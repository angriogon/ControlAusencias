import { expect, test } from '@playwright/test';
import { entrar, esperarCalendario, sinAvisos } from './helpers';

test.describe('Calendario', () => {
  test('marcar un día con el teclado y deshacerlo con Ctrl+Z', async ({ page }) => {
    await entrar(page, { admin: false });
    await esperarCalendario(page);
    // Un día laborable vacío de la segunda persona
    const libre = page.locator('tbody tr').nth(1).locator('td.cell:not(.we)').filter({ hasText: /^$/ }).first();
    const celda = page.locator(`td[data-cell="${await libre.getAttribute('data-cell')}"]`); // fija: no «la primera vacía»
    await celda.click();
    await page.getByPlaceholder(/Escribe la clave/).fill('V');
    await page.keyboard.press('Enter');
    await expect(celda).toHaveText('V');
    await sinAvisos(page);
    await page.locator('.grid-wrap').focus();
    await page.keyboard.press('Control+z');
    await expect(celda).toHaveText('');
  });

  test('clic en el nombre copia NOMBRE y teléfono; ▦ selecciona el mes', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await entrar(page);
    await esperarCalendario(page);
    await page.locator('.person-btn').first().click();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toMatch(/^[A-ZÁÉÍÓÚÑÜ ]+\n[\d ]+$/);
    await expect(page.locator('.picker')).toHaveCount(0);
    await page.locator('.rowsel-btn').first().click();
    await expect(page.locator('.picker')).toBeVisible();
  });

  test('siglas bloqueadas: cambiarlas pide confirmación', async ({ page }) => {
    await entrar(page);
    await esperarCalendario(page);
    const sig = page.locator('td.sig.editable').first();
    const antes = await sig.innerText();
    await sig.click();
    await expect(page.getByRole('dialog')).toContainText('Siglas bloqueadas');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('td.sig.editing')).toHaveCount(0);
    await expect(sig).toHaveText(antes);
  });

  test('filtros: zona resaltada y «✕ Filtros» los quita', async ({ page }) => {
    await entrar(page);
    await esperarCalendario(page);
    const total = await page.locator('.person-btn').count();
    await page.getByLabel('Zona').selectOption({ index: 1 });
    await expect(page.getByLabel('Zona')).toHaveClass(/on/);
    expect(await page.locator('.person-btn').count()).toBeLessThan(total);
    await page.getByRole('button', { name: '✕ Filtros' }).click();
    await expect(page.locator('.person-btn')).toHaveCount(total);
  });
});

test('Grupos: asignar en Ajustes, sombrear y filtrar «Sin grupo» desde la leyenda', async ({ page }) => {
  await entrar(page, { storage: { 'ca-calendar-prefs': JSON.stringify({ showLegend: true }) } });
  await esperarCalendario(page);
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: /Ajustes/ }).click();
  await page.getByRole('navigation', { name: 'Ajustes' }).getByRole('button', { name: 'Grupos' }).click();
  await page.locator('select[aria-label^="Grupo de"]').first().selectOption({ label: 'UNEI' });
  await page.getByRole('button', { name: 'Guardar grupos' }).click();
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: /Calendario/ }).click();
  await esperarCalendario(page);
  await expect(page.locator('th.person.grp').first()).toBeVisible();
  const total = await page.locator('.person-btn').count();
  await page.locator('.grp-chip', { hasText: 'Sin grupo' }).click();
  await expect(page.locator('.person-btn')).toHaveCount(total - 1);
  await page.locator('.grp-chip', { hasText: 'UNEI' }).click();
  await expect(page.locator('.person-btn')).toHaveCount(1);
});
