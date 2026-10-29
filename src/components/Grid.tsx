import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import type { CellChange, Code, Employee, Entry, Note } from '../types';
import { entryKey } from '../data/useAppData';
import { WEEKDAY_LETTER, formatDate, formatDateLong, isWeekend, isoWeek, parseIso, todayIso, weekday } from '../lib/dates';
import { normalizeCode } from '../lib/codes';
import { CodePicker } from './CodePicker';
import { useUi } from './ui';

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
  onApply: (changes: CellChange[], label: string) => Promise<boolean>;
  onSaveNote: (employeeId: string, date: string, text: string, label: string) => Promise<boolean>;
  onOpenEmployee: (e: Employee) => void;
}

const rect = (s: Sel) => ({
  r0: Math.min(s.a.r, s.f.r), r1: Math.max(s.a.r, s.f.r),
  c0: Math.min(s.a.c, s.f.c), c1: Math.max(s.a.c, s.f.c),
});

export function Grid(p: Props) {
  const { toast } = useUi();
  const [sel, setSel] = useState<Sel | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; filter: string } | null>(null);
  const dragging = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const today = todayIso();

  // Si cambia el mes o el filtro, la selección deja de tener sentido
  useEffect(() => { setSel(null); setPicker(null); }, [p.days[0], p.employees.length]);

  const r = sel ? rect(sel) : null;
  const selCount = r ? (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1) : 0;

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

  const openPicker = (filter = '') => {
    if (!sel || !p.canEdit) return;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-cell="${sel.f.r}-${sel.f.c}"]`);
    const b = el?.getBoundingClientRect();
    setPicker({ x: b ? b.left : 200, y: b ? b.bottom + 4 : 200, filter });
  };

  const applyCode = async (code: string | null) => {
    const cells = cellsInSel();
    setPicker(null);
    if (!cells.length) return;
    const label = code
      ? `Marca ${code} · ${cells.length === 1 ? `${cells[0].emp.nombre} ${formatDate(cells[0].date)}` : describeSel()}`
      : `Borra · ${cells.length === 1 ? `${cells[0].emp.nombre} ${formatDate(cells[0].date)}` : describeSel()}`;
    await p.onApply(cells.map((c) => ({ employeeId: c.emp.id, date: c.date, code })), label);
    wrap.current?.focus();
  };

  const move = (dr: number, dc: number, extend: boolean) => {
    setSel((s) => {
      const base = s ?? { a: { r: 0, c: 0 }, f: { r: 0, c: 0 } };
      const f = {
        r: Math.max(0, Math.min(p.employees.length - 1, base.f.r + dr)),
        c: Math.max(0, Math.min(p.days.length - 1, base.f.c + dc)),
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
    if (changes.length) await p.onApply(changes, `Pega ${changes.length} celda(s)`);
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
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (sel && p.canEdit) applyCode(null); }
    else if (k === 'Escape') { setSel(null); }
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

  const singleKey = r && selCount === 1 && p.employees[r.r0] ? entryKey(p.employees[r.r0].id, p.days[r.c0]) : null;
  const single = singleKey ? p.entries.get(singleKey) : undefined;
  const singleNote = singleKey ? p.notes.get(singleKey) ?? null : null;

  const saveNote = async (text: string) => {
    if (!r || selCount !== 1) return;
    const emp = p.employees[r.r0];
    const date = p.days[r.c0];
    const label = `${text.trim() ? 'Nota' : 'Borra nota'} · ${emp.nombre} ${formatDate(date)}`;
    if (await p.onSaveNote(emp.id, date, text, label)) setPicker(null);
    wrap.current?.focus();
  };

  return (
    <div className="grid-wrap" ref={wrap} tabIndex={0} onKeyDown={onKey} aria-label="Calendario de ausencias">
      <table className="grid">
        <thead>
          <tr className="weeks">
            <th className="sticky-col name-col" />
            <th className="sticky-col vac-col" />
            {p.days.map((d, i) => (weekday(d) === 1 || i === 0
              ? <th key={d} colSpan={Math.min(7 - ((weekday(d) + 6) % 7), p.days.length - i)} className="week-label">Sem. {isoWeek(d)}</th>
              : null))}
          </tr>
          <tr>
            <th className="sticky-col name-col corner">Persona</th>
            <th className="sticky-col vac-col corner" title="Días de vacaciones (V) que le quedan este año">Vac.</th>
            {p.days.map((d) => {
              const { d: dd } = parseIso(d);
              return (
                <th key={d} className={`day ${isWeekend(d) ? 'we' : ''} ${d === today ? 'today' : ''} ${weekday(d) === 1 ? 'monday' : ''}`}>
                  <span className="wd">{WEEKDAY_LETTER[weekday(d)]}</span>
                  <span className="dn">{dd}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row) => row.kind === 'group'
            ? (
              <tr key={`g-${row.label}`} className="group-row">
                <td className="sticky-col name-col group-label" colSpan={2}>{row.label} <small>({row.count})</small></td>
                <td colSpan={p.days.length} />
              </tr>
            )
            : (
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
                entries={p.entries}
                codeByKey={p.codeByKey}
                selC0={r && row.idx >= r.r0 && row.idx <= r.r1 ? r.c0 : -1}
                selC1={r && row.idx >= r.r0 && row.idx <= r.r1 ? r.c1 : -1}
                focusC={sel && sel.f.r === row.idx ? sel.f.c : -1}
                flashSig={p.days.filter((d) => p.flash.has(entryKey(row.emp.id, d))).join(',')}
                vacLeft={p.vacLeft.get(row.emp.id)}
                onDown={onCellDown}
                onEnter={onCellEnter}
                onOpenEmployee={p.onOpenEmployee}
              />
            ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky-col name-col foot-label">Ausencias del día</td>
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
          onSaveNote={saveNote}
          onPick={applyCode}
          onClose={() => { setPicker(null); wrap.current?.focus(); }}
        />
      )}
    </div>
  );
}

interface RowProps {
  emp: Employee; ri: number; days: string[]; today: string; sig: string; noteSig: string;
  entries: Map<string, Entry>; codeByKey: Map<string, Code>;
  selC0: number; selC1: number; focusC: number; flashSig: string; vacLeft?: number;
  onDown: (r: number, c: number, shift: boolean) => void;
  onEnter: (r: number, c: number) => void;
  onOpenEmployee: (e: Employee) => void;
}

/** Fila memorizada: solo se repinta si cambian sus marcas, su selección o su resaltado. */
const GridRowView = memo(function GridRowView(p: RowProps) {
  const codes = p.sig.split('|');
  const notes = p.noteSig.split('\u0001');
  const flashing = new Set(p.flashSig ? p.flashSig.split(',') : []);
  return (
    <tr>
      <th className="sticky-col name-col person" scope="row">
        <button className="person-btn" onClick={() => p.onOpenEmployee(p.emp)} title={`${p.emp.nombre}\n${[p.emp.sede, p.emp.zona, p.emp.telefono && `Tel: ${p.emp.telefono}`, p.emp.extension && `Ext: ${p.emp.extension}`].filter(Boolean).join(' · ')}`}>
          <span className="pname">{p.emp.nombre}</span>
          <span className="psub">{[p.emp.equipo, p.emp.zona, p.emp.sede].filter(Boolean).join(' · ')}</span>
        </button>
      </th>
      <td className={`sticky-col vac-col vac ${p.vacLeft != null && p.vacLeft < 0 ? 'neg' : ''}`}>{p.vacLeft ?? ''}</td>
      {p.days.map((d, ci) => {
        const code = codes[ci];
        const c = code ? p.codeByKey.get(code) : undefined;
        const inSel = ci >= p.selC0 && ci <= p.selC1 && p.selC0 >= 0;
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
        ].join(' ');
        const tip = [c ? `${c.code} · ${c.label}` : '', notes[ci] ? `📝 ${notes[ci]}` : ''].filter(Boolean).join('\n\n');
        return (
          <td
            key={d}
            data-cell={`${p.ri}-${ci}`}
            className={cls}
            style={c ? { background: c.color, color: c.textColor } : undefined}
            onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); p.onDown(p.ri, ci, e.shiftKey); } }}
            onMouseEnter={() => p.onEnter(p.ri, ci)}
            title={tip || undefined}
          >
            {code}
          </td>
        );
      })}
    </tr>
  );
}, (a, b) => a.sig === b.sig && a.noteSig === b.noteSig && a.selC0 === b.selC0 && a.selC1 === b.selC1 && a.focusC === b.focusC
  && a.flashSig === b.flashSig && a.emp === b.emp && a.days === b.days && a.vacLeft === b.vacLeft
  && a.codeByKey === b.codeByKey && a.ri === b.ri);
