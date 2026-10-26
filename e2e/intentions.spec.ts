import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
/** L'instant « lundi 12 octobre 2026, 09:00 » de la démo (heure de Toronto, comme le navigateur des tests). */
const MAI = Date.parse('2026-10-12T09:00:00-04:00'), H = 3_600_000;
/** Les propositions du monde de départ sont datées sans fuseau côté Node : on les rend toutes valides (48 h) pour le navigateur. */
const fraiches = (e: Etat) => { const p = e.monde.intentions.find((i) => i.id === 'INT-4F7K')!.propositions; p[0].quand = MAI - 30 * H; p[1].quand = MAI - 23 * H; p[2].quand = MAI - 1 * H; };
const bouton = (page: Page, nom: RegExp | string) => page.getByRole('button', { name: nom });
const NOUVELLE = '/intention/nouvelle?de=YUL&vers=CDG&jour=2026-12-18';
const SOURCES_FONDS = (page: Page) => page.getByRole('radio');

test.describe('garde d’accès', () => {
  for (const r of ['/intention/nouvelle', '/intention/fonds', '/intentions', '/intentions/INT-4F7K/proposition/p-2', '/intentions/INT-4F7K/accord']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('dites votre prix', () => {
  test('le trajet, la fenêtre et les repères viennent de la recherche et du monde simulé', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX });
    await expect(page.getByRole('heading', { level: 1, name: 'Dites votre prix' })).toBeVisible();
    await expect(page.locator('#from')).toHaveValue('Montréal (YUL)'); await expect(page.locator('#to')).toHaveValue('Paris (CDG)');
    await expect(page.locator('#date-from')).toHaveValue('2026-12-15'); await expect(page.locator('#date-to')).toHaveValue('2026-12-20');
    await expect(page.getByText('Tout départ du 15 au 20 déc. vous convient')).toBeVisible();
    await expect(page.getByText('5 vendeurs compatibles · 0 à votre prix ou moins')).toBeVisible(); await expect(page.getByText('Chances d’accord : faibles')).toBeVisible();
    await expect(page.locator('#prix-range')).toHaveAttribute('max', '1890'); await expect(page.getByText('Meilleure revente actuelle')).toContainText('1 380 $');
    await expect(page.getByText('−37 % vs neuf')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/intentions-1.png`, fullPage: true });
  });
  test('le curseur change le prix, les chances et le bouton ; le clavier suffit', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX });
    const curseur = page.locator('#prix-range'); await curseur.focus(); await page.keyboard.press('End');
    await expect(page.getByText('Chances d’accord : bonnes')).toBeVisible(); await expect(page.getByText('5 vendeurs compatibles · 5 à votre prix ou moins')).toBeVisible();
    await expect(bouton(page, /^Réserver/)).toContainText('1 890 $'); await curseur.fill('1400'); await expect(page.getByText('Chances d’accord : moyennes')).toBeVisible();
    await expect(page.getByText('1 billet compatible est déjà à votre prix')).toBeVisible(); await expect(bouton(page, /^Réserver/)).toContainText('1 400 $');
  });
  test('options, validité, voyageurs, aller-retour', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX });
    const auto = page.getByRole('switch', { name: /Accepter automatiquement/ }); await expect(auto).toHaveAttribute('aria-checked', 'true'); await auto.click(); await expect(auto).toHaveAttribute('aria-checked', 'false'); await expect(page.getByText('Vous validerez chaque proposition à la main.')).toBeVisible();
    const anon = page.getByRole('switch', { name: /Rester anonyme/ }); await expect(page.getByText('Les vendeurs voient « A. », votre trajet et votre prix max.')).toBeVisible(); await anon.click(); await expect(page.getByText('Les vendeurs voient « Alex T. »')).toBeVisible();
    await page.getByRole('button', { name: '7 jours' }).click(); await expect(page.getByText(/Expire le 19 oct\. 2026/)).toBeVisible();
    await page.getByRole('button', { name: /Jusqu’à J-3/ }).click(); await expect(page.getByText(/Jusqu’au 12 déc\. 2026, trois jours avant/)).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un voyageur' }).click(); await expect(page.getByText('2 voyageurs')).toBeVisible(); await expect(bouton(page, /^Réserver/)).toContainText('2 400 $');
    await expect(bouton(page, 'Retirer un voyageur')).toBeEnabled(); await page.getByRole('button', { name: 'Aller-retour' }).click(); await page.getByRole('button', { name: 'Choisir les dates de retour' }).click(); await expect(page.locator('#ret-from')).toBeVisible();
    await page.getByLabel('Flexible').uncheck(); await expect(page.getByText('Seuls les billets datés exactement du 15 déc. ou du 20 déc.')).toBeVisible();
  });
  test('erreurs : aéroport inconnu, même départ et arrivée, fenêtre dans le passé', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX });
    await page.locator('#to').fill('Atlantide'); await expect(page.getByRole('alert').filter({ hasText: 'Aéroport d’arrivée inconnu' })).toBeVisible();
    await bouton(page, /^Réserver/).click({ force: true }); await expect(page.getByRole('alert').filter({ hasText: 'Corrigez les champs signalés' })).toBeVisible(); expect(chemin(page)).toBe('/intention/nouvelle');
    await page.locator('#to').fill('YUL'); await expect(page.getByRole('alert').filter({ hasText: 'doivent être différents' })).toBeVisible();
    await page.locator('#to').fill('Paris'); await page.locator('#date-from').fill('2026-10-01'); await expect(page.getByRole('alert').filter({ hasText: 'dans le passé' })).toBeVisible();
    await page.getByRole('button', { name: 'Inverser départ et arrivée' }).click(); await expect(page.locator('#from')).toHaveValue('Paris'); await expect(page.locator('#to')).toHaveValue('Montréal (YUL)');
  });
  test('sans paramètres : Montréal → Paris, et un trajet sans vol est refusé', async ({ page }) => {
    await ouvrir(page, '/intention/nouvelle', { connecte: ALEX }); await expect(page.locator('#to')).toHaveValue('Paris (CDG)');
    await page.locator('#to').fill('Tokyo'); await page.locator('#from').fill('Lisbonne'); await expect(page.getByRole('alert').filter({ hasText: 'Aucun vol connu sur ce trajet' })).toBeVisible();
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, NOUVELLE, { connecte: ALEX });
    await expect(page.getByText('Intention d’achat')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#to')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /^Réserver/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('réserver les fonds', () => {
  test('parcours : prix 1 300 $ → fonds → intention publiée, carte pré-autorisée sans débit', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX });
    await page.locator('#prix-range').fill('1300'); await bouton(page, /^Réserver/).click(); await expect.poll(() => chemin(page)).toBe('/intention/fonds');
    await expect(page.getByRole('heading', { level: 1, name: 'Réserver les fonds' })).toBeVisible(); await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toBeVisible();
    await expect(page.getByLabel('Montant réservé', { exact: false }).or(page.getByRole('region', { name: 'Fonds réservés' }))).toContainText('1 300 $');
    await expect(page.getByText('Non débité.')).toBeVisible(); await expect(page.getByText('Libéré automatiquement le 11 nov. 2026 si aucun accord.')).toBeVisible();
    await expect(page.getByText(/Carte •••• 4821 \(test\)/)).toBeVisible(); await expect(SOURCES_FONDS(page).first()).toBeChecked();
    await expect(page.getByText('Insuffisant : il manque 148 $')).toBeVisible(); await expect(page.locator('#src-balance')).toBeDisabled();
    await expect(page.getByText('Du 15 au 20 déc. · flexible')).toBeVisible(); await expect(page.getByText('Accord automatique ≤ 1 300 $ · propositions au-dessus acceptées · anonyme « A. »')).toBeVisible();
    await expect(page.getByText('Débité aujourd’hui : 0 $')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/intentions-2.png`, fullPage: true });
    await bouton(page, /Confirmer la réservation/).click(); await expect(page.getByRole('alert').filter({ hasText: 'Cochez cette case pour réserver les fonds.' })).toBeVisible(); expect(chemin(page)).toBe('/intention/fonds');
    await page.getByLabel(/Je comprends que les fonds sont réservés/).check(); await bouton(page, /Confirmer la réservation/).click(); await expect.poll(() => chemin(page)).toBe('/intentions');
    await expect(page.getByRole('tab', { name: 'Actives · 2' })).toHaveAttribute('aria-selected', 'true');
    const e = await lireEtat(page); const n = e.monde.intentions.find((i) => i.id !== 'INT-4F7K' && i.id !== 'INT-2B9X')!;
    expect(n).toMatchObject({ compteId: ALEX, de: 'YUL', vers: 'CDG', budget: 1300, fondsReserves: 1300, statut: 'publiee' }); expect(e.monde.comptes.find((c) => c.id === ALEX)!.solde).toBe(1152);
    expect((e.tranches.intentions as { details: Record<string, { source: string; du: string }> }).details[n.id]).toMatchObject({ source: 'carte', du: '2026-12-15' });
  });
  test('sur le solde NexG : le montant est mis de côté, puis libéré au retrait', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX, preparer: (e) => { e.monde.comptes.find((c) => c.id === ALEX)!.solde = 3000; } });
    await page.locator('#prix-range').fill('1300'); await bouton(page, /^Réserver/).click(); await expect.poll(() => chemin(page)).toBe('/intention/fonds');
    await page.locator('#src-balance').check(); await expect(page.getByText(/sont mis de côté sur votre solde NexG/)).toBeVisible();
    await page.getByLabel(/Je comprends/).check(); await bouton(page, /Confirmer la réservation/).click(); await expect.poll(() => chemin(page)).toBe('/intentions');
    let e = await lireEtat(page); expect(e.monde.comptes.find((c) => c.id === ALEX)).toMatchObject({ solde: 1700, enAttente: 1300 });
    await page.getByRole('button', { name: 'Retirer cette intention' }).first().click(); await bouton(page, 'Retirer (démo)').click(); await expect(page.getByText(/Intention retirée · 1\s300\s\$ libérés/)).toBeVisible();
    e = await lireEtat(page); expect(e.monde.comptes.find((c) => c.id === ALEX)).toMatchObject({ solde: 3000, enAttente: 0 }); expect(e.monde.ecritures.filter((x) => x.type === 'fonds_reserves').map((x) => x.montant)).toEqual([-1300, 1300]);
  });
  test('sans brouillon, on revient à « Dites votre prix »', async ({ page }) => {
    await ouvrir(page, '/intention/fonds', { connecte: ALEX }); await expect.poll(() => chemin(page)).toBe('/intention/nouvelle');
  });
  test('sans carte enregistrée : la source carte est signalée et le wallet choisi', async ({ page }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX, preparer: (e) => { e.monde.comptes.find((c) => c.id === ALEX)!.carte4 = undefined; } });
    await page.locator('#prix-range').fill('1300'); await page.getByRole('button', { name: /^Réserver/ }).click(); await expect.poll(() => chemin(page)).toBe('/intention/fonds');
    await expect(page.getByText('Aucune carte enregistrée.')).toBeVisible(); await expect(page.locator('#src-card')).toBeDisabled(); await expect(page.locator('#src-wallet')).toBeChecked();
    await page.getByRole('link', { name: 'Ajouter une carte' }).click(); await expect.poll(() => chemin(page)).toBe('/carte');
  });
  test('hors ligne : la réservation est reportée avec un message', async ({ page, context }) => {
    await ouvrir(page, NOUVELLE, { connecte: ALEX }); await page.getByRole('button', { name: /^Réserver/ }).click(); await expect.poll(() => chemin(page)).toBe('/intention/fonds');
    await page.getByLabel(/Je comprends/).check(); await context.setOffline(true); await bouton(page, /Confirmer la réservation/).click();
    await expect(page.getByRole('alert').filter({ hasText: 'hors ligne' })).toBeVisible(); expect(chemin(page)).toBe('/intention/fonds'); await context.setOffline(false);
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, NOUVELLE, { connecte: ALEX }); await page.getByRole('button', { name: /^Réserver/ }).click(); await expect.poll(() => chemin(page)).toBe('/intention/fonds');
    await expect(page.getByText('Montant réservé')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /Confirmer la réservation/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('mes intentions et propositions', () => {
  test('actives : billet, propositions avec écart signé, ce que voient les vendeurs', async ({ page }) => {
    await ouvrir(page, '/intentions', { connecte: ALEX, preparer: fraiches });
    await expect(page.getByRole('heading', { level: 1, name: 'Mes intentions' })).toBeVisible();
    for (const t of ['Actives · 1', 'Conclues · 1', 'Expirées · 0']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
    const billet = page.getByRole('region', { name: /Intention INT-4F7K/ }); await expect(billet).toContainText('15–20 déc. 2026 · aller simple · 1 voyageur'); await expect(billet).toContainText('1 300 $'); await expect(billet).toContainText('3 propositions');
    await expect(billet).toContainText('Fonds réservés'); await expect(billet).toContainText('Expire dans 30 j'); await expect(billet).toContainText('Accord auto ≤ 1 300 $');
    const l = page.getByRole('link', { name: /^Proposition à/ }); await expect(l).toHaveCount(3);
    await expect(l.nth(0)).toContainText('= votre prix'); await expect(l.nth(0)).toContainText('Au prix : accord automatique en cours');
    await expect(l.nth(1)).toContainText('1 380 $'); await expect(l.nth(1)).toContainText('+80 $'); await expect(l.nth(1)).toContainText('Au-dessus de votre prix'); await expect(l.nth(1)).toContainText('Nordelle 224 · 1 escale (KEF)');
    await expect(l.nth(2)).toContainText('+200 $'); await expect(page.getByText('5 vendeurs compatibles')).toBeVisible();
    const vues = page.getByRole('complementary', { name: 'Ce que voient les vendeurs' }); await expect(vues).toContainText('A.'); await expect(vues).toContainText('YUL → CDG · 15–20 déc.'); await expect(vues).not.toContainText('Tremblay'); await expect(vues).toContainText('Jamais votre nom complet');
    await page.screenshot({ path: `${CAPTURES}/intentions-3.png`, fullPage: true });
    await l.nth(1).click(); await expect.poll(() => chemin(page)).toBe('/intentions/INT-4F7K/proposition/p-2');
  });
  test('propositions expirées (48 h) : visibles, grisées, sans lien', async ({ page }) => {
    await ouvrir(page, '/intentions', { connecte: ALEX, preparer: (e) => { fraiches(e); e.monde.intentions.find((i) => i.id === 'INT-4F7K')!.propositions[0].quand = MAI - 60 * H; } });
    await expect(page.getByRole('link', { name: /^Proposition à/ })).toHaveCount(2); await expect(page.getByRole('group', { name: /1 500 \$.*expirée/ })).toContainText('Expirée'); await expect(page.getByText('2 propositions')).toBeVisible();
  });
  test('onglets au clavier : conclues puis expirées (état vide)', async ({ page }) => {
    await ouvrir(page, '/intentions', { connecte: ALEX, preparer: fraiches });
    await page.getByRole('tab', { name: 'Actives · 1' }).focus(); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name: 'Conclues · 1' })).toBeFocused();
    const accord = page.getByRole('link', { name: /Accord conclu YUL vers HAV à 350 \$/ }); await expect(accord).toContainText('Nordelle · accord du 2 oct. 2026'); await expect(accord).toContainText('INT-2B9X'); await expect(accord).toContainText('Prix max demandé : 350 $ · 0 $ de plus'); await expect(accord).toContainText('En vente');
    await expect(page.getByText('Ce droit de voyage est dans votre portefeuille. À nommer avant le 29 janv. 2027.')).toBeVisible();
    await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tabpanel')).toContainText('Aucune intention expirée'); await expect(page.getByText('les fonds sont libérés automatiquement')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/intentions-3b.png` }); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tab', { name: 'Actives · 1' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Conclues · 1' }).click(); await accord.click(); await expect.poll(() => chemin(page)).toBe('/intentions/INT-2B9X/accord');
  });
  test('retirer : confirmation, fonds libérés, propositions déclinées', async ({ page }) => {
    await ouvrir(page, '/intentions', { connecte: ALEX, preparer: fraiches });
    await page.getByRole('button', { name: 'Retirer cette intention' }).click(); const r = page.getByRole('region', { name: 'Retirer l’intention' });
    await expect(r).toContainText('Les 3 propositions seront déclinées et les 1 300 $ réservés seront libérés immédiatement.');
    await bouton(page, 'Garder').click(); await expect(r).toBeHidden(); await page.getByRole('button', { name: 'Retirer cette intention' }).click(); await bouton(page, 'Retirer (démo)').click();
    await expect(page.getByText('Intention retirée · 1 300 $ libérés')).toBeVisible(); await expect(page.getByRole('tab', { name: 'Actives · 0' })).toBeVisible(); await expect(page.getByText('Aucune intention active')).toBeVisible();
    const e = await lireEtat(page); const i = e.monde.intentions.find((x) => x.id === 'INT-4F7K')!; expect(i.statut).toBe('annulee'); expect(i.fondsReserves).toBe(0); expect(i.propositions.map((p) => p.statut)).toEqual(['refusee', 'refusee', 'refusee']);
    expect((e.tranches.intentions as { fins: Record<string, string> }).fins['INT-4F7K']).toBe('retiree');
    await page.getByRole('tab', { name: 'Expirées · 0' }).click(); await expect(page.getByText('Aucune intention expirée')).toBeVisible();
  });
  test('expiration : à la fin de la validité l’intention passe dans « Expirées », fonds libérés, republier en un geste', async ({ page }) => {
    await ouvrir(page, '/intentions?maintenant=2026-11-15T10:00', { connecte: ALEX, preparer: (e) => { e.monde.comptes.find((c) => c.id === ALEX)!.solde = 1152; } });
    await expect(page.getByRole('tab', { name: 'Expirées · 1' })).toBeVisible(); await expect(page.getByRole('tab', { name: 'Actives · 0' })).toBeVisible();
    await page.getByRole('tab', { name: 'Expirées · 1' }).click(); await expect(page.getByText('INT-4F7K')).toBeVisible(); await expect(page.getByText(/aucun accord, fonds libérés/)).toBeVisible();
    await page.getByRole('button', { name: 'Republier' }).click(); await expect.poll(() => chemin(page)).toBe('/intention/nouvelle'); await expect(page.locator('#to')).toHaveValue('Paris (CDG)'); await expect(page.locator('#date-from')).toHaveValue('2026-12-15');
  });
  test('nouvelle intention : le « + » et le bouton mènent à « Dites votre prix »', async ({ page }) => {
    await ouvrir(page, '/intentions', { connecte: ALEX }); await page.getByRole('link', { name: 'Nouvelle intention' }).first().click(); await expect.poll(() => chemin(page)).toBe('/intention/nouvelle');
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/intentions', { connecte: ALEX, preparer: fraiches });
    await expect(page.getByRole('tab', { name: 'Actives · 1' })).toBeInViewport({ ratio: 1 }); await expect(page.getByText('Le billet que vous cherchez')).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('link', { name: 'Nouvelle intention' }).last()).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('une proposition reçue', () => {
  const P2 = '/intentions/INT-4F7K/proposition/p-2';
  test('le billet, l’écart, le minuteur et le vendeur viennent du monde simulé', async ({ page }) => {
    await ouvrir(page, P2, { connecte: ALEX, preparer: fraiches });
    await expect(page.getByRole('heading', { level: 1, name: 'Proposition reçue' })).toBeVisible(); await expect(page.getByText('Nordelle · Vol 224')).toBeVisible();
    await expect(page.getByText('Vendredi 18 décembre 2026 · dans votre fenêtre 15–20 déc.')).toBeVisible(); await expect(page.getByText('+80 $ vs votre max')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText(/^2[45]:\d\d:\d\d$/); await expect(page.getByText('Le vendeur s’est engagé 48 h.')).toBeVisible();
    await expect(page.getByText('+80 $ (+6 %)')).toBeVisible(); await expect(page.getByText('−27 %')).toBeVisible(); await expect(page.getByText(/la différence \(80\s\$\) est débitée en plus des fonds réservés/)).toBeVisible();
    await expect(page.getByText('Détenteur vérifié · « P. »')).toBeVisible(); await expect(page.getByText('1er détenteur de ce billet · identité vérifiée par NexG-TT')).toBeVisible();
    await expect(bouton(page, /^Accepter 1 380 \$ \(démo\)/)).toBeVisible(); await expect(bouton(page, 'Contre-proposer')).toBeVisible(); await expect(bouton(page, 'Refuser cette proposition')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/intentions-4.png`, fullPage: true });
  });
  test('contre-proposer : entre le prix max et la proposition, par pas de 10 $', async ({ page }) => {
    await ouvrir(page, P2, { connecte: ALEX, preparer: fraiches });
    await bouton(page, 'Contre-proposer').click(); const c = page.locator('#counter-range'); await expect(c).toHaveAttribute('min', '1300'); await expect(c).toHaveAttribute('max', '1380'); await expect(c).toHaveValue('1340');
    await expect(page.getByText('−40 $ vs proposition')).toBeVisible(); await c.fill('1350'); await expect(page.getByRole('region').or(page.locator('section')).filter({ hasText: 'Contre-proposer' }).first()).toContainText('1 350 $');
    await page.screenshot({ path: `${CAPTURES}/intentions-4b.png`, fullPage: true });
    await bouton(page, /^Envoyer/).click(); await expect(page.getByRole('status').filter({ hasText: 'Contre-proposition de 1 350 $ envoyée.' })).toBeVisible(); await expect(page.getByText(/Vous pouvez toujours accepter 1\s380\s\$/)).toBeVisible();
    await expect(bouton(page, 'Modifier ma contre-proposition')).toBeVisible(); await expect(bouton(page, /^Accepter 1 380/)).toBeVisible();
    expect(((await lireEtat(page)).tranches.intentions as { contres: { propositionId: string; prix: number }[] }).contres).toMatchObject([{ propositionId: 'p-2', prix: 1350 }]);
  });
  test('refuser : le vendeur est informé, l’intention reste active', async ({ page }) => {
    await ouvrir(page, P2, { connecte: ALEX, preparer: fraiches });
    await bouton(page, 'Refuser cette proposition').click(); await expect(page.getByRole('status').filter({ hasText: 'Proposition refusée.' })).toContainText('Votre intention reste active avec 2 autres propositions.');
    await expect(bouton(page, /^Accepter/)).toHaveCount(0); await expect(page.getByRole('timer')).toHaveCount(0);
    expect((await lireEtat(page)).monde.intentions.find((i) => i.id === 'INT-4F7K')!.propositions.map((p) => p.statut)).toEqual(['recue', 'refusee', 'recue']);
    await bouton(page, 'Retour aux propositions').click(); await expect.poll(() => chemin(page)).toBe('/intentions'); await expect(page.getByRole('tab', { name: 'Actives · 1' })).toBeVisible();
  });
  test('une proposition à votre prix : ni écart au-dessus, ni contre-proposition', async ({ page }) => {
    await ouvrir(page, '/intentions/INT-4F7K/proposition/p-3', { connecte: ALEX, preparer: fraiches });
    await expect(page.getByText('= votre prix', { exact: false }).first()).toBeVisible(); await expect(bouton(page, 'Contre-proposer')).toHaveCount(0); await expect(page.getByText(/est débitée en plus/)).toHaveCount(0); await expect(bouton(page, /^Accepter 1 300 \$/)).toBeVisible();
  });
  test('proposition expirée ou inconnue : message et retour', async ({ page }) => {
    await ouvrir(page, P2, { connecte: ALEX, preparer: (e) => { fraiches(e); e.monde.intentions.find((i) => i.id === 'INT-4F7K')!.propositions[1].quand = MAI - 60 * H; } });
    await expect(page.getByText('Proposition expirée.')).toBeVisible(); await expect(bouton(page, /^Accepter/)).toHaveCount(0); await expect(bouton(page, 'Retour aux propositions')).toBeVisible();
    await page.goto('/intentions/INT-4F7K/proposition/zzz'); await expect(page.getByRole('heading', { name: 'Proposition introuvable' })).toBeVisible();
  });
  test('première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, P2, { connecte: ALEX, preparer: fraiches });
    await expect(page.getByText('Proposition du vendeur')).toBeInViewport({ ratio: 1 }); await expect(page.getByText('+80 $ vs votre max')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /^Accepter/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true); await bouton(page, 'Contre-proposer').click(); await page.waitForTimeout(200); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('accord conclu', () => {
  test('accepter 1 380 $ : vente immédiate, droit au portefeuille, accord', async ({ page }) => {
    await ouvrir(page, '/intentions/INT-4F7K/proposition/p-2', { connecte: ALEX, preparer: fraiches });
    await bouton(page, /^Accepter 1 380/).click(); await expect.poll(() => chemin(page)).toBe('/intentions/INT-4F7K/accord');
    await expect(page.getByRole('heading', { level: 1, name: 'Accord conclu' })).toBeVisible(); await expect(page.getByText('Vous détenez ce droit de voyage')).toBeVisible(); await expect(page.getByText('Nordelle · Vol 224')).toBeVisible();
    await expect(page.getByText('Prix de l’accord')).toBeVisible(); await expect(page.getByText('À nommer', { exact: true })).toBeVisible();
    const fonds = page.getByRole('region').filter({ hasText: 'Vos fonds réservés' }).or(page.locator('section').filter({ hasText: 'Vos fonds réservés' })).first();
    await expect(fonds).toContainText('Réservés le'); await expect(fonds).toContainText('1 300 $'); await expect(fonds).toContainText('Capturés pour cet accord'); await expect(fonds).toContainText('+80 $'); await expect(fonds).toContainText('Total payé'); await expect(fonds).toContainText('1 380 $');
    await expect(fonds).toContainText('Carte •••• 4821 (test) · reçu de démo'); await expect(fonds).toContainText('Intention INT-4F7K fermée ; les 2 autres propositions ont été déclinées automatiquement.');
    await expect(page.getByText('Nommer le voyageur avant le 17 déc. 21:40.')).toBeVisible(); await expect(page.getByText('Fait à l’instant. Vous êtes le 2e détenteur de ce droit de voyage.')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/intentions-5.png`, fullPage: true });
    const e = await lireEtat(page); const d = e.monde.droits.find((x) => x.id === 'd-r224')!; expect([d.detenteurId, d.prixPaye, d.statut]).toEqual([ALEX, 1380, 'detenu']);
    expect(e.monde.intentions.find((i) => i.id === 'INT-4F7K')).toMatchObject({ statut: 'accord', fondsReserves: 0 }); expect(e.monde.comptes.find((c) => c.id === 'ACC-0233')!.solde).toBe(1242);
    expect(e.monde.ecritures.filter((x) => x.compteId === 'ACC-0233').map((x) => [x.type, x.montant])).toEqual([['revente', 1380], ['commission', -138]]);
    await bouton(page, 'Nommer le voyageur').or(page.getByRole('button', { name: 'Nommer le voyageur' })).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-r224');
  });
  test('accord du monde de départ (INT-2B9X) : 350 $, droit détenu, portefeuille', async ({ page }) => {
    await ouvrir(page, '/intentions/INT-2B9X/accord', { connecte: ALEX });
    await expect(page.getByText('NXG-2HV6')).toBeVisible(); await expect(page.getByText('350 $').first()).toBeVisible(); await expect(page.getByText('Nommer le voyageur avant le 29 janv. 08:15.')).toBeVisible();
    await expect(page.getByText(/Vous êtes le 2e détenteur/)).toBeVisible(); await page.getByRole('link', { name: 'Voir mon portefeuille' }).click(); await expect.poll(() => chemin(page)).toBe('/portefeuille');
  });
  test('sans accord : message et retour aux intentions', async ({ page }) => {
    await ouvrir(page, '/intentions/INT-4F7K/accord', { connecte: ALEX }); await expect(page.getByRole('heading', { name: 'Pas encore d’accord' })).toBeVisible(); await page.getByRole('button', { name: 'Mes intentions' }).click(); await expect.poll(() => chemin(page)).toBe('/intentions');
  });
  test('mouvement réduit, première vue 390 × 700 et 320 px sans débordement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/intentions/INT-2B9X/accord', { connecte: ALEX });
    await expect(page.getByText('Vous détenez ce droit de voyage')).toBeInViewport({ ratio: 1 }); await expect(page.getByText('Prix de l’accord')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, 'Nommer le voyageur')).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
  });
});
