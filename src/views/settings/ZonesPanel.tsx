import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../../data/useAppData';
import type { OpsConfig } from '../../types';
import { fieldStaff, zonesOf } from '../../lib/ops';
import { useUi } from '../../components/ui';
import { useAdmin } from '../../components/admin';

/** Equipos de campo, mínimo de técnicos por zona y zonas vecinas (para la Operativa). */
export function ZonesPanel({ data }: { data: AppData }) {
  const { toast } = useUi();
  const admin = useAdmin();
  const [cfg, setCfg] = useState<OpsConfig>(data.ops);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCfg(data.ops), [data.ops]);
  const equipos = useMemo(() => [...new Set(data.employees.filter((e) => e.activo).map((e) => e.equipo).filter(Boolean))].sort(), [data.employees]);
  const staff = useMemo(() => fieldStaff(data.employees, cfg), [data.employees, cfg]);
  const zones = useMemo(() => zonesOf(staff), [staff]);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(data.ops);
  const zc = (z: string) => cfg.zonas[z] ?? { minimo: 1, vecinas: [] };
  const setZone = (z: string, v: Partial<{ minimo: number; vecinas: string[] }>) => setCfg((c) => ({ ...c, zonas: { ...c.zonas, [z]: { ...zc(z), ...v } } }));
  const toggleVecina = (z: string, v: string, on: boolean) => {
    setZone(z, { vecinas: on ? [...new Set([...zc(z).vecinas, v])] : zc(z).vecinas.filter((x) => x !== v) });
    // La vecindad es mutua: si Sev cubre Cad, Cad también cubre Sev
    setCfg((c) => {
      const o = c.zonas[v] ?? { minimo: 1, vecinas: [] };
      const vec = on ? [...new Set([...o.vecinas, z])] : o.vecinas.filter((x) => x !== z);
      return { ...c, zonas: { ...c.zonas, [v]: { ...o, vecinas: vec } } };
    });
  };
  const save = async () => {
    if (!(await admin.requestAdmin('Cambiar las zonas requiere el modo administrador.'))) return;
    setBusy(true);
    try { await data.saveOps(cfg, 'Ajustes de zonas y equipos de campo'); toast('Zonas guardadas'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const count = (z: string) => staff.filter((e) => (e.zona || '(sin zona)') === z).length;

  return (
    <section className="panel">
      <h2>Zonas y técnicos de campo</h2>
      <p className="muted small">
        Lo usa la pestaña <b>Operativa</b>: cobertura, avisos al marcar ausencias y «¿Quién puede ir?». El <b>mínimo</b> es cuántos técnicos deben
        estar trabajando en la zona (si la zona tiene menos, se usa el total). Las <b>vecinas</b> son las zonas desde las que se puede cubrir.
      </p>
      <fieldset className="equipos" disabled={!data.canEdit}>
        <legend>Equipos que cuentan como técnicos de campo</legend>
        {equipos.map((q) => (
          <label key={q} className="check">
            <input type="checkbox" checked={cfg.equipos.includes(q)}
              onChange={(e) => setCfg((c) => ({ ...c, equipos: e.target.checked ? [...c.equipos, q] : c.equipos.filter((x) => x !== q) }))} />
            {q}
          </label>
        ))}
      </fieldset>
      <table className="table">
        <thead><tr><th>Zona</th><th className="num">Técnicos</th><th>Mínimo</th><th>Zonas vecinas</th></tr></thead>
        <tbody>
          {zones.map((z) => (
            <tr key={z}>
              <td><b>{z}</b></td>
              <td className="num">{count(z)}</td>
              <td><input type="number" min={0} max={count(z)} value={zc(z).minimo} style={{ width: 70 }} disabled={!data.canEdit}
                onChange={(e) => setZone(z, { minimo: Math.max(0, Number(e.target.value) || 0) })} /></td>
              <td>
                <details>
                  <summary>{zc(z).vecinas.length ? zc(z).vecinas.join(', ') : 'Ninguna'}</summary>
                  <div className="vecinas">
                    {zones.filter((x) => x !== z).map((v) => (
                      <label key={v} className="check small"><input type="checkbox" disabled={!data.canEdit} checked={zc(z).vecinas.includes(v)} onChange={(e) => toggleVecina(z, v, e.target.checked)} /> {v}</label>
                    ))}
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-actions">
        {dirty && <button onClick={() => setCfg(data.ops)}>Descartar</button>}
        <button className="primary" disabled={!dirty || busy || !data.canEdit} onClick={save}>{busy ? 'Guardando…' : `${admin.active ? '' : '🔒 '}Guardar zonas`}</button>
      </div>
    </section>
  );
}
