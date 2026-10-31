import { useEffect, useMemo, useState } from 'react';
import type { DataStore } from '../data/store';
import type { AppData } from '../data/useAppData';
import type { AppUser, Code, Employee, OpsConfig, UserProfile } from '../types';
import { fieldStaff, zonesOf } from '../lib/ops';
import { Modal, useUi } from '../components/ui';
import { matches } from '../lib/search';
import { fillSiglas, makeSiglas, normSiglas } from '../lib/siglas';
import { AdminGate, useAdmin } from '../components/admin';

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
  const [tab, setTab] = useState<'people' | 'codes' | 'zones' | 'users' | 'admin'>('people');
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
      await store.saveEmployee(e);
      data.setEmployees((prev) => [...prev.filter((x) => x.id !== e.id), e]);
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
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted">Personas del calendario y claves disponibles.</p>
        </div>
        <div className="seg">
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Personas ({data.employees.filter((e) => e.activo).length})</button>
          <button className={tab === 'codes' ? 'on' : ''} onClick={() => setTab('codes')}>Claves ({data.codes.length})</button>
          <button className={tab === 'zones' ? 'on' : ''} onClick={() => setTab('zones')}>Zonas</button>
          {admin.status.canManage && <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Usuarios</button>}
          {admin.status.canManage && <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>🔒 Contraseña admin</button>}
        </div>
      </div>

      {(tab === 'people' || tab === 'codes') && !admin.active && (
        <div className="panel"><AdminGate what="Añadir, editar u ocultar personas y claves">{null}</AdminGate></div>
      )}

      {tab === 'admin' && <AdminPasswordPanel />}
      {tab === 'zones' && <ZonesPanel data={data} />}
      {tab === 'users' && <UsersPanel store={store} user={user} />}

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

export function EmployeeForm({ initial, isNew, others = [], onClose, onSave }: {
  initial: Employee; isNew: boolean; others?: Employee[]; onClose: () => void; onSave: (e: Employee) => void;
}) {
  const [e, setE] = useState(initial);
  const sig = normSiglas(e.siglas ?? '');
  const dupe = sig ? others.find((o) => o.id !== e.id && normSiglas(o.siglas ?? '') === sig) : undefined;
  const suggest = () => {
    const used = others.filter((o) => o.id !== e.id);
    const [mine] = fillSiglas([...used, { ...e, siglas: '' }]).slice(-1);
    setE((x) => ({ ...x, siglas: mine.siglas || makeSiglas(x.nombre) }));
  };
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setE((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Employee, label: string, ph = '') => (
    <label>{label}<input value={String(e[k] ?? '')} placeholder={ph} onChange={(ev) => set(k, ev.target.value as never)} /></label>
  );
  const num = (k: keyof Employee, label: string) => (
    <label>{label}<input type="number" step="0.5" value={Number(e[k] ?? 0)} onChange={(ev) => set(k, Number(ev.target.value) as never)} /></label>
  );
  return (
    <Modal title={isNew ? 'Añadir persona' : `Editar · ${initial.nombre}`} wide onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={!e.nombre.trim() || busy || !!dupe} onClick={async () => { setBusy(true); await onSave({ ...e, nombre: e.nombre.trim(), siglas: sig }); setBusy(false); }}>
        Guardar
      </button>
    </>}>
      <div className="form grid2">
        {text('nombre', 'Nombre completo *')}
        <label>Siglas (las de las planificaciones)
          <span className="inline-field">
            <input value={e.siglas ?? ''} maxLength={10} placeholder="p. ej. AMRG" onChange={(ev) => set('siglas', ev.target.value.toUpperCase())} />
            <button type="button" onClick={suggest} title="Proponer a partir del nombre">Proponer</button>
          </span>
          {dupe && <span className="error small">Ya las tiene {dupe.nombre}</span>}
        </label>
        {text('sede', 'Sede / puesto', 'p. ej. DISPATCHER 1 SEV')}
        {text('equipo', 'Equipo', 'DISPATCH, ALMACEN, TEC.P…')}
        {text('zona', 'Zona', 'Sev, Cen, Lev…')}
        {text('teamLeader', 'Team leader')}
        {text('almacen', 'Almacén VK')}
        {text('telefono', 'Teléfono')}
        {text('extension', 'Extensión')}
        {text('guardias', 'Guardias')}
        {num('diasVacaciones', 'Días de vacaciones del año')}
        {num('vpPendientes', 'Vacaciones pendientes año anterior (VP)')}
        {num('diasLh', 'Días libre por horas (LH)')}
        <label className="span2">Notas<textarea rows={2} value={e.notas} onChange={(ev) => set('notas', ev.target.value)} /></label>
      </div>
    </Modal>
  );
}

function CodeForm({ initial, isNew, onClose, onSave }: {
  initial: Code; isNew: boolean; onClose: () => void; onSave: (c: Code, isNew: boolean) => void;
}) {
  const [c, setC] = useState(initial);
  return (
    <Modal title={isNew ? 'Nueva clave' : `Editar clave ${initial.code}`} onClose={onClose} footer={<>
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" onClick={() => onSave(c, isNew)}>Guardar</button>
    </>}>
      <div className="form">
        <label>Clave (lo que aparece en la celda)<input value={c.code} disabled={!isNew} maxLength={10} onChange={(e) => setC({ ...c, code: e.target.value })} /></label>
        <label>Significado<input value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} /></label>
        <div className="row2">
          <label>Color de fondo<input type="color" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value.toUpperCase() })} /></label>
          <label>Color del texto<input type="color" value={c.textColor} onChange={(e) => setC({ ...c, textColor: e.target.value.toUpperCase() })} /></label>
        </div>
        <label>Tipo
          <select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value as Code['category'] })}>
            <option value="ausencia">Ausencia (cuenta en el total del día)</option>
            <option value="control">Control (solo informativa)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked })} /> En uso (si se desmarca, deja de salir en la paleta pero se conservan las marcas)</label>
        <div>Vista previa: <span className="chip" style={{ background: c.color, color: c.textColor }}>{c.code || '?'}</span></div>
      </div>
    </Modal>
  );
}

/** Crear o cambiar la contraseña del modo administrador (solo usuarios con rol admin). */
function AdminPasswordPanel() {
  const admin = useAdmin();
  const { toast } = useUi();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = admin.status.configured;

  const save = async () => {
    setError('');
    if (next !== next2) { setError('Las dos contraseñas nuevas no coinciden'); return; }
    setBusy(true);
    try {
      await admin.setPassword(configured ? current : null, next);
      toast(configured ? 'Contraseña de administrador cambiada' : 'Contraseña de administrador creada');
      setCurrent(''); setNext(''); setNext2('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2>{configured ? 'Cambiar la contraseña de administrador' : 'Crear la contraseña de administrador'}</h2>
      <p className="muted small">
        Es una contraseña compartida para quienes deban importar, restaurar copias, gestionar personas y claves o hacer
        cambios a más de 5 personas a la vez. Se guarda cifrada; ni siquiera se puede consultar, solo cambiar.
      </p>
      <div className="form narrow">
        {configured && <label>Contraseña actual<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>}
        <label>Nueva contraseña (mínimo 8 caracteres)<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label>Repite la nueva contraseña<input type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <div><button className="primary" disabled={busy || next.length < 8 || (configured && !current)} onClick={save}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button></div>
      </div>
    </section>
  );
}

/** Equipos de campo, mínimo de técnicos por zona y zonas vecinas (para la Operativa). */
function ZonesPanel({ data }: { data: AppData }) {
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

const ROLE_LABEL: Record<UserProfile['role'], string> = { admin: 'Administrador', editor: 'Editor (marca días)', lector: 'Solo consulta' };

/** Roles de los usuarios (solo para el rol administrador). */
function UsersPanel({ store, user }: { store: DataStore; user: AppUser }) {
  const { toast } = useUi();
  const admin = useAdmin();
  const [list, setList] = useState<UserProfile[] | null>(null);
  const load = () => store.listProfiles().then(setList).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);
  const change = async (u: UserProfile, role: UserProfile['role']) => {
    if (!(await admin.requestAdmin('Cambiar roles requiere el modo administrador.'))) return;
    try { await store.setUserRole(u.id, role); toast(`${u.name}: ${ROLE_LABEL[role]}`); load(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <section className="panel">
      <h2>Usuarios y roles</h2>
      <div className="warn-box small">
        <b>Dar de alta a alguien:</b> Supabase → Authentication → Users → <i>Add user</i> (correo y contraseña; en «User metadata»
        <code>{' {"name": "Nombre Apellido"} '}</code>para que el historial muestre su nombre). Entra con rol <b>Editor</b>; cámbialo aquí.
        <br />Recomendado: <b>dispatchers</b> = Editor · <b>técnicos y responsables</b> = Solo consulta · tú = Administrador.
      </div>
      {!list ? <p className="muted">Cargando…</p> : (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b>{u.email === user.email && <span className="tag">tú</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => change(u, e.target.value as UserProfile['role'])} disabled={store.mode === 'local'}>
                    {(Object.keys(ROLE_LABEL) as UserProfile['role'][]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
