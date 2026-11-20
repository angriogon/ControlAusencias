import { useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { AppUser, Code, Employee } from '../types';
import { useUi } from '../components/ui';
import { matches } from '../lib/search';
import { AdminGate, useAdmin } from '../components/admin';
import { DataReview } from './ops/DataReview';
import { EmployeeForm } from './settings/EmployeeForm';
import { CodeForm } from './settings/CodeForm';
import { AdminPasswordPanel } from './settings/AdminPasswordPanel';
import { GroupsPanel } from './settings/GroupsPanel';
import { ZonesPanel } from './settings/ZonesPanel';
import { UsersPanel } from './settings/UsersPanel';
import { ErrorsPanel } from './settings/ErrorsPanel';

const blankEmployee = (orden: number): Employee => ({
  id: crypto.randomUUID(), nombre: '', siglas: '', telefono: '', extension: '', almacen: '', teamLeader: '', equipo: '',
  zona: '', guardias: 'NO', sede: '', diasVacaciones: 25, vpPendientes: 0, diasLh: 0, notas: '', orden, activo: true,
});

/** Gestión de personas del calendario y de las claves. */
export function SettingsView({ store, data, user, editing, setEditing }: {
  store: DataStore; data: AppData; user: AppUser;
  editing: Employee | null; setEditing: (e: Employee | null) => void;
}) {
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<'people' | 'codes' | 'groups' | 'zones' | 'review' | 'users' | 'errors' | 'admin'>('people');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [codeEdit, setCodeEdit] = useState<Code | null>(null);
  const admin = useAdmin();
  const isAdmin = admin.active;
  const canEdit = data.canEdit && user.role !== 'lector' && admin.active;

  const list = data.employees.filter((e) => (showInactive || e.activo)
    && matches(q, e.nombre, e.siglas, e.equipo, e.zona, e.sede));

  const saveEmp = async (e: Employee) => {
    try {
      await data.saveEmployee(e);
      toast('Ficha guardada');
      return true;
    } catch (err) { toast((err as Error).message, 'error'); return false; }
  };

  const toggleActive = async (e: Employee) => {
    if (e.activo && !(await confirm({
      title: 'Dar de baja en el calendario',
      message: <><b>{e.nombre}</b> dejará de aparecer en el calendario, pero se conservan todas sus marcas. Se puede reactivar en cualquier momento.</>,
      ok: 'Ocultar del calendario',
    }))) return;
    await saveEmp({ ...e, activo: !e.activo });
  };

  const remove = async (e: Employee) => {
    if (!(await confirm({
      title: 'Eliminar definitivamente',
      danger: true,
      ok: 'Eliminar',
      message: <>Se borrará <b>{e.nombre}</b> y <b>todas sus marcas</b>. Normalmente es mejor «Ocultar». Si te equivocas, se puede deshacer desde el Historial.</>,
    }))) return;
    try {
      await store.deleteEmployee(e.id);
      await data.reloadAll();
      toast('Persona eliminada');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const moveTo = async (e: Employee, dir: -1 | 1) => {
    const ordered = data.employees;
    const i = ordered.findIndex((x) => x.id === e.id);
    const other = ordered[i + dir];
    if (!other) return;
    // Renumerar ambos para que el orden quede estable aunque hubiera empates
    const a = { ...e, orden: other.orden }, b = { ...other, orden: e.orden };
    if (a.orden === b.orden) { a.orden += dir; }
    await saveEmp(a);
    await saveEmp(b);
  };

  const saveCode = async (c: Code, isNew: boolean) => {
    if (!c.code.trim()) { toast('La clave no puede estar vacía', 'error'); return; }
    if (isNew && data.codes.some((x) => x.code.toUpperCase() === c.code.trim().toUpperCase())) { toast('Esa clave ya existe', 'error'); return; }
    try {
      const clean = { ...c, code: c.code.trim() };
      await store.saveCode(clean);
      data.setCodes((prev) => [...prev.filter((x) => x.code !== clean.code), clean]);
      setCodeEdit(null);
      toast('Clave guardada');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <nav className="subtabs" aria-label="Ajustes">
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Personas ({data.employees.filter((e) => e.activo).length})</button>
          <button className={tab === 'codes' ? 'on' : ''} onClick={() => setTab('codes')}>Claves ({data.codes.length})</button>
          <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Grupos</button>
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>Zonas</button>
          <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')} title="Fichas con datos que faltan o no cuadran">Revisar datos</button>
          {admin.status.canManage && <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Usuarios</button>}
          {admin.status.canManage && <button className={tab === 'errors' ? 'on' : ''} onClick={() => setTab('errors')}>Errores</button>}
          {admin.status.canManage && <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>🔒 Contraseña admin</button>}
      </nav>

      {(tab === 'people' || tab === 'codes') && !admin.active && (
        <div className="panel"><AdminGate what="Añadir, editar u ocultar personas y claves">{null}</AdminGate></div>
      )}

      {tab === 'admin' && <AdminPasswordPanel />}
      {tab === 'zones' && <ZonesPanel data={data} />}
      {tab === 'groups' && <GroupsPanel data={data} />}
      {tab === 'review' && <DataReview data={data} onEditEmployee={async (e) => { if (await admin.requestAdmin('Corregir fichas requiere el modo administrador.')) setEditing(e); }} />}
      {tab === 'users' && <UsersPanel store={store} user={user} />}
      {tab === 'errors' && <ErrorsPanel store={store} />}

      {tab === 'people' && (
        <section className="panel">
          <div className="inline-form">
            <input className="search" placeholder="🔍 Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar ocultas</label>
            <span className="spacer" />
            {canEdit && <button className="primary" onClick={() => setEditing(blankEmployee(Math.max(0, ...data.employees.map((e) => e.orden)) + 1))}>＋ Añadir persona</button>}
          </div>
          <table className="table">
            <thead><tr><th>Orden</th><th>Nombre</th><th>Siglas</th><th>Equipo</th><th>Zona</th><th>Sede</th><th>Teléfono</th><th>Vac.</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={e.activo ? '' : 'inactive'}>
                  <td className="nowrap">
                    {canEdit && !q && <>
                      <button className="icon-btn" onClick={() => moveTo(e, -1)} aria-label="Subir">▲</button>
                      <button className="icon-btn" onClick={() => moveTo(e, 1)} aria-label="Bajar">▼</button>
                    </>}
                  </td>
                  <td><b>{e.nombre}</b>{!e.activo && <span className="tag gray">oculta</span>}</td>
                  <td className="sig">{e.siglas || <span className="muted">—</span>}</td>
                  <td>{e.equipo}</td><td>{e.zona}</td><td>{e.sede}</td><td>{e.telefono}</td><td>{e.diasVacaciones}</td>
                  <td className="nowrap right">
                    {canEdit && <>
                      <button onClick={() => setEditing(e)}>Editar</button>{' '}
                      <button onClick={() => toggleActive(e)}>{e.activo ? 'Ocultar' : 'Reactivar'}</button>{' '}
                      {isAdmin && <button className="danger-ghost" onClick={() => remove(e)}>Eliminar</button>}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'codes' && (
        <section className="panel">
          <div className="inline-form">
            <p className="muted small">Las claves de tipo «Ausencia» cuentan para el total de ausencias del día. Las de «Control» son informativas.</p>
            <span className="spacer" />
            {isAdmin && canEdit && (
              <button className="primary" onClick={() => setCodeEdit({ code: '', label: '', color: '#BFBFBF', textColor: '#000000', category: 'ausencia', orden: data.codes.length, activo: true })}>＋ Nueva clave</button>
            )}
          </div>
          <table className="table">
            <thead><tr><th>Clave</th><th>Significado</th><th>Tipo</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.codes.map((c) => (
                <tr key={c.code} className={c.activo ? '' : 'inactive'}>
                  <td><span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code}</span></td>
                  <td>{c.label}</td>
                  <td>{c.category === 'ausencia' ? 'Ausencia' : 'Control'}</td>
                  <td>{c.activo ? 'En uso' : 'Retirada'}</td>
                  <td className="right">{isAdmin && canEdit && <button onClick={() => setCodeEdit(c)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </section>
      )}

      {editing && (
        <EmployeeForm
          initial={editing}
          isNew={!data.employees.some((e) => e.id === editing.id)}
          others={data.employees}
          onClose={() => setEditing(null)}
          onSave={async (e) => { if (await saveEmp(e)) setEditing(null); }}
        />
      )}
      {codeEdit && (
        <CodeForm
          initial={codeEdit}
          isNew={!data.codes.some((c) => c.code === codeEdit.code)}
          onClose={() => setCodeEdit(null)}
          onSave={saveCode}
        />
      )}
    </div>
  );
}
