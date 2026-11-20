import { useEffect, useState } from 'react';
import type { DataStore } from '../../data/store';
import type { AppUser, UserProfile } from '../../types';
import { useUi } from '../../components/ui';
import { useAdmin } from '../../components/admin';

const ROLE_LABEL: Record<UserProfile['role'], string> = { admin: 'Administrador', editor: 'Editor (marca días)', lector: 'Solo consulta' };

/** Roles de los usuarios (solo para el rol administrador). */
export function UsersPanel({ store, user }: { store: DataStore; user: AppUser }) {
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
