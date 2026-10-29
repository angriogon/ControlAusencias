import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Code, Note } from '../types';
import { relativeTime } from '../lib/dates';

interface Props {
  x: number; y: number;
  title: string;
  initialFilter: string;
  codes: Code[];
  current: string | null;
  lastChange: { by: string; at?: string } | null;
  /** undefined = varias celdas (no se edita nota); null = celda sin nota. */
  note?: Note | null;
  onSaveNote: (text: string) => void;
  onPick: (code: string | null) => void;
  onClose: () => void;
}

/**
 * Paleta de claves. Pensada para quien no se sabe las siglas: botones grandes
 * con color + nombre. Quien sí se las sabe puede escribir "v" + Enter.
 */
export function CodePicker(p: Props) {
  const [filter, setFilter] = useState(p.initialFilter);
  const [noteText, setNoteText] = useState(p.note?.text ?? '');
  const [noteOpen, setNoteOpen] = useState(!!p.note);
  const noteDirty = noteText.trim() !== (p.note?.text ?? '').trim();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: p.x, top: p.y });

  // Recolocar para que no se salga de la pantalla
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(p.x, window.innerWidth - w - 12);
    let top = p.y;
    if (top + h > window.innerHeight - 12) top = Math.max(12, p.y - h - 40);
    left = Math.max(12, left);
    setPos({ left, top });
  }, [p.x, p.y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) p.onClose(); };
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown); };
  }, [p.onClose]);

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return p.codes;
    const exact = p.codes.filter((c) => c.code.toLowerCase() === f);
    const starts = p.codes.filter((c) => c.code.toLowerCase().startsWith(f) && !exact.includes(c));
    const label = p.codes.filter((c) => c.label.toLowerCase().includes(f) && !exact.includes(c) && !starts.includes(c));
    return [...exact, ...starts, ...label];
  }, [filter, p.codes]);

  const groups: [string, Code[]][] = filter.trim()
    ? [['Resultados', list]]
    : [['Ausencias', list.filter((c) => c.category === 'ausencia')], ['Otras claves de control', list.filter((c) => c.category === 'control')]];

  return (
    <div className="picker" ref={box} style={pos} role="dialog" aria-label="Elegir clave">
      <div className="picker-head">
        <strong>{p.title}</strong>
        {p.lastChange && <small>Último cambio: {p.lastChange.by}{p.lastChange.at ? ` · ${relativeTime(p.lastChange.at)}` : ''}</small>}
      </div>
      <input
        autoFocus
        className="picker-search"
        placeholder="Escribe la clave o busca (ej. V, baja, festivo)…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && list[0]) { e.preventDefault(); p.onPick(list[0].code); }
          if (e.key === 'Escape') { e.preventDefault(); p.onClose(); }
        }}
      />
      <div className="picker-groups">
        {groups.map(([name, cs]) => cs.length > 0 && (
          <div key={name}>
            <div className="picker-group-title">{name}</div>
            <div className="picker-grid">
              {cs.map((c, i) => (
                <button
                  key={c.code}
                  className={`picker-item ${p.current === c.code ? 'current' : ''} ${filter && i === 0 && name === 'Resultados' ? 'first' : ''}`}
                  onClick={() => p.onPick(c.code)}
                  title={c.label}
                >
                  <span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
                  <span className="picker-label">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div className="muted pad">No hay ninguna clave que coincida.</div>}
      </div>
      {p.note !== undefined && (
        <div className="picker-note">
          {!noteOpen ? (
            <button className="link" onClick={() => setNoteOpen(true)}>📝 Añadir nota a este día</button>
          ) : (
            <>
              <div className="picker-note-head">
                <strong>📝 Nota</strong>
                {p.note && <small className="muted">{p.note.author}{p.note.updatedAt ? ` · ${relativeTime(p.note.updatedAt)}` : ''}</small>}
              </div>
              <textarea
                rows={3}
                value={noteText}
                placeholder="Ej.: cita médica a las 10:00, cubre a…"
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); p.onClose(); }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); p.onSaveNote(noteText); }
                }}
              />
              <div className="picker-note-actions">
                {p.note && <button className="danger-ghost" onClick={() => p.onSaveNote('')}>Borrar nota</button>}
                <button className="primary" disabled={!noteDirty} onClick={() => p.onSaveNote(noteText)}>Guardar nota</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="picker-foot">
        <button className="danger-ghost" onClick={() => p.onPick(null)}>🗑 Vaciar celda(s)</button>
        <span className="muted small">Enter = primera opción · Esc = cerrar</span>
      </div>
    </div>
  );
}
