import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../data/useAppData';
import { MONTHS_SHORT } from '../lib/dates';
import { matches } from '../lib/search';

/** Equivalente a la hoja "Resumen año" y a las columnas de totales del Excel. */
export function SummaryView({ data }: { data: AppData }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [equipo, setEquipo] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'orden', dir: 1 });

  useEffect(() => { data.loadYear(year); }, [year, data.loadYear]);

  const active = useMemo(() => data.employees.filter((e) => e.activo), [data.employees]);
  const equipos = [...new Set(active.map((e) => e.equipo).filter(Boolean))].sort();
  const people = useMemo(
    () => active.filter((e) => (!equipo || e.equipo === equipo) && matches(q, e.nombre, e.siglas)),
    [active, equipo, q],
  );
  const absenceCodes = useMemo(() => new Set(data.codes.filter((c) => c.category === 'ausencia').map((c) => c.code)), [data.codes]);

  const { counts, monthly } = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    const monthly = Array.from({ length: 12 }, () => 0);
    const ids = new Set(people.map((p) => p.id));
    for (const e of data.entries.values()) {
      if (!e.date.startsWith(`${year}-`) || !ids.has(e.employeeId)) continue;
      if (!counts.has(e.employeeId)) counts.set(e.employeeId, new Map());
      const m = counts.get(e.employeeId)!;
      m.set(e.code, (m.get(e.code) ?? 0) + 1);
      if (absenceCodes.has(e.code)) monthly[Number(e.date.slice(5, 7)) - 1]++;
    }
    return { counts, monthly };
  }, [data.entries, year, people, absenceCodes]);

  const usedCodes = data.codes.filter((c) => [...counts.values()].some((m) => m.has(c.code)));
  const rows = people.map((e) => {
    const m = counts.get(e.id) ?? new Map<string, number>();
    const totalAbs = [...m.entries()].filter(([c]) => absenceCodes.has(c)).reduce((s, [, n]) => s + n, 0);
    return { e, m, vLeft: e.diasVacaciones - (m.get('V') ?? 0), vpLeft: e.vpPendientes - (m.get('VP') ?? 0), totalAbs };
  });
  const val = (r: (typeof rows)[number], key: string): number | string => {
    if (key === 'orden') return r.e.orden;
    if (key === 'nombre') return r.e.nombre;
    if (key === 'vLeft') return r.vLeft;
    if (key === 'vpLeft') return r.vpLeft;
    if (key === 'totalAbs') return r.totalAbs;
    return r.m.get(key) ?? 0;
  };
  rows.sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir;
  });
  const th = (key: string, label: string, title?: string) => (
    <th className="sortable" title={title} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : (key === 'nombre' || key === 'orden' ? 1 : -1) }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const max = Math.max(1, ...monthly);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Resumen del año</h1>
          <p className="muted">Días de cada clave por persona y vacaciones pendientes. Haz clic en una columna para ordenar.</p>
        </div>
        <div className="filters">
          <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Año anterior">‹</button>
          <b className="year">{year}</b>
          <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Año siguiente">›</button>
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)} aria-label="Equipo">
            <option value="">Todos los equipos</option>
            {equipos.map((x) => <option key={x}>{x}</option>)}
          </select>
          <input className="search" placeholder="🔍 Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="panel">
        <h2>Días de ausencia por mes ({people.length} personas)</h2>
        <div className="bars">
          {monthly.map((n, i) => (
            <div key={i} className="bar-col" title={`${MONTHS_SHORT[i]}: ${n} días de ausencia`}>
              <span className="bar-val">{n || ''}</span>
              <div className="bar" style={{ height: `${(n / max) * 100}%` }} />
              <span className="bar-label">{MONTHS_SHORT[i]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="table-scroll">
        <table className="table summary">
          <thead>
            <tr>
              {th('nombre', 'Persona')}
              {th('vLeft', 'Vac. pend.', 'Días de vacaciones del año que quedan')}
              {th('vpLeft', 'VP pend.', 'Vacaciones del año anterior que quedan')}
              {th('totalAbs', 'Total aus.', 'Suma de días con claves de ausencia')}
              {usedCodes.map((c) => (
                <th key={c.code} className="sortable code-th" title={c.label}
                  onClick={() => setSort((s) => ({ key: c.code, dir: s.key === c.code ? (-s.dir as 1 | -1) : -1 }))}>
                  <span className="chip small" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
                  {sort.key === c.code ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, m, vLeft, vpLeft, totalAbs }) => (
              <tr key={e.id}>
                <td><b>{e.nombre}</b><div className="muted small">{[e.equipo, e.zona].filter(Boolean).join(' · ')}</div></td>
                <td className={`num ${vLeft < 0 ? 'neg' : vLeft === 0 ? 'zero' : ''}`}>{vLeft} <span className="muted small">/ {e.diasVacaciones}</span></td>
                <td className={`num ${vpLeft < 0 ? 'neg' : ''}`}>{e.vpPendientes ? vpLeft : <span className="muted">–</span>}</td>
                <td className="num"><b>{totalAbs}</b></td>
                {usedCodes.map((c) => <td key={c.code} className="num">{m.get(c.code) || ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
