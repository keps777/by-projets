import { expect, test, type Page } from '@playwright/test';

// Le Fil, journée en deux parties : « Prévu » (planifié) à gauche, « Fait » (réellement fait) à droite (spec §7, nov. 2026).

async function ajouter(page: Page, titre: string, heure: number) {
  await page.goto(`/tache/nouvelle?sans-projet=1&heure=${heure}`);
  await page.getByLabel('Titre de la tâche').fill(titre);
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await expect(page).toHaveURL(/\/$|\/\?/);
}

test.describe('journée en deux parties', () => {
  test('les deux colonnes, un bloc terminé qui passe dans Fait, une activité ajoutée après coup', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));

    await ajouter(page, 'Lecture du soir', 20 * 60);
    await ajouter(page, 'Appel au frère', 21 * 60);
    await expect(page.getByText('Prévu', { exact: false }).first()).toBeVisible();
    await expect(page.locator('#titre-prevu')).toContainText('Prévu · 2');
    await expect(page.locator('#titre-fait')).toContainText('Fait · 0');
    await expect(page.locator('[data-fait]')).toHaveCount(0);

    // Terminer un bloc : il garde sa place dans Prévu et se pose aussi dans Fait.
    await page.locator('.bloc').filter({ hasText: 'Lecture du soir' }).locator('.ouvrir').click();
    await page.getByRole('button', { name: /Marquer comme fait|Terminer/ }).first().click();
    await expect(page.locator('[data-fait]').filter({ hasText: 'Lecture du soir' })).toHaveCount(1);
    await expect(page.locator('.bloc').filter({ hasText: 'Lecture du soir' })).toHaveCount(1);
    await expect(page.locator('#titre-fait')).toContainText('Fait · 1');

    // Ce que j'ai fait, après coup : Fait seulement (pas dans Prévu).
    await page.keyboard.press('Escape');
    const grille = page.locator('.grille');
    const largeur = (await grille.boundingBox())!.width;
    await grille.click({ position: { x: largeur - 40, y: (6 * 60 + 10) * (72 / 60) } });
    await expect(page.getByRole('dialog', { name: 'Ce que j’ai fait' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Ce que j’ai fait' }).fill('Prière du matin');
    await page.getByLabel('Durée du fait').selectOption('60');
    await page.getByRole('button', { name: 'Ajouter à Fait' }).click();
    await expect(page.locator('[data-fait]').filter({ hasText: 'Prière du matin' })).toHaveCount(1);
    await expect(page.locator('.bloc').filter({ hasText: 'Prière du matin' })).toHaveCount(0);
    await expect(page.locator('#titre-fait')).toContainText('Fait · 2');
    await expect(page.locator('#titre-prevu')).toContainText('Prévu · 2');

    await page.locator('.defile-jour').evaluate((el) => { el.scrollTop = 19 * 72; });
    await page.screenshot({ path: '/tmp/fil-deux-parties-soir.png' });
    await page.locator('.defile-jour').evaluate((el) => { el.scrollTop = 5 * 72; });
    await page.screenshot({ path: '/tmp/fil-deux-parties.png' });

    // Rien ne se perd au rechargement, et le bloc de Fait s'ouvre comme les autres.
    await page.reload();
    await expect(page.locator('[data-fait]').filter({ hasText: 'Prière du matin' })).toHaveCount(1);
    await page.locator('[data-fait]').filter({ hasText: 'Prière du matin' }).locator('.ouvrir').click();
    await expect(page.getByText('Prière du matin').first()).toBeVisible();
    expect(erreurs).toEqual([]);
  });

  test('sans débordement horizontal à 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ajouter(page, 'Étude', 9 * 60);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(ok).toBe(true);
  });
});

test.describe('horaire type', () => {
  const jourToronto = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:4179', localStorage: [{ name: 'luther-life:invitation-rapport', value: JSON.stringify({ jour: jourToronto, jusqua: 'jour' }) }] }] } });

  test('posé tout seul au premier démarrage, retiré pour de bon à la demande, reposé à la demande', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.grille');
    await expect(page.locator('.bloc').first()).toBeVisible();
    const n = await page.locator('.bloc').count();
    expect(n).toBeGreaterThanOrEqual(8);
    await expect(page.locator('#titre-prevu')).toContainText(`Prévu · ${n}`);
    await page.locator('.defile-jour').evaluate((el) => { el.scrollTop = 17 * 72; });
    await page.screenshot({ path: '/tmp/horaire-type.png' });

    // Retiré à la main : il ne revient pas tout seul.
    await page.goto('/reglages');
    await expect(page.getByRole('button', { name: /Mon horaire type est posé/ })).toBeVisible();
    const retirer = page.getByRole('button', { name: /Retirer l’horaire type/ });
    await retirer.scrollIntoViewIfNeeded();
    await retirer.click();
    await page.getByRole('button', { name: /confirmer/ }).click();
    await page.getByRole('link', { name: 'Le Fil' }).click();
    await page.waitForSelector('.grille');
    await expect(page.locator('.bloc')).toHaveCount(0);
    await page.waitForTimeout(3500); // des centaines d'occurrences à enregistrer dans IndexedDB : l'écriture suit l'affichage de quelques secondes
    await page.reload();
    await page.waitForSelector('.grille');
    await expect(page.locator('.bloc')).toHaveCount(0);

    // Reposé à la demande.
    await page.goto('/reglages');
    const poser = page.getByRole('button', { name: /Poser mon horaire type/ });
    await poser.scrollIntoViewIfNeeded();
    await poser.click();
    await page.getByRole('link', { name: 'Le Fil' }).click();
    await expect(page.locator('.bloc').first()).toBeVisible();
  });
});

test('PDF de la journée : un vrai fichier avec créneaux, vides, recap, temps total et notes du jour', async ({ page }) => {
  await page.goto('/carnet');
  await page.getByLabel('Écrire une note libre').fill('Note du test PDF\nDeuxième ligne');
  await page.getByRole('button', { name: 'Ajouter au Carnet' }).click();
  await expect(page.getByText('Note du test PDF')).toBeVisible();
  await page.goto('/tache/nouvelle?sans-projet=1&heure=60');
  await page.getByLabel('Titre de la tâche').fill('Prière seule');
  await page.getByRole('button', { name: 'Ajouter au Fil' }).click();
  await page.locator('.bloc').filter({ hasText: 'Prière seule' }).locator('.ouvrir').click();
  await page.getByRole('button', { name: /Marquer comme fait|Terminer/ }).first().click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Exporter la journée en PDF' }).click();
  const volet = page.getByRole('dialog', { name: 'Ma journée en PDF' });
  await expect(volet).toBeVisible();
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    volet.getByRole('button', { name: /Télécharger le PDF/ }).click()
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/^Ma-journee-\d{4}-\d{2}-\d{2}\.pdf$/);
  const chemin = '/tmp/ma-journee-e2e.pdf';
  await telechargement.saveAs(chemin);
  const fs = await import('node:fs');
  expect(fs.readFileSync(chemin).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // Le texte du PDF (si pdftotext est disponible) : tableau, total, notes.
  const { execFileSync } = await import('node:child_process');
  let texte = '';
  try { texte = execFileSync('pdftotext', ['-layout', chemin, '-'], { encoding: 'utf8' }); } catch { /* pas d'outil : le contrôle du texte est sauté */ }
  if (texte) {
    expect(texte).toContain('CRÉNEAUX EFFECTUÉS');
    expect(texte).toContain('1h00–1h45');
    expect(texte).toContain('45 min de Prière seule');
    expect(texte).toMatch(/0h00–\d+h\d\d\s+vide/);
    expect(texte).toContain('Temps total de travail investi sur 24 h');
    expect(texte).toContain('NOTES DU JOUR');
    expect(texte).toContain('Note du test PDF');
    expect(texte).toContain('Deuxième ligne');
  }
});
