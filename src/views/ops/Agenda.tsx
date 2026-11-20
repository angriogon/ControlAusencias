import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../../data/useAppData';
import { addDays, formatDate, formatDateLong, parseIso, todayIso } from '../../lib/dates';
import { useUi } from '../../components/ui';
import { NOTE_TYPES, agenda, parseNote, pendingTasks, toggleDone, typeInfo, type AgendaItem, type NoteType } from '../../lib/notes';
import { fold } from '../../lib/search';
import { Chip } from './shared';

// =====================================================================
// Agenda y tareas
// =====================================================================
const AGENDA_PREFS = 'ca-agenda-prefs';

const ALL_TYPES: NoteType[] = ['medico', 'taller', 'tarea', 'formacion'];

export function Agenda({ data, onGoto }: { data: AppData; onGoto: (employeeId: string, date: string) => void }) {
  const { toast } = useUi();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(AGENDA_PREFS) ?? '{}'); } catch { return {}; } })();
  const today = todayIso();
  const [days, setDays] = useState<number>(saved.days ?? 14);
  const [types, setTypes] = useState<NoteType[]>(saved.types ?? ALL_TYPES);
  const [zona, setZona] = useState<string>(saved.zona ?? '');
  const [q, setQ] = useState('');
  useEffect(() => { try { localStorage.setItem(AGENDA_PREFS, JSON.stringify({ days, types, zona })); } catch { /* */ } }, [days, types, zona]);
  const to = addDays(today, days - 1);
  useEffect(() => { data.loadYear(parseIso(today).y); data.loadYear(parseIso(to).y); }, [today, to, data.loadYear]);
  // Para buscar en notas antiguas se carga también el año anterior
  useEffect(() => { if (q.trim()) data.loadYear(parseIso(today).y - 1); }, [q, today, data.loadYear]);

  const zones = useMemo(() => [...new Set(data.employees.filter((e) => e.activo).map((e) => e.zona).filter(Boolean))].sort(), [data.employees]);
  const inZone = (a: AgendaItem) => !zona || a.emp.zona === zona;
  const items = useMemo(() => agenda(data.employees, data.entries, data.notes, today, to), [data.employees, data.entries, data.notes, today, to])
    .filter((a) => types.includes(a.info.type) && inZone(a));
  const pending = useMemo(() => pendingTasks(data.employees, data.entries, data.notes, today, to), [data.employees, data.entries, data.notes, today, to])
    .filter(inZone);
  const found = useMemo(() => {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    return agenda(data.employees, data.entries, data.notes, '0000-01-01', '9999-12-31')
      .filter((a) => fold(a.text).includes(f) || fold(a.emp.nombre).includes(f) || fold(a.emp.siglas ?? '').includes(f))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  }, [q, data.employees, data.entries, data.notes]);

  const toggle = async (a: AgendaItem) => {
    const next = toggleDone(a.text);
    const ok = await data.saveNote(a.emp.id, a.date, next, `${a.info.done ? 'Reabre' : 'Hecha'}: tarea de ${a.emp.nombre} ${formatDate(a.date)}`);
    if (ok) toast(a.info.done ? 'Tarea reabierta' : 'Tarea hecha ✅', 'ok', { label: 'Deshacer', run: () => { data.saveNote(a.emp.id, a.date, a.text, 'Deshacer tarea'); } });
  };

  const byDay = new Map<string, AgendaItem[]>();
  for (const a of items) byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
  const counts = new Map<NoteType, number>();
  for (const a of agenda(data.employees, data.entries, data.notes, today, to)) if (inZone(a)) counts.set(a.info.type, (counts.get(a.info.type) ?? 0) + 1);

  const row = (a: AgendaItem, showDate = false) => {
    const t = typeInfo(a.info.type);
    const body = parseNote(a.text).body || t.label;
    const overdue = a.info.type === 'tarea' && !a.info.done && a.date < today;
    return (
      <li key={`${a.emp.id}${a.date}`} className={`ag-item ${a.info.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
        <span className="ag-ico">{a.info.done ? '✅' : t.emoji}</span>
        <span className="ag-time">{showDate ? formatDate(a.date).slice(0, 5) : a.info.time || '—'}</span>
        <span className="ag-main">
          <b>{a.emp.nombre}</b> <span className="muted small">{[a.emp.siglas, a.emp.zona].filter(Boolean).join(' · ')}</span>
          {a.code && <> <Chip code={a.code} data={data} /></>}
          {a.clash && <span className="tag warn-tag">⚠ cita con {a.code}</span>}
          {overdue && <span className="tag bad-tag">atrasada · {formatDate(a.date)}</span>}
          <div className="ag-text pre">{body}</div>
        </span>
        <span className="ag-actions">
          {a.info.type === 'tarea' && data.canEdit && <button onClick={() => toggle(a)} title={a.info.done ? 'Reabrir' : 'Marcar como hecha'}>{a.info.done ? '↺ Reabrir' : '✓ Hecha'}</button>}
          <button className="link small" onClick={() => onGoto(a.emp.id, a.date)}>Ir al día</button>
        </span>
      </li>
    );
  };

  return (
    <>
      <div className="toolbar ops-toolbar">
        <input className="search" placeholder="🔍 Buscar en todas las notas: taller, Northgate, curso, nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!q && <>
          <div className="seg">
            {[7, 14, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} días</button>)}
          </div>
          <select value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
            <option value="">Todas las zonas</option>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </>}
      </div>

      {q.trim() ? (
        <section className="panel">
          <h2>Notas que contienen «{q.trim()}» ({found.length}{found.length === 200 ? '+' : ''})</h2>
          {q.trim().length < 2 ? <p className="muted">Escribe al menos 2 letras.</p> : !found.length ? <p className="muted">Ninguna nota coincide (se busca en los años cargados).</p>
            : <ul className="agenda">{found.map((a) => row(a, true))}</ul>}
        </section>
      ) : (
        <>
          <div className="type-filter">
            {[...NOTE_TYPES.map((t) => t.type), 'otra' as const].map((t) => {
              const info = typeInfo(t);
              const on = types.includes(t);
              return (
                <button key={t} className={on ? 'on' : ''} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}>
                  {info.emoji} {t === 'otra' ? 'Otras notas' : info.label} <span className="muted">{counts.get(t) ?? 0}</span>
                </button>
              );
            })}
          </div>

          {pending.length > 0 && (
            <section className="panel">
              <h2>📌 Tareas pendientes ({pending.length})</h2>
              <p className="muted small">Siguen aquí hasta que se marcan como hechas, aunque su día ya haya pasado.</p>
              <ul className="agenda">{pending.map((a) => row(a, true))}</ul>
            </section>
          )}

          <section className="panel">
            <h2>Próximos {days} días · {formatDate(today)} – {formatDate(to)}</h2>
            {!byDay.size && <p className="muted">Nada apuntado con estos filtros.</p>}
            {[...byDay].map(([d, list]) => (
              <div key={d} className="ag-day">
                <h3 className={d === today ? 'today' : ''}>{d === today ? 'Hoy · ' : d === addDays(today, 1) ? 'Mañana · ' : ''}<span className="cap">{formatDateLong(d)}</span></h3>
                <ul className="agenda">{list.map((a) => row(a))}</ul>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
