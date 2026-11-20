import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../../data/useAppData';
import { addDays, dateRange, formatDate, isWeekend, parseIso, todayIso, WEEKDAY_LETTER, weekday } from '../../lib/dates';
import { candidates, workWeek, zoneDay, type ZoneDay } from '../../lib/ops';
import { LEVEL_LABEL, nextWorkday, useOpsBase, Chip, Dot, NoteBadge } from './shared';
import { ZoneDetail } from './CommandCenter';

// =====================================================================
// Mapa de cobertura
// =====================================================================
export function CoverageMap({ data, onAsk }: { data: AppData; onAsk: (zona: string, date: string) => void }) {
  const [start, setStart] = useState(() => workWeek(nextWorkday(todayIso()))[0]);
  const [weeks, setWeeks] = useState(2);
  const [detail, setDetail] = useState<ZoneDay | null>(null);
  const { staff, zones, absence } = useOpsBase(data);
  const days = useMemo(() => dateRange(start, addDays(start, weeks * 7 - 1)).filter((d) => !isWeekend(d)), [start, weeks]);
  useEffect(() => { new Set(days.map((d) => parseIso(d).y)).forEach((y) => data.loadYear(y)); }, [days, data.loadYear]);
  const grid = useMemo(() => zones.map((z) => ({ zona: z, cells: days.map((d) => zoneDay(z, d, staff, data.entries, data.notes, absence, data.ops)) })),
    [zones, days, staff, data.entries, data.notes, absence, data.ops]);
  const red = grid.reduce((s, r) => s + r.cells.filter((c) => c.level === 'bajo').length, 0);
  const amber = grid.reduce((s, r) => s + r.cells.filter((c) => c.level === 'justo').length, 0);

  return (
    <>
      <div className="toolbar ops-toolbar">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Semana anterior">‹</button>
        <b>{formatDate(days[0])} – {formatDate(days[days.length - 1])}</b>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Semana siguiente">›</button>
        <button onClick={() => setStart(workWeek(nextWorkday(todayIso()))[0])}>Esta semana</button>
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Semanas">
          {[1, 2, 4].map((w) => <option key={w} value={w}>{w} semana{w > 1 ? 's' : ''}</option>)}
        </select>
        <span className="spacer" />
        <span className="legend-inline"><Dot level="ok" /> cubierta <Dot level="justo" /> justa (en el mínimo) <Dot level="bajo" /> sin cubrir <Dot level="festivo" /> festivo</span>
      </div>
      <p className="muted small">{red} casilla(s) sin cubrir y {amber} justas. Cada casilla: técnicos trabajando / total de la zona. Clic para ver quién está.</p>
      <div className="table-scroll">
        <table className="cov">
          <thead>
            <tr>
              <th className="cov-zone">Zona</th>
              {days.map((d) => <th key={d} className={d === todayIso() ? 'today' : weekday(d) === 1 ? 'monday' : ''}>{WEEKDAY_LETTER[weekday(d)]}<br />{parseIso(d).d}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.zona}>
                <th className="cov-zone">{row.zona} <span className="muted small">({row.cells[0]?.total ?? 0})</span></th>
                {row.cells.map((c) => (
                  <td key={c.date} className={`cov-cell ${c.level} ${weekday(c.date) === 1 ? 'monday' : ''}`} onClick={() => setDetail(c)}
                    title={`${c.zona} · ${formatDate(c.date)}: ${LEVEL_LABEL[c.level]} (${c.working}/${c.total})${c.fuera.length ? `\nFuera: ${c.fuera.map((f) => `${f.emp.nombre} (${f.code})`).join(', ')}` : ''}`}>
                    {c.level === 'festivo' ? 'F' : `${c.working}/${c.total}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && <ZoneDetail z={detail} data={data} onClose={() => setDetail(null)} onAsk={() => { setDetail(null); onAsk(detail.zona, detail.date); }} />}
    </>
  );
}

// =====================================================================
// ¿Quién puede ir?
// =====================================================================
export function WhoCanGo({ data, initial }: { data: AppData; initial: { zona: string; date: string } | null }) {
  const { staff, zones, absence } = useOpsBase(data);
  const [zona, setZona] = useState(initial?.zona ?? zones[0] ?? '');
  const [date, setDate] = useState(initial?.date ?? nextWorkday(todayIso()));
  const [all, setAll] = useState(false);
  useEffect(() => { if (initial) { setZona(initial.zona); setDate(initial.date); } }, [initial]);
  useEffect(() => { data.loadYear(parseIso(date).y); }, [date, data.loadYear]);
  const near = useMemo(() => (zona ? candidates(zona, date, staff, data.entries, data.notes, absence, data.ops, { allZones: all }) : []),
    [zona, date, staff, data.entries, data.notes, absence, data.ops, all]);
  // Si en la zona y sus vecinas no hay nadie, se proponen directamente las demás zonas
  const fallback = !near.length && !all;
  const list = useMemo(() => (fallback && zona ? candidates(zona, date, staff, data.entries, data.notes, absence, data.ops, { allZones: true }) : near),
    [fallback, near, zona, date, staff, data.entries, data.notes, absence, data.ops]);
  const zd = zona ? zoneDay(zona, date, staff, data.entries, data.notes, absence, data.ops) : null;
  const vecinas = data.ops.zonas[zona]?.vecinas ?? [];
  const RANK = ['De la zona', 'Zona vecina', 'Otra zona'];

  return (
    <>
      <div className="toolbar ops-toolbar">
        <label className="inline">Zona
          <select value={zona} onChange={(e) => setZona(e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
        </label>
        <label className="inline">Día <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Incluir todas las zonas</label>
        <span className="spacer" />
        {zd && <span><Dot level={zd.level} /> {zona}: {zd.working}/{zd.total} trabajando ese día</span>}
      </div>
      <p className="muted small">
        Ordenados: primero los de {zona || 'la zona'}, luego zonas vecinas{vecinas.length ? ` (${vecinas.join(', ')})` : ' (ninguna configurada: Ajustes → Zonas)'}; libres antes que en cliente y, a igualdad, quien menos PC lleva esa semana y ese mes.
      </p>
      {fallback && list.length > 0 && <p className="warn-box">No hay nadie disponible en {zona}{vecinas.length ? ' ni en sus vecinas' : ''}. Estos son los disponibles de otras zonas:</p>}
      {!list.length ? <div className="empty">No hay nadie disponible ese día.</div> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>#</th><th>Persona</th><th>Zona</th><th>Ese día</th><th className="num">PC semana</th><th className="num">PC mes</th><th>Teléfono</th></tr></thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.emp.id} className={i === 0 ? 'best' : ''}>
                  <td>{i + 1}</td>
                  <td><b>{c.emp.nombre}</b> <span className="sig">{c.emp.siglas}</span></td>
                  <td>{c.emp.zona} <span className="tag gray">{RANK[c.rank]}</span></td>
                  <td>{c.status === 'libre'
                    ? <><span className="ok">Libre{c.code ? <> (<Chip code={c.code} data={data} />)</> : ''}</span><NoteBadge text={c.note} /></>
                    : <><Chip code={c.code!} data={data} /> en cliente{c.note && <div className="muted small pre">{c.note}</div>}</>}</td>
                  <td className="num">{c.weekLoad}</td>
                  <td className="num">{c.monthLoad}</td>
                  <td className="nowrap">{c.emp.telefono ? <a href={`tel:${c.emp.telefono.split(/[\s/]+/)[0]}`}>{c.emp.telefono}</a> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
