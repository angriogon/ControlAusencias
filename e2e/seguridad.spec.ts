import { expect, test } from '@playwright/test';
import { entrar, esperarCalendario } from './helpers';

const secciones = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Secciones' });

test('CSP activa y sin bloqueos al recorrer todas las secciones', async ({ page }) => {
  const bloqueos: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bloqueos.push(m.text()); });
  await entrar(page);
  await esperarCalendario(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  for (const s of [/Operativa/, /Historial y copias/, /Ajustes/, /Calendario/]) {
    await secciones(page).getByRole('button', { name: s }).click();
    await page.waitForTimeout(300);
  }
  expect(bloqueos).toEqual([]);
});

test('Exportar a Excel funciona con la CSP y queda anotada la última exportación', async ({ page }) => {
  await entrar(page);
  await esperarCalendario(page);
  await secciones(page).getByRole('button', { name: /Historial y copias/ }).click();
  await page.getByRole('navigation', { name: 'Historial y copias' }).getByRole('button', { name: /Excel/ }).click();
  await expect(page.getByText(/todavía no se ha exportado nunca/)).toBeVisible();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar Excel/ }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^Control Ausencias .*\.xlsx$/);
  await expect(page.getByText(/última exportación/)).toBeVisible();
});

test('Calendario a 1280 px: cabecera en una fila y «Más» con Team leader y Agrupar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await entrar(page);
  await esperarCalendario(page);
  const alto = (await page.locator('.toolbar').boundingBox())!.height;
  expect(alto).toBeLessThan(50);
  await page.getByRole('button', { name: /Más/ }).click();
  await page.getByLabel('Agrupar').selectOption({ label: 'Por zona' });
  await expect(page.locator('.group-row').first()).toBeVisible();
  await page.locator('.menu-backdrop').click();
  await expect(page.getByRole('button', { name: /Más \(1\)/ })).toBeVisible();
});
