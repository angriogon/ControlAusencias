import { useState } from 'react';
import { useUi } from '../../components/ui';
import { useAdmin } from '../../components/admin';

/** Crear o cambiar la contraseña del modo administrador (solo usuarios con rol admin). */
export function AdminPasswordPanel() {
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
