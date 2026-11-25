import { expect, test } from '@playwright/test';

test('Bible : Darby par défaut, navigateur de livres, version, soulignement, note vers le cahier', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto('/bible?l=43&c=3'); // Jean 3
  await expect(page.getByRole('button', { name: /Version : Darby/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Jean/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choisir un livre et un chapitre' })).toContainText('Jean 3');
  await expect(page.getByRole('button', { name: 'Verset 16' })).toContainText('Car Dieu a tant aimé');

  // Navigateur : Ancien / Nouveau Testament → livres → chapitres
  await page.getByRole('button', { name: 'Choisir un livre et un chapitre' }).click();
  await page.getByRole('tab', { name: 'Ancien Testament' }).click();
  await page.getByRole('button', { name: /^Psaumes/ }).click();
  await page.getByRole('button', { name: 'Chapitre 23' }).click();
  await expect(page.getByRole('button', { name: 'Choisir un livre et un chapitre' })).toContainText('Psaumes 23');

  // Version anglaise
  await page.getByRole('button', { name: /Version : Darby/ }).click();
  await page.getByRole('button', { name: /King James/ }).click();
  await expect(page.getByRole('button', { name: 'Verset 1' })).toContainText('is my shepherd');
  await page.getByRole('button', { name: /Version : King James/ }).click();
  await page.getByRole('button', { name: /^Darby/ }).click();

  // Souligner plusieurs versets
  await page.getByRole('button', { name: 'Verset 1' }).click();
  await page.getByRole('button', { name: 'Verset 2' }).click();
  await page.getByRole('button', { name: 'Souligner en jaune' }).click();
  await expect(page.locator('.vs.surl')).toHaveCount(2);

  // Note : page sans titre dans le cahier, avec lieu et date
  await page.getByRole('button', { name: 'Verset 3' }).click();
  await page.getByRole('button', { name: /^Note/ }).click();
  const ed = page.getByRole('dialog', { name: 'Note de lecture' });
  await page.keyboard.type('Il me conduit');
  await ed.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByLabel('Date (au moins l’année)')).toHaveValue(/\d{2}\/\d{2}\/\d{2}/);
  await page.getByRole('textbox', { name: 'Lieu' }).fill('Montréal');
  await page.getByRole('button', { name: 'Enregistrer dans le cahier' }).click();
  await expect(page.getByText(/Note enregistrée dans/)).toBeVisible();

  await page.goto('/carnet');
  await page.getByRole('button', { name: /Notes pendant ma lecture biblique/ }).click();
  await expect(page.locator('.toc li .ch')).toHaveCount(1);
  await expect(page.locator('.toc li .ch b')).toHaveText('Sans titre'); // titre laissé vide, à remplir plus tard
  await page.getByRole('button', { name: 'Lire le livre' }).click();
  const txt = await page.locator('.lecteur').innerText();
  expect(txt.indexOf('Il me conduit')).toBeGreaterThan(-1);
  expect(txt.indexOf('Il me conduit')).toBeLessThan(txt.indexOf('Psaumes 23'));
  expect(txt).toContain('Montréal');
  // Les soulignements ne sont pas des livres ni des notes du journal
  await page.goto('/carnet');
  expect(erreurs).toEqual([]);
});
