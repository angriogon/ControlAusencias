import type { DataStore } from '../data/store';
import { APP_VERSION } from '../changelog';

/** Ruido conocido que no es un fallo de la app. */
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /AbortError/i];
const recent = new Map<string, number>();

/** Guarda un error en el registro (una vez por minuto el mismo mensaje). Nunca lanza. */
export function reportError(store: DataStore, err: unknown, where = '') {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const message = `${where ? `[${where}] ` : ''}${e.message || String(err)}`;
  if (IGNORE.some((r) => r.test(message))) return;
  const now = Date.now();
  if ((recent.get(message) ?? 0) > now - 60_000) return;
  recent.set(message, now);
  store.logError({
    message,
    stack: e.stack?.split('\n').slice(0, 12).join('\n'),
    version: APP_VERSION,
    url: location.pathname + location.hash,
    userAgent: navigator.userAgent,
  }).catch(() => { /* nunca falla */ });
}

const RELOADED = 'ca-recargada-por-version';

/**
 * Errores no capturados → registro. Y si tras publicar una versión nueva el navegador
 * pide una parte de la app que ya no existe, se recarga una vez para tomar la nueva.
 */
export function installErrorLogging(store: DataStore): () => void {
  const onError = (ev: ErrorEvent) => reportError(store, ev.error ?? ev.message, 'error');
  const onRejection = (ev: PromiseRejectionEvent) => reportError(store, ev.reason, 'promesa');
  const onPreload = (ev: Event) => {
    ev.preventDefault();
    let done = false;
    try { done = sessionStorage.getItem(RELOADED) === APP_VERSION; sessionStorage.setItem(RELOADED, APP_VERSION); } catch { /* */ }
    if (!done) location.reload();
    else reportError(store, (ev as Event & { payload?: unknown }).payload ?? 'No se pudo cargar una parte de la app', 'carga');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('vite:preloadError', onPreload);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('vite:preloadError', onPreload);
  };
}
