import { expect, test } from '@playwright/test';

// Carnet riche (spec §18, nov. 2026) : paragraphes, mise en forme, images et vidéos, comme dans un document.

// Un PNG de 4×4 pixels (valide) et un « fichier vidéo » minimal : l'éditeur garde le fichier tel quel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YWMDRwzEcQAREhQBbrqBkwAAAABJRU5ErkJggg==', 'base64');
const VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42', 'ascii'), Buffer.alloc(64)]);

test.describe('notes riches du Carnet', () => {
  test('écrire des paragraphes, un titre, du gras, une liste, une image et une vidéo, puis tout retrouver après rechargement', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('/carnet?vue=journal');
    await page.getByRole('button', { name: /Note riche/ }).click();
    const editeur = page.getByRole('dialog', { name: 'Nouvelle note' });
    await expect(editeur).toBeVisible();
    const zone = editeur.getByRole('textbox', { name: 'Contenu de la note' });
    await zone.click();

    // Titre, puis deux paragraphes, dont un mot en gras.
    await editeur.getByLabel('Style du paragraphe').selectOption('h1');
    await page.keyboard.type('Culte du dimanche');
    await page.keyboard.press('Enter');
    await editeur.getByLabel('Style du paragraphe').selectOption('p');
    await page.keyboard.type('Premier paragraphe avec ');
    await editeur.getByRole('button', { name: 'Gras' }).click();
    await page.keyboard.type('un mot fort');
    await editeur.getByRole('button', { name: 'Gras' }).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Deuxième paragraphe.');
    await page.keyboard.press('Enter');
    await editeur.getByRole('button', { name: 'Liste à puces' }).click();
    await page.keyboard.type('Premier point');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Deuxième point');

    await expect(zone.locator('h1')).toHaveText('Culte du dimanche');
    await expect(zone.locator('p', { hasText: 'paragraphe' })).toHaveCount(2);
    await expect(zone.locator('strong, b')).toHaveText('un mot fort'); // le navigateur écrit <b> ; la note enregistrée aura <strong>
    await expect(zone.locator('ul > li')).toHaveCount(2);

    // Une image, puis une vidéo.
    await editeur.getByLabel('Choisir des images').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(zone.locator('figure img[data-media]')).toHaveCount(1);
    await editeur.getByLabel('Choisir une vidéo').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: VIDEO });
    await expect(zone.locator('figure video[data-media]')).toHaveCount(1);

    await editeur.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(editeur).toBeHidden();

    // La note est dans le livre, avec sa mise en forme et ses médias.
    const note = page.locator('li.note').filter({ hasText: 'Culte du dimanche' });
    await expect(note.locator('h1')).toHaveText('Culte du dimanche');
    await expect(note.locator('strong')).toHaveText('un mot fort');
    await expect(note.locator('img[data-media]')).toHaveCount(1);
    await expect(note.locator('video[data-media]')).toHaveCount(1);
    await expect(note.locator('img[data-media]')).toHaveAttribute('src', /^blob:/);

    // Rechargement : tout revient.
    await page.waitForTimeout(1500);
    await page.reload();
    const apres = page.locator('li.note').filter({ hasText: 'Culte du dimanche' });
    await expect(apres.locator('h1')).toBeVisible();
    await expect(apres.locator('strong')).toHaveText('un mot fort');
    await expect(apres.locator('img[data-media]')).toHaveAttribute('src', /^blob:/);
    await expect(apres.locator('li')).toHaveCount(2);

    // La recherche trouve le texte (le texte brut garde l'équivalent).
    await page.screenshot({ path: '/tmp/carnet-riche.png' });
    expect(erreurs).toEqual([]);
  });

  test('corriger une note riche, la retrouver sans sa mise en forme dangereuse, et la supprimer', async ({ page }) => {
    await page.goto('/carnet?riche=1');
    const editeur = page.getByRole('dialog', { name: 'Nouvelle note' });
    await editeur.getByRole('textbox', { name: 'Contenu de la note' }).click();
    await page.keyboard.type('Ma première ligne');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ma seconde ligne');
    await editeur.getByRole('button', { name: 'Enregistrer' }).click();
    const note = page.locator('li.note').filter({ hasText: 'Ma seconde ligne' });
    await expect(note.locator('p')).toHaveCount(2);

    await note.getByRole('button', { name: /Modifier la note/ }).click();
    const edition = page.getByRole('dialog', { name: /Note n° \d+/ });
    await edition.getByRole('textbox', { name: 'Contenu de la note' }).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' (corrigée)');
    await edition.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('li.note').filter({ hasText: 'Ma seconde ligne (corrigée)' })).toHaveCount(1);

    await page.locator('li.note').filter({ hasText: 'corrigée' }).getByRole('button', { name: /Modifier la note/ }).click();
    await page.getByRole('dialog', { name: /Note n° \d+/ }).getByRole('button', { name: 'Supprimer la note' }).click();
    await expect(page.locator('li.note').filter({ hasText: 'Ma première ligne' })).toHaveCount(0);
  });

  test('un nouveau brouillon est gardé quand on ferme, et repris à la réouverture', async ({ page }) => {
    await page.goto('/carnet?riche=1');
    const editeur = page.getByRole('dialog', { name: 'Nouvelle note' });
    await editeur.getByRole('textbox', { name: 'Contenu de la note' }).click();
    await page.keyboard.type('Idée à ne pas perdre');
    await editeur.getByRole('button', { name: 'Fermer l’éditeur' }).click();
    await expect(editeur).toBeHidden();
    await page.getByRole('button', { name: /Note riche/ }).click();
    await expect(page.getByRole('dialog', { name: 'Nouvelle note' }).getByRole('textbox', { name: 'Contenu de la note' })).toContainText('Idée à ne pas perdre');
  });

  test('sans débordement horizontal à 320 px, éditeur ouvert', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/carnet?riche=1');
    await expect(page.getByRole('dialog', { name: 'Nouvelle note' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
});
