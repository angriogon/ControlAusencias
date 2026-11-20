import { CHANGELOG } from '../changelog';
import { formatDate } from '../lib/dates';
import { Modal } from './ui';

/** Ventana «Novedades»: la versión actual abierta y las anteriores plegadas, una línea cada una. */
export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="🆕 Novedades" onClose={onClose} footer={<button className="primary" onClick={onClose}>Cerrar</button>}>
      <ol className="changelog">
        {CHANGELOG.map((r, i) => (
          <li key={r.version}>
            <details open={i === 0}>
              <summary>
                <span className={`ver-tag ${i === 0 ? 'current' : ''}`}>v{r.version}</span>
                <b>{r.title}</b>
                <span className="muted small">{formatDate(r.date)}</span>
              </summary>
              <ul>{r.changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
