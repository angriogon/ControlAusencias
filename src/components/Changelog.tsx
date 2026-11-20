import { useEffect } from 'react';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { formatDate } from '../lib/dates';
import { Modal, useUi } from './ui';

const SEEN = 'ca-version-vista';

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

/**
 * Tras una actualización, un aviso con la versión nueva y un enlace a las novedades
 * (una vez por versión y navegador).
 */
export function useUpdateNotice(open: () => void) {
  const { toast } = useUi();
  useEffect(() => {
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN); localStorage.setItem(SEEN, APP_VERSION); } catch { return; }
    if (seen !== APP_VERSION) {
      toast(`🆕 Actualizada a la v${APP_VERSION}: ${CHANGELOG[0].title}`, 'info', { label: 'Ver novedades', run: open });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
