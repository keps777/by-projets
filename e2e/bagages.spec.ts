import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';

const ALEX = 'ACC-0412';
const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
const acheter = (page: Page, nom: RegExp | string) => page.getByRole('button', { name: nom });

test.describe('garde d’accès', () => {
  for (const r of ['/bagages', '/bagages/ajouter?droit=d-812', '/bagages/transfere']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('mes bagages', () => {
  test('étiquettes, franchise et comparaison viennent du monde simulé', async ({ page }) => {
    await ouvrir(page, '/bagages', { connecte: ALEX });
    await expect(page.getByRole('heading', { level: 1, name: 'Mes bagages' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /2 bagages inclus,\s*1 sans valise\./ })).toBeVisible();
    await expect(page.getByText('AÉROLYS 812 · YUL → CDG · LUN. 14 DÉC.', { exact: false })).toBeVisible();
    const tags = page.getByRole('list', { name: /Étiquettes de vos bagages/ }).getByRole('listitem');
    await expect(tags).toHaveCount(2); await expect(tags.nth(0)).toContainText('Utilisé'); await expect(tags.nth(1)).toContainText('En vente · 100 $');
    await expect(page.getByText('1 / 2')).toBeVisible(); await expect(page.getByText('Inclus dans le tarif du droit de voyage NXG-7Q2M')).toBeVisible();
    await expect(page.getByText('dès 90 $')).toBeVisible(); await expect(page.getByText('−60 $', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('7 bagages proposés et aucune demande sur le vol 812')).toBeVisible();
    await expect(page.getByText('Un bagage ne voyage que sur son vol : même numéro, même date.')).toBeVisible();
    await expect(page.getByText('Sous réserve d’accord avec la compagnie.')).toBeVisible();
    await expect(page.getByRole('img', { name: /Jauge de franchise : 1 bagage utilisé sur 2 inclus/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/bagages-1.png`, fullPage: true });
  });
  test('?droit= choisit la réservation, un droit étranger retombe sur le prochain', async ({ page }) => {
    await ouvrir(page, '/bagages?droit=d-puj', { connecte: ALEX });
    await expect(page.getByText('NORDELLE 905 · YUL → PUJ', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /2 bagages inclus,\s*tous utilisés\./ })).toBeVisible();
    await page.goto('/bagages?droit=d-8wc2'); await expect(page.getByText('AÉROLYS 812', { exact: false })).toBeVisible();
  });
  test('compte sans voyage : état vide avec une issue', async ({ page }) => {
    await ouvrir(page, '/bagages', { connecte: 'adm-01', preparer: (e) => { e.monde.comptes.find((c) => c.id === 'adm-01')!.role = 'voyageur'; } });
    await expect(page.getByRole('heading', { name: 'Aucun voyage à venir' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Rechercher un vol' })).toBeVisible();
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/bagages', { connecte: ALEX });
    await expect(page.getByRole('heading', { level: 2, name: /2 bagages inclus/ })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('list', { name: /Étiquettes/ })).toBeInViewport({ ratio: 0.5 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('ajouter des bagages', () => {
  test('parcours nominal : 2 bagages les moins chers, achat, transfert, confirmation', async ({ page }) => {
    await ouvrir(page, '/bagages', { connecte: ALEX });
    await page.getByRole('link', { name: /Besoin de plus/ }).click(); await expect.poll(() => chemin(page)).toBe('/bagages/ajouter');
    await expect(page.getByRole('heading', { level: 1, name: 'Ajouter des bagages' })).toBeVisible();
    await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toBeVisible(); await expect(page.getByText('Même vol', { exact: true })).toBeVisible();
    await expect(page.getByText('AE 812 · 14 déc.')).toBeVisible();
    await expect(page.getByText('2 inclus + 2 ajoutés = 4 bagages en soute')).toBeVisible();
    await expect(page.getByText('Soute du vol 812 · 6 offres')).toBeVisible();
    await expect(page.getByText('2 × 150 $ = 300 $')).toBeVisible(); await expect(page.getByText('−115 $', { exact: false }).first()).toBeVisible();
    const cta = acheter(page, /^Acheter 2 bagages/); await expect(cta).toContainText('185 $'); await expect(cta).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${CAPTURES}/bagages-2.png` });
    await cta.click(); await expect.poll(() => chemin(page)).toBe('/bagages/transfere');

    await expect(page.getByRole('heading', { level: 2, name: 'Vos 2 bagages changent de mains.' })).toBeVisible();
    await expect(page.getByText('Étape 3 · en cours')).toBeVisible(); await expect(page.getByText('En attente de confirmation de la compagnie')).toBeVisible();
    await expect(page.getByText('185 $', { exact: true })).toBeVisible(); await expect(page.getByText('Bagage 1 · passager du vol 812')).toBeVisible();
    await expect(page.getByText(/Chacun enregistre ses propres bagages/)).toBeVisible(); await expect(page.getByText(/Sous réserve d’accord avec la compagnie/)).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/bagages-3.png`, fullPage: true });
    await page.getByRole('button', { name: /Simuler la confirmation/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '2 bagages ajoutés à votre réservation.' })).toBeVisible();
    await expect(page.getByText('4 bagages en soute pour Alex T. sur le vol 812.')).toBeVisible(); await expect(page.getByText('Confirmé par la compagnie (démo)')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/bagages-3b.png`, fullPage: true });

    const e = await lireEtat(page);
    expect(e.monde.bagages.filter((b) => b.detenteurId === ALEX && b.statut === 'transfere').map((b) => b.prix).sort()).toEqual([90, 95]);
    expect(e.monde.bagages.find((b) => b.id === 'b-2')!.statut).toBe('vendu');
    expect(e.monde.ecritures.filter((x) => x.compteId === 'ACC-0187').map((x) => x.montant)).toEqual([90, -11.25]);
    await page.getByRole('button', { name: 'Revenir à l’état en attente (démo)' }).click(); await expect(page.getByText('Étape 3 · en cours')).toBeVisible();
    await page.goto('/bagages'); await expect(page.getByRole('list', { name: /Étiquettes/ }).getByRole('listitem')).toHaveCount(4);
  });
  test('quantité : de 1 à 3, boutons bornés et clavier', async ({ page }) => {
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX });
    const moins = page.getByRole('button', { name: 'Retirer un bagage' }), plus = page.getByRole('button', { name: 'Ajouter un bagage' });
    await plus.focus(); await page.keyboard.press('Enter'); await expect(page.getByText('bagages en plus')).toBeVisible(); await expect(page.getByText('3', { exact: true }).first()).toBeVisible();
    await expect(plus).toBeDisabled(); await expect(acheter(page, /^Acheter 3 bagages/)).toContainText('285 $');
    await moins.click(); await moins.click(); await expect(moins).toBeDisabled(); await expect(page.getByText('bagage en plus', { exact: true })).toBeVisible();
    await expect(acheter(page, /^Acheter 1 bagage ·/)).toContainText('90 $'); await expect(page.getByText('1 ajouté = 3 bagages en soute')).toBeVisible();
  });
  test('un autre vol : l’achat est impossible, retour à son vol', async ({ page }) => {
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX });
    await page.getByRole('button', { name: 'Essayer avec un autre vol' }).click();
    const alerte = page.getByRole('alert').filter({ hasText: 'Vol différent' }); await expect(alerte).toBeVisible(); await expect(alerte).toContainText('Un bagage ne se transfère que sur le même vol (même numéro, même date).');
    await expect(page.getByText('Vol différent', { exact: true }).first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Achat impossible sur ce vol' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Achat impossible sur ce vol' }).click({ force: true }); await expect.poll(() => chemin(page)).toBe('/bagages/ajouter');
    await page.screenshot({ path: `${CAPTURES}/bagages-2b.png` });
    await page.getByRole('button', { name: 'Essayer encore un autre vol' }).click(); await expect(alerte).toBeVisible();
    await page.getByRole('button', { name: /Revenir à mon vol AE 812/ }).click(); await expect(page.getByText('Même vol', { exact: true })).toBeVisible();
    expect((await lireEtat(page)).monde.bagages.filter((b) => b.statut === 'achete')).toHaveLength(0);
  });
  test('plus aucune offre : message et achat désactivé', async ({ page }) => {
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX, preparer: (e) => { for (const b of e.monde.bagages) if (b.detenteurId !== ALEX) b.statut = 'vendu'; } });
    await expect(page.getByText('Aucun bagage disponible sur ce vol pour l’instant.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Aucun bagage à acheter' })).toHaveAttribute('aria-disabled', 'true');
  });
  test('hors ligne : l’achat est reporté avec un message', async ({ page, context }) => {
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX }); await context.setOffline(true);
    await acheter(page, /^Acheter 2 bagages/).click(); await expect(page.getByRole('alert').filter({ hasText: 'hors ligne' })).toBeVisible(); expect(chemin(page)).toBe('/bagages/ajouter');
    await context.setOffline(false);
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Bagages à ajouter' })).toBeInViewport({ ratio: 1 }); await expect(acheter(page, /^Acheter 2 bagages/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: 'Essayer avec un autre vol' }).click(); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('bagage transféré', () => {
  test('sans achat récent : état vide', async ({ page }) => {
    await ouvrir(page, '/bagages/transfere', { connecte: ALEX }); await expect(page.getByRole('heading', { name: 'Aucun transfert récent' })).toBeVisible();
  });
  test('rejouer l’animation, fermer, retour au voyage ; 320 px', async ({ page }) => {
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX }); await acheter(page, /^Acheter 2 bagages/).click(); await expect.poll(() => chemin(page)).toBe('/bagages/transfere');
    await page.getByRole('button', { name: 'Revoir le transfert' }).click(); await expect(page.getByRole('img', { name: /Deux étiquettes|2 étiquettes de bagage/ })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: 'Retour à mon voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/voyage/d-812');
  });
  test('mouvement réduit : pas d’animation longue', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrir(page, '/bagages/ajouter?droit=d-812', { connecte: ALEX }); await acheter(page, /^Acheter 2 bagages/).click(); await expect.poll(() => chemin(page)).toBe('/bagages/transfere');
    await expect(page.getByRole('button', { name: 'Simuler la confirmation' })).toBeVisible();
  });
});
