import { useMemo } from 'react';
import type { AppData } from '../data/useAppData';
import type { Employee } from '../types';
import { Modal } from '../components/ui';

/** Ficha rápida: datos de contacto y resumen del año de una persona. */
export function EmployeeCard({ emp, year, data, onClose, onEdit }: {
  emp: Employee; year: number; data: AppData; onClose: () => void; onEdit: () => void;
}) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries.values()) {
      if (e.employeeId === emp.id && e.date.startsWith(`${year}-`)) m.set(e.code, (m.get(e.code) ?? 0) + 1);
    }
    return m;
  }, [data.entries, emp.id, year]);
  const v = counts.get('V') ?? 0;
  const vp = counts.get('VP') ?? 0;

  const rows: [string, string][] = [
    ['Teléfono', emp.telefono], ['Extensión', emp.extension], ['Equipo', emp.equipo], ['Zona', emp.zona],
    ['Sede', emp.sede], ['Almacén VK', emp.almacen], ['Team leader', emp.teamLeader], ['Guardias', emp.guardias], ['Notas', emp.notas],
  ];

  return (
    <Modal title={emp.nombre} onClose={onClose} footer={<>
      <button onClick={onClose}>Cerrar</button>
      {data.canEdit && <button className="primary" onClick={onEdit}>Editar ficha</button>}
    </>}>
      <dl className="card-dl">
        {rows.filter(([, val]) => val).map(([k, val]) => (
          <div key={k}><dt>{k}</dt><dd>{k === 'Teléfono' ? <a href={`tel:${val.replace(/[^\d+]/g, '').slice(0, 12)}`}>{val}</a> : val}</dd></div>
        ))}
      </dl>
      <h3>Año {year}</h3>
      <div className="stats">
        <div className="stat"><b>{emp.diasVacaciones - v}</b><span>vacaciones pendientes<br />({v} de {emp.diasVacaciones} usadas)</span></div>
        <div className="stat"><b>{emp.vpPendientes - vp}</b><span>VP año anterior pendientes<br />({vp} de {emp.vpPendientes} usadas)</span></div>
      </div>
      <div className="legend compact">
        {data.codes.filter((c) => counts.has(c.code)).map((c) => (
          <span key={c.code} className="legend-item" title={c.label}>
            <span className="chip small" style={{ background: c.color, color: c.textColor }}>{c.code}</span>
            {c.label}: <b>{counts.get(c.code)}</b>
          </span>
        ))}
        {!counts.size && <span className="muted">Sin marcas este año.</span>}
      </div>
    </Modal>
  );
}
