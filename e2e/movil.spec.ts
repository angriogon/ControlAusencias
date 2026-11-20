import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

test('Móvil: vista propia, Personas y Novedades desde el menú sin salirse de la pantalla', async ({ page }) => {
  await entrar(page);
  await expect(page.locator('.m-top')).toBeVisible();
  await page.getByRole('button', { name: /Personas/ }).click();
  await page.locator('.m-user').click();
  await page.getByRole('button', { name: /Novedades/ }).click();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});
