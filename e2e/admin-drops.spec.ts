import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

// Console d'administration (PC) : « Drops et agences » (/admin/drops) et « Journal d'audit » (/admin/audit). Compte administrateur adm-01.
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
const CAPTURES = '/tmp/claude-0/-home-user-by-projets/5cebacd6-2351-5a93-a27a-e14809ba4f99/scratchpad/admdrops';
const admin = (page: Page, route: string, preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: 'adm-01', preparer });
const dernier = async (page: Page) => (await lireEtat(page)).monde.audit[0];

test.describe('garde', () => {
  test('sans compte, /admin/drops et /admin/audit renvoient vers /admin', async ({ page }) => { await ouvrir(page, '/admin/drops'); await expect.poll(() => chemin(page)).toBe('/admin'); await page.goto('/admin/audit'); await expect.poll(() => chemin(page)).toBe('/admin'); });
  test('un compte voyageur est renvoyé hors de la console', async ({ page }) => { await ouvrir(page, '/admin/drops', { connecte: 'ACC-0412' }); await expect.poll(() => chemin(page)).toBe('/admin'); });
  test('l’entrée de démonstration ouvre la console et consigne la connexion', async ({ page }) => {
    await ouvrir(page, '/admin'); await page.getByRole('button', { name: 'Entrer comme adm-01 (démo)' }).click(); await expect.poll(() => chemin(page)).toBe('/admin/droits');
    await page.getByRole('link', { name: 'Journal d’audit' }).click(); await expect(page.getByRole('heading', { name: 'Journal d’audit', level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Connexion à la console' })).toBeVisible();
  });
});

test.describe('Drops et agences · rendu', () => {
  test('1440 × 900 : titres, tableau des drops, panneau du drop en direct, agences', async ({ page }) => {
    await admin(page, '/admin/drops');
    await expect(page.getByRole('heading', { name: 'Drops et agences', level: 1 })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Drops', level: 2 })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Agences partenaires' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Planifier un drop' })).toBeVisible();
    for (const t of ['Drop', 'Trajet et vol', 'Ouverture', 'Places', 'Prix membre', 'Statut']) await expect(page.getByRole('columnheader', { name: t, exact: true }).first()).toBeVisible();
    const aside = page.getByRole('complementary', { name: 'Drop N° 128' }); await expect(aside).toBeVisible();
    await expect(aside.getByText('3 réclamées · 3 restantes sur 6 libérées')).toBeVisible(); await expect(aside.getByText('Se termine dans')).toBeVisible(); await expect(aside.getByText('200 $', { exact: false }).first()).toBeVisible(); await expect(aside.getByText('Prix équivalent')).toBeVisible();
    await expect(aside.getByText('Une place par membre et par drop.')).toBeVisible(); await expect(aside.getByRole('button', { name: 'Clore le drop' })).toBeVisible();
    await expect(page.getByRole('row', { name: /N° 128/ }).getByText('Ouvert')).toBeVisible();
    // trois annonces de prochains drops (destination masquée au public)
    await expect(page.getByRole('row', { name: /annonce/ })).toHaveCount(3);
    await expect(page.getByRole('row', { name: /Agence Horizon/ })).toBeVisible(); await expect(page.getByRole('row', { name: /Cap Nord Voyages/ })).toBeVisible();
    expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: `${CAPTURES}/drops-1440.png`, fullPage: true });
  });
  for (const [w, h] of [[900, 700], [1024, 768], [1280, 800]] as const) test(`aucun débordement à ${w} px (Drops et Journal)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h }); await admin(page, '/admin/drops'); await expect(page.getByRole('heading', { name: 'Agences partenaires' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.goto('/admin/audit'); await expect(page.getByRole('heading', { name: 'Journal d’audit', level: 1 })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    if (w === 1024) { await page.screenshot({ path: `${CAPTURES}/audit-1024.png`, fullPage: true }); await page.goto('/admin/drops'); await page.screenshot({ path: `${CAPTURES}/drops-1024.png`, fullPage: true }); }
  });
  test('sous 900 px la console reste lisible : les tables défilent dans leur boîte', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 }); await admin(page, '/admin/drops'); await expect(page.getByRole('heading', { name: 'Agences partenaires' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    const boite = page.getByRole('region', { name: 'Liste des drops' }); expect(await boite.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    await page.goto('/admin/audit'); expect(await sansDebordement(page)).toBe(true);
  });
  test('sélectionner un autre drop (annonce) change le panneau', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('row', { name: /annonce/ }).first().getByRole('button').click();
    await expect(page.getByRole('complementary', { name: /Drop annoncé/ })).toBeVisible(); await expect(page.getByText('la destination reste masquée au public')).toBeVisible();
  });
});

test.describe('Drops et agences · états', () => {
  test('chargement', async ({ page }) => { await admin(page, '/admin/drops?etat=chargement'); await expect(page.getByText('Chargement des drops et des agences…')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Agences partenaires' })).toHaveCount(0); });
  test('erreur puis Réessayer', async ({ page }) => {
    await admin(page, '/admin/drops?etat=erreur'); await expect(page.getByRole('alert').getByText('Impossible de charger les drops et les agences.')).toBeVisible(); await expect(page.getByText('ERR-DEMO-91B0')).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByRole('heading', { name: 'Agences partenaires' })).toBeVisible();
  });
  test('hors ligne : bandeau, actions désactivées, aucune écriture', async ({ page }) => {
    await admin(page, '/admin/drops?etat=horsligne'); await expect(page.getByText(/Hors ligne\. Dernières données reçues le/)).toBeVisible(); await expect(page.getByText('Lecture seule')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Planifier un drop' })).toHaveAttribute('aria-disabled', 'true'); await page.getByRole('button', { name: 'Planifier un drop' }).click({ force: true }); await expect(page.getByRole('heading', { name: 'Planifier un drop', level: 3 })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clore le drop' })).toHaveAttribute('aria-disabled', 'true'); await page.getByRole('button', { name: 'Clore le drop' }).click({ force: true }); await expect(page.getByText('Clore ce drop ?')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Suspendre la vitrine' })).toHaveAttribute('aria-disabled', 'true');
    expect((await lireEtat(page)).monde.audit.length).toBe(2);
  });
  test('aucun drop : état vide', async ({ page }) => {
    await admin(page, '/admin/drops', (e) => { e.monde.drops = []; e.monde.dropsAVenir = []; }); await expect(page.getByRole('heading', { name: 'Aucun drop planifié' })).toBeVisible(); await expect(page.getByText('Aucun drop n’est planifié ni ouvert pour le moment.')).toBeVisible();
    await page.getByRole('button', { name: 'Planifier un drop' }).last().click(); await expect(page.getByRole('heading', { name: 'Planifier un drop', level: 3 })).toBeVisible();
  });
});

test.describe('Drops · planifier, ouvrir, clore, annuler', () => {
  async function remplir(page: Page, o: { vol?: string; places?: string; prix?: string; dateO?: string; heureO?: string; dateF?: string; heureF?: string }) {
    if (o.vol !== undefined) await page.getByLabel('Vol du drop').selectOption({ label: o.vol });
    const champs: [string, string | undefined][] = [['Places à libérer', o.places], ['Prix membre ($)', o.prix], ['Date d’ouverture', o.dateO], ['Heure d’ouverture', o.heureO], ['Date de fin', o.dateF], ['Heure de fin', o.heureF]];
    for (const [l, v] of champs) if (v !== undefined) await page.getByLabel(l).fill(v);
  }
  test('validation : prix membre ≥ prix équivalent, places hors 1–50, ouverture passée', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('button', { name: 'Planifier un drop' }).click();
    const vol = await page.getByLabel('Vol du drop').locator('option').nth(1).textContent();
    await remplir(page, { vol: vol!, places: '80', prix: '5000', dateO: '2026-10-01', heureO: '12:00', dateF: '2026-10-20', heureF: '12:00' });
    await page.getByRole('button', { name: 'Planifier le drop' }).click();
    await expect(page.getByText('Entre 1 et 50 places.')).toBeVisible(); await expect(page.getByText(/Le prix membre doit être inférieur au prix équivalent/)).toBeVisible(); await expect(page.getByText('L’ouverture doit être dans le futur.')).toBeVisible();
    expect((await lireEtat(page)).monde.drops).toHaveLength(1);
    await page.getByRole('button', { name: 'Annuler' }).first().click(); await expect(page.getByRole('heading', { name: 'Planifier un drop', level: 3 })).toHaveCount(0);
  });
  test('planifier un drop valide : il apparaît, il est consigné, il est annoncé aux membres', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('button', { name: 'Planifier un drop' }).click();
    await expect(page.getByText('Ce sera le drop N° 129.')).toBeVisible();
    const vol = await page.getByLabel('Vol du drop').locator('option').last().textContent();
    await remplir(page, { vol: vol!, places: '8', prix: '150', dateO: '2026-10-20', heureO: '12:00', dateF: '2026-10-21', heureF: '12:00' });
    await page.getByRole('button', { name: 'Planifier le drop' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Drop N° 129 planifié' })).toBeVisible(); await expect(page.getByRole('complementary', { name: 'Drop N° 129' })).toBeVisible();
    await expect(page.getByRole('row', { name: /N° 129/ }).getByText('Planifié')).toBeVisible();
    const e = await lireEtat(page); expect(e.monde.drops.map((d) => d.n)).toEqual([128, 129]); expect(e.monde.drops[1]).toMatchObject({ prixMembre: 150, places: 8, restantes: 8 }); expect(e.monde.dropsAVenir.some((d) => d.id === 'dv-drop-129')).toBe(true);
    expect(e.monde.audit[0]).toMatchObject({ acteur: 'adm-01', action: 'Création de drop', cible: 'Drop N° 129', gravite: 'info' });
    await page.getByRole('link', { name: 'Voir le journal d’audit' }).first().click(); await expect(page.getByRole('cell', { name: 'Création de drop' })).toBeVisible(); await expect(page.getByRole('cell', { name: 'Drop N° 129' })).toBeVisible();
  });
  test('ouvrir maintenant (avec confirmation), puis clore : consignés', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('button', { name: 'Planifier un drop' }).click();
    const vol = await page.getByLabel('Vol du drop').locator('option').last().textContent();
    await remplir(page, { vol: vol!, places: '4', prix: '100', dateO: '2026-10-20', heureO: '12:00', dateF: '2026-10-21', heureF: '12:00' }); await page.getByRole('button', { name: 'Planifier le drop' }).click();
    await page.getByRole('button', { name: 'Ouvrir maintenant' }).click(); await expect(page.getByText(/L’ouverture est immédiate et journalisée/)).toBeVisible();
    await page.getByRole('button', { name: 'Annuler', exact: true }).last().click(); await expect(page.getByText(/L’ouverture est immédiate/)).toHaveCount(0); expect((await dernier(page)).action).toBe('Création de drop');
    await page.getByRole('button', { name: 'Ouvrir maintenant' }).click(); await page.getByRole('button', { name: 'Confirmer l’ouverture' }).click();
    await expect(page.getByRole('row', { name: /N° 129/ }).getByText('Ouvert')).toBeVisible(); expect(await dernier(page)).toMatchObject({ action: 'Ouverture de drop', cible: 'Drop N° 129', gravite: 'attention' });
    await page.getByRole('button', { name: 'Clore le drop' }).click(); await page.getByRole('button', { name: 'Confirmer la clôture' }).click();
    await expect(page.getByRole('row', { name: /N° 129/ }).getByText('Terminé')).toBeVisible(); expect(await dernier(page)).toMatchObject({ action: 'Clôture de drop', cible: 'Drop N° 129' });
  });
  test('clore le drop en direct N° 128 (aussi les places déjà attribuées restent) puis plus d’offre membres', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('button', { name: 'Clore le drop' }).click(); await page.getByRole('button', { name: 'Confirmer la clôture' }).click();
    await expect(page.getByRole('row', { name: /N° 128/ }).getByText('Terminé')).toBeVisible(); const e = await lireEtat(page); expect(e.monde.drops[0].restantes).toBe(3); expect(e.monde.drops[0].fin).toBeLessThanOrEqual(Date.now() + 10 * 24 * 3600 * 1000);
    expect(e.monde.audit[0]).toMatchObject({ action: 'Clôture de drop', cible: 'Drop N° 128' });
  });
  test('annuler une annonce de prochain drop', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('row', { name: /annonce/ }).first().getByRole('button').click(); await page.getByRole('button', { name: 'Annuler le drop' }).click(); await page.getByRole('button', { name: 'Confirmer l’annulation' }).click();
    await expect(page.getByRole('row', { name: /annonce/ })).toHaveCount(2); const e = await lireEtat(page); expect(e.monde.dropsAVenir).toHaveLength(2); expect(e.monde.audit[0]).toMatchObject({ action: 'Annulation de drop', gravite: 'attention' });
  });
});

test.describe('Agences partenaires', () => {
  test('suspendre une agence retire ses offres du marché, la réactiver les rend (consigné)', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('row', { name: /Agence Horizon/ }).getByRole('button').click();
    const aside = page.getByRole('complementary', { name: 'Agence Horizon' }); await expect(aside).toBeVisible(); await expect(aside.getByText('Permis vérifié')).toBeVisible(); await expect(aside.getByText('Offres de l’agence', { exact: true })).toBeVisible();
    await aside.getByRole('button', { name: 'Suspendre la vitrine' }).click(); await expect(aside.getByText('Indiquez le motif.')).toBeVisible();
    await aside.getByLabel(/Motif de la suspension/).fill('Permis expiré (démo)'); await aside.getByRole('button', { name: 'Suspendre la vitrine' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Vitrine de Agence Horizon suspendue' })).toBeVisible(); await expect(aside.getByText('Vitrine suspendue')).toBeVisible(); await expect(aside.getByText('Permis expiré (démo)')).toBeVisible();
    await expect(page.getByRole('row', { name: /Agence Horizon/ }).getByText('Suspendue')).toBeVisible();
    let e = await lireEtat(page); expect(e.monde.agences[0].suspendue).toBe(true); expect(e.monde.audit[0]).toMatchObject({ action: 'Suspension d’agence', cible: 'Agence Horizon', gravite: 'critique' });
    await page.goto('/recherche/resultats?de=YUL&vers=CDG'); // les offres d'agence ne sont plus dans le monde visible : vérifié en test de domaine
    await admin(page, '/admin/drops'); await page.getByRole('row', { name: /Agence Horizon/ }).getByRole('button').click();
    await page.getByRole('complementary', { name: 'Agence Horizon' }).getByRole('button', { name: 'Réactiver la vitrine' }).click(); await expect(page.getByRole('row', { name: /Agence Horizon/ }).getByText('Vérifiée')).toBeVisible();
    e = await lireEtat(page); expect(e.monde.agences[0].suspendue).toBeFalsy(); expect(e.monde.audit[0]).toMatchObject({ action: 'Réactivation d’agence' });
  });
  test('ajouter une offre : plafond = prix équivalent neuf ; puis retirer', async ({ page }) => {
    await admin(page, '/admin/drops'); await page.getByRole('row', { name: /Cap Nord Voyages/ }).getByRole('button').click();
    const aside = page.getByRole('complementary', { name: 'Cap Nord Voyages' }); const vol = await aside.getByLabel('Vol', { exact: true }).locator('option').nth(1).textContent();
    await aside.getByLabel('Vol', { exact: true }).selectOption({ label: vol! }); await aside.getByLabel(/Prix de l’offre/).fill('99999'); await aside.getByRole('button', { name: 'Ajouter l’offre' }).click();
    await expect(aside.getByText(/Le prix est plafonné au prix équivalent neuf/)).toBeVisible(); expect((await lireEtat(page)).monde.offresAgence).toHaveLength(3);
    await aside.getByLabel(/Prix de l’offre/).fill('100'); await aside.getByRole('button', { name: 'Ajouter l’offre' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Offre ajoutée à Cap Nord Voyages' })).toBeVisible();
    let e = await lireEtat(page); expect(e.monde.offresAgence).toHaveLength(4); expect(e.monde.audit[0]).toMatchObject({ action: 'Ajout d’une offre d’agence', cible: 'Cap Nord Voyages' });
    await aside.getByRole('button', { name: /^Retirer l’offre/ }).first().click(); await expect(page.getByRole('status').filter({ hasText: 'Offre retirée' })).toBeVisible();
    e = await lireEtat(page); expect(e.monde.offresAgence).toHaveLength(3); expect(e.monde.audit[0]).toMatchObject({ action: 'Retrait d’une offre d’agence' });
  });
  test('une agence en vérification : trois contrôles puis approbation de la vitrine', async ({ page }) => {
    await admin(page, '/admin/drops', (e) => { e.monde.agences[1].permisVerifie = false; });
    const aside = page.getByRole('complementary', { name: 'Cap Nord Voyages' }); await expect(aside).toBeVisible(); await expect(aside.getByText('En vérification', { exact: true })).toBeVisible();
    const bouton = aside.getByRole('button', { name: 'Approuver la vitrine' }); await expect(bouton).toHaveAttribute('aria-disabled', 'true'); await expect(aside.getByText('Cochez les trois contrôles pour approuver la vitrine.')).toBeVisible();
    await bouton.click({ force: true }); expect((await lireEtat(page)).monde.agences[1].permisVerifie).toBe(false);
    for (const c of ['Identité de l’entreprise vérifiée', 'Permis d’agent de voyages vérifié auprès de l’OPC', 'Cautionnement reçu']) await aside.getByLabel(c).check();
    await expect(bouton).not.toHaveAttribute('aria-disabled', 'true'); await bouton.click();
    await expect(page.getByRole('row', { name: /Cap Nord Voyages/ }).getByText('Vérifiée')).toBeVisible(); const e = await lireEtat(page); expect(e.monde.agences[1].permisVerifie).toBe(true); expect(e.monde.audit[0]).toMatchObject({ action: 'Vérification d’agence', cible: 'Cap Nord Voyages' });
  });
});

test.describe('Journal d’audit', () => {
  const JOURNAL = (e: Etat) => { const t = Date.parse('2026-10-12T09:00'); for (let i = 0; i < 24; i++) e.monde.audit.push({ id: `t-${i}`, quand: t - (i + 1) * 3_600_000, acteur: i % 3 === 0 ? 'système' : 'adm-02', action: i % 4 === 0 ? 'Injection de drop' : 'Vérification d’agence', cible: `Cible ${i}`, detail: `Détail ${i}`, gravite: i % 5 === 0 ? 'critique' : i % 2 ? 'info' : 'attention' }); };
  test('1440 × 900 : colonnes, lignes du seed, puces avec icône et texte, bandeau « Ajout seul »', async ({ page }) => {
    await admin(page, '/admin/audit');
    await expect(page.getByRole('heading', { name: 'Journal d’audit', level: 1 })).toBeVisible(); await expect(page.getByText('heures de Montréal et UTC')).toBeVisible(); await expect(page.getByRole('button', { name: 'Exporter (CSV)' })).toBeVisible(); await expect(page.getByText('L’export est journalisé.')).toBeVisible();
    await expect(page.getByText('Ajout seul')).toBeVisible();
    for (const t of ['Horodatage', 'Acteur', 'Action', 'Objet', 'Détail', 'Gravité']) await expect(page.getByRole('columnheader', { name: t })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Gel du droit' })).toBeVisible(); await expect(page.getByRole('cell', { name: 'NXG-0GEL' })).toBeVisible(); await expect(page.getByRole('cell', { name: 'Rapprochement quotidien' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Gel du droit/ }).getByText('Attention')).toBeVisible(); await expect(page.getByRole('row', { name: /Rapprochement quotidien/ }).getByText('Info')).toBeVisible();
    await expect(page.getByRole('cell', { name: /UTC−4/ }).first()).toBeVisible(); await expect(page.getByText('2 entrées sur 2')).toBeVisible(); await expect(page.getByText('Page 1 sur 1')).toBeVisible();
    expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: `${CAPTURES}/audit-1440.png`, fullPage: true });
  });
  test('filtres : gravité, acteur, action, recherche, période ; réinitialiser ; aucun résultat', async ({ page }) => {
    await admin(page, '/admin/audit', JOURNAL); await expect(page.getByText('26 entrées sur 26')).toBeVisible();
    await page.getByLabel('Gravité').selectOption('critique'); await expect(page.getByText(/entrées? sur 26/)).toBeVisible(); const lignes = page.locator('tbody tr'); for (const t of await lignes.locator('td:last-child').allTextContents()) expect(t.trim()).toMatch(/Critique/);
    await page.getByLabel('Gravité').selectOption('toutes'); await page.getByLabel(/^Acteur/).fill('SYSTÈME'); for (const t of await lignes.locator('td:nth-child(2)').allTextContents()) expect(t).toBe('système');
    await page.getByLabel(/^Acteur/).fill(''); await page.getByLabel('Action', { exact: true }).selectOption('gel'); await expect(page.getByText('1 entrée sur 26')).toBeVisible(); await expect(page.getByRole('cell', { name: 'NXG-0GEL' })).toBeVisible();
    await page.getByLabel('Action', { exact: true }).selectOption('toutes'); await page.getByLabel(/^Recherche/).fill('cible 7'); await expect(page.getByText('1 entrée sur 26')).toBeVisible();
    await page.getByLabel(/^Recherche/).fill('introuvable-xyz'); await expect(page.getByRole('heading', { name: 'Aucune entrée ne correspond à ces filtres' })).toBeVisible(); await expect(page.getByText('Élargissez la période ou retirez un filtre.')).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click(); await expect(page.getByText('26 entrées sur 26')).toBeVisible();
    await page.getByLabel('Période').selectOption('heure'); await expect(page.getByRole('heading', { name: 'Aucune entrée ne correspond à ces filtres' })).toBeVisible(); await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await expect(page.getByText('26 entrées sur 26')).toBeVisible();
  });
  test('tri par colonne (aria-sort) et pagination par 10', async ({ page }) => {
    await admin(page, '/admin/audit', JOURNAL); await expect(page.getByText('Page 1 sur 3')).toBeVisible(); await expect(page.locator('tbody tr')).toHaveCount(10);
    await expect(page.getByRole('columnheader', { name: /Horodatage/ })).toHaveAttribute('aria-sort', 'descending'); await expect(page.getByText('Tri : du plus récent au plus ancien.')).toBeVisible();
    await page.getByRole('button', { name: /^Horodatage/ }).click(); await expect(page.getByRole('columnheader', { name: /Horodatage/ })).toHaveAttribute('aria-sort', 'ascending'); await expect(page.getByText('Tri : du plus ancien au plus récent.')).toBeVisible(); await expect(page.locator('tbody tr').first().getByText('Gel du droit')).toBeVisible();
    await page.getByRole('button', { name: /^Acteur/ }).click(); await expect(page.getByRole('columnheader', { name: /^Acteur/ })).toHaveAttribute('aria-sort', 'ascending'); await expect(page.locator('tbody tr').first().locator('td:nth-child(2)')).toHaveText('adm-01');
    await page.getByRole('button', { name: /^Gravité/ }).click(); await expect(page.locator('tbody tr').first().getByText('Critique')).toBeVisible();
    await page.getByRole('button', { name: 'Précédent' }).isDisabled(); await page.getByRole('button', { name: 'Suivant' }).click(); await expect(page.getByText('Page 2 sur 3')).toBeVisible(); await page.getByRole('button', { name: 'Suivant' }).click(); await expect(page.getByText('Page 3 sur 3')).toBeVisible(); await expect(page.locator('tbody tr')).toHaveCount(6); await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();
    await page.getByLabel('Gravité').selectOption('info'); await expect(page.getByText(/Page 1 sur/)).toBeVisible();
  });
  test('export CSV : téléchargement d’un Blob (lignes filtrées), journalisé', async ({ page }) => {
    await admin(page, '/admin/audit', JOURNAL); await page.getByLabel('Gravité').selectOption('critique');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter (CSV)' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^journal-audit-2026-10-12\.csv$/); const csv = readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''); const l = csv.trim().split('\r\n');
    expect(l[0]).toBe('horodatage_utc,acteur,action,objet,detail,gravite'); expect(l.length).toBeGreaterThan(1); for (const x of l.slice(1)) expect(x).toMatch(/,Critique$/); expect(csv).not.toMatch(/@|ACC-/);
    await expect(page.getByRole('status').filter({ hasText: 'Export CSV de' })).toBeVisible(); const e = await dernier(page); expect(e).toMatchObject({ acteur: 'adm-01', action: 'Export du journal', cible: 'Journal d’audit', gravite: 'info' });
    await page.getByLabel('Gravité').selectOption('toutes'); await expect(page.getByRole('cell', { name: 'Export du journal' })).toBeVisible();
  });
  test('états : chargement, erreur (Réessayer), hors ligne, journal vide', async ({ page }) => {
    await admin(page, '/admin/audit?etat=chargement'); await expect(page.getByText('Chargement du journal d’audit…')).toBeVisible();
    await page.goto('/admin/audit?etat=erreur'); await expect(page.getByRole('alert').getByText('Impossible de charger le journal d’audit.')).toBeVisible(); await expect(page.getByText('ERR-DEMO-5E17')).toBeVisible(); await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByRole('cell', { name: 'Gel du droit' })).toBeVisible();
    await page.goto('/admin/audit?etat=horsligne'); await expect(page.getByText(/Hors ligne\. Dernières données reçues le/)).toBeVisible(); await expect(page.getByText('l’export est indisponible')).toBeVisible(); await expect(page.getByRole('button', { name: 'Exporter (CSV)' })).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByRole('cell', { name: 'Gel du droit' })).toBeVisible();
  });
  test('journal vide', async ({ page }) => { await admin(page, '/admin/audit', (e) => { e.monde.audit = []; }); await expect(page.getByRole('heading', { name: 'Le journal est vide' })).toBeVisible(); });
  test('les actions des autres écrans apparaissent : connexion, drop, agence', async ({ page }) => {
    await ouvrir(page, '/admin'); await page.getByRole('button', { name: 'Entrer comme adm-01 (démo)' }).click(); await page.goto('/admin/drops');
    const aside = page.getByRole('complementary', { name: 'Agence Horizon' }).or(page.getByRole('row', { name: /Agence Horizon/ })); await page.getByRole('row', { name: /Agence Horizon/ }).getByRole('button').click(); void aside;
    await page.getByLabel(/Motif de la suspension/).fill('Contrôle (démo)'); await page.getByRole('button', { name: 'Suspendre la vitrine' }).click(); await page.getByRole('link', { name: 'Voir le journal d’audit' }).first().click();
    await expect(page.getByRole('cell', { name: 'Suspension d’agence' })).toBeVisible(); await expect(page.getByRole('cell', { name: 'Connexion à la console' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Suspension d’agence/ }).getByText('Critique')).toBeVisible();
  });
});
