import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataStore } from './store';
import { DEFAULT_OPS, type CellChange, type Code, type Employee, type Entry, type LiveEvent, type Note, type NoteChange, type OpsConfig } from '../types';

export const entryKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

export type SyncStatus = 'saved' | 'saving' | 'error' | 'offline';

interface UndoItem {
  label: string;
  batchId: string | null;
  inverse: CellChange[];
  applied: CellChange[];
  notesInverse?: NoteChange[];
  notesApplied?: NoteChange[];
  /** Otros lotes del mismo gesto (p. ej. borrar clave + nota con Supr): se deshacen juntos. */
  extraBatchIds?: string[];
}

/**
 * Estado central de la app: personas, claves y marcas, sincronizado con el
 * backend. Los cambios se ven al instante (optimista) y se guardan en segundo
 * plano; si el guardado falla, se deshace en pantalla y se avisa.
 */
export function useAppData(store: DataStore, onErrorProp: (msg: string) => void) {
  // El aviso de error puede cambiar en cada render de quien nos llama: se guarda
  // en una referencia para que NO provoque recargas completas de datos.
  const onErrorRef = useRef(onErrorProp);
  onErrorRef.current = onErrorProp;
  const onError = useCallback((msg: string) => onErrorRef.current(msg), []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [flash, setFlash] = useState<Map<string, number>>(new Map());
  const loadedYears = useRef(new Set<number>());
  const undoStack = useRef<UndoItem[]>([]);
  const [undoSize, setUndoSize] = useState(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const loadYear = useCallback(async (y: number, force = false) => {
    if (!force && loadedYears.current.has(y)) return;
    loadedYears.current.add(y);
    try {
      const [list, noteList] = await Promise.all([
        store.loadEntries(`${y}-01-01`, `${y}-12-31`),
        store.loadNotes(`${y}-01-01`, `${y}-12-31`),
      ]);
      setEntries((prev) => {
        const next = new Map(prev);
        for (const k of next.keys()) if (k.slice(-10, -6) === String(y)) next.delete(k);
        for (const e of list) next.set(entryKey(e.employeeId, e.date), e);
        return next;
      });
      setNotes((prev) => {
        const next = new Map(prev);
        for (const k of next.keys()) if (k.slice(-10, -6) === String(y)) next.delete(k);
        for (const n of noteList) next.set(entryKey(n.employeeId, n.date), n);
        return next;
      });
    } catch (e) {
      loadedYears.current.delete(y);
      onError(`No se pudieron cargar los datos de ${y}: ${(e as Error).message}`);
    }
  }, [store, onError]);

  const loadSettings = useCallback(async () => {
    try { setSettings(await store.loadSettings()); } catch { /* se usan los valores por defecto */ }
  }, [store]);

  const reloadAll = useCallback(async () => {
    try {
      const [base] = await Promise.all([store.loadBase(), loadSettings()]);
      setEmployees(base.employees);
      setCodes(base.codes);
      const years = [...loadedYears.current];
      loadedYears.current.clear();
      await Promise.all(years.map((y) => loadYear(y, true)));
    } catch (e) {
      onError(`No se pudieron cargar los datos: ${(e as Error).message}`);
    }
  }, [store, loadYear, loadSettings, onError]);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      loadedYears.current.clear();
      setEntries(new Map());
      setNotes(new Map());
      await reloadAll();
      await loadYear(new Date().getFullYear());
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // Solo al arrancar o si cambia el servidor: nunca por otros cambios de pantalla
    // (antes se relanzaba cada 30 s y mostraba "Cargando datos…").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Conexión
  useEffect(() => {
    const on = () => { setOnline(true); reloadAll(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [reloadAll]);

  // Cambios en tiempo real de otros compañeros
  useEffect(() => store.subscribe((ev: LiveEvent) => {
    if (ev.type === 'reload') { reloadAll(); return; }
    if (ev.type === 'settings') { loadSettings(); return; }
    if (ev.type === 'entry') {
      const k = entryKey(ev.employeeId, ev.date);
      const changed = (entriesRef.current.get(k)?.code ?? null) !== (ev.entry?.code ?? null);
      setEntries((prev) => {
        const cur = prev.get(k);
        if ((cur?.code ?? null) === (ev.entry?.code ?? null)) {
          if (ev.entry && cur && ev.entry.updatedBy !== cur.updatedBy) {
            const next = new Map(prev); next.set(k, ev.entry); return next;
          }
          return prev;
        }
        const next = new Map(prev);
        if (ev.entry) next.set(k, ev.entry); else next.delete(k);
        return next;
      });
      if (!changed) return; // eco de un cambio mío: no resaltar
      setFlash((prev) => new Map(prev).set(k, Date.now()));
      setTimeout(() => setFlash((prev) => { const n = new Map(prev); n.delete(k); return n; }), 2500);
    } else if (ev.type === 'note') {
      const k = entryKey(ev.employeeId, ev.date);
      setNotes((prev) => {
        const next = new Map(prev);
        if (ev.note) next.set(k, ev.note); else next.delete(k);
        return next;
      });
    } else if (ev.type === 'employee') {
      setEmployees((prev) => {
        const rest = prev.filter((e) => e.id !== ev.id);
        return ev.employee ? [...rest, ev.employee] : rest;
      });
    } else if (ev.type === 'code') {
      setCodes((prev) => {
        const rest = prev.filter((c) => c.code !== ev.key);
        return ev.code ? [...rest, ev.code] : rest;
      });
    }
  }), [store, reloadAll, loadSettings]);

  const sortedEmployees = useMemo(() => [...employees].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)), [employees]);
  const sortedCodes = useMemo(() => [...codes].sort((a, b) => a.orden - b.orden), [codes]);

  const canEdit = online || store.mode === 'local';

  const ops = useMemo<OpsConfig>(() => {
    const o = (settings.ops ?? {}) as Partial<OpsConfig>;
    return { equipos: Array.isArray(o.equipos) ? o.equipos : DEFAULT_OPS.equipos, zonas: o.zonas && typeof o.zonas === 'object' ? o.zonas : {} };
  }, [settings]);

  /** Guarda los ajustes de operativa (requiere modo admin en el servidor). */
  const saveOps = useCallback(async (next: OpsConfig, label: string) => {
    await store.saveSetting('ops', next, label);
    setSettings((s) => ({ ...s, ops: next }));
  }, [store]);

  /** Aplica cambios: se ven ya y se guardan en segundo plano. Devuelve true si se guardó. */
  const apply = useCallback(async (changes: CellChange[], label: string, opts: { undoable?: boolean } = {}) => {
    const cur = entriesRef.current;
    const real = changes.filter((c) => (cur.get(entryKey(c.employeeId, c.date))?.code ?? null) !== c.code);
    if (!real.length) return true;
    if (!canEdit) { onError('Sin conexión: no se pueden guardar cambios ahora mismo.'); return false; }
    const inverse = real.map((c) => ({ ...c, code: cur.get(entryKey(c.employeeId, c.date))?.code ?? null }));
    const optimistic = (list: CellChange[]) => setEntries((prev) => {
      const next = new Map(prev);
      for (const c of list) {
        const k = entryKey(c.employeeId, c.date);
        if (c.code) next.set(k, { employeeId: c.employeeId, date: c.date, code: c.code, updatedAt: new Date().toISOString(), updatedBy: 'tú' });
        else next.delete(k);
      }
      return next;
    });
    optimistic(real);
    setPending((n) => n + 1);
    try {
      const batchId = await store.applyChanges(real, label);
      setFailed(false);
      if (opts.undoable !== false) {
        undoStack.current.push({ label, inverse, applied: real, batchId });
        if (undoStack.current.length > 50) undoStack.current.shift();
        setUndoSize(undoStack.current.length);
      }
      return true;
    } catch (e) {
      optimistic(inverse);
      setFailed(true);
      onError(`No se ha guardado el cambio: ${(e as Error).message}`);
      return false;
    } finally {
      setPending((n) => n - 1);
    }
  }, [store, canEdit, onError]);

  const applyNotesLocal = (list: NoteChange[], author: string) => setNotes((prev) => {
    const next = new Map(prev);
    for (const c of list) {
      const k = entryKey(c.employeeId, c.date);
      if (c.text?.trim()) next.set(k, { employeeId: c.employeeId, date: c.date, text: c.text, author, updatedAt: new Date().toISOString() });
      else next.delete(k);
    }
    return next;
  });

  /** Guarda o borra (text vacío) la nota de una celda. */
  const saveNote = useCallback(async (employeeId: string, date: string, text: string, label: string) => {
    const k = entryKey(employeeId, date);
    const prevNote = notesRef.current.get(k);
    const clean = text.trim() ? text.trim() : null;
    if ((prevNote?.text ?? null) === clean) return true;
    if (!canEdit) { onError('Sin conexión: no se pueden guardar cambios ahora mismo.'); return false; }
    const applied: NoteChange[] = [{ employeeId, date, text: clean }];
    const inverse: NoteChange[] = [{ employeeId, date, text: prevNote?.text ?? null }];
    applyNotesLocal(applied, 'tú');
    setPending((n) => n + 1);
    try {
      const batchId = await store.applyNotes(applied, label);
      setFailed(false);
      undoStack.current.push({ label, batchId, inverse: [], applied: [], notesInverse: inverse, notesApplied: applied });
      if (undoStack.current.length > 50) undoStack.current.shift();
      setUndoSize(undoStack.current.length);
      return true;
    } catch (e) {
      if (prevNote) setNotes((p) => new Map(p).set(k, prevNote)); else applyNotesLocal(inverse, '');
      setFailed(true);
      onError(`No se ha guardado la nota: ${(e as Error).message}`);
      return false;
    } finally {
      setPending((n) => n - 1);
    }
  }, [store, canEdit, onError]);

  /**
   * Cambia claves y notas en un mismo gesto (p. ej. Supr borra todo lo del día).
   * Se ve al instante, se guarda en segundo plano y se deshace de una sola vez.
   */
  const applyCombined = useCallback(async (cells: CellChange[], noteChanges: NoteChange[], label: string) => {
    const cur = entriesRef.current;
    const curN = notesRef.current;
    const k = (c: { employeeId: string; date: string }) => entryKey(c.employeeId, c.date);
    const realC = cells.filter((c) => (cur.get(k(c))?.code ?? null) !== c.code);
    const realN = noteChanges.filter((c) => (curN.get(k(c))?.text ?? null) !== (c.text?.trim() ? c.text.trim() : null));
    if (!realC.length && !realN.length) return true;
    if (!canEdit) { onError('Sin conexión: no se pueden guardar cambios ahora mismo.'); return false; }
    const invC = realC.map((c) => ({ ...c, code: cur.get(k(c))?.code ?? null }));
    const invN = realN.map((c) => ({ ...c, text: curN.get(k(c))?.text ?? null }));
    const setCodes = (list: CellChange[]) => setEntries((prev) => {
      const next = new Map(prev);
      for (const c of list) {
        if (c.code) next.set(k(c), { employeeId: c.employeeId, date: c.date, code: c.code, updatedAt: new Date().toISOString(), updatedBy: 'tú' });
        else next.delete(k(c));
      }
      return next;
    });
    setCodes(realC);
    applyNotesLocal(realN, 'tú');
    setPending((n) => n + 1);
    try {
      const ids: string[] = [];
      if (realC.length) { const b = await store.applyChanges(realC, label); if (b) ids.push(b); }
      if (realN.length) { const b = await store.applyNotes(realN, label); if (b) ids.push(b); }
      setFailed(false);
      undoStack.current.push({
        label, batchId: ids[0] ?? null, extraBatchIds: ids.slice(1),
        inverse: invC, applied: realC, notesInverse: invN, notesApplied: realN,
      });
      if (undoStack.current.length > 50) undoStack.current.shift();
      setUndoSize(undoStack.current.length);
      return true;
    } catch (e) {
      setCodes(invC);
      applyNotesLocal(invN, '');
      setFailed(true);
      onError(`No se ha guardado el cambio: ${(e as Error).message}`);
      return false;
    } finally {
      setPending((n) => n - 1);
    }
  }, [store, canEdit, onError]);

  /** Deshace mi último cambio. Devuelve la descripción o null. */
  const undo = useCallback(async (confirmOverwrite: (n: number) => Promise<boolean>) => {
    const item = undoStack.current.pop();
    setUndoSize(undoStack.current.length);
    if (!item) return null;
    const cur = entriesRef.current;
    const curNotes = notesRef.current;
    const touched = item.applied.filter((c) => (cur.get(entryKey(c.employeeId, c.date))?.code ?? null) !== c.code).length
      + (item.notesApplied ?? []).filter((c) => (curNotes.get(entryKey(c.employeeId, c.date))?.text ?? null) !== (c.text ?? null)).length;
    if (touched && !(await confirmOverwrite(touched))) {
      undoStack.current.push(item);
      setUndoSize(undoStack.current.length);
      return null;
    }
    if (!item.batchId) {
      if (item.notesInverse?.length) await store.applyNotes(item.notesInverse, `Deshacer: ${item.label}`).then(() => applyNotesLocal(item.notesInverse!, 'tú'));
      if (item.inverse.length) await apply(item.inverse, `Deshacer: ${item.label}`, { undoable: false });
      return item.label;
    }
    // Se deshace a través del historial para que el cambio original quede marcado como "deshecho".
    try {
      await store.revertBatch(item.batchId, touched > 0);
      for (const b of item.extraBatchIds ?? []) await store.revertBatch(b, touched > 0);
    } catch (e) {
      onError(`No se pudo deshacer: ${(e as Error).message}`);
      return null;
    }
    setEntries((prev) => {
      const next = new Map(prev);
      for (const c of item.inverse) {
        const k = entryKey(c.employeeId, c.date);
        if (c.code) next.set(k, { employeeId: c.employeeId, date: c.date, code: c.code, updatedAt: new Date().toISOString(), updatedBy: 'tú' });
        else next.delete(k);
      }
      return next;
    });
    if (item.notesInverse?.length) applyNotesLocal(item.notesInverse, 'tú');
    return item.label;
  }, [apply, store, onError]);

  const status: SyncStatus = !online && store.mode !== 'local' ? 'offline' : pending > 0 ? 'saving' : failed ? 'error' : 'saved';

  return {
    employees: sortedEmployees,
    codes: sortedCodes,
    entries,
    notes,
    loading,
    ops,
    saveOps,
    status,
    canEdit,
    flash,
    undoSize,
    loadYear,
    reloadAll,
    apply,
    applyCombined,
    saveNote,
    undo,
    setEmployees,
    setCodes,
  };
}

export type AppData = ReturnType<typeof useAppData>;
