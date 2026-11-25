import { expect, test } from '@playwright/test';

test('Bibliothèque : créer un livre coloré, écrire des chapitres (notes), les lire en pages', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto('/carnet');
  await page.getByRole('button', { name: 'Nouveau livre' }).click();
  await page.getByLabel('Titre du livre').fill('Le chemin de la prière');
  await page.getByLabel('Thème du livre').fill('Prière');
  await page.getByLabel('Nom sur la couverture').fill('Kevin K.'); // nom paramétrable, imprimé sur la couverture
  await page.getByRole('button', { name: 'Couleur #1F7A6D' }).click();
  await page.getByRole('button', { name: 'Créer le livre' }).click();
  await expect(page.getByRole('heading', { name: 'Le chemin de la prière' }).first()).toBeVisible();
  for (const [t, corps] of [['Au commencement', 'Premier paragraphe du premier chapitre. '.repeat(40)], ['La persévérance', 'Un autre texte. '.repeat(60)]]) {
    await page.getByRole('button', { name: 'Nouveau chapitre' }).click();
    await page.getByRole('button', { name: /Une seule page/ }).click(); // le type du chapitre se choisit dès la création
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
  // Chapitre à pages, choisi dès la création : il ne porte que son titre ; sa première page reprend ce titre (modifiable).
  await page.getByRole('button', { name: 'Nouveau chapitre' }).click();
  await expect(page.getByRole('button', { name: /Une seule page/ })).toBeVisible();
  await page.getByRole('button', { name: /Plusieurs pages/ }).click();
  await page.getByLabel('Titre du chapitre').fill('Les saisons');
  await page.getByRole('button', { name: /Créer et écrire la première page/ }).click();
  const ep = page.getByRole('dialog', { name: 'Nouvelle page' });
  await page.keyboard.type('Texte de la première page. ');
  await ep.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Date (au moins l’année)').fill('2026');
  await page.getByRole('button', { name: 'Enregistrer le chapitre' }).click();
  await expect(page.locator('.toc li .ch')).toHaveCount(4); // 2 chapitres d'une page + « Les saisons » + sa page 3.1
  await expect(page.locator('.toc li.page .n')).toHaveText(['3.1']);
  await expect(page.locator('.toc li.page .ch b').first()).toHaveText('Les saisons'); // titre de la première page = titre du chapitre
  await expect(page.getByRole('button', { name: 'Ajouter une page à Au commencement' })).toHaveCount(0); // « + » : seulement pour les chapitres à pages
  await page.getByRole('button', { name: 'Ajouter une page à Les saisons' }).click();
  await page.keyboard.type('Une deuxième page. ');
  await page.getByRole('dialog', { name: 'Nouvelle page' }).getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Date (au moins l’année)').fill('2026');
  await page.getByRole('button', { name: 'Enregistrer le chapitre' }).click();
  await expect(page.locator('.toc li.page .n')).toHaveText(['3.1', '3.2']);
  await page.getByRole('button', { name: 'Replier Les saisons' }).click();
  await expect(page.locator('.toc li .ch')).toHaveCount(3);
  await page.getByRole('button', { name: 'Déplier Les saisons' }).click();
  await expect(page.locator('.toc li .ch')).toHaveCount(5);
  await expect(page.locator('.heros .couv small')).toHaveText('Kevin K.');
  // PDF du livre : mêmes options que le PDF de la journée (partager, télécharger, ouvrir)
  await page.getByRole('button', { name: 'Exporter le livre en PDF' }).click();
  const vp = page.getByRole('dialog', { name: 'Mon livre en PDF' });
  await expect(vp.getByText(/Le-chemin-de-la-priere\.pdf/)).toBeVisible({ timeout: 20000 });
  await expect(vp.getByRole('button', { name: 'Télécharger le PDF' })).toBeVisible();
  await expect(vp.getByRole('button', { name: 'Ouvrir pour le lire' })).toBeVisible();
  await vp.getByRole('button', { name: 'Fermer' }).click();
  await page.screenshot({ path: '/tmp/livre.png' });
  await page.getByRole('button', { name: /Lire le livre/ }).click();
  await expect(page.locator('.lecteur')).toBeVisible();
  await expect(page.locator('.lecteur .ouverture h1')).toHaveText('Les saisons'); // le chapitre à pages s'ouvre sur sa page, titre centré
  await expect(page.locator('.lecteur .chap .num').nth(3)).toHaveText('Page 3.1');
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
  await expect(page.getByRole('button', { name: /Le chemin de la prière, 3 chapitres/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Prière/ })).toBeVisible(); // classé par thème
  await page.getByRole('button', { name: /Filtrer par thème/ }).click(); // liste déroulante des thèmes
  await page.getByRole('dialog', { name: 'Filtrer par thème' }).getByRole('button', { name: /^Prière/ }).click();
  await expect(page.getByRole('button', { name: /Filtrer par thème : Prière/ })).toBeVisible();
  await page.getByRole('button', { name: 'Voir tous les thèmes' }).click();
  await page.getByRole('button', { name: /Thème de Le chemin de la prière/ }).click(); // classement rapide depuis la tuile
  await page.getByRole('button', { name: 'Croisade', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Croisade/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/biblio.png' });
  await page.goto('/carnet?vue=journal');
  await expect(page.getByText('Au commencement')).toHaveCount(0); // les chapitres ne sont pas dans le journal
  expect(erreurs).toEqual([]);
});
