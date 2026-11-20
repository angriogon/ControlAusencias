import { expect, type Page } from '@playwright/test';
import { APP_VERSION } from '../src/changelog';

/**
 * Entra en modo local con los datos de ejemplo. Por defecto con el modo administrador
 * ya activo (en modo local la contraseña vive en el navegador) y sin aviso de novedades.
 */
export async function entrar(page: Page, opts: { admin?: boolean; storage?: Record<string, string> } = {}) {
  await page.goto('/');
  await page.evaluate(({ admin, storage, version }) => {
    localStorage.setItem('ca-version-vista', version); // sin aviso de novedades (se prueba aparte)
    if (admin) {
      localStorage.setItem('ca-local-admin-hash', 'x');
      localStorage.setItem('ca-local-admin-until', String(Date.now() + 3600e3));
    }
    for (const [k, v] of Object.entries(storage ?? {})) localStorage.setItem(k, v);
  }, { admin: opts.admin ?? true, storage: opts.storage ?? {}, version: APP_VERSION });
  await page.getByLabel('Tu nombre').fill('Prueba');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Cierra los avisos (toasts) para que no tapen nada. */
export async function sinAvisos(page: Page) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
}

export async function esperarCalendario(page: Page) {
  await expect(page.locator('.person-btn').first()).toBeVisible();
}
