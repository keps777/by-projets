import { expect, test } from '@playwright/test';

test('Bibliothèque : créer un livre coloré, écrire des chapitres (notes), les lire en pages', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto('/carnet');
  await page.getByRole('button', { name: 'Nouveau livre' }).click();
  await page.getByLabel('Titre du livre').fill('Le chemin de la prière');
  await page.getByRole('button', { name: 'Couleur #1F7A6D' }).click();
  await page.getByRole('button', { name: 'Créer le livre' }).click();
  await expect(page.getByRole('heading', { name: 'Le chemin de la prière' }).first()).toBeVisible();
  for (const [t, corps] of [['Au commencement', 'Premier paragraphe du premier chapitre. '.repeat(40)], ['La persévérance', 'Un autre texte. '.repeat(60)]]) {
    await page.getByRole('button', { name: 'Nouveau chapitre' }).click();
    const ed = page.getByRole('dialog', { name: 'Nouveau chapitre' });
    const z = ed.getByRole('textbox', { name: 'Contenu de la note' });
    await z.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(t); await page.keyboard.press('Enter'); await page.keyboard.insertText(corps);
    await ed.getByRole('button', { name: 'Enregistrer' }).click();
  }
  await expect(page.locator('.toc li .ch')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/livre.png' });
  await page.getByRole('button', { name: /Lire le livre/ }).click();
  await expect(page.locator('.lecteur')).toBeVisible();
  await expect(page.locator('.pg')).toContainText('p. 1 /');
  await page.getByRole('button', { name: 'Fermer la lecture' }).click();
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  await expect(page.getByRole('button', { name: /Le chemin de la prière, 2 chapitres/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/biblio.png' });
  await page.goto('/carnet?vue=journal');
  await expect(page.getByText('Au commencement')).toHaveCount(0); // les chapitres ne sont pas dans le journal
  expect(erreurs).toEqual([]);
});
