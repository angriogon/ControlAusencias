import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react';
import type { Code, Note } from '../types';
import { addDays, relativeTime } from '../lib/dates';
import { NOTE_TYPES, composeNote, parseNote, type Repeat } from '../lib/notes';
import { fold } from '../lib/search';

/** Lo que se guarda al confirmar. undefined = no tocar; code null = quitar la clave. */
export interface PickerResult { code?: string | null; note?: string; repeat?: { every: Repeat; until: string } }

/** Claves para las que se sugiere apuntar el motivo. */
const ASK_REASON = ['P', 'A'];
const REASONS = ['Asunto propio', 'Gestión personal', 'Asunto familiar'];

interface Props {
  x: number; y: number;
  title: string;
  subtitle?: string;
  initialFilter: string;
  codes: Code[];
  current: string | null;
  lastChange: { by: string; at?: string } | null;
  /** undefined = varias celdas (sin nota); null = celda sin nota. */
  note?: Note | null;
  /** Avisos para selecciones de varias celdas (claves protegidas, etc.). */
  warning?: ReactNode;
  /** Si existe, no se puede guardar hasta resolverlo (p. ej. falta modo admin). */
  blocker?: ReactNode;
  /** Textos de nota usados a menudo (para sugerir). */
  suggestions?: string[];
  /** Fecha de la celda (solo una celda): permite repetir tareas. */
  date?: string;
  onCommit: (r: PickerResult) => void;
  onClose: () => void;
}

const COLS = 3;

/**
 * Paleta de claves. Ratón: clic en la clave (guarda también la nota escrita).
 * Teclado: escribir filtra, flechas se mueven, Enter guarda clave + nota, Esc cierra.
 */
export function CodePicker(p: Props) {
  const [filter, setFilter] = useState(p.initialFilter);
  // La nota se edita por partes: tipo + hora + texto libre (se guarda como un único texto)
  const init = useMemo(() => parseNote(p.note?.text ?? ''), [p.note]);
  const [ntype, setNtype] = useState(init.type);
  const [time, setTime] = useState(init.time);
  const [body, setBody] = useState(init.body);
  const noteText = composeNote({ type: ntype, time, done: init.done, body });
  const noteDirty = p.note !== undefined && noteText.trim() !== (p.note?.text ?? '').trim();
  const [repeat, setRepeat] = useState<Repeat | ''>('');
  const [until, setUntil] = useState(() => (p.date ? addDays(p.date, 91) : ''));
  /** Clave P/A elegida sin motivo: se pide (opcional) antes de guardar. */
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const noteArea = useRef<HTMLTextAreaElement>(null);
  const sugg = useMemo(() => {
    const all = p.suggestions ?? [];
    const q = fold(body.trim());
    const list = q.length >= 2 ? all.filter((x) => fold(x).includes(q) && fold(x) !== q) : all;
    return list.slice(0, 6);
  }, [p.suggestions, body]);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: p.x, top: p.y });

  // Orden visual: con filtro, por relevancia; sin filtro, ausencias y luego control
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return [...p.codes.filter((c) => c.category === 'ausencia'), ...p.codes.filter((c) => c.category !== 'ausencia')];
    const exact = p.codes.filter((c) => c.code.toLowerCase() === f);
    const starts = p.codes.filter((c) => c.code.toLowerCase().startsWith(f) && !exact.includes(c));
    const label = p.codes.filter((c) => c.label.toLowerCase().includes(f) && !exact.includes(c) && !starts.includes(c));
    return [...exact, ...starts, ...label];
  }, [filter, p.codes]);
  const absCount = filter.trim() ? list.length : p.codes.filter((c) => c.category === 'ausencia').length;

  // Elemento resaltado: con filtro, el primero; sin filtro, ninguno hasta usar las flechas
  const [active, setActive] = useState(-1);
  useEffect(() => { setActive(filter.trim() ? 0 : -1); }, [filter]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(p.x, window.innerWidth - w - 12);
    let top = p.y;
    if (top + h > window.innerHeight - 12) top = Math.max(12, p.y - h - 40);
    left = Math.max(12, left);
    setPos({ left, top: Math.max(12, Math.min(top, window.innerHeight - h - 12)) });
  }, [p.x, p.y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) p.onClose(); };
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown); };
  }, [p.onClose]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.picker-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const commit = (code?: string | null, skipReason = false) => {
    if (p.blocker) return;
    // P o A sin nota: antes de guardar, se ofrece apuntar el motivo (no es obligatorio)
    if (!skipReason && !reasonFor && p.note !== undefined && code && ASK_REASON.includes(code) && code !== p.current && !noteText.trim()) {
      setReasonFor(code);
      setTimeout(() => noteArea.current?.focus(), 0);
      return;
    }
    const r: PickerResult = {};
    if (code !== undefined && code !== p.current) r.code = code;
    if (noteDirty) r.note = noteText;
    if (r.note && ntype === 'tarea' && repeat && until) r.repeat = { every: repeat, until };
    if (r.code === undefined && r.note === undefined) { p.onClose(); return; }
    p.onCommit(r);
  };
  const commitActive = () => commit(reasonFor ?? (active >= 0 ? list[active]?.code : undefined), !!reasonFor);
  const applySuggestion = (text: string) => {
    const s2 = parseNote(text);
    if (s2.type) setNtype(s2.type);
    setBody(s2.body);
    noteArea.current?.focus();
  };

  // Flechas: ←→ de uno en uno, ↑↓ por filas. Dentro de cada bloque (ausencias / control)
  const moveActive = (key: string) => {
    if (!list.length) return;
    if (active < 0) { setActive(0); return; }
    const inFirst = active < absCount;
    const start = inFirst ? 0 : absCount;
    const local = active - start;
    let next = active;
    if (key === 'ArrowRight') next = Math.min(list.length - 1, active + 1);
    if (key === 'ArrowLeft') next = Math.max(0, active - 1);
    if (key === 'ArrowDown') {
      const cand = start + local + COLS;
      const blockEnd = inFirst ? absCount : list.length;
      next = cand < blockEnd ? cand : inFirst && absCount < list.length ? Math.min(list.length - 1, absCount + (local % COLS)) : active;
    }
    if (key === 'ArrowUp') {
      const cand = local - COLS;
      if (cand >= 0) next = start + cand;
      else if (!inFirst) {
        const lastRowStart = Math.floor((absCount - 1) / COLS) * COLS;
        next = Math.min(absCount - 1, lastRowStart + (local % COLS));
      }
    }
    setActive(next);
  };

  const onKey = (e: RKE) => {
    const inNote = (e.target as HTMLElement).tagName === 'TEXTAREA';
    if (e.key === 'Escape') { e.preventDefault(); p.onClose(); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitActive(); return; }
    if (!inNote && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      moveActive(e.key);
    }
  };

  const renderItems = (items: Code[], offset: number) => (
    <div className="picker-grid">
      {items.map((c, i) => (
        <button
          key={c.code}
          tabIndex={-1}
          className={`picker-item ${p.current === c.code ? 'current' : ''} ${active === offset + i ? 'active' : ''}`}
          onMouseEnter={() => setActive(offset + i)}
          onClick={() => commit(c.code)}
          title={c.label}
        >
          <span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
          <span className="picker-label">{c.label}</span>
        </button>
      ))}
    </div>
  );

  const pending = reasonFor ? p.codes.find((c) => c.code === reasonFor) : active >= 0 ? list[active] : undefined;

  return (
    <div className="picker" ref={box} style={pos} role="dialog" aria-label="Elegir clave" onKeyDown={onKey}>
      <div className="picker-head">
        <div>
          <strong>{p.title}</strong>
          {(p.subtitle || p.lastChange) && (
            <small className="muted">
              {p.subtitle}
              {p.lastChange && `Último cambio: ${p.lastChange.by}${p.lastChange.at ? ` · ${relativeTime(p.lastChange.at)}` : ''}`}
            </small>
          )}
        </div>
        <button className="icon-btn" onClick={p.onClose} aria-label="Cerrar" tabIndex={-1}>✕</button>
      </div>

      <div className="picker-body">
        <div className="picker-codes">
          <input
            ref={search}
            autoFocus
            className="picker-search"
            placeholder="Escribe la clave o busca: V, baja, festivo…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="picker-groups">
            {filter.trim() ? (
              list.length ? renderItems(list, 0) : <div className="muted pad">Ninguna clave coincide.</div>
            ) : (
              <>
                <div className="picker-group-title">Ausencias</div>
                {renderItems(list.slice(0, absCount), 0)}
                <div className="picker-group-title">Otras claves de control</div>
                {renderItems(list.slice(absCount), absCount)}
              </>
            )}
          </div>
        </div>

        <aside className="picker-side">
          {p.note !== undefined ? (
            <>
              {reasonFor && (
                <div className="reason-box">
                  <b>Motivo de la {reasonFor === 'P' ? 'P (permiso)' : 'A (ausencia)'}</b> <span className="muted small">(opcional)</span>
                  <div className="note-chips">
                    <button type="button" tabIndex={-1} className={ntype === 'medico' ? 'on' : ''} onClick={() => { setNtype('medico'); noteArea.current?.focus(); }}>🩺 Médico</button>
                    {REASONS.map((r) => <button key={r} type="button" tabIndex={-1} onClick={() => { setBody(r); noteArea.current?.focus(); }}>{r}</button>)}
                  </div>
                  <button type="button" className="link small" tabIndex={-1} onClick={() => commit(reasonFor, true)}>Guardar sin motivo</button>
                </div>
              )}
              <span className="picker-side-title">📝 Nota del día</span>
              <div className="note-types" role="group" aria-label="Tipo de nota">
                {NOTE_TYPES.map((t) => (
                  <button key={t.type} type="button" tabIndex={-1} className={ntype === t.type ? 'on' : ''} title={t.label}
                    onClick={() => setNtype(ntype === t.type ? null : t.type)}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
              {ntype && (
                <label className="note-time">Hora
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  {time && <button type="button" className="link small" tabIndex={-1} onClick={() => setTime('')}>quitar</button>}
                </label>
              )}
              <textarea
                id="picker-note"
                ref={noteArea}
                rows={4}
                value={body}
                placeholder={ntype ? 'Detalle (opcional)' : 'Opcional. Ej.: cita médica a las 10:00'}
                onChange={(e) => setBody(e.target.value)}
              />
              {sugg.length > 0 && (
                <div className="note-sugg" aria-label="Sugerencias">
                  {sugg.map((x) => <button key={x} type="button" tabIndex={-1} onClick={() => applySuggestion(x)} title="Usar este texto">{x}</button>)}
                </div>
              )}
              {ntype === 'tarea' && p.date && (
                <div className="note-repeat">
                  <label>Repetir
                    <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat | '')}>
                      <option value="">No</option>
                      <option value="w">Cada semana</option>
                      <option value="2w">Cada 2 semanas</option>
                      <option value="m">Cada mes</option>
                    </select>
                  </label>
                  {repeat && <label>hasta<input type="date" value={until} min={p.date} max={addDays(p.date, 366)} onChange={(e) => setUntil(e.target.value)} /></label>}
                </div>
              )}
              {p.note && <small className="muted">{p.note.author}{p.note.updatedAt ? ` · ${relativeTime(p.note.updatedAt)}` : ''}</small>}
              <small className="muted">Mayús+Enter para saltar de línea.</small>
            </>
          ) : (
            <p className="muted small">Las notas se escriben celda a celda.</p>
          )}
          {p.warning}
        </aside>
      </div>

      {p.blocker && <div className="picker-blocker">{p.blocker}</div>}

      <div className="picker-foot">
        <button className="danger-ghost" onClick={() => commit(null)} disabled={!!p.blocker} tabIndex={-1}>Quitar clave</button>
        <span className="muted small picker-keys">↑↓←→ moverse · Enter guardar · Esc cerrar</span>
        <button className="primary" onClick={commitActive} disabled={!!p.blocker || (!pending && !noteDirty)}>
          {pending ? <>Guardar <span className="chip small" style={{ background: pending.color, color: pending.textColor }}>{pending.code}</span>{noteDirty ? (reasonFor ? ' + motivo' : ' + nota') : ''}</> : noteDirty ? 'Guardar nota' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
