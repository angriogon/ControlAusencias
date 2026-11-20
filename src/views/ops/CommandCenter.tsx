import { useEffect, useMemo, useState } from 'react';
import type { DataStore } from '../../data/store';
import type { AppData } from '../../data/useAppData';
import type { AppUser, ChangeLog, Employee } from '../../types';
import { addDays, formatDate, formatDateLong, formatDateTime, isWeekend, parseIso, todayIso } from '../../lib/dates';
import { balances, ongoingSickLeaves, zoneDay, type ZoneDay } from '../../lib/ops';
import { Modal } from '../../components/ui';
import { agenda, pendingTasks, typeInfo } from '../../lib/notes';
import type { Go } from '../OpsView';
import { LEVEL_LABEL, nextWorkday, useOpsBase, Chip, Dot } from './shared';

const SEEN_KEY = 'ca-ops-seen';

// =====================================================================
// Centro de mando
// =====================================================================
export function CommandCenter({ store, data, user, onAsk, onGo, onGoto }: {
  store: DataStore; data: AppData; user: AppUser; onAsk: (zona: string, date: string) => void; onGo: (s: Go) => void;
  onGoto: (employeeId: string, date: string) => void;
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
  // Citas (médico/taller) en días con presencial en cliente, próximas dos semanas
  const clashes = useMemo(() => agenda(data.employees, data.entries, data.notes, today, addDays(today, 14)).filter((a) => a.clash),
    [data.employees, data.entries, data.notes, today]);
  const pending = useMemo(() => pendingTasks(data.employees, data.entries, data.notes, today, today), [data.employees, data.entries, data.notes, today]);
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
            {!upcoming.length && !sick.length && !vacAlert?.people && !clashes.length && !pending.length && <p className="muted small">Nada que vigilar en los próximos 10 días laborables.</p>}
            {clashes.length > 0 && (
              <div className="alert-block">
                <b>Citas en días con presencial (PC)</b>
                <ul>
                  {clashes.slice(0, 10).map((a) => (
                    <li key={`${a.emp.id}${a.date}`}>
                      {typeInfo(a.info.type).emoji} <b>{a.emp.nombre}</b> · {formatDate(a.date)}{a.info.time && ` a las ${a.info.time}`} · tiene {a.code}
                      {' '}<button className="link small" onClick={() => onGoto(a.emp.id, a.date)}>Ir</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pending.length > 0 && (
              <div className="alert-block">
                <b>📌 {pending.length} tarea(s) pendiente(s) de hoy o atrasadas</b>{' '}
                <button className="link small" onClick={() => onGo('agenda')}>Ver tareas</button>
              </div>
            )}
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

export function ZoneDetail({ z, data, onClose, onAsk }: { z: ZoneDay; data: AppData; onClose: () => void; onAsk: () => void }) {
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
