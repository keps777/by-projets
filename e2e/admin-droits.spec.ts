// Console d'administration (PC) : registre des droits de voyage et chaîne de détention avec gel / dégel.
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
const ADM = { connecte: 'adm-01' };
const tableau = (page: import('@playwright/test').Page) => page.getByRole('table', { name: /Droits de voyage du registre/ });

test.describe('registre des droits', () => {
  test('affiche tous les droits du monde simulé, triés par départ, avec le droit gelé en puce distincte', async ({ page }) => {
    await ouvrir(page, '/admin/droits', ADM);
    await expect(page.getByRole('heading', { level: 1, name: 'Droits de voyage' })).toBeVisible();
    await expect(page.getByText('Rapprochement du 12 oct. 02:00 · aucun écart')).toBeVisible();
    const etat = await lireEtat(page); const n = etat.monde.droits.length;
    await expect(page.getByRole('status').filter({ hasText: /droits? trouvés?/ })).toHaveText(`${n} droits trouvés`);
    await expect(page.getByText(`${n} droits de démonstration`)).toBeVisible();
    for (const t of ['Référence', 'Trajet et vol', 'Départ', 'Détenteur', 'Statut', 'Canal', 'Échéance de nommage', 'Dernier événement']) await expect(page.getByRole('columnheader', { name: t })).toBeVisible();
    const lignes = tableau(page).locator('tbody tr'); await expect(lignes).toHaveCount(n);
    await expect(lignes.first()).toContainText('NXG-8F3H'); await expect(lignes.last()).toContainText('NXG-9PPT'); // départ le plus proche d'abord
    const premiere = tableau(page).locator('tr[data-droit="NXG-7Q2M"]'); await expect(premiere).toContainText('NXG-7Q2M'); await expect(premiere).toContainText('PNR '); await expect(premiere).toContainText('YUL → CDG'); await expect(premiere).toContainText('Aérolys 812');
    await expect(premiere).toContainText('lun. · 18:05 · UTC−5'); await expect(premiere).toContainText('ACC-0412'); await expect(premiere).toContainText('À nommer'); await expect(premiere).toContainText('Primaire');
    await expect(premiere).toContainText('13 déc. · 18:05'); await expect(premiere).toContainText('dans 62 jours · UTC−5'); await expect(premiere).toContainText('#1 Émission'); await expect(premiere).toContainText('12 janv. 2026');
    const nommé = tableau(page).locator('tr[data-droit="NXG-8WC2"]'); await expect(nommé).toContainText('Nommé — prêt'); await expect(nommé).toContainText('Nommé le 2 oct. 2026'); await expect(nommé).toContainText('#2 Nommage');
    await expect(tableau(page).locator('tr[data-droit="NXG-4PUJ"]')).toContainText('Drop N° 127');
    const gele = tableau(page).locator('tr[data-droit="NXG-0GEL"]'); await expect(gele).toContainText('Détenu'); await expect(gele).toContainText('Gelé'); await expect(gele).toContainText('ACC-0402'); await expect(gele.locator('.puce.err')).toHaveText('Gelé');
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/admin-droits-liste.png', fullPage: true });
  });

  test('recherche par référence, PNR, compte ou vol ; filtres Statut et Canal ; réinitialiser ; état vide', async ({ page }) => {
    await ouvrir(page, '/admin/droits', ADM);
    const compte = page.getByRole('status').filter({ hasText: /droits? trouvés?/ }), lignes = tableau(page).locator('tbody tr');
    const total = (await lireEtat(page)).monde.droits.length;
    await page.getByLabel('Référence, PNR, compte ou vol').fill('nxg-0gel'); await expect(compte).toHaveText('1 droit trouvé'); await expect(lignes.first()).toContainText('NXG-0GEL');
    const pnr = (await lignes.first().locator('.r2').innerText()).replace('PNR ', ''); await page.getByLabel('Référence, PNR, compte ou vol').fill(pnr.toLowerCase()); await expect(compte).toHaveText('1 droit trouvé');
    await page.getByLabel('Référence, PNR, compte ou vol').fill('ACC-0402'); await expect(lignes.first()).toContainText('ACC-0402');
    await page.getByLabel('Référence, PNR, compte ou vol').fill('812'); await expect(compte).toHaveText('2 droits trouvés'); await expect(lignes.nth(0)).toContainText('NXG-7Q2M'); await expect(lignes.nth(1)).toContainText('NXG-8WC2');
    await page.getByLabel('Référence, PNR, compte ou vol').fill('AE 812'); await expect(compte).toHaveText('2 droits trouvés');
    await page.getByLabel('Référence, PNR, compte ou vol').fill('zzz'); await expect(page.getByRole('heading', { name: 'Aucun droit ne correspond à votre recherche' })).toBeVisible(); await expect(compte).toHaveText('0 droit trouvé');
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click(); await expect(compte).toHaveText(`${total} droits trouvés`);
    await page.getByLabel('Statut').selectOption('gele'); await expect(compte).toHaveText('1 droit trouvé'); await expect(lignes.first()).toContainText('NXG-0GEL');
    await page.getByLabel('Statut').selectOption('envente'); await expect(lignes.first()).toContainText(/en vente/i); for (const t of await lignes.locator('td:nth-child(5)').allInnerTexts()) expect(t).toMatch(/en vente/i);
    await page.getByLabel('Statut').selectOption('nomme'); await expect(compte).toHaveText('1 droit trouvé');
    await page.getByLabel('Statut').selectOption('all'); await page.getByLabel('Canal').selectOption('drop'); await expect(compte).toHaveText('1 droit trouvé'); await expect(lignes.first()).toContainText('Drop N° 127');
    await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await expect(compte).toHaveText(`${total} droits trouvés`); await expect(page.getByLabel('Canal')).toHaveValue('all');
  });

  test('états : chargement, erreur (code de corrélation, réessayer) et hors ligne en lecture seule', async ({ page }) => {
    await ouvrir(page, '/admin/droits?etat=chargement', ADM); await expect(page.getByText('Chargement des droits de voyage…')).toBeVisible(); await expect(tableau(page)).toHaveCount(0);
    await page.goto('/admin/droits?etat=erreur'); await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les droits de voyage.' })).toBeVisible(); await expect(page.getByText('ERR-DEMO-4F2A')).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(tableau(page)).toBeVisible();
    await page.goto('/admin/droits?etat=horsligne'); await expect(page.getByText(/Hors ligne\. Dernières données reçues le .* Lecture seule : la recherche porte sur ces données et aucune action sensible n’est possible\./)).toBeVisible();
    await page.getByLabel('Référence, PNR, compte ou vol').fill('NXG-0GEL'); await expect(tableau(page).locator('tbody tr')).toHaveCount(1);
  });

  test('à moins de 900 px, seul le tableau défile (pas la page) ; à 1024 et 1440 px aucun débordement', async ({ page }) => {
    await ouvrir(page, '/admin/droits', ADM);
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [900, 700], [820, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h }); await expect(tableau(page)).toBeVisible(); expect(await sansDebordement(page), `${w} px`).toBe(true);
      const defile = await page.locator('.boite').evaluate((e) => e.scrollWidth > e.clientWidth); expect(defile, `${w} px`).toBe(w < 1240);
    }
  });

  test('une ligne ouvre la chaîne de détention ; la console est réservée aux administrateurs', async ({ page }) => {
    await ouvrir(page, '/admin/droits', ADM);
    await tableau(page).locator('tr[data-droit="NXG-9PPT"]').click(); await expect.poll(() => chemin(page)).toBe('/admin/droits/d-ppt');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('NXG-9PPT');
    await page.getByRole('link', { name: 'Droits de voyage', exact: true }).last().click(); await expect.poll(() => chemin(page)).toBe('/admin/droits');
    await tableau(page).getByRole('link', { name: 'Ouvrir le droit NXG-2HV6' }).click(); await expect.poll(() => chemin(page)).toBe('/admin/droits/d-hav');
  });
  test('un compte voyageur est renvoyé à l’entrée de la console', async ({ page }) => {
    await ouvrir(page, '/admin/droits', { connecte: 'ACC-0412' }); await expect.poll(() => chemin(page)).toBe('/admin');
  });
});

test.describe('chaîne de détention et gel', () => {
  test('fiche d’un droit : résumé, chaîne numérotée avec empreintes, colonnes de la planche', async ({ page }) => {
    await ouvrir(page, '/admin/droits/d-ppt', ADM);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('NXG-9PPT · YUL → PPT');
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toContainText('Droits de voyage');
    const resume = page.getByRole('region', { name: 'Résumé du droit' }).or(page.locator('section[aria-labelledby="resume-t"]'));
    for (const t of ['Vol', 'Départ', 'Détenteur actuel', 'Voyageur', 'Échéance de nommage', 'Statut', 'Version de projection', 'Réservation']) await expect(resume.getByText(t, { exact: true })).toBeVisible();
    await expect(resume).toContainText('ACC-0412'); await expect(resume).toContainText('depuis le 3 août 2026'); await expect(resume).toContainText('À nommer'); await expect(resume).toContainText('Identité masquée après nommage'); await expect(resume).toContainText('PNR ');
    const chaine = page.locator('table').filter({ hasText: 'Empreinte précédente' }), lignes = chaine.locator('tbody tr');
    await expect(lignes).toHaveCount(3); await expect(page.getByText('Chaîne vérifiée · 3 événements · 12 oct. 02:00')).toBeVisible(); await expect(page.getByText('Ajout seul')).toBeVisible();
    await expect(lignes.nth(0)).toContainText('Émission'); await expect(lignes.nth(0)).toContainText('Achat neuf'); await expect(lignes.nth(0)).toContainText(/NexG-TT\s*→\s*ACC-0301/); await expect(lignes.nth(0)).toContainText('1 700 $'); await expect(lignes.nth(0)).toContainText('origine');
    await expect(lignes.nth(1)).toContainText('Vente'); await expect(lignes.nth(1)).toContainText(/ACC-0301\s*→\s*ACC-0356/); await expect(lignes.nth(1)).toContainText('1 800 $'); await expect(lignes.nth(1)).toContainText('commission 225 $'); await expect(lignes.nth(1)).toContainText('= n° 1');
    await expect(lignes.nth(2)).toContainText(/ACC-0356\s*→\s*ACC-0412/); await expect(lignes.nth(2)).toContainText('1 850 $'); await expect(lignes.nth(2)).toContainText('= n° 2');
    const e1 = await lignes.nth(0).locator('.emp').getAttribute('title'); expect(await lignes.nth(1).locator('.emp2').getAttribute('title')).toBe(e1); expect(e1).toMatch(/^[0-9a-f]{12}$/);
    await expect(page.getByRole('heading', { name: 'Actions d’administration' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Journal d’audit de ce droit' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Rapprochement quotidien' })).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/admin-droits-chaine.png', fullPage: true });
  });

  test('geler : motif obligatoire, confirmation « action sensible », puis le droit est gelé, audité, notifié', async ({ page }) => {
    await ouvrir(page, '/admin/droits/d-812', ADM);
    await page.getByRole('button', { name: 'Geler ce droit' }).click();
    await page.getByRole('button', { name: 'Demander le gel' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Indiquez le motif du gel.' })).toBeVisible();
    await page.getByLabel('Motif du gel').fill('Paiement contesté (démo)'); await page.getByRole('button', { name: 'Demander le gel' }).click();
    await expect(page.getByText('Action sensible', { exact: true })).toBeVisible(); await page.screenshot({ path: '/tmp/admin-droits-confirmer.png', fullPage: true });
    await page.getByRole('button', { name: 'Confirmer le gel' }).click();
    await expect(page.getByText(/Ce droit est gelé depuis le .* Aucune vente, aucun transfert ni nommage n’est possible tant qu’il n’est pas dégelé/)).toBeVisible();
    const chaine = page.locator('table').filter({ hasText: 'Empreinte précédente' }).locator('tbody tr'); await expect(chaine).toHaveCount(2); await expect(chaine.nth(1)).toContainText('Gel'); await expect(chaine.nth(1)).toContainText('Motif : Paiement contesté (démo)'); await expect(chaine.nth(1)).toContainText(/adm-01\s*→\s*ACC-0412/);
    await expect(page.locator('section[aria-labelledby="resume-t"]').locator('.puce.err')).toHaveText('Gelé'); await expect(page.getByRole('button', { name: 'Dégeler ce droit' })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="aud-t"]')).toContainText('Gel du droit'); await page.screenshot({ path: '/tmp/admin-droits-gele.png', fullPage: true });
    const e = await lireEtat(page); const d = e.monde.droits.find((x) => x.id === 'd-812')!;
    expect(d.statut).toBe('gele'); expect(d.gelRaison).toBe('Paiement contesté (démo)'); expect(d.chaine.at(-1)?.type).toBe('gel');
    expect(e.monde.audit[0]).toMatchObject({ acteur: 'adm-01', action: 'Gel du droit', cible: 'NXG-7Q2M', gravite: 'attention' }); expect(e.monde.notifications[0]).toMatchObject({ compteId: 'ACC-0412', titre: 'Votre droit NXG-7Q2M est gelé' });
    // la liste le montre, et le détenteur ne peut plus rien faire
    await page.getByRole('link', { name: 'Droits de voyage', exact: true }).last().click(); await expect(page.locator('tr[data-droit="NXG-7Q2M"] .puce.err')).toHaveText('Gelé');
  });

  test('dégeler un droit gelé (avec motif) le remet dans son statut d’avant ; annuler ne change rien', async ({ page }) => {
    await ouvrir(page, '/admin/droits/d-gele', ADM);
    await expect(page.getByText('Ce droit est gelé depuis le')).toBeVisible(); await expect(page.locator('section[aria-labelledby="act-t"]')).toContainText('Vérification d’identité en cours (démo).');
    await page.getByRole('button', { name: 'Dégeler ce droit' }).click(); await page.getByRole('button', { name: 'Annuler' }).click(); await expect(page.getByRole('button', { name: 'Dégeler ce droit' })).toBeVisible();
    await page.getByRole('button', { name: 'Dégeler ce droit' }).click(); await page.getByRole('button', { name: 'Demander le dégel' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Indiquez le motif du dégel.' })).toBeVisible();
    await page.getByLabel('Motif du dégel').fill('Identité vérifiée'); await page.getByRole('button', { name: 'Demander le dégel' }).click(); await page.getByRole('button', { name: 'Confirmer le dégel' }).click();
    await expect(page.getByText('Droit dégelé.')).toBeVisible(); await expect(page.getByText('Ce droit est gelé depuis le')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Geler ce droit' })).toBeVisible();
    const e = await lireEtat(page); const d = e.monde.droits.find((x) => x.id === 'd-gele')!; expect(d.statut).toBe('detenu'); expect(d.gelRaison).toBeUndefined(); expect(d.chaine.at(-1)?.type).toBe('degel');
    expect(e.monde.audit[0]).toMatchObject({ action: 'Dégel du droit', cible: 'NXG-0GEL', gravite: 'attention' });
  });

  test('droit introuvable, erreur, chargement et hors ligne (lecture seule)', async ({ page }) => {
    await ouvrir(page, '/admin/droits/d-nexiste-pas', ADM);
    await expect(page.getByRole('heading', { name: 'Aucun droit ne porte cette référence' })).toBeVisible(); await expect(page.getByText('d-nexiste-pas').first()).toBeVisible();
    await page.getByRole('link', { name: 'Retour à la liste' }).click(); await expect.poll(() => chemin(page)).toBe('/admin/droits');
    await page.goto('/admin/droits/d-812?etat=erreur'); await expect(page.getByText('ERR-DEMO-7C91')).toBeVisible(); await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByRole('heading', { level: 1 })).toContainText('NXG-7Q2M');
    await page.goto('/admin/droits/d-812?etat=chargement'); await expect(page.getByText('Chargement de la fiche du droit…')).toBeVisible();
    await page.goto('/admin/droits/d-812?etat=horsligne'); await expect(page.getByText(/Lecture seule : consultation seulement ; les actions d’administration sont indisponibles\./)).toBeVisible();
    await expect(page.getByText('Hors ligne : les actions d’administration sont indisponibles.')).toBeVisible();
    await page.getByRole('button', { name: 'Geler ce droit' }).click({ force: true }); await expect(page.getByLabel('Motif du gel')).toHaveCount(0);
  });

  test('la fiche reste lisible à 1024 px et en dessous de 900 px (la chaîne défile dans sa boîte)', async ({ page }) => {
    await ouvrir(page, '/admin/droits/d-ppt', ADM);
    for (const [w, h] of [[1440, 900], [1024, 768], [900, 700], [820, 900], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await expect(page.getByRole('heading', { name: 'Chaîne de détention' })).toBeVisible(); expect(await sansDebordement(page), `${w} px`).toBe(true); }
  });
});
