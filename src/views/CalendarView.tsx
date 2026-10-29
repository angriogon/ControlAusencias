import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../data/useAppData';
import { entryKey } from '../data/useAppData';
import type { CellChange, Code, Employee } from '../types';
import { MONTHS, dateRange, isWeekend, monthDays, todayIso, parseIso, formatDate } from '../lib/dates';
import { codeMap } from '../lib/codes';
import { Grid, type GridRow, type GroupRow } from '../components/Grid';
import { Modal, useUi } from '../components/ui';
import { EmployeeCard } from './EmployeeCard';

type GroupBy = 'none' | 'equipo' | 'zona' | 'teamLeader' | 'sede';
const GROUP_LABEL: Record<GroupBy, string> = { none: 'Sin agrupar', equipo: 'Equipo', zona: 'Zona', teamLeader: 'Team leader', sede: 'Sede' };

const PREFS = 'ca-calendar-prefs';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) ?? '{}'); } catch { return {}; }
}

export function CalendarView({ data, onEditEmployee }: { data: AppData; onEditEmployee: (e: Employee) => void }) {
  const t = parseIso(todayIso());
  const saved = loadPrefs();
  const [ym, setYm] = useState({ y: t.y, m: t.m0 });
  const [q, setQ] = useState('');
  const [equipo, setEquipo] = useState<string>(saved.equipo ?? '');
  const [zona, setZona] = useState<string>(saved.zona ?? '');
  const [tl, setTl] = useState<string>(saved.tl ?? '');
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy ?? 'none');
  const [showLegend, setShowLegend] = useState<boolean>(saved.showLegend ?? true);
  const [period, setPeriod] = useState(false);
  const [card, setCard] = useState<Employee | null>(null);

  useEffect(() => {
    try { localStorage.setItem(PREFS, JSON.stringify({ equipo, zona, tl, groupBy, showLegend })); } catch { /* sin almacenamiento */ }
  }, [equipo, zona, tl, groupBy, showLegend]);

  useEffect(() => { data.loadYear(ym.y); }, [ym.y, data.loadYear]);

  const days = useMemo(() => monthDays(ym.y, ym.m), [ym.y, ym.m]);
  const codeByKey = useMemo(() => codeMap(data.codes), [data.codes]);
  const active = useMemo(() => data.employees.filter((e) => e.activo), [data.employees]);
  const opts = (k: keyof Employee) => [...new Set(active.map((e) => String(e[k] ?? '')).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active.filter((e) => (!equipo || e.equipo === equipo) && (!zona || e.zona === zona) && (!tl || e.teamLeader === tl)
      && (!s || [e.nombre, e.sede, e.zona, e.equipo, e.almacen, e.telefono, e.extension, e.teamLeader].join(' ').toLowerCase().includes(s)));
  }, [active, q, equipo, zona, tl]);

  const { rows, ordered } = useMemo(() => {
    if (groupBy === 'none') {
      return { ordered: filtered, rows: filtered.map((emp, idx): GridRow => ({ kind: 'emp', emp, idx })) };
    }
    const groups = new Map<string, Employee[]>();
    for (const e of filtered) {
      const k = String(e[groupBy] || '(sin dato)');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    const ordered: Employee[] = [];
    const rows: (GridRow | GroupRow)[] = [];
    for (const [label, list] of groups) {
      rows.push({ kind: 'group', label, count: list.length });
      for (const emp of list) { rows.push({ kind: 'emp', emp, idx: ordered.length }); ordered.push(emp); }
    }
    return { rows, ordered };
  }, [filtered, groupBy]);

  // Vacaciones que quedan en el año que se está viendo
  const vacLeft = useMemo(() => {
    const used = new Map<string, number>();
    const prefix = `${ym.y}-`;
    for (const e of data.entries.values()) {
      if (e.code === 'V' && e.date.startsWith(prefix)) used.set(e.employeeId, (used.get(e.employeeId) ?? 0) + 1);
    }
    return new Map(active.map((e) => [e.id, e.diasVacaciones - (used.get(e.id) ?? 0)]));
  }, [data.entries, active, ym.y]);

  const go = (delta: number) => setYm(({ y, m }) => {
    const n = m + delta;
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
  });

  const filtersOn = !!(q || equipo || zona || tl);
  const usedCodes = useMemo(() => {
    const s = new Set<string>();
    for (const e of ordered) for (const d of days) { const c = data.entries.get(entryKey(e.id, d))?.code; if (c) s.add(c); }
    return s;
  }, [ordered, days, data.entries]);

  return (
    <div className="calendar-view">
      <div className="toolbar">
        <div className="month-nav">
          <button className="icon-btn big" onClick={() => go(-1)} aria-label="Mes anterior">‹</button>
          <div className="month-title">
            <select value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })} aria-label="Mes">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <input type="number" value={ym.y} min={2000} max={2100} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) || ym.y })} aria-label="Año" />
          </div>
          <button className="icon-btn big" onClick={() => go(1)} aria-label="Mes siguiente">›</button>
          <button onClick={() => setYm({ y: t.y, m: t.m0 })}>Hoy</button>
        </div>

        <div className="filters">
          <input className="search" placeholder="🔍 Buscar persona, sede, teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)} aria-label="Equipo">
            <option value="">Todos los equipos</option>
            {opts('equipo').map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
            <option value="">Todas las zonas</option>
            {opts('zona').map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={tl} onChange={(e) => setTl(e.target.value)} aria-label="Team leader">
            <option value="">Todos los TL</option>
            {opts('teamLeader').map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar">
            {Object.entries(GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{k === 'none' ? v : `Agrupar: ${v}`}</option>)}
          </select>
          {filtersOn && <button className="link" onClick={() => { setQ(''); setEquipo(''); setZona(''); setTl(''); }}>Quitar filtros</button>}
        </div>

        <div className="actions">
          <button className="primary" onClick={() => setPeriod(true)} disabled={!data.canEdit}>＋ Marcar periodo</button>
          <button onClick={() => setShowLegend((v) => !v)}>{showLegend ? 'Ocultar leyenda' : 'Ver leyenda'}</button>
        </div>
      </div>

      {showLegend && <Legend codes={data.codes} used={usedCodes} />}

      <div className="hint">
        Haz clic en un día para marcarlo · Arrastra para marcar varios · Teclado: flechas, escribe la clave + Enter, Supr para borrar, Ctrl+C / Ctrl+V, Ctrl+Z para deshacer.
      </div>

      {ordered.length === 0
        ? <div className="empty">No hay nadie que coincida con los filtros.</div>
        : (
          <Grid
            days={days}
            rows={rows}
            employees={ordered}
            entries={data.entries}
            notes={data.notes}
            codes={data.codes}
            codeByKey={codeByKey}
            flash={data.flash}
            canEdit={data.canEdit}
            vacLeft={vacLeft}
            onApply={data.apply}
            onSaveNote={data.saveNote}
            onOpenEmployee={setCard}
          />
        )}

      {period && (
        <PeriodDialog
          employees={ordered}
          codes={data.codes.filter((c) => c.activo)}
          month={ym}
          existing={(id, d) => data.entries.get(entryKey(id, d))?.code ?? null}
          onClose={() => setPeriod(false)}
          onApply={async (changes, label) => { if (await data.apply(changes, label)) setPeriod(false); }}
        />
      )}
      {card && (
        <EmployeeCard
          emp={card}
          year={ym.y}
          data={data}
          onClose={() => setCard(null)}
          onEdit={() => { setCard(null); onEditEmployee(card); }}
        />
      )}
    </div>
  );
}

function Legend({ codes, used }: { codes: Code[]; used: Set<string> }) {
  return (
    <div className="legend" aria-label="Leyenda de claves">
      {codes.filter((c) => c.activo).map((c) => (
        <span key={c.code} className={`legend-item ${used.has(c.code) ? '' : 'unused'}`} title={c.label}>
          <span className="chip small" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** Para marcar vacaciones de X a Y, festivos para todo un equipo, etc. sin arrastrar. */
function PeriodDialog({ employees, codes, month, existing, onClose, onApply }: {
  employees: Employee[]; codes: Code[]; month: { y: number; m: number };
  existing: (id: string, date: string) => string | null;
  onClose: () => void; onApply: (c: CellChange[], label: string) => void;
}) {
  const { toast } = useUi();
  const first = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const [who, setWho] = useState<string>(employees[0]?.id ?? '');
  const [from, setFrom] = useState(todayIso().slice(0, 7) === first.slice(0, 7) ? todayIso() : first);
  const [to, setTo] = useState(from);
  const [code, setCode] = useState('V');
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  const targets = who === '*' ? employees : employees.filter((e) => e.id === who);
  const dates = from && to ? dateRange(from, to).filter((d) => !skipWeekends || !isWeekend(d)) : [];
  const changes: CellChange[] = [];
  let skipped = 0;
  for (const e of targets) for (const d of dates) {
    const cur = existing(e.id, d);
    if (cur === code) continue;
    if (cur && !overwrite) { skipped++; continue; }
    changes.push({ employeeId: e.id, date: d, code });
  }
  const tooLong = from && to && dateRange(from, to).length >= 1000;

  const submit = async () => {
    if (!changes.length) { toast('No hay nada que marcar con esas opciones', 'info'); return; }
    setBusy(true);
    const whoTxt = who === '*' ? `${targets.length} personas` : targets[0]?.nombre;
    await onApply(changes, `Periodo ${code} · ${whoTxt} · ${formatDate(from)}–${formatDate(to)}`);
    setBusy(false);
  };

  return (
    <Modal title="Marcar un periodo" onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={busy || !changes.length || !!tooLong} onClick={submit}>
        {busy ? 'Guardando…' : `Marcar ${changes.length} día(s)`}
      </button>
    </>}>
      <div className="form">
        <label>Persona
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="*">— Todas las que se ven ahora ({employees.length}) —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <div className="row2">
          <label>Desde<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
          <label>Hasta<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label>Clave
          <div className="code-choice">
            {codes.map((c) => (
              <button type="button" key={c.code} className={`chip-btn ${code === c.code ? 'on' : ''}`} onClick={() => setCode(c.code)} title={c.label}>
                <span className="chip small" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </label>
        <label className="check"><input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} /> Saltar sábados y domingos</label>
        <label className="check"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Sustituir los días que ya tienen otra clave</label>
        {tooLong && <p className="warn">El periodo es demasiado largo.</p>}
        {skipped > 0 && !overwrite && <p className="muted">{skipped} día(s) ya tienen otra clave y no se tocarán.</p>}
      </div>
    </Modal>
  );
}
