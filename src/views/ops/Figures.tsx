import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../../data/useAppData';
import { MONTHS, dateRange, formatDate, isWeekend, parseIso, todayIso } from '../../lib/dates';
import { balances, median, pcLoad } from '../../lib/ops';
import { r1, useOpsBase } from './shared';

// =====================================================================
// Carga de presencial
// =====================================================================
type Period = 'mes' | 'mesAnt' | 'trim' | 'anio';

function periodRange(p: Period, today: string): [string, string, string] {
  const { y, m0 } = parseIso(today);
  const mm = (m: number) => String(m + 1).padStart(2, '0');
  const last = (yy: number, m: number) => new Date(Date.UTC(yy, m + 1, 0)).getUTCDate();
  if (p === 'mes') return [`${y}-${mm(m0)}-01`, `${y}-${mm(m0)}-${last(y, m0)}`, `${MONTHS[m0]} ${y}`];
  if (p === 'mesAnt') { const yy = m0 ? y : y - 1; const m = (m0 + 11) % 12; return [`${yy}-${mm(m)}-01`, `${yy}-${mm(m)}-${last(yy, m)}`, `${MONTHS[m]} ${yy}`]; }
  if (p === 'trim') { const q = Math.floor(m0 / 3) * 3; return [`${y}-${mm(q)}-01`, `${y}-${mm(q + 2)}-${last(y, q + 2)}`, `${q / 3 + 1}.º trimestre ${y}`]; }
  return [`${y}-01-01`, `${y}-12-31`, `Año ${y}`];
}

export function Workload({ data }: { data: AppData }) {
  const { staff, zones } = useOpsBase(data);
  const [period, setPeriod] = useState<Period>('mes');
  const [zona, setZona] = useState('');
  const [from, to, label] = periodRange(period, todayIso());
  useEffect(() => { data.loadYear(parseIso(from).y); }, [from, data.loadYear]);
  const rows = useMemo(() => {
    const load = pcLoad(staff, data.entries, from, to);
    const extra = new Map<string, { ts: number; tf: number }>();
    for (const e of data.entries.values()) {
      if (e.date < from || e.date > to || (e.code !== 'TS' && e.code !== 'TF')) continue;
      const x = extra.get(e.employeeId) ?? { ts: 0, tf: 0 };
      if (e.code === 'TS') x.ts++; else x.tf++;
      extra.set(e.employeeId, x);
    }
    const medByZone = new Map(zones.map((z) => [z, median(staff.filter((e) => (e.zona || '(sin zona)') === z).map((e) => load.get(e.id) ?? 0))]));
    return staff.map((e) => {
      const pc = load.get(e.id) ?? 0;
      const med = medByZone.get(e.zona || '(sin zona)') ?? 0;
      return { e, pc, med, diff: pc - med, ...(extra.get(e.id) ?? { ts: 0, tf: 0 }) };
    }).sort((a, b) => b.pc - a.pc || a.e.nombre.localeCompare(b.e.nombre));
  }, [staff, zones, data.entries, from, to]);
  const shown = rows.filter((r) => !zona || r.e.zona === zona);
  const max = Math.max(1, ...shown.map((r) => r.pc));
  const totalPc = shown.reduce((s, r) => s + r.pc, 0);
  const top = [...shown].sort((a, b) => b.pc - a.pc);
  const top20 = top.slice(0, Math.max(1, Math.ceil(top.length * 0.2))).reduce((s, r) => s + r.pc, 0);

  return (
    <>
      <div className="toolbar ops-toolbar">
        <div className="seg">
          {([['mes', 'Este mes'], ['mesAnt', 'Mes anterior'], ['trim', 'Trimestre'], ['anio', 'Año']] as [Period, string][]).map(([k, l]) => (
            <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <select value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
          <option value="">Todas las zonas</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <span className="muted">{label} · {formatDate(from)}–{formatDate(to)}</span>
      </div>
      <div className="stats">
        <div className="stat"><b>{r1(totalPc)}</b><span>días de PC</span></div>
        <div className="stat"><b>{r1(median(shown.map((r) => r.pc)))}</b><span>mediana por técnico</span></div>
        <div className="stat"><b>{totalPc ? Math.round((top20 / totalPc) * 100) : 0}%</b><span>del PC lo hace el 20 % más cargado</span></div>
      </div>
      <p className="muted small">PC cuenta 1 día y PC de media jornada, medio. La barra compara con el más cargado; «vs. zona» es la diferencia con la mediana de su zona.</p>
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Persona</th><th>Zona</th><th className="num">PC</th><th style={{ width: '30%' }} /><th className="num">vs. zona</th><th className="num">TS</th><th className="num">TF</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.e.id}>
                <td><b>{r.e.nombre}</b> <span className="sig">{r.e.siglas}</span></td>
                <td>{r.e.zona}</td>
                <td className="num"><b>{r.pc}</b></td>
                <td><div className="hbar"><div style={{ width: `${(r.pc / max) * 100}%` }} className={r.diff > Math.max(3, r.med) ? 'hot' : ''} /></div></td>
                <td className={`num ${r.diff > 0 ? 'warn' : r.diff < 0 ? 'muted' : ''}`}>{r.diff > 0 ? '+' : ''}{r1(r.diff)}</td>
                <td className="num">{r.ts || ''}</td>
                <td className="num">{r.tf || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =====================================================================
// Saldos
// =====================================================================
export function Balances({ data }: { data: AppData }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [equipo, setEquipo] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  useEffect(() => { data.loadYear(year); }, [year, data.loadYear]);
  const active = useMemo(() => data.employees.filter((e) => e.activo), [data.employees]);
  const equipos = [...new Set(active.map((e) => e.equipo).filter(Boolean))].sort();
  const rows = useMemo(() => balances(active, data.entries, year).sort((a, b) => b.vacLeft - a.vacLeft || a.emp.nombre.localeCompare(b.emp.nombre)), [active, data.entries, year]);
  const shown = rows.filter((r) => (!equipo || r.emp.equipo === equipo) && (!onlyPending || r.vacLeft >= 10));
  const pend10 = rows.filter((r) => r.vacLeft >= 10);
  const daysLeft = dateRange(todayIso(), `${year}-12-31`).filter((d) => !isWeekend(d)).length;

  return (
    <>
      <div className="toolbar ops-toolbar">
        <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Año anterior">‹</button>
        <b className="year">{year}</b>
        <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Año siguiente">›</button>
        <select value={equipo} onChange={(e) => setEquipo(e.target.value)} aria-label="Equipo">
          <option value="">Todos los equipos</option>
          {equipos.map((x) => <option key={x}>{x}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo con 10 días o más pendientes</label>
      </div>
      {year === new Date().getFullYear() && pend10.length > 0 && (
        <div className="warn-box">
          <b>{pend10.length} personas</b> tienen 10 días o más de vacaciones sin coger ({pend10.reduce((s, r) => s + r.vacLeft, 0)} días en total) y quedan <b>{daysLeft} días laborables</b> hasta fin de año.
        </div>
      )}
      <p className="muted small">«Trabajados» = festivos y sábados trabajados (TF + TS). «Libres» = Lf + Lh disfrutados. Es un contador informativo: no presupone si se compensan con días o se pagan.</p>
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Persona</th><th>Equipo · zona</th><th className="num">Vac. pendientes</th><th className="num">VP pend.</th><th className="num">Trabajados TF+TS</th><th className="num">Libres Lf+Lh</th><th className="num">Bajas (B)</th><th className="num">PC</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.emp.id}>
                <td><b>{r.emp.nombre}</b></td>
                <td className="small">{[r.emp.equipo, r.emp.zona].filter(Boolean).join(' · ')}</td>
                <td className={`num ${r.vacLeft < 0 ? 'neg' : r.vacLeft >= 10 ? 'warn' : ''}`}><b>{r.vacLeft}</b> <span className="muted small">/ {r.vac}</span></td>
                <td className="num">{r.emp.vpPendientes ? r.vpLeft : <span className="muted">–</span>}</td>
                <td className="num">{r.worked || ''}</td>
                <td className="num">{r.compensated || ''}</td>
                <td className="num">{r.bajas || ''}</td>
                <td className="num">{r.pc || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
