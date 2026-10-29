import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { DataStore } from '../data/store';
import type { AdminStatus } from '../types';
import { Modal, useUi } from './ui';

interface AdminCtx {
  status: AdminStatus;
  /** Modo administrador activo ahora mismo. */
  active: boolean;
  /** Abre la ventana de contraseña; resuelve true si se ha activado. */
  requestAdmin: (reason?: string) => Promise<boolean>;
  lock: () => Promise<void>;
  refresh: () => Promise<void>;
  setPassword: (current: string | null, next: string) => Promise<void>;
}

const Ctx = createContext<AdminCtx | null>(null);
export const useAdmin = () => useContext(Ctx)!;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Modo administrador: una contraseña compartida desbloquea durante 4 horas las
 * acciones masivas (importar, restaurar, personas, claves, cambios a muchas
 * personas). El servidor es quien lo comprueba; aquí solo se gestiona la UI.
 */
export function AdminProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  const { toast } = useUi();
  const [status, setStatus] = useState<AdminStatus>({ configured: true, until: null, canManage: false });
  const [prompt, setPrompt] = useState<{ reason?: string; resolve: (ok: boolean) => void } | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try { setStatus(await store.adminStatus()); } catch { /* sin conexión: se mantiene */ }
  }, [store]);
  useEffect(() => { refresh(); }, [refresh]);

  // Reloj para que el modo admin caduque solo en pantalla
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const active = !!status.until && new Date(status.until).getTime() > now;
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) toast('El modo administrador ha caducado', 'info');
    wasActive.current = active;
  }, [active, toast]);

  const requestAdmin = useCallback((reason?: string) => {
    if (active) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setPrompt({ reason, resolve }));
  }, [active]);

  const lock = useCallback(async () => {
    wasActive.current = false; // salida manual: no avisar de "caducado"
    await store.adminLock();
    await refresh();
    toast('Modo administrador desactivado', 'info');
  }, [store, refresh, toast]);

  const setPassword = useCallback(async (current: string | null, next: string) => {
    await store.setAdminPassword(current, next);
    await refresh();
  }, [store, refresh]);

  const close = (ok: boolean) => { prompt?.resolve(ok); setPrompt(null); };

  // Mismo objeto mientras no cambie nada real (el reloj de 30 s no debe repintar la app)
  const value = useMemo(() => ({ status, active, requestAdmin, lock, refresh, setPassword }),
    [status, active, requestAdmin, lock, refresh, setPassword]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {prompt && (
        <UnlockDialog
          reason={prompt.reason}
          status={status}
          onUnlock={async (pw) => {
            const until = await store.adminUnlock(pw);
            if (!until) return false;
            await refresh();
            toast(`Modo administrador activo hasta las ${hhmm(until)}`);
            close(true);
            return true;
          }}
          onCreate={async (pw) => {
            await setPassword(null, pw);
            toast('Contraseña de administrador creada');
          }}
          onClose={() => close(false)}
        />
      )}
    </Ctx.Provider>
  );
}

function UnlockDialog({ reason, status, onUnlock, onCreate, onClose }: {
  reason?: string; status: AdminStatus;
  onUnlock: (pw: string) => Promise<boolean>;
  onCreate: (pw: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const creating = !status.configured;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (creating) {
        if (pw !== pw2) { setError('Las dos contraseñas no coinciden'); return; }
        await onCreate(pw);
        if (!(await onUnlock(pw))) setError('No se pudo activar');
      } else if (!(await onUnlock(pw))) {
        setError('Contraseña incorrecta');
        setPw('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="🔒 Modo administrador" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {reason && <p className="warn-box">{reason}</p>}
        {creating && !status.canManage ? (
          <p>Todavía no hay contraseña de administrador. Tiene que crearla un usuario con rol de administrador.</p>
        ) : (
          <>
            <p className="muted">
              {creating
                ? 'Primera vez: crea la contraseña que usaréis para importar, restaurar copias, gestionar personas y claves, y hacer cambios a más de 5 personas a la vez.'
                : 'Introduce la contraseña de administrador. El modo se desactiva solo a las 4 horas.'}
            </p>
            <label>{creating ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Contraseña'}
              <input type="password" autoFocus autoComplete={creating ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            {creating && (
              <label>Repite la contraseña
                <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>Cancelar</button>
              <button className="primary" disabled={busy || !pw}>{busy ? 'Comprobando…' : creating ? 'Crear y activar' : 'Activar'}</button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

/** Bloque para páginas: muestra el contenido solo en modo admin, o un botón para activarlo. */
export function AdminGate({ children, what }: { children: ReactNode; what: string }) {
  const { active, requestAdmin } = useAdmin();
  if (active) return <>{children}</>;
  return (
    <div className="admin-gate">
      <span>🔒 {what} requiere el <b>modo administrador</b>.</span>
      <button onClick={() => requestAdmin()}>Activar modo administrador</button>
    </div>
  );
}

export { hhmm };
