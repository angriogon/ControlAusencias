import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { MASS_PEOPLE_LIMIT, PROTECTED_CODES, type CellChange, type NoteChange, type Code, type Employee, type Entry, type Note, type PresenceUser } from '../types';
import { entryKey } from '../data/useAppData';
import { WEEKDAY_LETTER, formatDate, formatDateLong, isWeekend, isoWeek, parseIso, todayIso, weekday } from '../lib/dates';
import { normalizeCode } from '../lib/codes';
import { initials } from '../lib/colors';
import { CodePicker, type PickerResult } from './CodePicker';
import { useUi } from './ui';
import { useAdmin } from './admin';

export interface Pos { r: number; c: number }
interface Sel { a: Pos; f: Pos }

export interface GridRow { kind: 'emp'; emp: Employee; idx: number }
export interface GroupRow { kind: 'group'; label: string; count: number }

interface Props {
  days: string[];
  rows: (GridRow | GroupRow)[];
  employees: Employee[]; // solo personas, en el mismo orden que rows
  entries: Map<string, Entry>;
  notes: Map<string, Note>;
  codes: Code[];
  codeByKey: Map<string, Code>;
  flash: Map<string, number>;
  canEdit: boolean;
  vacLeft: Map<string, number>;
  presence: PresenceUser[];
  onCursor: (cell: { employeeId: string; date: string } | null) => void;
  onApply: (changes: CellChange[], label: string) => Promise<boolean>;
  onSaveNote: (employeeId: string, date: string, text: string, label: string) => Promise<boolean>;
  onApplyCombined: (cells: CellChange[], notes: NoteChange[], label: string) => Promise<boolean>;
  onOpenEmployee: (e: Employee) => void;
}

const rect = (s: Sel) => ({
  r0: Math.min(s.a.r, s.f.r), r1: Math.max(s.a.r, s.f.r),
  c0: Math.min(s.a.c, s.f.c), c1: Math.max(s.a.c, s.f.c),
});

export function Grid(p: Props) {
  const { toast } = useUi();
  const admin = useAdmin();
  const [sel, setSel] = useState<Sel | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; filter: string } | null>(null);
  const dragging = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const today = todayIso();
  const lastRow = p.employees.length - 1;
  const lastCol = p.days.length - 1;

  // Si cambia el mes o el filtro, la selección deja de tener sentido
  useEffect(() => { setSel(null); setPicker(null); }, [p.days[0], p.employees.length]);

  // Comunicar a los compañeros en qué celda estoy
  const focusEmp = sel ? p.employees[sel.f.r]?.id : undefined;
  const focusDate = sel ? p.days[sel.f.c] : undefined;
  useEffect(() => {
    p.onCursor(focusEmp && focusDate ? { employeeId: focusEmp, date: focusDate } : null);
  }, [focusEmp, focusDate]);
  useEffect(() => () => p.onCursor(null), []);

  const r = sel ? rect(sel) : null;
  const selCount = r ? (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1) : 0;
  const selPeople = r ? r.r1 - r.r0 + 1 : 0;

  const cellsInSel = useCallback((): { emp: Employee; date: string }[] => {
    if (!r) return [];
    const out: { emp: Employee; date: string }[] = [];
    for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) {
      if (p.employees[i] && p.days[j]) out.push({ emp: p.employees[i], date: p.days[j] });
    }
    return out;
  }, [r?.r0, r?.r1, r?.c0, r?.c1, p.employees, p.days]);

  const describeSel = () => {
    const cells = cellsInSel();
    if (cells.length === 1) return `${cells[0].emp.nombre} · ${formatDateLong(cells[0].date)}`;
    const people = new Set(cells.map((c) => c.emp.id)).size;
    const days = new Set(cells.map((c) => c.date)).size;
    return `${cells.length} celdas · ${people} persona(s) · ${days} día(s)`;
  };

  /** En cambios de varias celdas, FN/FL/F nunca se tocan. */
  const protect = (changes: CellChange[]) => {
    if (changes.length <= 1) return { allowed: changes, skipped: 0 };
    const allowed = changes.filter((c) => {
      const cur = p.entries.get(entryKey(c.employeeId, c.date))?.code;
      return !(cur && PROTECTED_CODES.includes(cur) && cur !== c.code);
    });
    return { allowed, skipped: changes.length - allowed.length };
  };

  /** Cambios a más de 5 personas: pedir el modo administrador antes de enviar. */
  const ensureMassAllowed = async (changes: CellChange[]) => {
    const people = new Set(changes.map((c) => c.employeeId)).size;
    if (people <= MASS_PEOPLE_LIMIT || admin.active) return true;
    return admin.requestAdmin(`Este cambio afecta a ${people} personas. Los cambios a más de ${MASS_PEOPLE_LIMIT} personas a la vez requieren el modo administrador.`);
  };

  const applyCells = async (changes: CellChange[], label: string) => {
    const { allowed, skipped } = protect(changes);
    if (skipped) toast(`${skipped} día(s) con FN, FL o F no se han modificado`, 'info');
    if (!allowed.length) return false;
    if (!(await ensureMassAllowed(allowed))) return false;
    return p.onApply(allowed, label);
  };

  /** Supr: borra TODO lo de los días seleccionados (clave y nota) en un solo paso que se deshace de una vez. */
  const clearAll = async () => {
    const cells = cellsInSel();
    const { allowed, skipped } = protect(cells.map((c) => ({ employeeId: c.emp.id, date: c.date, code: null })));
    // En selecciones de varias celdas, los días con FN/FL/F se dejan intactos (clave y nota)
    const keep = new Set(cells.length > 1
      ? cells.filter((c) => !allowed.some((a) => a.employeeId === c.emp.id && a.date === c.date)).map((c) => entryKey(c.emp.id, c.date))
      : []);
    const notes: NoteChange[] = cells
      .filter((c) => p.notes.has(entryKey(c.emp.id, c.date)) && !keep.has(entryKey(c.emp.id, c.date)))
      .map((c) => ({ employeeId: c.emp.id, date: c.date, text: null }));
    const codes = allowed.filter((c) => p.entries.has(entryKey(c.employeeId, c.date)));
    if (!codes.length && !notes.length) { if (skipped) toast(`${skipped} día(s) con FN, FL o F no se han modificado`, 'info'); return; }
    if (!(await ensureMassAllowed(codes))) return;
    if (skipped) toast(`${skipped} día(s) con FN, FL o F no se han modificado`, 'info');
    const one = cells.length === 1 ? `${cells[0].emp.nombre} ${formatDate(cells[0].date)}` : describeSel();
    await p.onApplyCombined(codes, notes, `Borra todo · ${one}`);
  };

  const openPicker = (filter = '', at?: { x: number; y: number }) => {
    if (!sel || !p.canEdit) return;
    if (at) { setPicker({ ...at, filter }); return; }
    const el = wrap.current?.querySelector<HTMLElement>(`[data-cell="${sel.f.r}-${sel.f.c}"]`);
    const b = el?.getBoundingClientRect();
    setPicker({ x: b ? b.left : 200, y: b ? b.bottom + 4 : 200, filter });
  };

  const commit = async ({ code, note }: PickerResult) => {
    const cells = cellsInSel();
    setPicker(null);
    if (!cells.length) return;
    const one = cells.length === 1 ? `${cells[0].emp.nombre} ${formatDate(cells[0].date)}` : describeSel();
    if (code !== undefined) {
      await applyCells(cells.map((c) => ({ employeeId: c.emp.id, date: c.date, code })), code ? `Marca ${code} · ${one}` : `Borra · ${one}`);
    }
    if (note !== undefined && cells.length === 1) {
      await p.onSaveNote(cells[0].emp.id, cells[0].date, note, `${note.trim() ? 'Nota' : 'Borra nota'} · ${one}`);
    }
    wrap.current?.focus();
  };

  const move = (dr: number, dc: number, extend: boolean) => {
    setSel((s) => {
      const base = s ?? { a: { r: 0, c: 0 }, f: { r: 0, c: 0 } };
      const f = {
        r: Math.max(0, Math.min(lastRow, base.f.r + dr)),
        c: Math.max(0, Math.min(lastCol, base.f.c + dc)),
      };
      return extend ? { a: base.a, f } : { a: f, f };
    });
  };

  // Mantener visible la celda activa al moverse con el teclado
  useEffect(() => {
    if (!sel) return;
    wrap.current?.querySelector<HTMLElement>(`[data-cell="${sel.f.r}-${sel.f.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel?.f.r, sel?.f.c]);

  const copy = async () => {
    if (!r) return;
    const lines: string[] = [];
    for (let i = r.r0; i <= r.r1; i++) {
      const row: string[] = [];
      for (let j = r.c0; j <= r.c1; j++) row.push(p.entries.get(entryKey(p.employees[i].id, p.days[j]))?.code ?? '');
      lines.push(row.join('\t'));
    }
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(`Copiadas ${selCount} celda(s)`, 'info'); } catch { toast('No se pudo copiar', 'error'); }
  };

  const paste = async () => {
    if (!r || !p.canEdit) return;
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { toast('El navegador no permite pegar. Usa la paleta de claves.', 'error'); return; }
    const matrix = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const single = matrix.length === 1 && matrix[0].length === 1;
    const changes: CellChange[] = [];
    let bad = 0;
    const H = single ? r.r1 - r.r0 + 1 : matrix.length;
    const W = single ? r.c1 - r.c0 + 1 : Math.max(...matrix.map((m) => m.length));
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
      const emp = p.employees[r.r0 + i];
      const date = p.days[r.c0 + j];
      if (!emp || !date) continue;
      const raw = single ? matrix[0][0] : (matrix[i]?.[j] ?? '');
      const code = raw.trim() ? normalizeCode(raw, p.codes) : null;
      if (raw.trim() && !code) { bad++; continue; }
      changes.push({ employeeId: emp.id, date, code });
    }
    if (bad) toast(`${bad} valor(es) no son claves válidas y se han ignorado`, 'error');
    if (changes.length) await applyCells(changes, `Pega ${changes.length} celda(s)`);
  };

  const onKey = (e: RKE<HTMLDivElement>) => {
    if (picker) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey); }
    else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey); }
    else if (k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(0, 1, e.shiftKey && k !== 'Tab'); }
    else if (k === 'Tab' && e.shiftKey) { e.preventDefault(); move(0, -1, false); }
    else if (k === 'Enter' || k === 'F2' || k === ' ') { e.preventDefault(); openPicker(); }
    else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      if (sel && p.canEdit) clearAll();
    }
    else if (k === 'Escape') { setSel(null); }
    else if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
    else if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); copy(); }
    else if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); paste(); }
    else if (!ctrl && !e.altKey && k.length === 1 && /[\p{L}\d/]/u.test(k) && sel) { e.preventDefault(); openPicker(k); }
  };

  useEffect(() => {
    const up = () => {
      if (dragging.current) { dragging.current = false; openPickerRef.current(); }
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const openPickerRef = useRef(() => openPicker());
  openPickerRef.current = () => openPicker();

  const onCellDown = useCallback((ri: number, ci: number, shift: boolean) => {
    setPicker(null);
    dragging.current = true;
    setSel((s) => (shift && s ? { a: s.a, f: { r: ri, c: ci } } : { a: { r: ri, c: ci }, f: { r: ri, c: ci } }));
    wrap.current?.focus({ preventScroll: true });
  }, []);
  const onCellEnter = useCallback((ri: number, ci: number) => {
    if (dragging.current) setSel((s) => (s ? { a: s.a, f: { r: ri, c: ci } } : s));
  }, []);

  // ----- Selección de filas (clic en el nombre) y columnas (clic en el día) -----
  const pendingOpen = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (pendingOpen.current && sel) { openPicker('', pendingOpen.current); pendingOpen.current = null; }
  }, [sel]);

  const selectRows = useCallback((ri: number, shift: boolean, at: { x: number; y: number }) => {
    setPicker(null);
    pendingOpen.current = at;
    setSel((s) => {
      const fullRows = s && s.a.c === lastCol && s.f.c === 0;
      const anchor = shift && s && fullRows ? s.a.r : ri;
      return { a: { r: anchor, c: lastCol }, f: { r: ri, c: 0 } };
    });
    wrap.current?.focus({ preventScroll: true });
  }, [lastCol]);

  const selectCols = (ci: number, shift: boolean, at: { x: number; y: number }) => {
    setPicker(null);
    pendingOpen.current = at;
    setSel((s) => {
      const fullCols = s && s.a.r === lastRow && s.f.r === 0;
      const anchor = shift && s && fullCols ? s.a.c : ci;
      return { a: { r: lastRow, c: anchor }, f: { r: 0, c: ci } };
    });
    wrap.current?.focus({ preventScroll: true });
  };

  const selectAll = (at?: { x: number; y: number }) => {
    setPicker(null);
    if (at) pendingOpen.current = at;
    setSel({ a: { r: lastRow, c: lastCol }, f: { r: 0, c: 0 } });
  };

  // Totales por día (personas visibles)
  const totals = useMemo(() => p.days.map((d) => {
    const per = new Map<string, number>();
    let abs = 0;
    for (const emp of p.employees) {
      const code = p.entries.get(entryKey(emp.id, d))?.code;
      if (!code) continue;
      per.set(code, (per.get(code) ?? 0) + 1);
      if (p.codeByKey.get(code)?.category === 'ausencia') abs++;
    }
    return { abs, per };
  }), [p.days, p.employees, p.entries, p.codeByKey]);

  // Compañeros: celda → quiénes están en ella
  const remoteByCell = useMemo(() => {
    const m = new Map<string, PresenceUser[]>();
    for (const u of p.presence) {
      if (!u.cell) continue;
      const k = entryKey(u.cell.employeeId, u.cell.date);
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    return m;
  }, [p.presence]);

  const singleKey = r && selCount === 1 && p.employees[r.r0] ? entryKey(p.employees[r.r0].id, p.days[r.c0]) : null;
  const single = singleKey ? p.entries.get(singleKey) : undefined;
  const singleNote = singleKey ? p.notes.get(singleKey) ?? null : null;

  // Avisos de la paleta para selecciones de varias celdas
  const protectedInSel = useMemo(() => {
    if (!picker || selCount <= 1) return [];
    return cellsInSel()
      .map((c) => ({ ...c, code: p.entries.get(entryKey(c.emp.id, c.date))?.code }))
      .filter((c) => c.code && PROTECTED_CODES.includes(c.code));
  }, [picker, selCount, cellsInSel, p.entries]);

  const fullRows = !!sel && r?.c0 === 0 && r?.c1 === lastCol && selCount > 1;
  const fullCols = !!sel && r?.r0 === 0 && r?.r1 === lastRow && selCount > 1;

  // La columna "Persona" se ajusta al nombre más largo para que se lean completos
  const nameWidth = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return 280;
    ctx.font = '600 12px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
    const widest = Math.max(0, ...p.employees.map((e) => ctx.measureText(e.nombre).width));
    return Math.round(Math.min(440, Math.max(200, widest + 44))); // 44 = márgenes + botón ⓘ
  }, [p.employees]);

  return (
    <div className="grid-wrap" ref={wrap} tabIndex={0} onKeyDown={onKey} aria-label="Calendario de ausencias"
      style={{ ['--name-w' as string]: `${nameWidth}px` }}>
      <table className="grid">
        <thead>
          <tr className="weeks">
            <th className="sticky-col name-col" />
            <th className="sticky-col sig-col" />
            <th className="sticky-col vac-col" />
            {p.days.map((d, i) => (weekday(d) === 1 || i === 0
              ? <th key={d} colSpan={Math.min(7 - ((weekday(d) + 6) % 7), p.days.length - i)} className="week-label">Sem. {isoWeek(d)}</th>
              : null))}
          </tr>
          <tr>
            <th className="sticky-col name-col corner selectable" title="Clic: seleccionar todo el mes" onClick={(e) => p.canEdit && selectAll({ x: e.clientX, y: e.clientY + 8 })}>Persona</th>
            <th className="sticky-col sig-col corner" title="Siglas de la persona (las de las planificaciones)">Siglas</th>
            <th className="sticky-col vac-col corner" title="Días de vacaciones (V) que le quedan este año">Vac.</th>
            {p.days.map((d, ci) => {
              const { d: dd } = parseIso(d);
              return (
                <th
                  key={d}
                  className={`day ${isWeekend(d) ? 'we' : ''} ${d === today ? 'today' : ''} ${weekday(d) === 1 ? 'monday' : ''} ${fullCols && ci >= r!.c0 && ci <= r!.c1 ? 'selcol' : ''}`}
                  title="Clic: seleccionar el día para todos · Mayús+clic: varios días"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => p.canEdit && selectCols(ci, e.shiftKey, { x: e.clientX - 40, y: e.clientY + 12 })}
                >
                  <span className="wd">{WEEKDAY_LETTER[weekday(d)]}</span>
                  <span className="dn">{dd}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row) => {
            if (row.kind === 'group') {
              return (
                <tr key={`g-${row.label}`} className="group-row">
                  <td className="sticky-col name-col group-label" colSpan={3}>{row.label} <small>({row.count})</small></td>
                  <td colSpan={p.days.length} />
                </tr>
              );
            }
            const inRows = !!r && row.idx >= r.r0 && row.idx <= r.r1;
            return (
              <GridRowView
                key={row.emp.id}
                emp={row.emp}
                ri={row.idx}
                days={p.days}
                today={today}
                sig={p.days.map((d) => p.entries.get(entryKey(row.emp.id, d))?.code ?? '').join('|')}
                noteSig={p.days.map((d) => {
                  const n = p.notes.get(entryKey(row.emp.id, d));
                  return n ? `${n.author ? `${n.author}: ` : ''}${n.text}` : '';
                }).join('\u0001')}
                remoteSig={p.days.map((d) => (remoteByCell.get(entryKey(row.emp.id, d)) ?? []).map((u) => `${u.name}\u0002${u.color}`).join('\u0003')).join('\u0001')}
                codeByKey={p.codeByKey}
                selC0={inRows ? r!.c0 : -1}
                selC1={inRows ? r!.c1 : -1}
                rowSelected={inRows && fullRows}
                focusC={sel && sel.f.r === row.idx ? sel.f.c : -1}
                flashSig={p.days.filter((d) => p.flash.has(entryKey(row.emp.id, d))).join(',')}
                vacLeft={p.vacLeft.get(row.emp.id)}
                canEdit={p.canEdit}
                onDown={onCellDown}
                onEnter={onCellEnter}
                onSelectRow={selectRows}
                onOpenEmployee={p.onOpenEmployee}
              />
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky-col name-col foot-label">Ausencias del día</td>
            <td className="sticky-col sig-col" />
            <td className="sticky-col vac-col" />
            {totals.map((t, i) => (
              <td key={p.days[i]} className={`foot ${isWeekend(p.days[i]) ? 'we' : ''} ${t.abs ? 'has' : ''}`}
                title={[...t.per.entries()].map(([c, n]) => `${c}: ${n}`).join('\n') || 'Sin marcas'}>
                {t.abs || ''}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky-col name-col foot-label">% sobre {p.employees.length} visibles</td>
            <td className="sticky-col sig-col" />
            <td className="sticky-col vac-col" />
            {totals.map((t, i) => (
              <td key={p.days[i]} className={`foot pct ${isWeekend(p.days[i]) ? 'we' : ''}`}>
                {t.abs && p.employees.length ? Math.round((t.abs / p.employees.length) * 100) : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {picker && sel && (
        <CodePicker
          x={picker.x}
          y={picker.y}
          title={describeSel()}
          initialFilter={picker.filter}
          codes={p.codes.filter((c) => c.activo)}
          current={single?.code ?? null}
          lastChange={single?.updatedBy ? { by: single.updatedBy, at: single.updatedAt } : null}
          note={selCount === 1 ? singleNote : undefined}
          warning={protectedInSel.length > 0 && (
            <div className="danger-box">
              <b>No se tocarán {protectedInSel.length} día(s) con FN, FL o F:</b>
              <ul>
                {protectedInSel.slice(0, 30).map((c) => <li key={`${c.emp.id}${c.date}`}>{c.code} · {formatDate(c.date)} · {c.emp.nombre}</li>)}
                {protectedInSel.length > 30 && <li>… y {protectedInSel.length - 30} más</li>}
              </ul>
            </div>
          )}
          blocker={selPeople > MASS_PEOPLE_LIMIT && !admin.active && (
            <>
              <span>🔒 Afecta a <b>{selPeople} personas</b>: los cambios a más de {MASS_PEOPLE_LIMIT} personas requieren el modo administrador.</span>
              <button onClick={() => admin.requestAdmin()}>Activar modo administrador</button>
            </>
          )}
          onCommit={commit}
          onClose={() => { setPicker(null); wrap.current?.focus(); }}
        />
      )}
    </div>
  );
}

interface RowProps {
  emp: Employee; ri: number; days: string[]; today: string; sig: string; noteSig: string; remoteSig: string;
  codeByKey: Map<string, Code>;
  selC0: number; selC1: number; rowSelected: boolean; focusC: number; flashSig: string; vacLeft?: number; canEdit: boolean;
  onDown: (r: number, c: number, shift: boolean) => void;
  onEnter: (r: number, c: number) => void;
  onSelectRow: (r: number, shift: boolean, at: { x: number; y: number }) => void;
  onOpenEmployee: (e: Employee) => void;
}

/** Fila memorizada: solo se repinta si cambian sus marcas, su selección o su resaltado. */
const GridRowView = memo(function GridRowView(p: RowProps) {
  const codes = p.sig.split('|');
  const notes = p.noteSig.split('\u0001');
  const remotes = p.remoteSig.split('\u0001');
  const flashing = new Set(p.flashSig ? p.flashSig.split(',') : []);
  const info = `${p.emp.nombre}\n${[p.emp.sede, p.emp.zona, p.emp.telefono && `Tel: ${p.emp.telefono}`, p.emp.extension && `Ext: ${p.emp.extension}`].filter(Boolean).join(' · ')}`;
  return (
    <tr>
      <th className={`sticky-col name-col person ${p.rowSelected ? 'selrow' : ''}`} scope="row">
        <button
          className="person-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { if (p.canEdit) p.onSelectRow(p.ri, e.shiftKey, { x: e.clientX + 12, y: e.clientY + 12 }); else p.onOpenEmployee(p.emp); }}
          title={`${info}\n\nClic: seleccionar todo el mes · Mayús+clic: varias personas`}
        >
          <span className="pname">{p.emp.nombre}</span>
          <span className="psub">{[p.emp.equipo, p.emp.zona, p.emp.sede].filter(Boolean).join(' · ')}</span>
        </button>
        <button className="info-btn" onClick={() => p.onOpenEmployee(p.emp)} title="Ver ficha (teléfono, resumen y notas)" aria-label={`Ficha de ${p.emp.nombre}`}>ⓘ</button>
      </th>
      <td className="sticky-col sig-col sig" title={p.emp.siglas ? `Siglas: ${p.emp.siglas}` : 'Sin siglas'}>{p.emp.siglas}</td>
      <td className={`sticky-col vac-col vac ${p.vacLeft != null && p.vacLeft < 0 ? 'neg' : ''}`}>{p.vacLeft ?? ''}</td>
      {p.days.map((d, ci) => {
        const code = codes[ci];
        const c = code ? p.codeByKey.get(code) : undefined;
        const inSel = ci >= p.selC0 && ci <= p.selC1 && p.selC0 >= 0;
        const here = remotes[ci] ? remotes[ci].split('\u0003').map((x) => { const [name, color] = x.split('\u0002'); return { name, color }; }) : [];
        const cls = [
          'cell',
          isWeekend(d) ? 'we' : '',
          d === p.today ? 'today' : '',
          weekday(d) === 1 ? 'monday' : '',
          inSel ? 'sel' : '',
          ci === p.focusC ? 'focus' : '',
          flashing.has(d) ? 'flash' : '',
          code && !c ? 'unknown' : '',
          notes[ci] ? 'has-note' : '',
          here.length ? 'remote' : '',
        ].join(' ');
        const tip = [
          c ? `${c.code} · ${c.label}` : '',
          notes[ci] ? `📝 ${notes[ci]}` : '',
          here.length ? `👤 Aquí está: ${here.map((h) => h.name).join(', ')}` : '',
        ].filter(Boolean).join('\n\n');
        const style: Record<string, string> = {};
        if (c) { style.background = c.color; style.color = c.textColor; }
        if (here.length) style['--rc'] = here[0].color;
        return (
          <td
            key={d}
            data-cell={`${p.ri}-${ci}`}
            className={cls}
            style={style}
            onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); p.onDown(p.ri, ci, e.shiftKey); } }}
            onMouseEnter={() => p.onEnter(p.ri, ci)}
            title={tip || undefined}
          >
            {here.length > 0 && <span className="remote-tag" style={{ background: here[0].color }}>{initials(here[0].name)}{here.length > 1 ? `+${here.length - 1}` : ''}</span>}
            {code}
          </td>
        );
      })}
    </tr>
  );
}, (a, b) => a.sig === b.sig && a.noteSig === b.noteSig && a.remoteSig === b.remoteSig && a.selC0 === b.selC0 && a.selC1 === b.selC1
  && a.rowSelected === b.rowSelected && a.focusC === b.focusC && a.flashSig === b.flashSig && a.emp === b.emp && a.days === b.days
  && a.vacLeft === b.vacLeft && a.codeByKey === b.codeByKey && a.ri === b.ri && a.canEdit === b.canEdit);
