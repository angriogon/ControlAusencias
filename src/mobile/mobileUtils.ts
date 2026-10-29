import { useEffect, useState } from 'react';

/** Primera letra en mayúscula: «martes 20 de octubre» → «Martes 20 de octubre». */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pantalla de móvil (o ventana muy estrecha). */
export function useIsSmallScreen() {
  const query = '(max-width: 760px)';
  const [small, setSmall] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setSmall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return small;
}

const LAST_ACTIVITY = 'ca-last-activity';
const IDLE_MS = 8 * 3600 * 1000;

/**
 * Cierra la sesión tras 8 horas sin usar la app (pensado para móviles, que se
 * pueden perder y contienen datos sensibles). Se comprueba al abrir la app, al
 * volver a ella y cada minuto.
 */
export function useIdleLogout(enabled: boolean, onLogout: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const read = () => Number(localStorage.getItem(LAST_ACTIVITY) ?? 0);
    const touch = () => { try { localStorage.setItem(LAST_ACTIVITY, String(Date.now())); } catch { /* */ } };
    const check = () => {
      const last = read();
      if (last && Date.now() - last > IDLE_MS) onLogout();
    };
    check();
    if (!read()) touch();
    let lastTouch = 0;
    const onActivity = () => {
      if (Date.now() - lastTouch > 30000) { lastTouch = Date.now(); touch(); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(check, 60000);
    touch();
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [enabled, onLogout]);
}

/**
 * Saca los teléfonos de textos como "659000490(Personal)-662652877" o
 * "722 30 53 67 (Personal)-607643771" para poder llamar con un toque.
 */
export function parsePhones(raw: string): { number: string; label: string }[] {
  const out: { number: string; label: string }[] = [];
  const re = /(\+?\d[\d ]{7,}\d)\s*(\(\s*personal\s*\))?/gi;
  for (const m of raw.matchAll(re)) {
    const number = m[1].replace(/\s+/g, '');
    if (number.replace('+', '').length < 9) continue;
    out.push({ number, label: m[2] ? 'Personal' : out.length ? 'Empresa' : 'Teléfono' });
  }
  // Si solo hay uno, no hace falta etiqueta especial
  if (out.length === 1) out[0].label = 'Llamar';
  else if (out.length > 1 && out.every((p) => p.label !== 'Personal')) out.forEach((p, i) => { p.label = `Teléfono ${i + 1}`; });
  return out;
}
