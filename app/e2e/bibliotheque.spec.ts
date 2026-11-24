import { expect, test } from '@playwright/test';

test('Bibliothèque : créer un livre coloré, écrire des chapitres (notes), les lire en pages', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto('/carnet');
  await page.getByRole('button', { name: 'Nouveau livre' }).click();
  await page.getByLabel('Titre du livre').fill('Le chemin de la prière');
  await page.getByLabel('Thème du livre').fill('Prière');
  await page.getByRole('button', { name: 'Couleur #1F7A6D' }).click();
  await page.getByRole('button', { name: 'Créer le livre' }).click();
  await expect(page.getByRole('heading', { name: 'Le chemin de la prière' }).first()).toBeVisible();
  for (const [t, corps] of [['Au commencement', 'Premier paragraphe du premier chapitre. '.repeat(40)], ['La persévérance', 'Un autre texte. '.repeat(60)]]) {
    await page.getByRole('button', { name: 'Nouveau chapitre' }).click();
    const ed = page.getByRole('dialog', { name: 'Nouveau chapitre' });
    await expect(ed.getByRole('toolbar')).toBeHidden(); // outils cachés tant qu'on n'a pas touché le bouton flottant
    await ed.getByRole('button', { name: 'Outils de rédaction' }).click();
    await expect(ed.getByRole('toolbar')).toBeVisible();
    await ed.getByRole('button', { name: 'Masquer les outils de rédaction' }).click();
    const z = ed.getByRole('textbox', { name: 'Contenu de la note' });
    await z.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(t); await page.keyboard.press('Enter'); await page.keyboard.insertText(corps);
    await ed.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByLabel('Date (au moins l’année)')).toHaveValue(/\d{2}\/\d{2}\/\d{2}/);
    await page.getByLabel('Date (au moins l’année)').fill('abc');
    await page.getByRole('button', { name: 'Enregistrer le chapitre' }).click();
    await expect(page.getByLabel('Date (au moins l’année)')).toBeVisible(); // date sans année : bloqué
    await page.getByLabel('Circonstance').fill('Durant la nuit de prière');
    await page.getByLabel('Lieu').fill('Montréal');
    await page.getByLabel('Date (au moins l’année)').fill('21/08/26');
    await page.getByRole('button', { name: 'Enregistrer le chapitre' }).click();
  }
  await expect(page.locator('.toc li .ch')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/livre.png' });
  await page.getByRole('button', { name: /Lire le livre/ }).click();
  await expect(page.locator('.lecteur')).toBeVisible();
  // Glisser vers la page suivante (doigt vers la gauche) et revenir.
  const l = page.locator('.lecteur');
  await expect(page.locator('.barre-lec .total')).toContainText('1 /');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.barre-lec .total')).toContainText('2 /');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.barre-lec .total')).toContainText('1 /');
  expect(await page.locator('.lecteur .chap h1').first().evaluate((e) => getComputedStyle(e).fontWeight)).toMatch(/^(700|bold)$/);
  await page.screenshot({ path: '/tmp/lecture.png' });
  await page.getByRole('button', { name: 'Fermer la lecture' }).click();
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  await expect(page.getByRole('button', { name: /Le chemin de la prière, 2 chapitres/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Prière/ })).toBeVisible(); // classé par thème
  await expect(page.getByRole('group', { name: 'Thèmes' }).getByRole('button', { name: 'Prière' })).toBeVisible();
  await page.screenshot({ path: '/tmp/biblio.png' });
  await page.goto('/carnet?vue=journal');
  await expect(page.getByText('Au commencement')).toHaveCount(0); // les chapitres ne sont pas dans le journal
  expect(erreurs).toEqual([]);
});
