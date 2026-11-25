import { expect, test } from '@playwright/test';

test('Notes libres : bouton de la bibliothèque, page dans « Notes libres à classer » avec lieu et date', async ({ page }) => {
  await page.goto('/carnet');
  await page.getByRole('button', { name: 'Note libre' }).click();
  const ed = page.getByRole('dialog', { name: 'Note libre' });
  await page.keyboard.type('Une idée à ne pas perdre');
  await ed.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByLabel('Date (au moins l’année)')).toHaveValue(/\d{2}\/\d{2}\/\d{2}/);
  await page.getByRole('textbox', { name: 'Lieu' }).fill('Montréal');
  await page.getByRole('button', { name: 'Enregistrer le chapitre' }).click();
  await expect(page.getByText(/Note rangée dans/)).toBeVisible();
  await page.getByRole('button', { name: /Notes libres à classer, 1 chapitres/ }).click();
  await expect(page.locator('.toc li .ch')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lire le livre' }).click();
  await expect(page.locator('.lecteur .chap')).toContainText('Une idée à ne pas perdre');
  await expect(page.locator('.lecteur .chap')).toContainText('Montréal');
});
