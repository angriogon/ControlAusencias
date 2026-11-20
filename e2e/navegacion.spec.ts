import { expect, test } from '@playwright/test';
import { entrar, esperarCalendario } from './helpers';

const secciones = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Secciones' });

test('4 pestañas y una pestaña guardada con nombre antiguo se traduce', async ({ page }) => {
  await entrar(page, { storage: { 'ca-tab': 'data' } }); // «Copias y Excel» de antes de la v1.9
  await expect(secciones(page).getByRole('button')).toHaveText([/Calendario/, /Operativa/, /Historial y copias/, /Ajustes/]);
  await expect(secciones(page).locator('button.on')).toHaveText(/Historial y copias/);
});

test('Operativa: «Ver saldos» del centro de mando lleva a Cifras → Saldos', async ({ page }) => {
  await entrar(page);
  await esperarCalendario(page);
  await secciones(page).getByRole('button', { name: /Operativa/ }).click();
  const sub = page.getByRole('navigation', { name: 'Operativa' });
  await expect(sub.getByRole('button')).toHaveText([/Centro de mando/, /Agenda/, /Cobertura/, /Cifras/, /Informe mensual/]);
  await sub.getByRole('button', { name: /Centro de mando/ }).click();
  await page.getByRole('button', { name: 'Ver saldos' }).click();
  await expect(sub.locator('button.on')).toHaveText(/Cifras/);
  await expect(page.locator('.inner-seg button.on')).toHaveText('Saldos');
  await page.locator('.inner-seg').getByRole('button', { name: 'Resumen del año' }).click();
  await expect(page.getByText(/Días de ausencia por mes/)).toBeVisible();
});

test('Historial y copias: crear una copia y verla en la lista', async ({ page }) => {
  await entrar(page);
  await esperarCalendario(page);
  await secciones(page).getByRole('button', { name: /Historial y copias/ }).click();
  await page.getByRole('navigation', { name: 'Historial y copias' }).getByRole('button', { name: /Copias de seguridad/ }).click();
  await page.getByPlaceholder(/Nombre de la copia/).fill('Copia de prueba e2e');
  await page.getByRole('button', { name: /Crear copia/ }).click();
  await expect(page.getByRole('cell', { name: /Copia de prueba e2e/ })).toBeVisible();
});

test('Versión: la etiqueta abre Novedades y tras actualizar sale el aviso una vez', async ({ page }) => {
  await entrar(page, { storage: { 'ca-version-vista': '0.0.1' } });
  await expect(page.locator('.toast', { hasText: 'Actualizada a la v' })).toBeVisible();
  await page.locator('.ver-btn').click();
  await expect(page.getByRole('dialog', { name: /Novedades/ })).toBeVisible();
  await expect(page.locator('.ver-tag.current')).toHaveText(await page.locator('.ver-btn').innerText());
  await page.reload();
  await esperarCalendario(page);
  await expect(page.locator('.toast', { hasText: 'Actualizada a la v' })).toHaveCount(0);
});

test('Menú de usuario: novedades, guía y cerrar sesión', async ({ page }) => {
  await entrar(page);
  await esperarCalendario(page);
  await page.locator('.user-btn').click();
  const menu = page.getByRole('menu');
  await expect(menu).toContainText('Novedades');
  await menu.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
  await expect(page.getByLabel('Tu nombre')).toBeVisible();
});

test('Errores: un fallo no capturado queda en Ajustes → Errores', async ({ page }) => {
  await entrar(page);
  await esperarCalendario(page);
  await page.evaluate(() => setTimeout(() => { throw new Error('fallo de prueba e2e'); }));
  await page.waitForTimeout(300);
  await secciones(page).getByRole('button', { name: /Ajustes/ }).click();
  await page.getByRole('navigation', { name: 'Ajustes' }).getByRole('button', { name: 'Errores' }).click();
  await expect(page.locator('summary', { hasText: 'fallo de prueba e2e' })).toBeVisible();
});
