import { expect, test } from '@playwright/test';

test('Thèmes : on change leur position, les pages comptent pour ce qu’elles sont', async ({ page }) => {
  await page.goto('/carnet');
  for (const [t, th] of [['Livre A', 'Alpha'], ['Livre B', 'Beta']]) {
    await page.getByRole('button', { name: 'Nouveau livre' }).click();
    await page.getByLabel('Titre du livre').fill(t); await page.getByLabel('Thème du livre').fill(th);
    await page.getByRole('button', { name: 'Créer le livre' }).click();
    await page.getByRole('button', { name: 'Bibliothèque', exact: true }).click();
  }
  const titres = () => page.locator('h3.theme-t .serif').allInnerTexts();
  expect(await titres()).toEqual(['Alpha', 'Beta']);
  await page.getByRole('button', { name: /Filtrer par thème/ }).click();
  await page.getByRole('button', { name: 'Monter le thème Beta' }).click();
  await page.getByRole('dialog', { name: 'Filtrer par thème' }).getByRole('button', { name: 'Fermer' }).click();
  await expect.poll(titres).toEqual(['Beta', 'Alpha']);
  await expect(page.getByText(/≈/)).toHaveCount(0); // plus d'équivalents « ≈ 1 p. »
  await expect(page.getByText('0 ch. · 0 p.').first()).toBeVisible();
});
