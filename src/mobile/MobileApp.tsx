import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../data/useAppData';
import { entryKey } from '../data/useAppData';
import type { AppUser, Code, Employee } from '../types';
import {
  MONTHS, WEEKDAY_LETTER, addDays, formatDate, formatDateLong, isWeekend, monthDays, parseIso, todayIso, weekday,
} from '../lib/dates';
import { useUi } from '../components/ui';
import { matches } from '../lib/search';
import { DayEditor } from './DayEditor';
import { cap, parsePhones } from './mobileUtils';
import './mobile.css';

type MTab = 'today' | 'people';

/**
 * Vista para móvil: pensada para CONSULTAR (quién falta, ficha y teléfono de
 * cada persona) y para cambios ligeros de un día. Lo masivo se hace en el PC.
 */
export function MobileApp({ data, user, onLogout, onDesktop, statusText }: {
  data: AppData; user: AppUser; onLogout: () => void; onDesktop: () => void; statusText: string;
}) {
  const [tab, setTab] = useState<MTab>('today');
  const [person, setPerson] = useState<{ emp: Employee; date: string } | null>(null);
  const [menu, setMenu] = useState(false);

  return (
    <div className="m-app">
      <header className="m-top">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <span className="m-title">Ausencias</span>
        <span className={`m-status ${data.status}`} title={statusText} aria-label={statusText} />
        <button className="m-user" onClick={() => setMenu((v) => !v)} aria-label="Menú">{user.name} ▾</button>
        {menu && (
          <div className="m-menu" onClick={() => setMenu(false)}>
            <div className="m-menu-box" onClick={(e) => e.stopPropagation()}>
              <p className="m-muted">{statusText}</p>
              <button className="m-btn" onClick={onDesktop}>🖥 Ver versión completa</button>
              <button className="m-btn danger" onClick={onLogout}>Cerrar sesión</button>
              <p className="m-muted small">La sesión se cierra sola tras 8 horas sin usar la app.</p>
            </div>
          </div>
        )}
      </header>

      <main className="m-main">
        {person ? (
          <PersonDetail data={data} emp={person.emp} initialDate={person.date} onBack={() => setPerson(null)} />
        ) : tab === 'today' ? (
          <TodayView data={data} onOpen={(emp, date) => setPerson({ emp, date })} />
        ) : (
          <PeopleView data={data} onOpen={(emp) => setPerson({ emp, date: todayIso() })} />
        )}
      </main>

      <nav className="m-tabs" aria-label="Secciones">
        <button className={tab === 'today' && !person ? 'on' : ''} onClick={() => { setPerson(null); setTab('today'); }}>
          <span>📅</span>Hoy
        </button>
        <button className={tab === 'people' && !person ? 'on' : ''} onClick={() => { setPerson(null); setTab('people'); }}>
          <span>👥</span>Personas
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HOY: quién falta un día concreto, agrupado por clave
// ---------------------------------------------------------------------------
const PREFS = 'ca-mobile-prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) ?? '{}'); } catch { return {}; } };

function TodayView({ data, onOpen }: { data: AppData; onOpen: (e: Employee, date: string) => void }) {
  const [date, setDate] = useState(todayIso());
  const saved = loadPrefs();
  const [equipo, setEquipo] = useState<string>(saved.equipo ?? '');
  const [zona, setZona] = useState<string>(saved.zona ?? '');
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ equipo, zona })); } catch { /* */ } }, [equipo, zona]);
  useEffect(() => { data.loadYear(parseIso(date).y); }, [date, data.loadYear]);

  const active = useMemo(() => data.employees.filter((e) => e.activo), [data.employees]);
  const people = active.filter((e) => (!equipo || e.equipo === equipo) && (!zona || e.zona === zona));
  const opts = (k: 'equipo' | 'zona') => [...new Set(active.map((e) => e[k]).filter(Boolean))].sort();
  const byCode = new Map(data.codes.map((c) => [c.code, c]));

  const groups = new Map<string, Employee[]>();
  let withNote = 0;
  for (const e of people) {
    const code = data.entries.get(entryKey(e.id, date))?.code;
    if (data.notes.has(entryKey(e.id, date))) withNote++;
    if (!code) continue;
    groups.set(code, [...(groups.get(code) ?? []), e]);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const ca = byCode.get(a[0]), cb = byCode.get(b[0]);
    const cat = (c?: Code) => (c?.category === 'ausencia' ? 0 : 1);
    return cat(ca) - cat(cb) || (ca?.orden ?? 99) - (cb?.orden ?? 99);
  });
  const absent = ordered.filter(([c]) => byCode.get(c)?.category === 'ausencia').reduce((n, [, l]) => n + l.length, 0);

  return (
    <div className="m-page">
      <div className="m-datebar">
        <button className="m-icon big" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">‹</button>
        <label className="m-date">
          <strong>{cap(formatDateLong(date))}</strong>
          <span className="m-muted">{date === todayIso() ? 'Hoy' : formatDate(date)}</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Elegir fecha" />
        </label>
        <button className="m-icon big" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">›</button>
      </div>
      {date !== todayIso() && <button className="m-link center" onClick={() => setDate(todayIso())}>Volver a hoy</button>}

      <div className="m-filters">
        <select value={equipo} onChange={(e) => setEquipo(e.target.value)} aria-label="Equipo">
          <option value="">Todos los equipos</option>
          {opts('equipo').map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
          <option value="">Todas las zonas</option>
          {opts('zona').map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>

      <div className="m-kpis">
        <div><b>{absent}</b><span>fuera</span></div>
        <div><b>{people.length - absent}</b><span>disponibles</span></div>
        <div><b>{withNote}</b><span>con nota</span></div>
      </div>

      {ordered.length === 0 && <p className="m-empty">Nadie tiene marca este día{equipo || zona ? ' con estos filtros' : ''}.</p>}

      {ordered.map(([code, list]) => {
        const c = byCode.get(code);
        return (
          <section key={code} className="m-card">
            <h2 className="m-card-title">
              <span className="chip" style={{ background: c?.color ?? '#ddd', color: c?.textColor ?? '#000' }}>{code}</span>
              {c?.label ?? code}
              <span className="m-count">{list.length}</span>
            </h2>
            <ul className="m-list">
              {list.map((e) => {
                const note = data.notes.get(entryKey(e.id, date));
                return (
                  <li key={e.id}>
                    <button onClick={() => onOpen(e, date)}>
                      <span className="m-name">{e.nombre}</span>
                      <span className="m-sub">{[e.zona, e.sede].filter(Boolean).join(' · ')}</span>
                      {note && <span className="m-note-line">📝 {note.text}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PERSONAS: buscador
// ---------------------------------------------------------------------------
function PeopleView({ data, onOpen }: { data: AppData; onOpen: (e: Employee) => void }) {
  const [q, setQ] = useState('');
  const today = todayIso();
  const byCode = new Map(data.codes.map((c) => [c.code, c]));
  const list = data.employees.filter((e) => e.activo && matches(q, e.nombre, e.zona, e.sede, e.equipo, e.telefono, e.extension, e.almacen));

  return (
    <div className="m-page">
      <input className="m-search" type="search" placeholder="🔍 Nombre, zona, sede, teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="m-muted small">{list.length} persona(s) · a la derecha, su marca de hoy</p>
      <ul className="m-list m-card">
        {list.map((e) => {
          const code = data.entries.get(entryKey(e.id, today))?.code;
          const c = code ? byCode.get(code) : undefined;
          return (
            <li key={e.id}>
              <button onClick={() => onOpen(e)}>
                <span className="m-row">
                  <span>
                    <span className="m-name">{e.nombre}</span>
                    <span className="m-sub">{[e.equipo, e.zona, e.sede].filter(Boolean).join(' · ')}</span>
                  </span>
                  {code && <span className="chip small" style={{ background: c?.color ?? '#ddd', color: c?.textColor ?? '#000' }}>{code}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FICHA: contacto, mes en calendario, notas y edición de un día
// ---------------------------------------------------------------------------
function PersonDetail({ data, emp, initialDate, onBack }: {
  data: AppData; emp: Employee; initialDate: string; onBack: () => void;
}) {
  const { toast, confirm } = useUi();
  const init = parseIso(initialDate);
  const [ym, setYm] = useState({ y: init.y, m: init.m0 });
  const [editing, setEditing] = useState<string | null>(null);
  const today = todayIso();
  useEffect(() => { data.loadYear(ym.y); }, [ym.y, data.loadYear]);

  const days = monthDays(ym.y, ym.m);
  const lead = (weekday(days[0]) + 6) % 7; // huecos antes del día 1 (semana de lunes a domingo)
  const byCode = new Map(data.codes.map((c) => [c.code, c]));
  const phones = parsePhones(emp.telefono ?? '');
  const go = (d: number) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });

  const usedV = [...data.entries.values()].filter((x) => x.employeeId === emp.id && x.code === 'V' && x.date.startsWith(`${ym.y}-`)).length;
  const monthNotes = days.map((d) => ({ d, n: data.notes.get(entryKey(emp.id, d)) })).filter((x) => x.n);

  const save = async (date: string, code: string | null | undefined, note: string | undefined) => {
    const label = `${formatDate(date)} · ${emp.nombre} (móvil)`;
    let ok = true;
    if (code !== undefined) ok = await data.apply([{ employeeId: emp.id, date, code }], code ? `Marca ${code} · ${label}` : `Borra · ${label}`);
    if (ok && note !== undefined) ok = await data.saveNote(emp.id, date, note, `${note.trim() ? 'Nota' : 'Borra nota'} · ${label}`);
    if (!ok) return;
    setEditing(null);
    toast('Guardado', 'ok', {
      label: 'Deshacer',
      run: async () => {
        for (let i = 0; i < (code !== undefined ? 1 : 0) + (note !== undefined ? 1 : 0); i++) {
          await data.undo((n) => confirm({ title: 'Deshacer', message: `${n} dato(s) los ha cambiado otra persona después. ¿Deshacer igualmente?`, ok: 'Deshacer', danger: true }));
        }
      },
    });
  };

  return (
    <div className="m-page">
      <button className="m-back" onClick={onBack}>‹ Volver</button>
      <section className="m-card m-person">
        <h1>{emp.nombre}</h1>
        <p className="m-sub">{[emp.equipo, emp.zona, emp.sede].filter(Boolean).join(' · ')}</p>
        <div className="m-calls">
          {phones.map((p) => (
            <a key={p.number} className="m-btn primary" href={`tel:${p.number}`}>📞 {p.label}<small>{p.number}</small></a>
          ))}
          {!phones.length && emp.telefono && <span className="m-muted">{emp.telefono}</span>}
        </div>
        <dl className="m-facts">
          {emp.extension && <div><dt>Extensión</dt><dd>{emp.extension}</dd></div>}
          {emp.teamLeader && <div><dt>Team leader</dt><dd>{emp.teamLeader}</dd></div>}
          {emp.almacen && <div><dt>Almacén</dt><dd>{emp.almacen}</dd></div>}
          <div><dt>Vacaciones {ym.y}</dt><dd className={emp.diasVacaciones - usedV < 0 ? 'neg' : ''}>{emp.diasVacaciones - usedV} de {emp.diasVacaciones} pendientes</dd></div>
        </dl>
      </section>

      <section className="m-card">
        <div className="m-monthbar">
          <button className="m-icon big" onClick={() => go(-1)} aria-label="Mes anterior">‹</button>
          <strong>{MONTHS[ym.m]} {ym.y}</strong>
          <button className="m-icon big" onClick={() => go(1)} aria-label="Mes siguiente">›</button>
        </div>
        <div className="m-cal">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => <div key={w} className="m-cal-head">{w}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
          {days.map((d) => {
            const code = data.entries.get(entryKey(emp.id, d))?.code;
            const c = code ? byCode.get(code) : undefined;
            const hasNote = data.notes.has(entryKey(emp.id, d));
            return (
              <button
                key={d}
                className={`m-day ${isWeekend(d) ? 'we' : ''} ${d === today ? 'today' : ''} ${hasNote ? 'has-note' : ''}`}
                style={c ? { background: c.color, color: c.textColor } : undefined}
                onClick={() => setEditing(d)}
                aria-label={`${formatDateLong(d)}${code ? `, ${c?.label ?? code}` : ''}${hasNote ? ', con nota' : ''}`}
              >
                <span className="m-day-n">{parseIso(d).d}</span>
                <span className="m-day-c">{code ?? ''}</span>
              </button>
            );
          })}
        </div>
        <p className="m-muted small">Toca un día para ver o cambiar su clave y su nota. ▲ = tiene nota.</p>
      </section>

      {monthNotes.length > 0 && (
        <section className="m-card">
          <h2 className="m-card-title">📝 Notas de {MONTHS[ym.m].toLowerCase()}</h2>
          <ul className="m-list">
            {monthNotes.map(({ d, n }) => (
              <li key={d}>
                <button onClick={() => setEditing(d)}>
                  <span className="m-name">{WEEKDAY_LETTER[weekday(d)]} {parseIso(d).d} · {n!.text}</span>
                  {n!.author && <span className="m-sub">{n!.author}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <DayEditor
          emp={emp}
          date={editing}
          entry={data.entries.get(entryKey(emp.id, editing))}
          note={data.notes.get(entryKey(emp.id, editing))}
          codes={data.codes}
          canEdit={data.canEdit}
          onSave={(code, note) => save(editing, code, note)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
