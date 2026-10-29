import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataStore } from './data/store';
import { createStore } from './data';
import { useAppData } from './data/useAppData';
import type { AppUser, Employee } from './types';
import { UiProvider, useUi } from './components/ui';
import { CalendarView } from './views/CalendarView';
import { HistoryView } from './views/HistoryView';
import { DataView } from './views/DataView';
import { SummaryView } from './views/SummaryView';
import { SettingsView, EmployeeForm } from './views/SettingsView';
import { Login } from './views/Login';

type Tab = 'calendar' | 'summary' | 'history' | 'data' | 'settings';
const TABS: [Tab, string][] = [
  ['calendar', '📅 Calendario'],
  ['summary', '📊 Resumen'],
  ['history', '🕘 Historial'],
  ['data', '💾 Copias y Excel'],
  ['settings', '⚙️ Ajustes'],
];

export default function App() {
  const store = useMemo(() => createStore(), []);
  return (
    <UiProvider>
      <AuthGate store={store} />
    </UiProvider>
  );
}

function AuthGate({ store }: { store: DataStore }) {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  useEffect(() => { store.currentUser().then(setUser).catch(() => setUser(null)); }, [store]);
  if (user === undefined) return <div className="splash">Cargando…</div>;
  if (!user) return <Login store={store} onLogin={setUser} />;
  return <Main store={store} user={user} onLogout={async () => { await store.signOut(); setUser(null); }} />;
}

function Main({ store, user, onLogout }: { store: DataStore; user: AppUser; onLogout: () => void }) {
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('ca-tab') as Tab) || 'calendar');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const onError = useCallback((m: string) => toast(m, 'error'), [toast]);
  const data = useAppData(store, onError);
  const readOnly = user.role === 'lector';
  const effective = useMemo(() => ({
    ...data,
    canEdit: data.canEdit && !readOnly,
    apply: readOnly
      ? async () => { toast('Tu usuario es de solo lectura', 'error'); return false; }
      : data.apply,
    saveNote: readOnly
      ? async () => { toast('Tu usuario es de solo lectura', 'error'); return false; }
      : data.saveNote,
  }), [data, readOnly, toast]);

  useEffect(() => { try { localStorage.setItem('ca-tab', tab); } catch { /* */ } }, [tab]);
  useEffect(() => store.onPresence?.(setOnline), [store]);

  const undo = useCallback(async () => {
    const label = await data.undo((n) => confirm({
      title: 'Deshacer',
      message: `${n} de esas celdas las ha cambiado otra persona después. ¿Deshacer igualmente?`,
      ok: 'Deshacer igualmente', danger: true,
    }));
    if (label) toast(`Deshecho: ${label}`, 'info');
    else if (!data.undoSize) toast('No hay nada tuyo que deshacer en esta sesión. Mira el Historial.', 'info');
  }, [data, confirm, toast]);

  // Ctrl+Z global (salvo cuando se escribe en un campo de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const saveEditing = async (e: Employee) => {
    try {
      await store.saveEmployee(e);
      data.setEmployees((prev) => [...prev.filter((x) => x.id !== e.id), e]);
      toast('Ficha guardada');
      setEditing(null);
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const statusText = {
    saved: '✓ Todo guardado',
    saving: '⟳ Guardando…',
    error: '⚠ Error al guardar',
    offline: '⚠ Sin conexión · solo lectura',
  }[data.status];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /> Control de Ausencias</div>
        <nav className="tabs" aria-label="Secciones">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="undo-btn" onClick={undo} disabled={!data.undoSize} title="Deshacer mi último cambio (Ctrl+Z)">↶ Deshacer</button>
          <span className={`status ${data.status}`} title="Los cambios se guardan solos al momento">{statusText}</span>
          {online.length > 1 && (
            <span className="presence" title={`Conectados ahora:\n${online.join('\n')}`}>
              {online.slice(0, 4).map((n) => <span key={n} className="avatar">{n.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>)}
              {online.length > 4 && <span className="avatar more">+{online.length - 4}</span>}
            </span>
          )}
          <span className="user" title={`${user.email}\nRol: ${user.role}`}>{user.name}</span>
          <button className="link" onClick={onLogout}>Salir</button>
        </div>
      </header>

      {store.mode === 'local' && (
        <div className="banner">
          <b>Modo local (prueba):</b> los datos se guardan solo en este navegador y no se comparten con el equipo.
          Para usarlo entre todos hay que conectar el servidor (ver README).
        </div>
      )}
      {readOnly && <div className="banner">Tu usuario es de <b>solo lectura</b>.</div>}

      <main>
        {data.loading ? <div className="splash">Cargando datos…</div> : (
          <>
            {tab === 'calendar' && <CalendarView data={effective} onEditEmployee={setEditing} />}
            {tab === 'summary' && <SummaryView data={effective} />}
            {tab === 'history' && <HistoryView store={store} data={effective} />}
            {tab === 'data' && <DataView store={store} data={effective} user={user} />}
            {tab === 'settings' && <SettingsView store={store} data={effective} user={user} editing={editing} setEditing={setEditing} />}
          </>
        )}
      </main>

      {editing && tab !== 'settings' && (
        <EmployeeForm initial={editing} isNew={false} onClose={() => setEditing(null)} onSave={saveEditing} />
      )}
    </div>
  );
}
