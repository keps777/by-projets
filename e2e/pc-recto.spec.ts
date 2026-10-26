// Variantes PC (≥ 900 px) du recto : accueil Voyager (jour et nuit), Rechercher, Résultats (jour : planche WebResultats ; nuit : « Marché des billets », planche WebMarche),
// détail d'une offre, radar, reventes de la semaine, vitrine d'agence. Captures dans /tmp/pc-recto-*.png à comparer aux planches Web… de design/maquettes/.
import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const GRAND = { width: 1440, height: 900 }, MOYEN = { width: 1024, height: 768 };
const dropActif = (e: Etat) => { for (const d of e.monde.drops) d.fin += 86_400_000; };
const nuit = (e: Etat) => { dropActif(e); e.session.face = 'marche'; };
const RESULTATS = '/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1';
const entete = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });
/** Aucun débordement horizontal à 900, 1280 et 1440 px. */
async function sansDebordementPartout(page: Page) {
  for (const width of [900, 1280, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(150); expect(await sansDebordement(page), `débordement à ${width}`).toBe(true); }
}

test.describe('PC · accueil Voyager', () => {
  test('face jour : titre, barre de recherche, billet horizontal, bagage, radar, recherches récentes et reventes à droite ; la bascule mobile disparaît', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, '/', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal', level: 1 })).toBeVisible();
    await expect(page.getByText('Bonjour Alex · lundi 12 octobre')).toBeVisible();
    const barre = page.getByRole('search', { name: 'Rechercher un trajet' });
    for (const t of ['De', 'À', 'Départ', 'Voyageurs', 'Sources']) await expect(barre.getByText(t, { exact: true }).first()).toBeVisible();
    await expect(barre.getByRole('button', { name: 'Rechercher' })).toBeVisible();
    const billet = page.getByRole('link', { name: /Prochain voyage/ });
    await expect(billet).toContainText('Dans 63 jours'); await expect(billet).toContainText('Nommer le voyageur avant le 13 déc.'); await expect(billet).toContainText('Voir mon voyage');
    const b = (await billet.boundingBox())!; expect(b.height).toBeLessThan(260); // horizontal : le billet n'est plus empilé
    await expect(page.getByRole('link', { name: /Votre 2e bagage est inutilisé/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Radar des destinations/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recherches récentes' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Montréal → Punta Cana/ })).toContainText('févr. 2027 · 2 voyageurs');
    await expect(page.getByRole('link', { name: /Où partir/ })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Face de l’application' })).toHaveCount(1); // seule la bascule de l'en-tête PC
    const reventes = page.getByRole('group', { name: 'Billets en revente cette semaine' }).getByRole('link');
    expect(await reventes.count()).toBeLessThanOrEqual(3);
    const rb = (await page.getByRole('heading', { name: 'Ces billets cherchent un voyageur' }).boundingBox())!; expect(rb.x).toBeGreaterThan(b.x + b.width - 40); // colonne de droite
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/pc-recto-accueil.png', fullPage: true });
  });

  test('la barre de recherche valide puis ouvre les résultats ; l’en-tête PC ouvre Rechercher', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, '/', { connecte: ALEX });
    const barre = page.getByRole('search', { name: 'Rechercher un trajet' });
    await barre.getByRole('button', { name: 'Rechercher' }).click();
    await expect(barre.getByRole('alert')).toContainText('Choisissez une destination'); expect(chemin(page)).toBe('/');
    await barre.getByRole('combobox', { name: 'À' }).fill('pari'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await barre.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page).toHaveURL(/\/resultats\?de=YUL&vers=CDG/);
    await entete(page).getByRole('link', { name: 'Rechercher' }).click(); await expect(page).toHaveURL(/\/rechercher$/);
  });

  test('face nuit : Mes actifs en grille (drop, portefeuille, départs qui montent) et navigation Marché · Drops · Portefeuille', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, '/', { connecte: ALEX, preparer: nuit });
    await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible();
    await expect(page.getByRole('search', { name: 'Rechercher un trajet' })).toBeVisible();
    await expect(page.getByText('Drop membres · en direct')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Départs qui montent' })).toBeVisible();
    const nav = entete(page); for (const l of ['Marché', 'Drops', 'Portefeuille', 'Agences']) await expect(nav.getByRole('link', { name: l })).toBeVisible();
    const t = (await page.getByRole('heading', { name: 'Départs qui montent' }).boundingBox())!, d = (await page.getByText('Drop membres · en direct').boundingBox())!; expect(t.x).toBeGreaterThan(d.x + 300); // deux colonnes
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/pc-recto-accueil-nuit.png', fullPage: true });
    await nav.getByRole('link', { name: 'Portefeuille' }).click(); await expect(page).toHaveURL(/\/portefeuille$/);
  });

  test('explorer sans compte : version réduite, centrée, sans débordement à 1024 px', async ({ page }) => {
    await page.setViewportSize(MOYEN); await ouvrir(page, '/explorer');
    await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('PC · Rechercher', () => {
  test('carte « Votre trajet », sources en quatre tuiles, recherches récentes et rappel à droite ; la recherche ouvre les résultats', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, '/rechercher', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Rechercher', level: 1 })).toBeVisible();
    await expect(page.getByText('Voyager · neuf, revente, agences et drops')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre trajet' })).toBeVisible();
    for (const t of ['Billets neufs', 'Revente', 'Agences', 'Drops']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Prix indicatifs, par voyageur. Les prix des drops ne sont visibles qu’aux membres.')).toBeVisible();
    const form = (await page.locator('#form-recherche').boundingBox())!, rec = (await page.getByRole('heading', { name: 'Recherches récentes' }).boundingBox())!; expect(rec.x).toBeGreaterThan(form.x + form.width);
    const tuiles = await page.locator('.tuile').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top))); expect(new Set(tuiles).size).toBe(1); // une seule rangée
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/pc-recto-rechercher.png', fullPage: true });
    await page.locator('#to').fill('pari'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click(); await expect(page).toHaveURL(/\/resultats\?de=YUL&vers=CDG/);
  });
});

test.describe('PC · Résultats', () => {
  test('face jour : filtres, cartes d’offres avec écart signé, baromètre et alerte de prix (planche WebResultats)', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, RESULTATS, { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Résultats', level: 1 })).toBeVisible();
    await expect(page.getByText('Voyager · YUL → CDG · ven. 18 déc. 2026 · 1 voyageur')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Filtres' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Offres', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Baromètre du marché' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Alerte de prix' })).toBeVisible();
    const cartes = page.locator('article[data-offre]'); expect(await cartes.count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByText('Meilleure affaire')).toBeVisible();
    await expect(page.locator('article[data-type="revente"]').first()).toContainText('Revente · détenteur vérifié');
    await expect(page.locator('article[data-offre="neuf:v-ae816"]')).toContainText(/±0\s\$ · prix neuf/);
    await expect(page.locator('article[data-type="revente"]').first()).toContainText(/−\d+\s\$ · −\d+\s%/);
    // aucun élément de mobile : pas de barre d'onglets, pas de bouton « Trier : »
    await expect(page.getByRole('button', { name: /^Trier :/ })).toHaveCount(0);
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/pc-recto-resultats.png', fullPage: true });
  });

  test('filtres (source, direct, prix maximum), tri et réinitialisation s’appliquent tout de suite ; l’alerte de prix se crée', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, RESULTATS, { connecte: ALEX });
    const cartes = page.locator('article[data-offre]'), total = await cartes.count();
    await page.getByRole('button', { name: /^Revente/ }).click(); expect(await cartes.count()).toBeLessThan(total); await expect(page.locator('article[data-type="revente"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Réinitialiser' }).click(); await expect(cartes).toHaveCount(total);
    await page.getByRole('button', { name: 'Direct seulement' }).click(); expect(await cartes.count()).toBeLessThan(total);
    for (const h of await page.locator('article[data-offre] .via').allTextContents()) expect(h).toBe('Direct');
    await page.getByRole('button', { name: 'Toutes', exact: true }).click();
    await page.getByRole('slider', { name: 'Prix maximum' }).fill('1500'); const prix = await page.locator('article[data-offre] .montant').allTextContents();
    for (const p of prix) expect(Number(p.replace(/\D/g, ''))).toBeLessThanOrEqual(1500);
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    const h = () => page.locator('article[data-offre] .montant').allTextContents().then((l) => l.map((x) => Number(x.replace(/\D/g, ''))));
    const asc = await h(); expect(asc).toEqual([...asc].sort((a, b) => a - b));
    await page.getByRole('button', { name: /^Prix/ }).click(); const desc = await h(); expect(desc).toEqual([...asc].reverse().sort((a, b) => b - a));
    await page.getByRole('button', { name: /^Heure de départ/ }).click(); await expect(page.getByRole('button', { name: /^Heure de départ/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Créer une alerte' }).click(); await expect(page.getByText('Alerte créée : vous serez prévenu si le prix change.')).toBeVisible();
    expect((await lireEtat(page)).monde.alertes.length).toBeGreaterThan(0);
  });

  test('une carte ouvre le détail de l’offre ; la barre de recherche du haut refait la recherche', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, RESULTATS, { connecte: ALEX });
    await page.locator('article[data-offre="revente:d-r816"]').getByRole('link', { name: /Voir l’offre/ }).click(); await expect(page).toHaveURL(/\/offre\/revente%3Ad-r816$/);
    await page.goBack(); const barre = page.getByRole('search', { name: 'Rechercher un trajet' });
    await expect(barre.getByRole('combobox', { name: 'À' })).toHaveValue('Paris (CDG)');
    await barre.getByRole('combobox', { name: 'À' }).fill('lisb'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await barre.getByRole('button', { name: 'Rechercher' }).click(); await expect(page).toHaveURL(/vers=LIS/);
  });

  test('un trajet sans vol : état vide utile avec dates proches', async ({ page }) => {
    await page.setViewportSize(MOYEN); await ouvrir(page, '/resultats?de=YUL&vers=CDG&jour=2026-12-25&n=1', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Aucun vol ne correspond à cette recherche' })).toBeVisible(); await expect(page.getByText('Dates proches avec des vols')).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
  });

  test('face nuit : « Marché des billets », tableau des départs à volets, offre sélectionnée, drop en direct et portefeuille (planche WebMarche)', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, RESULTATS, { connecte: ALEX, preparer: nuit });
    await expect(page.getByRole('heading', { name: 'Marché des billets', level: 1 })).toBeVisible();
    await expect(page.getByText('Mes actifs · marché secondaire contrôlé')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tableau des départs' })).toBeVisible();
    const table = page.getByRole('table'); for (const c of ['Départ', 'Compagnie', 'Source', 'Prix', 'Écart vs neuf']) await expect(table.getByRole('columnheader', { name: new RegExp(c) })).toBeVisible();
    expect(await table.getByRole('row').count()).toBeGreaterThan(5);
    await expect(table).toContainText('Détenteur vérifié'); await expect(table).toContainText('Vendu par la compagnie');
    await expect(page.getByRole('heading', { name: 'Drop membres en direct' })).toBeVisible(); await expect(page.getByText(/Votre portefeuille · 3 droits/)).toBeVisible();
    await expect(page.getByText('Offre sélectionnée')).toBeVisible();
    const avant = await page.locator('.sel-t').textContent();
    await table.getByRole('row').nth(3).click(); expect(await page.locator('.sel-t').textContent()).not.toBe(avant);
    await expect(table.getByRole('button', { pressed: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Neuf' }).first()).toBeVisible(); // filtres à gauche
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/pc-recto-marche.png', fullPage: true });
    await page.getByRole('link', { name: /^Voir l’offre/ }).first().click(); await expect(page).toHaveURL(/\/offre\//);
  });

  test('le même écran à 390 px reste celui du mobile, même en face nuit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await ouvrir(page, RESULTATS, { connecte: ALEX, preparer: nuit });
    await expect(page.getByRole('button', { name: /^Trier :/ })).toBeVisible(); await expect(page.getByRole('search', { name: 'Rechercher un trajet' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Marché des billets' })).toHaveCount(0); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('PC · détail de l’offre et autres écrans', () => {
  test('détail d’une revente : billet horizontal, courbe, droits, vendeur, conditions et panneau « Acheter ce billet » (planche WebOffre)', async ({ page }) => {
    await page.setViewportSize(GRAND); await ouvrir(page, '/offre/revente%3Ad-r816', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Offre de revente', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Résultats' })).toBeVisible(); await expect(page.getByText('Voyager · YUL → CDG · ven. 18 déc. 2026')).toBeVisible();
    for (const h of ['Vos droits avec ce billet', 'Conditions', 'Acheter ce billet']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
    const achat = page.getByRole('link', { name: /^Acheter ·/ }); await expect(achat).toContainText(/1\s500\s\$/);
    const billet = (await page.getByRole('region', { name: /Billet/ }).boundingBox())!; expect(billet.height).toBeLessThan(340); // horizontal
    const ab = (await achat.boundingBox())!; expect(ab.x).toBeGreaterThan(billet.x + billet.width); // panneau à droite
    await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/pc-recto-offre.png', fullPage: true });
    await page.getByRole('button', { name: 'Créer une alerte' }).click(); await expect(page.getByText('Alerte créée : vous serez prévenu si le prix change.')).toBeVisible();
    await achat.click(); await expect(page).toHaveURL(/\/paiement\//);
  });

  test('retour vers les résultats depuis le détail', async ({ page }) => {
    await page.setViewportSize(MOYEN); await ouvrir(page, '/offre/revente%3Ad-r816', { connecte: ALEX });
    await page.getByRole('link', { name: 'Résultats' }).click(); await expect(page).toHaveURL(/\/resultats\?de=YUL&vers=CDG/);
  });

  test('radar, reventes de la semaine et vitrine d’agence : en-tête PC, deux colonnes, sans débordement', async ({ page }) => {
    for (const [route, titre] of [['/radar', 'Jusqu’où, pour combien ?'], ['/revente', 'Ces billets cherchent un voyageur'], ['/agence/horizon', 'Agence Horizon']] as const) {
      await page.setViewportSize(GRAND); await ouvrir(page, route, { connecte: ALEX });
      await expect(page.getByRole('heading', { name: titre }).first()).toBeVisible(); await expect(entete(page)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await sansDebordementPartout(page); await page.setViewportSize(GRAND); await page.waitForTimeout(200);
      await page.screenshot({ path: `/tmp/pc-recto-${route.split('/')[1]}.png`, fullPage: true });
      await page.goto('about:blank');
    }
  });
});
