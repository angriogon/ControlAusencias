import { useEffect, useMemo } from 'react';
import type { AppData } from '../../data/useAppData';
import type { Employee } from '../../types';
import { dataIssues } from '../../lib/ops';
import { useAdmin } from '../../components/admin';
import { Chip } from './shared';

// =====================================================================
// Revisión de datos
// =====================================================================
export function DataReview({ data, onEditEmployee }: { data: AppData; onEditEmployee: (e: Employee) => void }) {
  const admin = useAdmin();
  const year = new Date().getFullYear();
  useEffect(() => { data.loadYear(year); }, [year, data.loadYear]);
  const r = useMemo(() => dataIssues(data.employees, data.entries, data.codes, data.ops, year), [data.employees, data.entries, data.codes, data.ops, year]);
  const ok = !r.people.length && !r.unknownCodes.size && !r.reviewCodes.size;
  return (
    <>
      <p className="muted">Lo que hace que la cobertura, los saldos o la importación de planificación den datos falsos. {admin.active ? 'Pulsa «Corregir» para abrir la ficha.' : 'Para corregir, activa el modo administrador.'}</p>
      {ok && <div className="panel ok">✓ Todo correcto: no hay datos que revisar.</div>}
      {(r.unknownCodes.size > 0 || r.reviewCodes.size > 0) && (
        <section className="panel">
          <h2>Claves que revisar ({year})</h2>
          <ul>
            {[...r.reviewCodes].map(([c, n]) => <li key={c}><Chip code={c} data={data} /> {data.codes.find((x) => x.code === c)?.label}: <b>{n}</b> día(s). Búscalas en el calendario y cámbialas por la clave correcta.</li>)}
            {[...r.unknownCodes].map(([c, n]) => <li key={c}><b>{c}</b>: clave que no existe en la lista, en {n} día(s).</li>)}
          </ul>
        </section>
      )}
      {r.people.length > 0 && (
        <section className="panel">
          <h2>Fichas incompletas ({r.people.length})</h2>
          <table className="table">
            <thead><tr><th>Persona</th><th>Equipo · zona</th><th>Qué falta</th><th /></tr></thead>
            <tbody>
              {r.people.map((p) => (
                <tr key={p.emp.id}>
                  <td><b>{p.emp.nombre}</b></td>
                  <td className="small">{[p.emp.equipo, p.emp.zona].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{p.problems.map((x) => <span key={x} className="tag warn-tag">{x}</span>)}</td>
                  <td className="right"><button onClick={() => onEditEmployee(p.emp)}>{admin.active ? 'Corregir' : '🔒 Corregir'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
