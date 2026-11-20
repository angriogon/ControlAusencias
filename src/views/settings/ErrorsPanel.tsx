import { useEffect, useState } from 'react';
import type { DataStore } from '../../data/store';
import type { AppErrorRow } from '../../types';
import { formatDateTime } from '../../lib/dates';

/** Registro de errores de la app (solo administradores): qué ha fallado, a quién, cuándo y en qué versión. */
export function ErrorsPanel({ store }: { store: DataStore }) {
  const [rows, setRows] = useState<AppErrorRow[] | null>(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); store.listErrors(100).then(setRows).catch((e) => setError((e as Error).message)); };
  useEffect(load, [store]);
  return (
    <section className="panel">
      <div className="inline-form">
        <p className="muted small">Fallos que han tenido los usuarios en su navegador (90 días). Sirve para detectar problemas sin esperar a que alguien avise.</p>
        <span className="spacer" />
        <button onClick={load}>↻ Actualizar</button>
      </div>
      {error && <p className="warn-box small">{error}</p>}
      {rows && !rows.length && <p className="ok-text">✓ Sin errores registrados.</p>}
      {rows && rows.length > 0 && (
        <table className="table small">
          <thead><tr><th>Cuándo</th><th>Quién</th><th>Versión</th><th>Error</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{formatDateTime(r.ts)}</td>
                <td>{r.userName}</td>
                <td>v{r.version}</td>
                <td>
                  <details>
                    <summary>{r.message}</summary>
                    <pre className="err-stack">{[r.url && `Pantalla: ${r.url}`, r.userAgent && `Navegador: ${r.userAgent}`, r.stack].filter(Boolean).join('\n\n')}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
