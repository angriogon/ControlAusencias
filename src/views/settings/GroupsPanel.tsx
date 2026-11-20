import { useEffect, useState } from 'react';
import type { AppData } from '../../data/useAppData';
import type { GroupsConfig } from '../../types';
import { groupOf, removeGroup, setGroup } from '../../lib/groups';
import { useUi } from '../../components/ui';
import { matches } from '../../lib/search';
import { AdminGate, useAdmin } from '../../components/admin';

/** Grupos de personal (UNEI, INPLANT…): lista con colores y a quién se asigna cada uno. */
export function GroupsPanel({ data }: { data: AppData }) {
  const { toast, confirm } = useUi();
  const admin = useAdmin();
  const [cfg, setCfg] = useState<GroupsConfig>(data.groups);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  useEffect(() => setCfg(data.groups), [data.groups]);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(data.groups);
  const edit = admin.active && data.canEdit;
  const people = data.employees.filter((e) => e.activo);
  const count = (id: string) => people.filter((e) => groupOf(cfg, e)?.id === id).length;
  const list = people.filter((e) => matches(q, e.nombre, e.siglas, e.equipo, e.zona, e.sede)
    && (!only || (only === '-' ? !groupOf(cfg, e) : groupOf(cfg, e)?.id === only)));

  const setG = (id: string, v: Partial<{ nombre: string; color: string }>) =>
    setCfg((c) => ({ ...c, lista: c.lista.map((g) => (g.id === id ? { ...g, ...v } : g)) }));
  const add = () => setCfg((c) => ({ ...c, lista: [...c.lista, { id: crypto.randomUUID().slice(0, 8), nombre: 'NUEVO GRUPO', color: '#E8DAFF' }] }));
  const del = async (id: string) => {
    const g = cfg.lista.find((x) => x.id === id);
    const n = count(id);
    if (n && !(await confirm({ title: 'Quitar grupo', message: <>{n} persona(s) tienen el grupo <b>{g?.nombre}</b>. Se quedarán sin grupo.</>, ok: 'Quitar grupo', danger: true }))) return;
    setCfg((c) => removeGroup(c, id));
  };
  const save = async () => {
    if (cfg.lista.some((g) => !g.nombre.trim())) { toast('Todos los grupos necesitan un nombre', 'error'); return; }
    if (!(await admin.requestAdmin('Cambiar los grupos requiere el modo administrador.'))) return;
    setBusy(true);
    try {
      await data.saveGroups({ ...cfg, lista: cfg.lista.map((g) => ({ ...g, nombre: g.nombre.trim().toUpperCase() })) }, 'Grupos de personal');
      toast('Grupos guardados');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2>Grupos de personal</h2>
      <p className="muted small">
        Sombrea el nombre y las siglas en el calendario para distinguir a cada tipo de personal (UNEI, INPLANT, colaboradores, subcontratas…).
        Encima del calendario sale la leyenda. La asignación va por el <b>nombre</b> de la persona: se mantiene aunque se vuelva a importar el Excel.
      </p>
      {!admin.active && <AdminGate what="Cambiar los grupos">{null}</AdminGate>}
      <table className="table groups-table">
        <thead><tr><th>Color</th><th>Grupo</th><th className="num">Personas</th><th /></tr></thead>
        <tbody>
          {cfg.lista.map((g) => (
            <tr key={g.id}>
              <td><input type="color" value={g.color} disabled={!edit} onChange={(e) => setG(g.id, { color: e.target.value })} aria-label={`Color de ${g.nombre}`} /></td>
              <td><input value={g.nombre} disabled={!edit} maxLength={30} onChange={(e) => setG(g.id, { nombre: e.target.value.toUpperCase() })} aria-label="Nombre del grupo" /></td>
              <td className="num">{count(g.id)}</td>
              <td className="right">{edit && <button className="danger-ghost" onClick={() => del(g.id)}>Quitar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <button onClick={add}>＋ Añadir grupo</button>}

      <h3>Quién está en cada grupo</h3>
      <div className="inline-form">
        <input className="search" placeholder="🔍 Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Filtrar por grupo">
          <option value="">Todos</option>
          <option value="-">Sin grupo</option>
          {cfg.lista.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      </div>
      <table className="table">
        <thead><tr><th>Nombre</th><th>Siglas</th><th>Equipo</th><th>Zona</th><th>Grupo</th></tr></thead>
        <tbody>
          {list.map((e) => {
            const g = groupOf(cfg, e);
            return (
              <tr key={e.id}>
                <td><span className="grp-row-name"><span className="grp-swatch" style={{ background: g?.color ?? 'transparent' }} /><b>{e.nombre}</b></span></td>
                <td className="sig">{e.siglas}</td><td>{e.equipo}</td><td>{e.zona}</td>
                <td>
                  <select value={g?.id ?? ''} disabled={!edit} onChange={(ev) => setCfg((c) => setGroup(c, e, ev.target.value || null))} aria-label={`Grupo de ${e.nombre}`}>
                    <option value="">— Sin grupo —</option>
                    {cfg.lista.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="modal-actions sticky-actions">
        {dirty && <button onClick={() => setCfg(data.groups)}>Descartar</button>}
        <button className="primary" disabled={!dirty || busy || !data.canEdit} onClick={save}>{busy ? 'Guardando…' : `${admin.active ? '' : '🔒 '}Guardar grupos`}</button>
      </div>
    </section>
  );
}
