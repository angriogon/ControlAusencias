import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react';
import type { Code, Note } from '../types';
import { relativeTime } from '../lib/dates';

/** Lo que se guarda al confirmar. undefined = no tocar; code null = quitar la clave. */
export interface PickerResult { code?: string | null; note?: string }

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
  const [noteText, setNoteText] = useState(p.note?.text ?? '');
  const noteDirty = p.note !== undefined && noteText.trim() !== (p.note?.text ?? '').trim();
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

  const commit = (code?: string | null) => {
    if (p.blocker) return;
    const r: PickerResult = {};
    if (code !== undefined && code !== p.current) r.code = code;
    if (noteDirty) r.note = noteText;
    if (r.code === undefined && r.note === undefined) { p.onClose(); return; }
    p.onCommit(r);
  };
  const commitActive = () => commit(active >= 0 ? list[active]?.code : undefined);

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

  const pending = active >= 0 ? list[active] : undefined;

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
              <label className="picker-side-title" htmlFor="picker-note">📝 Nota del día</label>
              <textarea
                id="picker-note"
                rows={5}
                value={noteText}
                placeholder="Opcional. Ej.: cita médica a las 10:00"
                onChange={(e) => setNoteText(e.target.value)}
              />
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
          {pending ? <>Guardar <span className="chip small" style={{ background: pending.color, color: pending.textColor }}>{pending.code}</span>{noteDirty ? ' + nota' : ''}</> : noteDirty ? 'Guardar nota' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
