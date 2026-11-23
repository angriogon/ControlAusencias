import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataStore } from './data/store';
import { createStore } from './data';
import { useAppData } from './data/useAppData';
import { useExcelSync } from './data/useExcelSync';
import type { AppUser, CellChange, Employee, PresenceUser } from './types';
import { coverageImpact } from './lib/ops';
import { formatDate } from './lib/dates';
import { normSiglas } from './lib/siglas';
import type { Sub } from './views/OpsView';
import { TodayStrip } from './views/TodayStrip';
import { useUpdateNotice } from './components/Changelog';
import { APP_VERSION } from './changelog';
import { AdminProvider, useAdmin, hhmm } from './components/admin';
import { initials } from './lib/colors';
import { UiProvider, useUi } from './components/ui';
import type { BackupSub } from './views/BackupView';
import { Login } from './views/Login';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installErrorLogging, reportError } from './lib/errorLog';
import { EXPORT_EVERY_DAYS, exportDays } from './lib/exportReminder';

/*
 * Cada sección se descarga al abrirla (la app arranca antes) y, ya abierta la app,
 * las demás se precargan en segundo plano para que cambiar de pestaña sea inmediato.
 */
const load = {
  calendar: () => import('./views/CalendarView'),
  ops: () => import('./views/OpsView'),
  backup: () => import('./views/BackupView'),
  settings: () => import('./views/SettingsView'),
  form: () => import('./views/settings/EmployeeForm'),
  help: () => import('./views/HelpDialog'),
  news: () => import('./components/ChangelogDialog'),
  mobile: () => import('./mobile/MobileApp'),
};
const CalendarView = lazy(() => load.calendar().then((m) => ({ default: m.CalendarView })));
const OpsView = lazy(() => load.ops().then((m) => ({ default: m.OpsView })));
const BackupView = lazy(() => load.backup().then((m) => ({ default: m.BackupView })));
const SettingsView = lazy(() => load.settings().then((m) => ({ default: m.SettingsView })));
const EmployeeForm = lazy(() => load.form().then((m) => ({ default: m.EmployeeForm })));
const HelpDialog = lazy(() => load.help().then((m) => ({ default: m.HelpDialog })));
const ChangelogDialog = lazy(() => load.news().then((m) => ({ default: m.ChangelogDialog })));
const MobileApp = lazy(() => load.mobile().then((m) => ({ default: m.MobileApp })));

/** Precarga en segundo plano las secciones de la vista que se está usando. */
function usePrefetch(small: boolean) {
  useEffect(() => {
    const run = () => {
      const list = small ? [load.mobile, load.news] : [load.calendar, load.ops, load.backup, load.settings, load.form, load.help, load.news];
      for (const f of list) f().catch(() => { /* sin conexión: se intentará al abrirla */ });
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(run); else setTimeout(run, 1500);
  }, [small]);
}

const Loading = () => <div className="splash">Cargando…</div>;
import { touchActivity, useIdleLogout, useIsSmallScreen } from './mobile/mobileUtils';

type Tab = 'calendar' | 'ops' | 'backup' | 'settings';
const TABS: [Tab, string][] = [
  ['calendar', '📅 Calendario'],
  ['ops', '🧭 Operativa'],
  ['backup', '🕘 Historial y copias'],
  ['settings', '⚙️ Ajustes'],
];

/** Pestaña guardada (también los nombres antiguos, de antes de juntar secciones). */
function storedTab(): Tab {
  let v = '';
  try { v = localStorage.getItem('ca-tab') ?? ''; } catch { /* */ }
  if (v === 'history' || v === 'data') return 'backup';
  if (v === 'summary') return 'ops';
  return TABS.some(([k]) => k === v) ? (v as Tab) : 'calendar';
}

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
  const logout = useCallback(async () => { await store.signOut(); setUser(null); }, [store]);
  if (user === undefined) return <div className="splash">Cargando…</div>;
  if (!user) return <Login store={store} onLogin={setUser} />;
  return (
    <AdminProvider store={store}>
      <Main store={store} user={user} onLogout={logout} />
    </AdminProvider>
  );
}

const ROLE: Record<AppUser['role'], string> = { admin: 'administrador', editor: 'editor', lector: 'solo consulta' };

function Main({ store, user, onLogout }: { store: DataStore; user: AppUser; onLogout: () => void }) {
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<Tab>(storedTab);
  const [menu, setMenu] = useState(false);
  const [backupSub, setBackupSub] = useState<{ sub: BackupSub; n: number } | null>(null);
  const openBackup = useCallback((sub: BackupSub) => { setBackupSub({ sub, n: Date.now() }); setTab('backup'); }, []);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [help, setHelp] = useState(false);
  const [news, setNews] = useState(false);
  useUpdateNotice(() => setNews(true));
  useEffect(() => installErrorLogging(store), [store]);
  const onScreenError = useCallback((e: unknown) => reportError(store, e, 'pantalla'), [store]);
  const [focus, setFocus] = useState<{ employeeId: string; date: string; n: number } | null>(null);
  const [opsSub, setOpsSub] = useState<{ sub: Sub; n: number } | null>(null);
  const goto = useCallback((employeeId: string, date: string) => { setFocus({ employeeId, date, n: Date.now() }); setTab('calendar'); }, []);
  const openOps = useCallback((sub: Sub) => { setOpsSub({ sub, n: Date.now() }); try { localStorage.setItem('ca-ops-sub', sub); } catch { /* */ } setTab('ops'); }, []);
  const admin = useAdmin();
  const onError = useCallback((m: string) => toast(m, 'error',
    m.includes('modo administrador') ? { label: 'Activar modo admin', run: () => { admin.requestAdmin(); } } : undefined), [toast, admin]);
  const data = useAppData(store, onError);
  const readOnly = user.role === 'lector';
  const sync = useExcelSync(store, data, user.role === 'admin' && !data.loading, toast);

  // Aviso (sin bloquear) cuando un cambio deja una zona por debajo de su mínimo de técnicos
  const withCoverageCheck = useCallback(<A extends unknown[]>(fn: (cells: CellChange[], ...rest: A) => Promise<boolean>) =>
    async (cells: CellChange[], ...rest: A) => {
      const warnings = coverageImpact(cells, data.employees, data.entries, data.codes, data.ops);
      const ok = await fn(cells, ...rest);
      if (ok && warnings.length) {
        const list = warnings.slice(0, 4).map((w) => `${w.zona} el ${formatDate(w.date).slice(0, 5)} (${w.working} de mín. ${w.min})`).join(', ');
        toast(`⚠ Zona por debajo del mínimo de técnicos: ${list}${warnings.length > 4 ? ` y ${warnings.length - 4} más` : ''}.`, 'warn', {
          label: 'Ver cobertura',
          run: () => openOps('cobertura'),
        });
      }
      return ok;
    }, [data.employees, data.entries, data.codes, data.ops, toast, openOps]);

  const effective = useMemo(() => ({
    ...data,
    canEdit: data.canEdit && !readOnly,
    apply: readOnly
      ? async () => { toast('Tu usuario es de solo lectura', 'error'); return false; }
      : withCoverageCheck(data.apply),
    saveNote: readOnly
      ? async () => { toast('Tu usuario es de solo lectura', 'error'); return false; }
      : data.saveNote,
    applyCombined: readOnly
      ? async () => { toast('Tu usuario es de solo lectura', 'error'); return false; }
      : withCoverageCheck(data.applyCombined),
  }), [data, readOnly, toast, withCoverageCheck]);

  useEffect(() => { try { localStorage.setItem('ca-tab', tab); } catch { /* */ } }, [tab]);

  // Recordatorio al administrador: copia fuera de la app (exportar a Excel) cada semana. Una vez por sesión.
  useEffect(() => {
    if (data.loading || user.role !== 'admin' || store.mode === 'local') return;
    const days = exportDays(data.lastExport);
    if (days <= EXPORT_EVERY_DAYS) return;
    try { if (sessionStorage.getItem('ca-aviso-export')) return; sessionStorage.setItem('ca-aviso-export', '1'); } catch { /* */ }
    toast(days === Infinity
      ? '💾 Aún no hay ninguna copia fuera de la app. Exporta el calendario a Excel y guárdalo en SharePoint.'
      : `💾 La última copia fuera de la app es de hace ${Math.floor(days)} días. Exporta a Excel y guárdalo en SharePoint.`,
    'warn', { label: 'Exportar ahora', run: () => openBackup('excel') });
  }, [data.loading, data.lastExport, user.role, store.mode, toast, openBackup]);
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
      await data.saveEmployee(e);
      toast('Ficha guardada');
      setEditing(null);
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  // Modo admin: siglas editadas directamente en la celda del calendario
  const employeesRef = useRef(data.employees);
  employeesRef.current = data.employees;
  const saveSiglas = useCallback(async (e: Employee, raw: string) => {
    const siglas = normSiglas(raw);
    const dupe = siglas && employeesRef.current.find((o) => o.id !== e.id && normSiglas(o.siglas ?? '') === siglas);
    if (dupe) { toast(`Las siglas ${siglas} ya las tiene ${dupe.nombre}`, 'error'); return false; }
    try {
      await data.saveEmployee({ ...e, siglas });
      toast(siglas ? `Siglas de ${e.nombre}: ${siglas}` : `Siglas de ${e.nombre} borradas`);
      return true;
    } catch (err) { toast((err as Error).message, 'error'); return false; }
  }, [toast, data.saveEmployee]);

  const others = useMemo(() => online.filter((u) => u.key !== 'me'), [online]);

  // Móvil: vista propia (consulta + edición de un día) y sesión que caduca a las 8 h sin uso
  const small = useIsSmallScreen();
  const [forceDesktop, setForceDesktop] = useState(() => { try { return localStorage.getItem('ca-force-desktop') === '1'; } catch { return false; } });
  usePrefetch(small && !forceDesktop);
  const setDesktop = (v: boolean) => { setForceDesktop(v); try { localStorage.setItem('ca-force-desktop', v ? '1' : '0'); } catch { /* */ } };
  // Sesión que se cierra sola tras 8 h sin uso (móvil y PC). Excepción: el navegador que vigila
  // el Excel, que debe seguir conectado aunque nadie lo toque para no parar la sincronización.
  useIdleLogout(small || sync.state === 'off' || sync.state === 'unsupported', onLogout);
  useEffect(() => { if (sync.lastCheck) touchActivity(); }, [sync.lastCheck]);

  const statusText = {
    saved: '✓ Todo guardado',
    saving: '⟳ Guardando…',
    error: '⚠ Error al guardar',
    offline: '⚠ Sin conexión · solo lectura',
  }[data.status];

  if (small && !forceDesktop) {
    if (data.loading) return <div className="splash">Cargando datos…</div>;
    return (
      <>
        <ErrorBoundary onError={onScreenError}>
        <Suspense fallback={<Loading />}>
          <MobileApp data={effective} user={user} onLogout={onLogout} onDesktop={() => setDesktop(true)} statusText={statusText} onNews={() => setNews(true)} />
          {news && <ChangelogDialog onClose={() => setNews(false)} />}
        </Suspense>
        </ErrorBoundary>
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /> Control de Ausencias
          <button className="ver-btn" onClick={() => setNews(true)} title="Ver novedades de cada versión">v{APP_VERSION}</button>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          {sync.state !== 'off' && sync.state !== 'unsupported' && (
            <button className={`sync-pill ${sync.state} ${sync.stale != null ? 'stale' : ''}`} onClick={() => openBackup('excel')}
              title={sync.stale != null
                ? `El Excel no ha cambiado en este PC desde hace ${Math.round(sync.stale / 60 * 10) / 10} h: revisa que OneDrive esté sincronizando`
                : sync.state === 'watching' ? `Sincronizado con «${sync.fileName}»${sync.lastCheck ? ` · comprobado ${new Date(sync.lastCheck).toLocaleTimeString('es-ES')}` : ''}` : 'Sincronización con el Excel en pausa'}>
              {sync.stale != null ? '⚠ Excel' : '🔄 Excel'}
            </button>
          )}
          {others.length > 0 && (
            <span className="presence" title={`También conectados ahora:\n${others.map((u) => u.name).join('\n')}`}>
              {others.slice(0, 5).map((u) => <span key={u.key} className="avatar" style={{ background: u.color }}>{initials(u.name)}</span>)}
              {others.length > 5 && <span className="avatar more">+{others.length - 5}</span>}
            </span>
          )}
          <span className={`status ${data.status}`} title={`${statusText} · los cambios se guardan solos al momento`}>
            {data.status === 'saved' ? '✓' : statusText}
          </span>
          <button className="undo-btn" onClick={undo} disabled={!data.undoSize} title="Deshacer mi último cambio (Ctrl+Z)" aria-label="Deshacer">↶</button>
          <button className="help-btn" onClick={() => setHelp(true)} title="Guía rápida" aria-label="Ayuda">?</button>
          {admin.active ? (
            <button className="admin-btn on" onClick={admin.lock} title="Pulsa para salir del modo administrador">
              🔓 Admin {hhmm(admin.status.until!)}
            </button>
          ) : (
            !readOnly && <button className="admin-btn" onClick={() => admin.requestAdmin()} title="Activar el modo administrador">🔒 Admin</button>
          )}
          <div className="user-menu">
            <button className="user-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} title={`${user.email}\nRol: ${user.role}`}>{user.name} ▾</button>
            {menu && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(false)} />
                <div className="menu-pop" role="menu" onClick={() => setMenu(false)}>
                  <div className="menu-who"><b>{user.name}</b><span>{user.email || 'Sin correo'} · {ROLE[user.role]}</span></div>
                  <button role="menuitem" onClick={() => setNews(true)}>🆕 Novedades <span className="muted">v{APP_VERSION}</span></button>
                  <button role="menuitem" onClick={() => setHelp(true)}>❓ Guía rápida</button>
                  <button role="menuitem" className="danger-item" onClick={onLogout}>↪ Cerrar sesión</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {small && (
        <div className="banner mobile-back">
          Estás viendo la versión completa en una pantalla pequeña.
          <button className="primary" onClick={() => setDesktop(false)}>📱 Volver a la vista móvil</button>
        </div>
      )}
      {store.mode === 'local' && (
        <div className="banner">
          <b>Modo local (prueba):</b> los datos se guardan solo en este navegador y no se comparten con el equipo.
          Para usarlo entre todos hay que conectar el servidor (ver README).
        </div>
      )}
      {readOnly && <div className="banner">Tu usuario es de <b>solo lectura</b>.</div>}
      {sync.state === 'needs-permission' && (
        <div className="banner sync-banner">
          🔄 La sincronización con el Excel <b>«{sync.fileName}»</b> está en pausa: el navegador necesita tu permiso para leerlo.
          <button className="primary" onClick={sync.resume}>Reanudar</button>
        </div>
      )}
      {!data.loading && <TodayStrip data={data} onOpen={() => openOps('agenda')} />}

      <main>
        <ErrorBoundary key={tab} onError={onScreenError}>
        <Suspense fallback={<Loading />}>
        {data.loading ? <div className="splash">Cargando datos…</div> : (
          <>
            {tab === 'calendar' && (
              <CalendarView
                data={effective}
                presence={others}
                onCursor={(c) => store.setCursor?.(c)}
                onEditEmployee={async (e) => { if (await admin.requestAdmin('Editar fichas de personas requiere el modo administrador.')) setEditing(e); }}
                onSaveSiglas={readOnly ? undefined : saveSiglas}
                focus={focus}
              />
            )}
            {tab === 'ops' && <OpsView store={store} data={effective} user={user} onGoto={goto} initialSub={opsSub} />}
            {tab === 'backup' && <BackupView store={store} data={effective} user={user} sync={sync} initialSub={backupSub} />}
            {tab === 'settings' && <SettingsView store={store} data={effective} user={user} editing={editing} setEditing={setEditing} />}
          </>
        )}
        </Suspense>
        </ErrorBoundary>
      </main>

      <Suspense fallback={null}>
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {news && <ChangelogDialog onClose={() => setNews(false)} />}
      {editing && tab !== 'settings' && admin.active && (
        <EmployeeForm initial={editing} isNew={false} others={data.employees} onClose={() => setEditing(null)} onSave={saveEditing} />
      )}
      </Suspense>
    </div>
  );
}
