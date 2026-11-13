import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataStore } from './store';
import type { AppData } from './useAppData';
import { idbDel, idbGet, idbSet } from './idb';
import { parseWorkbook } from '../lib/excelImport';
import { deserializeSnapshot, fullDiff, planSync, rowsToChanges, serializeSnapshot, snapshotOf, staleMinutes, type DiffRow, type Snapshot, type SyncPlan } from '../lib/excelSync';

/**
 * Sincronización Excel (SharePoint sincronizado con OneDrive en este PC) → app.
 * La app vigila el archivo local y, cuando OneDrive lo actualiza, aplica solo lo
 * que ha cambiado en el Excel. La app NUNCA escribe en el Excel.
 * Usa la API de acceso a archivos del navegador (Edge/Chrome de escritorio).
 */

const CFG = 'excel-sync';
const BASE = 'excel-sync-baseline';
const POLL_MS = 20000;

interface Handle {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
}
interface Cfg { handle: Handle; fileName: string; lastModified: number }

export interface LastSync { at: string; cells: number; notes: number; people: number; overwritten: number }
export type SyncState = 'unsupported' | 'off' | 'needs-permission' | 'watching' | 'error';

export interface ExcelSync {
  state: SyncState;
  fileName: string;
  lastCheck: string | null;
  fileTime: string | null;
  /** Minutos que el Excel lleva sin cambiar en la jornada si puede haber un atasco de OneDrive; si no, null. */
  stale: number | null;
  last: LastSync | null;
  error: string;
  warnings: string[];
  /** Primera vez: diferencias entre el Excel y la app para que el usuario decida. */
  pending: { plan: SyncPlan; fileName: string } | null;
  /** Revisión completa de diferencias Excel ↔ app (abierta). */
  review: { rows: DiffRow[]; from: string; to: string; fileTime: string } | null;
  compare: () => Promise<void>;
  applyReview: (rows: DiffRow[]) => Promise<void>;
  closeReview: () => void;
  /** Hay una comprobación en marcha. */
  checking: boolean;
  choose: () => Promise<void>;
  confirmFirst: (apply: boolean) => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  checkNow: () => Promise<void>;
}

/** Guarda la configuración; si el navegador no puede guardar el archivo, la sincronización sigue en esta sesión. */
const saveCfg = async (c: Cfg) => { try { await idbSet(CFG, { ...c }); } catch { /* no se recordará al recargar */ } };

/** Si el archivo no responde (p. ej. OneDrive bloqueado), no se queda esperando para siempre. */
const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);

type Outcome = 'unchanged' | 'no-diff' | 'applied' | 'busy' | 'error' | 'off';

const supported = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export function useExcelSync(store: DataStore, data: AppData, enabled: boolean, notify: (msg: string, kind?: 'ok' | 'info' | 'warn' | 'error') => void): ExcelSync {
  const [state, setState] = useState<SyncState>(supported() ? 'off' : 'unsupported');
  const [fileName, setFileName] = useState('');
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [fileTime, setFileTime] = useState<string | null>(null);
  const [last, setLast] = useState<LastSync | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState<ExcelSync['pending']>(null);
  const cfg = useRef<Cfg | null>(null);
  const firstSnap = useRef<{ snap: Snapshot; lastModified: number } | null>(null);
  const busy = useRef(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<ExcelSync['review']>(null);
  const reviewSnap = useRef<{ snap: Snapshot; lastModified: number } | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const read = async (h: Handle) => {
    const file = await h.getFile();
    const snap = snapshotOf(parseWorkbook(await file.arrayBuffer()).dataset);
    return { file, snap };
  };

  /**
   * Estado actual de la app en las fechas del Excel, leído del servidor (no de la
   * pantalla, que puede no tener cargados todos los años).
   */
  const appState = async (snap: Snapshot) => {
    const dates = [...snap.cells.keys()].map((k) => k.slice(-10)).sort();
    const from = dates[0] ?? '2000-01-01';
    const to = dates[dates.length - 1] ?? '2000-01-01';
    const [list, noteList] = await Promise.all([store.loadEntries(from, to), store.loadNotes(from, to)]);
    return {
      entries: new Map(list.map((e) => [`${e.employeeId}|${e.date}`, e])),
      notes: new Map(noteList.map((n) => [`${n.employeeId}|${n.date}`, n])),
    };
  };

  const warn = (plan: SyncPlan) => {
    const w: string[] = [];
    if (plan.unknownPeople.length) w.push(`Personas del Excel que no están en la app (no se sincronizan): ${plan.unknownPeople.join(', ')}. Dalas de alta en Ajustes con el mismo nombre.`);
    if (plan.unknownCodes.size) w.push(`Claves del Excel que no existen en la app (esas celdas no se tocan): ${[...plan.unknownCodes].map(([c, n]) => `${c} (${n})`).join(', ')}.`);
    setWarnings(w);
  };

  const apply = async (plan: SyncPlan, label: string) => {
    if (!plan.cells.length && !plan.notes.length) return;
    await store.applyExternal(plan.cells, plan.notes, label);
    await dataRef.current.reloadAll();
    const info: LastSync = { at: new Date().toISOString(), cells: plan.cells.length, notes: plan.notes.length, people: plan.people, overwritten: plan.overwritten };
    setLast(info);
    try { localStorage.setItem('ca-excel-last', JSON.stringify(info)); } catch { /* */ }
    notifyRef.current(`🔄 Excel sincronizado: ${plan.cells.length} día(s) y ${plan.notes.length} nota(s) de ${plan.people} persona(s)${plan.overwritten ? ` · ${plan.overwritten} cambio(s) hechos en la app sustituidos por el Excel` : ''}.`, plan.overwritten ? 'warn' : 'info');
  };

  /** Comprueba el archivo; si ha cambiado, aplica las diferencias. */
  const check = useCallback(async (force = false): Promise<{ outcome: Outcome; message?: string; fileTime?: number }> => {
    const c = cfg.current;
    if (!c) return { outcome: 'off' };
    if (busy.current) return { outcome: 'busy' };
    busy.current = true;
    setChecking(true);
    try {
      const f = await withTimeout(c.handle.getFile(), 30000, 'El archivo no responde. Comprueba que OneDrive está sincronizado (icono de la nube junto al reloj).');
      setLastCheck(new Date().toISOString());
      setFileTime(new Date(f.lastModified).toISOString());
      if (!force && f.lastModified === c.lastModified) { setState('watching'); setError(''); return { outcome: 'unchanged', fileTime: f.lastModified }; }
      const { file, snap } = await withTimeout(read(c.handle), 60000, 'No se ha podido leer el Excel a tiempo. Se reintentará solo.');
      const raw = await idbGet<Parameters<typeof deserializeSnapshot>[0]>(BASE);
      const base = raw ? deserializeSnapshot(raw) : null;
      const d = dataRef.current;
      const cur = await appState(snap);
      const plan = planSync(base, snap, d.employees, cur.entries, cur.notes, d.codes);
      warn(plan);
      await apply(plan, `Sincronización con Excel · ${c.fileName}`);
      // Solo se avanza la foto si todo ha ido bien (si falla, se reintenta en la siguiente vuelta)
      await idbSet(BASE, serializeSnapshot(snap));
      c.lastModified = file.lastModified;
      await saveCfg(c);
      setState('watching');
      setError('');
      return { outcome: plan.cells.length || plan.notes.length ? 'applied' : 'no-diff', fileTime: file.lastModified };
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      // Si el archivo se está guardando o OneDrive lo está descargando, se reintenta luego
      if ((e as DOMException).name === 'NotAllowedError') setState('needs-permission');
      else { setState('error'); setError(msg); }
      return { outcome: 'error', message: msg };
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [store]);

  /** Botón «Comprobar ahora»: siempre dice qué ha pasado. */
  const checkNow = useCallback(async () => {
    const r = await check(true);
    const when = r.fileTime ? new Date(r.fileTime).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    if (r.outcome === 'no-diff') notifyRef.current(`✓ Excel leído (guardado el ${when}): no hay cambios nuevos que aplicar.`, 'info');
    else if (r.outcome === 'busy') notifyRef.current('Ya se está comprobando el Excel; espera unos segundos.', 'info');
    else if (r.outcome === 'error') notifyRef.current(`No se pudo leer el Excel: ${r.message}`, 'error');
    // 'applied' ya muestra su propio aviso con lo aplicado
  }, [check]);

  // Al arrancar: recuperar el archivo elegido y comprobar el permiso
  useEffect(() => {
    if (!enabled || !supported()) return;
    (async () => {
      try { const l = localStorage.getItem('ca-excel-last'); if (l) setLast(JSON.parse(l)); } catch { /* */ }
      // Protección: si la última vez el navegador se cerró al recuperar el archivo,
      // no se reintenta (evita un bucle) y se pide elegirlo otra vez.
      const RESTORING = 'ca-excel-restoring';
      let crashed = false;
      try { crashed = localStorage.getItem(RESTORING) === '1'; localStorage.setItem(RESTORING, '1'); } catch { /* */ }
      if (crashed) {
        await idbDel(CFG).catch(() => {});
        try { localStorage.removeItem(RESTORING); } catch { /* */ }
        setWarnings(['No se pudo recuperar el Excel que estaba sincronizado. Vuelve a elegirlo en «Copias y Excel».']);
        return;
      }
      const saved = await idbGet<Cfg>(CFG).catch(() => undefined);
      try { localStorage.removeItem(RESTORING); } catch { /* */ }
      if (!saved?.handle) return;
      cfg.current = saved;
      setFileName(saved.fileName);
      const perm = (await saved.handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
      if (perm === 'granted') { setState('watching'); check(); } else setState('needs-permission');
    })();
  }, [enabled, check]);

  // Vigilancia periódica
  useEffect(() => {
    if (state !== 'watching' && state !== 'error') return;
    const t = setInterval(() => check(), POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [state, check]);

  const choose = useCallback(async () => {
    const picker = (window as unknown as { showOpenFilePicker: (o: unknown) => Promise<Handle[]> }).showOpenFilePicker;
    let h: Handle;
    try {
      [h] = await picker({
        multiple: false,
        types: [{ description: 'Excel', accept: { 'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
    } catch { return; } // cancelado
    try {
      const { file, snap } = await read(h);
      const d = dataRef.current;
      const cur = await appState(snap);
      const plan = planSync(null, snap, d.employees, cur.entries, cur.notes, d.codes);
      warn(plan);
      cfg.current = { handle: h, fileName: h.name, lastModified: file.lastModified };
      firstSnap.current = { snap, lastModified: file.lastModified };
      setFileName(h.name);
      setFileTime(new Date(file.lastModified).toISOString());
      setPending({ plan, fileName: h.name });
    } catch (e) {
      setState('error');
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  }, []);

  /** Compara el Excel entero con la app (borrados incluidos) para revisar y elegir qué aplicar. */
  const compare = useCallback(async () => {
    const c = cfg.current;
    if (!c) return;
    if (busy.current) { notifyRef.current('Ya se está leyendo el Excel; espera unos segundos.', 'info'); return; }
    busy.current = true;
    setChecking(true);
    try {
      const file = await withTimeout(c.handle.getFile(), 30000, 'El archivo no responde. Comprueba que OneDrive está sincronizado.');
      const res = parseWorkbook(await file.arrayBuffer());
      const snap = snapshotOf(res.dataset);
      const from = res.stats.from ?? '2000-01-01';
      const to = res.stats.to ?? '2000-01-01';
      const [list, noteList] = await Promise.all([store.loadEntries(from, to), store.loadNotes(from, to)]);
      const d = dataRef.current;
      const rows = fullDiff(snap, from, to, d.employees,
        new Map(list.map((e) => [`${e.employeeId}|${e.date}`, e])),
        new Map(noteList.map((n) => [`${n.employeeId}|${n.date}`, n])), d.codes);
      reviewSnap.current = { snap, lastModified: file.lastModified };
      setFileTime(new Date(file.lastModified).toISOString());
      setReview({ rows, from, to, fileTime: new Date(file.lastModified).toISOString() });
      if (!rows.length) notifyRef.current('✓ La app y el Excel coinciden: no hay diferencias.', 'ok');
    } catch (e) {
      notifyRef.current(`No se pudo comparar con el Excel: ${(e as Error).message}`, 'error');
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [store]);

  const applyReview = useCallback(async (rows: DiffRow[]) => {
    const c = cfg.current;
    const r = reviewSnap.current;
    if (!c || !r) return;
    try {
      const { cells, notes } = rowsToChanges(rows);
      if (cells.length || notes.length) {
        await store.applyExternal(cells, notes, `Revisión de diferencias con el Excel · ${c.fileName}`);
        await dataRef.current.reloadAll();
      }
      // A partir de ahora la sincronización compara con este Excel ya revisado
      await idbSet(BASE, serializeSnapshot(r.snap));
      c.lastModified = r.lastModified;
      await saveCfg(c);
      setReview(null);
      notifyRef.current(cells.length || notes.length
        ? `✓ Aplicadas ${cells.length} clave(s) y ${notes.length} nota(s) del Excel. Queda en el Historial y se puede deshacer de una vez.`
        : 'Revisión cerrada sin aplicar cambios.', 'ok');
    } catch (e) {
      notifyRef.current(`No se pudieron aplicar: ${(e as Error).message}`, 'error');
    }
  }, [store]);

  const confirmFirst = useCallback(async (doApply: boolean) => {
    const c = cfg.current;
    const first = firstSnap.current;
    if (!c || !first || !pending) return;
    try {
      if (doApply) await apply(pending.plan, `Sincronización inicial con Excel · ${c.fileName}`);
      await idbSet(BASE, serializeSnapshot(first.snap));
      await saveCfg(c);
      setPending(null);
      setState('watching');
      setError('');
      setLastCheck(new Date().toISOString());
      notifyRef.current(`Sincronización activada con «${c.fileName}». La app comprobará el archivo cada 20 segundos.`, 'ok');
    } catch (e) {
      notifyRef.current(`No se pudo sincronizar: ${(e as Error).message}`, 'error');
    }
  }, [pending]);

  const resume = useCallback(async () => {
    const c = cfg.current;
    if (!c) return;
    const perm = (await c.handle.requestPermission?.({ mode: 'read' })) ?? 'granted';
    if (perm === 'granted') { setState('watching'); check(); }
  }, [check]);

  const stop = useCallback(async () => {
    cfg.current = null;
    firstSnap.current = null;
    setPending(null);
    await idbDel(CFG);
    await idbDel(BASE);
    setFileName('');
    setState('off');
    setWarnings([]);
    notifyRef.current('Sincronización con el Excel desactivada. Lo ya sincronizado se queda en la app.', 'info');
  }, []);

  const stale = state === 'watching' && fileTime && lastCheck ? staleMinutes(new Date(fileTime), new Date(lastCheck)) : null;

  return {
    state: supported() ? state : 'unsupported', fileName, lastCheck, fileTime, stale, last, error, warnings, pending,
    checking, choose, confirmFirst, resume, stop, checkNow,
    review, compare, applyReview, closeReview: () => setReview(null),
  };
}
