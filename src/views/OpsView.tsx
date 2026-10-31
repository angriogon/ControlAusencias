import { useEffect, useMemo, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { AppUser, ChangeLog, Employee } from '../types';
import { MONTHS, addDays, dateRange, formatDate, formatDateLong, formatDateTime, isWeekend, parseIso, todayIso, WEEKDAY_LETTER, weekday } from '../lib/dates';
import { codeMap } from '../lib/codes';
import {
  absenceSet, balances, candidates, dataIssues, fieldStaff, median, ongoingSickLeaves, pcLoad, workWeek, zoneDay, zonesOf,
  type Level, type ZoneDay,
} from '../lib/ops';
import { Modal, useUi } from '../components/ui';
import { useAdmin } from '../components/admin';

type Sub = 'hoy' | 'cobertura' | 'quien' | 'carga' | 'saldos' | 'revisar';
const SUBS: [Sub, string][] = [
  ['hoy', '🎯 Centro de mando'],
  ['cobertura', '🗺️ Cobertura'],
  ['quien', '🙋 ¿Quién puede ir?'],
  ['carga', '⚖️ Carga'],
  ['saldos', '🧮 Saldos'],
  ['revisar', '🧹 Revisar datos'],
];

const LEVEL_LABEL: Record<Level, string> = { ok: 'Cubierta', justo: 'Justa', bajo: 'Sin cubrir', festivo: 'Festivo' };
const SEEN_KEY = 'ca-ops-seen';
/** Redondeo a un decimal para mostrar (las medias jornadas cuentan 0,5). */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Siguiente día laborable (L–V) a partir de una fecha (incluida si ya lo es). */
const nextWorkday = (d: string) => { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; };

export function OpsView({ store, data, user, onEditEmployee }: {
  store: DataStore; data: AppData; user: AppUser; onEditEmployee: (e: Employee) => void;
}) {
  const [sub, setSub] = useState<Sub>(() => { try { return (localStorage.getItem('ca-ops-sub') as Sub) || 'hoy'; } catch { return 'hoy'; } });
  const [ask, setAsk] = useState<{ zona: string; date: string } | null>(null);
  const [report, setReport] = useState(false);
  useEffect(() => { try { localStorage.setItem('ca-ops-sub', sub); } catch { /* */ } }, [sub]);

  const askWho = (zona: string, date: string) => { setAsk({ zona, date }); setSub('quien'); };

  return (
    <div className="page ops">
      <div className="page-head">
        <div>
          <h1>Operativa</h1>
          <p className="muted">Cobertura por zona, disponibilidad, carga de presencial y saldos de los técnicos de campo ({data.ops.equipos.join(', ')}).</p>
        </div>
        <button onClick={() => setReport(true)}>📄 Informe mensual (Excel)</button>
      </div>
      <nav className="subtabs" aria-label="Operativa">
        {SUBS.map(([k, label]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{label}</button>)}
      </nav>
      {sub === 'hoy' && <CommandCenter store={store} data={data} user={user} onAsk={askWho} onGo={setSub} />}
      {sub === 'cobertura' && <CoverageMap data={data} onAsk={askWho} />}
      {sub === 'quien' && <WhoCanGo data={data} initial={ask} />}
      {sub === 'carga' && <Workload data={data} />}
      {sub === 'saldos' && <Balances data={data} />}
      {sub === 'revisar' && <DataReview data={data} onEditEmployee={onEditEmployee} />}
      {report && <ReportDialog data={data} onClose={() => setReport(false)} />}
    </div>
  );
}

/** Datos comunes: técnicos de campo, zonas, claves de ausencia. */
function useOpsBase(data: AppData) {
  const staff = useMemo(() => fieldStaff(data.employees, data.ops), [data.employees, data.ops]);
  const zones = useMemo(() => zonesOf(staff), [staff]);
  const absence = useMemo(() => absenceSet(data.codes), [data.codes]);
  const codeBy = useMemo(() => codeMap(data.codes), [data.codes]);
  return { staff, zones, absence, codeBy };
}

function Chip({ code, data }: { code: string; data: AppData }) {
  const c = data.codes.find((x) => x.code === code);
  return <span className="chip small" style={{ background: c?.color ?? '#ddd', color: c?.textColor ?? '#000' }} title={c?.label}>{code}</span>;
}

function Dot({ level }: { level: Level }) {
  return <span className={`dot ${level}`} title={LEVEL_LABEL[level]} />;
}

// =====================================================================
// Centro de mando
// =====================================================================
function CommandCenter({ store, data, user, onAsk, onGo }: {
  store: DataStore; data: AppData; user: AppUser; onAsk: (zona: string, date: string) => void; onGo: (s: Sub) => void;
}) {
  const today = todayIso();
  const [date, setDate] = useState(nextWorkday(today));
  const [zoneFilter, setZoneFilter] = useState('');
  const [detail, setDetail] = useState<ZoneDay | null>(null);
  const { staff, zones, absence } = useOpsBase(data);
  const year = parseIso(date).y;
  useEffect(() => { data.loadYear(year); data.loadYear(parseIso(addDays(date, 14)).y); }, [year, date, data.loadYear]);

  const days = useMemo(() => zones.map((z) => zoneDay(z, date, staff, data.entries, data.notes, absence, data.ops)), [zones, date, staff, data.entries, data.notes, absence, data.ops]);
  const shown = days.filter((z) => !zoneFilter || z.zona === zoneFilter);
  const sum = days.reduce((a, z) => ({ total: a.total + z.total, working: a.working + z.working, pc: a.pc + z.enCliente.length, fuera: a.fuera + z.fuera.length }), { total: 0, working: 0, pc: 0, fuera: 0 });
  const red = days.filter((z) => z.level === 'bajo').length;

  // Alertas de los próximos 10 días laborables
  const upcoming = useMemo(() => {
    const out: ZoneDay[] = [];
    let d = nextWorkday(today);
    for (let i = 0; i < 10; i++) {
      for (const z of zones) {
        const zd = zoneDay(z, d, staff, data.entries, data.notes, absence, data.ops);
        if (zd.level === 'bajo') out.push(zd);
      }
      d = nextWorkday(addDays(d, 1));
    }
    return out;
  }, [today, zones, staff, data.entries, data.notes, absence, data.ops]);
  const sick = useMemo(() => ongoingSickLeaves(staff, data.entries, today).filter((s) => s.days >= 5), [staff, data.entries, today]);
  const vacAlert = useMemo(() => {
    const { y, m0 } = parseIso(today);
    if (m0 < 9) return null; // a partir de octubre
    const list = balances(data.employees.filter((e) => e.activo), data.entries, y).filter((b) => b.vacLeft >= 10);
    return { people: list.length, days: list.reduce((s, b) => s + b.vacLeft, 0) };
  }, [today, data.employees, data.entries]);

  const isTomorrow = date === nextWorkday(addDays(today, 1)) && date !== today;
  return (
    <>
      <div className="toolbar ops-toolbar">
        <div className="seg">
          <button className={date === today ? 'on' : ''} onClick={() => setDate(today)}>Hoy</button>
          <button className={isTomorrow ? 'on' : ''} onClick={() => setDate(nextWorkday(addDays(today, 1)))}>Siguiente laborable</button>
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Fecha" />
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">›</button>
        <b className="ops-date">{formatDateLong(date)}</b>
        <span className="spacer" />
        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} aria-label="Zona">
          <option value="">Todas las zonas</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
      </div>

      <div className="stats">
        <div className="stat"><b>{sum.working}<small>/{sum.total}</small></b><span>técnicos trabajando</span></div>
        <div className="stat"><b>{sum.total - sum.working}</b><span>fuera (ausencia o festivo)</span></div>
        <div className="stat"><b>{sum.pc}</b><span>en cliente (PC)</span></div>
        <div className="stat"><b>{sum.working - sum.pc}</b><span>libres para asignar</span></div>
        <div className={`stat ${red ? 'bad' : 'good'}`}><b>{red}</b><span>zonas sin cubrir</span></div>
      </div>

      <div className="ops-cols">
        <section className="panel">
          <h2>Zonas · {formatDate(date)}</h2>
          {isWeekend(date) && <p className="warn-box">Es fin de semana: la cobertura solo se vigila de lunes a viernes.</p>}
          <div className="zone-cards">
            {shown.map((z) => (
              <div key={z.zona} className={`zone-card ${z.level}`}>
                <div className="zone-head">
                  <Dot level={z.level} />
                  <b>{z.zona}</b>
                  <span className="muted small">{z.working}/{z.total} trabajando · mín. {z.min}</span>
                </div>
                <OutList items={[...z.fuera, ...z.festivo]} data={data} />
                <div className="small muted">
                  {z.libres.length} libre(s){z.enCliente.length ? ` · ${z.enCliente.length} en cliente` : ''}
                </div>
                <div className="zone-actions">
                  <button className="link small" onClick={() => setDetail(z)}>Ver detalle</button>
                  {z.level !== 'ok' && z.level !== 'festivo' && <button className="link small" onClick={() => onAsk(z.zona, date)}>¿Quién puede ir?</button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="ops-side">
          <section className="panel">
            <h2>⚠ Alertas</h2>
            {!upcoming.length && !sick.length && !vacAlert?.people && <p className="muted small">Nada que vigilar en los próximos 10 días laborables.</p>}
            {upcoming.length > 0 && (
              <div className="alert-block">
                <b>Zonas sin cubrir (próximos 10 laborables)</b>
                <ul>
                  {upcoming.slice(0, 12).map((z) => (
                    <li key={`${z.zona}${z.date}`}>
                      <Dot level="bajo" /> <b>{z.zona}</b> · {formatDate(z.date)} ({z.working}/{z.total}, mín. {z.min})
                      {' '}<button className="link small" onClick={() => onAsk(z.zona, z.date)}>¿Quién?</button>
                    </li>
                  ))}
                  {upcoming.length > 12 && <li className="muted">… y {upcoming.length - 12} más (ver Cobertura)</li>}
                </ul>
              </div>
            )}
            {sick.length > 0 && (
              <div className="alert-block">
                <b>Bajas en curso de 5 días o más</b>
                <ul>{sick.map((s) => <li key={s.emp.id}>{s.emp.nombre} · desde {formatDate(s.since)} ({s.days} días marcados)</li>)}</ul>
              </div>
            )}
            {vacAlert && vacAlert.people > 0 && (
              <div className="alert-block">
                <b>Vacaciones pendientes a fin de año</b>
                <p className="small">{vacAlert.people} personas tienen 10 días o más sin coger ({vacAlert.days} días en total). <button className="link small" onClick={() => onGo('saldos')}>Ver saldos</button></p>
              </div>
            )}
          </section>
          <News store={store} data={data} user={user} />
        </aside>
      </div>

      {detail && <ZoneDetail z={detail} data={data} onClose={() => setDetail(null)} onAsk={() => { setDetail(null); onAsk(detail.zona, detail.date); }} />}
    </>
  );
}

/** Quién falta en una zona. Si son muchos (p. ej. festivo), se agrupan por clave. */
function OutList({ items, data }: { items: { emp: Employee; code: string; note?: string }[]; data: AppData }) {
  if (!items.length) return null;
  if (items.length <= 5) {
    return (
      <div className="zone-out">
        {items.map((f) => <span key={f.emp.id} className="out-item" title={f.note}><Chip code={f.code} data={data} /> {f.emp.nombre}</span>)}
      </div>
    );
  }
  const by = new Map<string, string[]>();
  for (const f of items) by.set(f.code, [...(by.get(f.code) ?? []), f.emp.nombre]);
  return (
    <div className="zone-out">
      {[...by].map(([code, names]) => (
        <span key={code} className="out-item" title={names.join('\n')}><Chip code={code} data={data} /> {names.length} persona{names.length > 1 ? 's' : ''}</span>
      ))}
    </div>
  );
}

function ZoneDetail({ z, data, onClose, onAsk }: { z: ZoneDay; data: AppData; onClose: () => void; onAsk: () => void }) {
  const line = (emp: Employee) => [emp.siglas, emp.telefono && `📞 ${emp.telefono}`].filter(Boolean).join(' · ');
  return (
    <Modal title={`${z.zona} · ${formatDateLong(z.date)}`} onClose={onClose} footer={<>
      <button onClick={onAsk}>🙋 ¿Quién puede ir?</button>
      <button className="primary" onClick={onClose}>Cerrar</button>
    </>}>
      <p><Dot level={z.level} /> <b>{LEVEL_LABEL[z.level]}</b> · {z.working} de {z.total} trabajando (mínimo {z.min})</p>
      <h3>Libres ({z.libres.length})</h3>
      <ul className="plain">{z.libres.map((e) => <li key={e.id}><b>{e.nombre}</b> <span className="muted small">{line(e)}</span></li>)}</ul>
      {z.enCliente.length > 0 && <><h3>En cliente ({z.enCliente.length})</h3>
        <ul className="plain">{z.enCliente.map((x) => <li key={x.emp.id}><Chip code={x.code} data={data} /> <b>{x.emp.nombre}</b>{x.note && <div className="muted small pre">{x.note}</div>}</li>)}</ul></>}
      {z.fuera.length + z.festivo.length > 0 && <><h3>Fuera ({z.fuera.length + z.festivo.length})</h3>
        <ul className="plain">{[...z.fuera, ...z.festivo].map((x) => <li key={x.emp.id}><Chip code={x.code} data={data} /> <b>{x.emp.nombre}</b>{x.note && <div className="muted small pre">{x.note}</div>}</li>)}</ul></>}
    </Modal>
  );
}

/** Cambios hechos por otros desde la última vez que se marcó como visto. */
function News({ store, data, user }: { store: DataStore; data: AppData; user: AppUser }) {
  const [seen, setSeen] = useState<string>(() => { try { return localStorage.getItem(SEEN_KEY) ?? new Date(Date.now() - 86400000).toISOString(); } catch { return ''; } });
  const [items, setItems] = useState<ChangeLog[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let off = false;
    store.listChanges({ limit: 300 }).then((list) => { if (!off) setItems(list.filter((c) => c.ts > seen && c.userName !== user.name)); }).catch(() => setItems([]));
    return () => { off = true; };
  }, [store, seen, user.name, tick]);
  const names = useMemo(() => new Map(data.employees.map((e) => [e.id, e.nombre])), [data.employees]);
  const markSeen = () => { const now = new Date().toISOString(); try { localStorage.setItem(SEEN_KEY, now); } catch { /* */ } setSeen(now); };

  const groups = useMemo(() => {
    const m = new Map<string, ChangeLog[]>();
    for (const c of items ?? []) { const key = c.batchId ?? String(c.id); m.set(key, [...(m.get(key) ?? []), c]); }
    return [...m.values()];
  }, [items]);

  return (
    <section className="panel">
      <h2>🔔 Novedades de otros desde {formatDateTime(seen)}</h2>
      {items === null ? <p className="muted small">Cargando…</p> : !groups.length ? <p className="muted small">Sin cambios de otros compañeros.</p> : (
        <ul className="news">
          {groups.slice(0, 15).map((g) => {
            const c = g[0];
            const one = g.length === 1 && c.entity === 'entry';
            return (
              <li key={c.id}>
                <span className="muted small">{formatDateTime(c.ts)} · {c.userName}</span>
                <div>{one
                  ? <><b>{names.get(c.employeeId ?? '') ?? '¿?'}</b> · {c.date && formatDate(c.date)}: {String(c.oldValue ?? '—')} → <b>{String(c.newValue ?? '—')}</b></>
                  : <>{c.batchLabel ?? 'Cambio'}{g.length > 1 && <span className="muted small"> ({g.length} cambios)</span>}</>}
                </div>
              </li>
            );
          })}
          {groups.length > 15 && <li className="muted small">… y {groups.length - 15} más en el Historial</li>}
        </ul>
      )}
      <button className="small" onClick={markSeen}>✓ Marcar como visto</button>
    </section>
  );
}

// =====================================================================
// Mapa de cobertura
// =====================================================================
function CoverageMap({ data, onAsk }: { data: AppData; onAsk: (zona: string, date: string) => void }) {
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
function WhoCanGo({ data, initial }: { data: AppData; initial: { zona: string; date: string } | null }) {
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
                    ? <span className="ok">Libre{c.code ? <> (<Chip code={c.code} data={data} />)</> : ''}</span>
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

function Workload({ data }: { data: AppData }) {
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
function Balances({ data }: { data: AppData }) {
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

// =====================================================================
// Revisión de datos
// =====================================================================
function DataReview({ data, onEditEmployee }: { data: AppData; onEditEmployee: (e: Employee) => void }) {
  const admin = useAdmin();
  const year = new Date().getFullYear();
  useEffect(() => { data.loadYear(year); }, [year, data.loadYear]);
  const r = useMemo(() => dataIssues(data.employees, data.entries, data.codes, data.ops, year), [data.employees, data.entries, data.codes, data.ops, year]);
  const ok = !r.people.length && !r.unknownCodes.size && !r.reviewCodes.size;
  return (
    <>
      <p className="muted">Lo que hace que la cobertura, los saldos o la importación de planificación den datos falsos. {admin.active ? 'Pulsa «Corregir» para abrir la ficha.' : 'Para corregir, activa el modo administrador.'}</p>
      {ok && <div className="panel ok">✓ Todo correcto: no hay datos que revisar.</div>}
      {(r.unknownCodes.size > 0 || r.reviewCodes.size > 0) && (
        <section className="panel">
          <h2>Claves que revisar ({year})</h2>
          <ul>
            {[...r.reviewCodes].map(([c, n]) => <li key={c}><Chip code={c} data={data} /> {data.codes.find((x) => x.code === c)?.label}: <b>{n}</b> día(s). Búscalas en el calendario y cámbialas por la clave correcta.</li>)}
            {[...r.unknownCodes].map(([c, n]) => <li key={c}><b>{c}</b>: clave que no existe en la lista, en {n} día(s).</li>)}
          </ul>
        </section>
      )}
      {r.people.length > 0 && (
        <section className="panel">
          <h2>Fichas incompletas ({r.people.length})</h2>
          <table className="table">
            <thead><tr><th>Persona</th><th>Equipo · zona</th><th>Qué falta</th><th /></tr></thead>
            <tbody>
              {r.people.map((p) => (
                <tr key={p.emp.id}>
                  <td><b>{p.emp.nombre}</b></td>
                  <td className="small">{[p.emp.equipo, p.emp.zona].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{p.problems.map((x) => <span key={x} className="tag warn-tag">{x}</span>)}</td>
                  <td className="right"><button onClick={() => onEditEmployee(p.emp)}>{admin.active ? 'Corregir' : '🔒 Corregir'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

// =====================================================================
// Informe mensual
// =====================================================================
function ReportDialog({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { toast } = useUi();
  const t = parseIso(todayIso());
  const [ym, setYm] = useState(() => (t.m0 ? { y: t.y, m: t.m0 - 1 } : { y: t.y - 1, m: 11 }));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await data.loadYear(ym.y);
      const { exportOpsReport } = await import('../lib/opsReport');
      await exportOpsReport(data.employees, data.codes, data.entries, data.notes, data.ops, ym.y, ym.m);
      toast('Informe descargado');
      onClose();
    } catch (e) { toast(`No se pudo generar: ${(e as Error).message}`, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="📄 Informe mensual" onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={busy} onClick={run}>{busy ? 'Generando…' : 'Descargar Excel'}</button>
    </>}>
      <div className="form">
        <p className="muted">Para tu responsable: absentismo por zona y tipo, días de PC, días con la cobertura en riesgo, detalle por persona y saldos del año.</p>
        <div className="row2">
          <label>Mes<select value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
          <label>Año<input type="number" value={ym.y} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) || ym.y })} /></label>
        </div>
      </div>
    </Modal>
  );
}
