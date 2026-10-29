import { useState } from 'react';
import type { Code, Employee, Entry, Note } from '../types';
import { formatDateLong, relativeTime } from '../lib/dates';
import { cap } from './mobileUtils';

/**
 * Hoja inferior para cambiar UN día de UNA persona desde el móvil:
 * botones grandes con la clave y su nombre, y la nota del día.
 */
export function DayEditor({ emp, date, entry, note, codes, canEdit, onSave, onClose }: {
  emp: Employee; date: string; entry?: Entry; note?: Note;
  codes: Code[]; canEdit: boolean;
  onSave: (code: string | null | undefined, note: string | undefined) => Promise<void>;
  onClose: () => void;
}) {
  const current = entry?.code ?? null;
  const [code, setCode] = useState<string | null>(current);
  const [text, setText] = useState(note?.text ?? '');
  const [busy, setBusy] = useState(false);
  const codeChanged = code !== current;
  const noteChanged = text.trim() !== (note?.text ?? '').trim();
  const active = codes.filter((c) => c.activo);
  const groups: [string, Code[]][] = [
    ['Ausencias', active.filter((c) => c.category === 'ausencia')],
    ['Otras claves', active.filter((c) => c.category !== 'ausencia')],
  ];

  const save = async () => {
    setBusy(true);
    await onSave(codeChanged ? code : undefined, noteChanged ? text : undefined);
    setBusy(false);
  };

  return (
    <div className="m-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-sheet" role="dialog" aria-label={`${emp.nombre}, ${formatDateLong(date)}`}>
        <div className="m-sheet-grip" />
        <header className="m-sheet-head">
          <div>
            <strong>{emp.nombre}</strong>
            <span className="m-muted">{cap(formatDateLong(date))}</span>
          </div>
          <button className="m-icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div className="m-sheet-body">
          {entry?.updatedBy && (
            <p className="m-muted small">Último cambio: {entry.updatedBy}{entry.updatedAt ? ` · ${relativeTime(entry.updatedAt)}` : ''}</p>
          )}
          {!canEdit && <p className="m-info">Solo consulta: sin conexión o usuario de solo lectura.</p>}

          {groups.map(([title, list]) => (
            <section key={title}>
              <h3 className="m-group-title">{title}</h3>
              <div className="m-codes">
                {list.map((c) => (
                  <button
                    key={c.code}
                    disabled={!canEdit}
                    className={`m-code ${code === c.code ? 'on' : ''}`}
                    onClick={() => setCode(code === c.code ? current : c.code)}
                  >
                    <span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {current && canEdit && (
            <button className={`m-clear ${code === null ? 'on' : ''}`} onClick={() => setCode(code === null ? current : null)}>
              {code === null ? '✓ Se quitará la clave' : 'Quitar la clave de este día'}
            </button>
          )}

          <h3 className="m-group-title">📝 Nota</h3>
          <textarea
            className="m-note"
            rows={3}
            value={text}
            disabled={!canEdit}
            placeholder="Opcional. Ej.: cita médica a las 10:00"
            onChange={(e) => setText(e.target.value)}
          />
          {note?.author && <p className="m-muted small">{note.author}{note.updatedAt ? ` · ${relativeTime(note.updatedAt)}` : ''}</p>}
        </div>

        <footer className="m-sheet-foot">
          <button className="m-btn" onClick={onClose}>Cancelar</button>
          <button className="m-btn primary" disabled={!canEdit || busy || (!codeChanged && !noteChanged)} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
