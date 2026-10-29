import { useState, type FormEvent } from 'react';
import type { DataStore } from '../data/store';
import type { AppUser } from '../types';

export function Login({ store, onLogin }: { store: DataStore; onLogin: (u: AppUser) => void }) {
  const local = store.mode === 'local';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try { onLogin(await store.signIn(email, password)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) { setError('Escribe primero tu correo.'); return; }
    try { await store.resetPassword?.(email); setInfo('Te hemos enviado un correo para cambiar la contraseña.'); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={64} height={64} />
        <h1>Control de Ausencias</h1>
        {local ? (
          <>
            <p className="muted">Modo de prueba local. Escribe tu nombre para que quede en el historial.</p>
            <label>Tu nombre<input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="p. ej. Ángel" /></label>
          </>
        ) : (
          <>
            <label>Correo<input autoFocus type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {info && <p className="ok">{info}</p>}
        <button className="primary big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        {!local && <button type="button" className="link" onClick={forgot}>He olvidado mi contraseña</button>}
      </form>
    </div>
  );
}
