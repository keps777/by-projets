// Recherche : formulaire, résultats (neuf, revente, agences, drops), détail d'une offre, vitrine d'agence. Mobile 390 × 844 ; captures dans /tmp à comparer aux planches m3-03, 04, 05 et 08.
import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
/** Le drop du seed expire 4 minutes après « maintenant » en UTC ; le navigateur de test est à Montréal : on le prolonge d'un jour. */
const dropActif = (e: Etat) => { for (const d of e.monde.drops) d.fin += 86_400_000; };
const dans = (page: Page, sel: string) => page.locator(sel);
/** Texte d'un montant : les espaces sont insécables dans l'application. */
const montant = (s: string) => new RegExp(s.replace(/ /g, '\\s').replace('$', '\\$'));

test.describe('Rechercher', () => {
  test('sans compte, l’écran est lisible ; première vue à 390 × 700 : trajet, dates, voyageurs et action principale visibles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrir(page, '/rechercher');
    await expect(page.getByRole('heading', { name: 'Rechercher', level: 1 })).toBeVisible();
    await expect(page.locator('#from')).toHaveValue('Montréal (YUL)');
    for (const t of ['Départ', 'Arrivée', 'Aller simple', 'Aller-retour', 'Date de départ', 'Voyageurs']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    const bouton = page.getByRole('button', { name: 'Rechercher', exact: true }), nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(bouton).toBeVisible();
    const b = (await bouton.boundingBox())!, n = (await nav.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.height).toBeLessThanOrEqual(n.y + 1); expect(b.height).toBeGreaterThanOrEqual(44);
    // le sélecteur de voyageurs n'est pas recouvert par la barre d'action
    const pax = (await page.locator('.pax').boundingBox())!; expect(pax.y + pax.height).toBeLessThanOrEqual(b.y + 1);
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/recherche-1-premiere-vue.png' });
  });

  test('autocomplétion : « par » propose Paris, flèches et Entrée choisissent ; « Partout » est proposé pour l’arrivée', async ({ page }) => {
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    const arrivee = page.locator('#to');
    await arrivee.click(); await expect(page.getByRole('listbox', { name: /Arrivée/ })).toBeVisible();
    await expect(page.getByRole('option').first()).toHaveText(/Partout/);
    await expect(page.getByRole('option', { name: /Montréal/ })).toHaveCount(0); // le départ est exclu
    await arrivee.fill('pari');
    await expect(page.getByRole('option')).toHaveCount(1); await expect(page.getByRole('option', { name: /Paris \(CDG\)/ })).toBeVisible();
    await expect(arrivee).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(arrivee).toHaveValue('Paris (CDG)'); await expect(page.locator('.gros').nth(1)).toHaveText('CDG'); await expect(arrivee).toHaveAttribute('aria-expanded', 'false');
    await arrivee.fill('mex'); await page.getByRole('option', { name: /Mexico \(MEX\)/ }).click(); await expect(arrivee).toHaveValue('Mexico (MEX)');
    await arrivee.click(); await page.getByRole('option', { name: /Partout/ }).click(); await expect(arrivee).toHaveValue('Partout'); await expect(page.locator('.gros').nth(1)).toHaveText('···');
    await arrivee.fill('zzz'); await expect(page.getByRole('status').filter({ hasText: 'Aucune suggestion' })).toBeAttached();
    // Échap ferme la liste
    await arrivee.fill('par'); await page.keyboard.press('Escape'); await expect(arrivee).toHaveAttribute('aria-expanded', 'false');
  });

  test('inverser départ et arrivée', async ({ page }) => {
    await ouvrir(page, '/rechercher?de=YUL&vers=CDG&jour=2026-12-18&n=1', { connecte: ALEX });
    await expect(page.locator('#to')).toHaveValue('Paris (CDG)');
    await page.getByRole('button', { name: 'Inverser départ et arrivée' }).click();
    await expect(page.locator('#from')).toHaveValue('Paris (CDG)'); await expect(page.locator('#to')).toHaveValue('Montréal (YUL)');
    await page.locator('#to').click(); await page.getByRole('option', { name: /Partout/ }).click();
    await page.getByRole('button', { name: 'Inverser départ et arrivée' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Impossible d.inverser/ })).toBeVisible(); await expect(page.locator('#from')).toHaveValue('Paris (CDG)');
  });

  test('calendrier accessible : ouverture, clavier, mois, jours sans passé, choix', async ({ page }) => {
    await ouvrir(page, '/rechercher?de=YUL&vers=CDG', { connecte: ALEX });
    await expect(page.locator('#flex3')).toBeDisabled();
    await page.locator('#date-out').click();
    const cal = page.getByRole('dialog', { name: 'Date de départ' }); await expect(cal).toBeVisible();
    await expect(cal.getByRole('grid')).toBeVisible();
    await expect(cal.getByText('octobre 2026')).toBeVisible();
    await expect(cal.getByRole('button', { name: /11 octobre 2026/ })).toBeDisabled(); // hier
    await expect(cal.getByRole('button', { name: /12 octobre 2026, aujourd’hui/ })).toBeEnabled();
    await expect(cal.getByRole('button', { name: 'Mois précédent' })).toBeDisabled();
    await cal.getByRole('button', { name: 'Mois suivant' }).click(); await cal.getByRole('button', { name: 'Mois suivant' }).click();
    await expect(cal.getByText('décembre 2026')).toBeVisible();
    await expect(cal.getByRole('button', { name: /Vendredi 18 décembre 2026, vols disponibles/ })).toBeVisible();
    await expect(cal.getByRole('button', { name: /Samedi 19 décembre 2026$/ })).toBeVisible(); // pas de vol pour Paris ce jour-là
    // clavier : on se place sur le 18, flèches, puis Entrée
    await cal.getByRole('button', { name: /Vendredi 18 décembre 2026/ }).focus();
    await page.keyboard.press('ArrowRight'); await expect(cal.getByRole('button', { name: /Samedi 19 décembre/ })).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(cal.getByRole('button', { name: /Samedi 26 décembre/ })).toBeFocused();
    await page.keyboard.press('PageDown'); await expect(cal.getByText('janvier 2027')).toBeVisible(); await expect(cal.getByRole('button', { name: /Lundi 26 janvier 2027|Mardi 26 janvier 2027/ })).toBeFocused();
    await page.keyboard.press('PageUp'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await expect(cal.getByRole('button', { name: /Vendredi 18 décembre/ })).toBeFocused();
    await page.screenshot({ path: '/tmp/recherche-2-calendrier.png' });
    await page.keyboard.press('Enter');
    await expect(cal).toBeHidden(); await expect(page.locator('#date-out')).toHaveText(/ven\. 18 déc\. 2026/); await expect(page.locator('#date-out')).toBeFocused();
    await expect(page.locator('#flex3')).toBeEnabled(); await page.locator('#flex3').check();
    // Échap ferme sans changer ; « Toutes les dates » efface
    await page.locator('#date-out').click(); await page.keyboard.press('Escape'); await expect(page.locator('#date-out')).toHaveText(/18 déc\. 2026/);
    await page.locator('#date-out').click(); await page.getByRole('button', { name: 'Toutes les dates' }).click(); await expect(page.locator('#date-out')).toHaveText(/Toutes les dates/); await expect(page.locator('#flex3')).toBeDisabled();
  });

  test('erreurs de validation : annoncées avec icône et texte, focus sur le premier champ en erreur', async ({ page }) => {
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    const go = page.getByRole('button', { name: 'Rechercher', exact: true });
    await go.click();
    const e1 = page.getByRole('alert').filter({ hasText: 'Choisissez une destination, ou « Partout ».' }); await expect(e1).toBeVisible(); await expect(e1.locator('svg')).toBeVisible();
    await expect(page.locator('#to')).toBeFocused(); await expect(page.locator('#to')).toHaveAttribute('aria-invalid', 'true'); await expect(chemin(page)).toBe('/rechercher');
    // un texte qui ne désigne aucun aéroport
    await page.locator('#to').fill('Atlantide'); await page.locator('#from').click(); await go.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choisissez un aéroport dans la liste.' })).toBeVisible();
    // l'erreur disparaît dès qu'on corrige
    await page.locator('#to').fill('Rome'); await page.getByRole('option', { name: /Rome \(FCO\)/ }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
    // aller-retour sans date de retour
    await page.getByRole('button', { name: 'Aller-retour' }).click(); await expect(page.locator('#date-back')).toBeVisible(); await go.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choisissez la date de retour.' })).toBeVisible(); await expect(page.locator('#date-back')).toBeFocused();
    await page.getByRole('button', { name: 'Aller simple' }).click();
    // aucune source
    for (const id of ['#src-new', '#src-resale', '#src-agency', '#src-drops']) await page.locator(id).uncheck();
    await go.click(); await expect(page.getByRole('alert').filter({ hasText: 'Cochez au moins une source' })).toBeVisible();
    await page.screenshot({ path: '/tmp/recherche-3-erreurs.png', fullPage: true });
  });

  test('erreurs : départ = arrivée, date passée (adresse préremplie), retour avant le départ', async ({ page }) => {
    await ouvrir(page, '/rechercher?de=YUL&vers=YUL&jour=2026-10-01', { connecte: ALEX });
    const go = page.getByRole('button', { name: 'Rechercher', exact: true });
    await expect(page.locator('#to')).toHaveValue('Montréal (YUL)');
    await go.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Le départ et l’arrivée sont identiques.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /Cette date est passée/ })).toBeVisible();
    await expect(chemin(page)).toBe('/rechercher');
  });

  test('voyageurs : 1 à 9, le bouton « retirer » est inactif à 1', async ({ page }) => {
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    const moins = page.getByRole('button', { name: 'Retirer un adulte' }), plus = page.getByRole('button', { name: 'Ajouter un adulte' }), v = page.locator('.pax-v');
    await expect(v).toHaveText(/1\s+adulte$/); await expect(moins).toHaveAttribute('aria-disabled', 'true'); await moins.click({ force: true }); await expect(v).toHaveText(/1\s+adulte$/);
    await plus.click(); await expect(v).toHaveText(/2\s+adultes/); for (let i = 0; i < 10; i++) await plus.click({ force: true }); await expect(v).toHaveText(/9\s+adultes/); await expect(plus).toHaveAttribute('aria-disabled', 'true');
  });

  test('parcours nominal : Paris, 18 décembre, 1 voyageur → résultats ; la recherche est mémorisée', async ({ page }) => {
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Recherches récentes' })).toBeVisible();
    await expect(page.locator('[data-recente="0"]')).toContainText('PUJ'); await expect(page.locator('[data-recente="0"]')).toContainText('Montréal → Punta Cana'); await expect(page.locator('[data-recente="0"]')).toContainText(/févr\. 2027 · 2\svoyageurs/);
    await expect(page.locator('[data-recente="1"]')).toContainText(/mai 2027 · 1\svoyageur · ±3\sjours/);
    await page.locator('#to').fill('paris'); await page.getByRole('option', { name: /Paris \(CDG\)/ }).click();
    await page.locator('#date-out').click(); await page.getByRole('dialog').getByRole('button', { name: 'Mois suivant' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Mois suivant' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Vendredi 18 décembre 2026/ }).click();
    await page.screenshot({ path: '/tmp/recherche-1b-rempli.png' });
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect.poll(() => page.url().replace(/^.*\/\/[^/]+/, '')).toBe('/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1');
    const e = await lireEtat(page); expect((e.tranches.recherche as { recentes: { vers: string }[] }).recentes[0].vers).toBe('CDG');
    await page.goBack(); await expect(page.locator('[data-recente="0"]')).toContainText('CDG');
  });

  test('une recherche récente rouvre ses résultats ; « Effacer » les retire ; l’intention d’achat est proposée', async ({ page }) => {
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    await page.getByRole('link', { name: /Intention d.achat|intention d.achat à votre prix/ }).click(); await expect.poll(() => chemin(page)).toBe('/intention/nouvelle');
    await page.goBack();
    await page.locator('[data-recente="0"]').click(); await expect.poll(() => page.url()).toContain('/resultats?de=YUL&vers=PUJ&jour=2027-02-21&n=2'); await expect(page.getByText(/2\svoyageurs/).first()).toBeVisible();
    await page.goBack(); await page.getByRole('button', { name: 'Effacer' }).click(); await expect(page.getByRole('heading', { name: 'Recherches récentes' })).toHaveCount(0);
  });

  test('options : aller-retour, ±3 jours, sources et revendables partent dans l’adresse', async ({ page }) => {
    await ouvrir(page, '/rechercher?de=YUL&vers=CDG&jour=2026-12-18&n=1', { connecte: ALEX });
    await page.locator('#flex3').check(); await page.getByRole('button', { name: 'Aller-retour' }).click();
    await page.locator('#date-back').click(); const cal = page.getByRole('dialog', { name: 'Date de retour' });
    await expect(cal.getByText('décembre 2026')).toBeVisible(); await expect(cal.getByRole('button', { name: /Jeudi 17 décembre 2026/ })).toBeDisabled(); // pas avant le départ
    await cal.getByRole('button', { name: 'Mois suivant' }).click(); await cal.getByRole('button', { name: /Lundi 4 janvier 2027/ }).click();
    await expect(page.locator('#date-back')).toHaveText(/4 janv\. 2027/);
    await page.locator('#src-new').uncheck(); await page.locator('#src-drops').uncheck(); await page.getByRole('switch', { name: /Seulement les billets revendables/ }).click();
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await expect.poll(() => page.url().replace(/^.*\/\/[^/]+/, '')).toBe('/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1&flex=1&retour=2027-01-04&src=revente%2Cagence&rev=1');
  });

  test('320 px : aucun débordement horizontal (formulaire, calendrier, erreurs)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/rechercher', { connecte: ALEX });
    expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: 'Aller-retour' }).click(); await page.getByRole('button', { name: 'Rechercher', exact: true }).click(); expect(await sansDebordement(page)).toBe(true);
    await page.locator('#date-out').click(); expect(await sansDebordement(page)).toBe(true);
    const box = (await page.getByRole('dialog').boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(321);
  });
});

test.describe('Résultats', () => {
  const R = '/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1';
  test('YUL → CDG le 18 décembre : en-tête, onglets, baromètre et cartes issues du marché', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    await expect(page.getByText('YUL → CDG', { exact: true })).toBeVisible(); await expect(page.getByText(/ven\. 18 déc\. · 1\svoyageur/)).toBeVisible();
    const onglets = page.getByRole('group', { name: 'Filtrer par source' });
    await expect(onglets.getByRole('button', { name: /^Tous 9$/ })).toHaveAttribute('aria-pressed', 'true');
    for (const [nom, n] of [['Revente', 5], ['Neuf', 3], ['Agences', 1], ['Drops', 0]] as const) await expect(onglets.getByRole('button', { name: new RegExp(`^${nom} ${n}$`) })).toBeVisible();
    const baro = page.getByRole('region', { name: 'Baromètre du marché' });
    await expect(baro).toContainText('Prix indicatifs'); await expect(baro).toContainText(montant('6 offres sous le prix équivalent neuf, dès 1 380 $.'));
    await expect(baro.getByRole('img')).toHaveAttribute('aria-label', /Échelle de 1\s300\s\$ à 2\s300\s\$\. Offres : .*1\s500\s\$ \(meilleure affaire\).*Prix équivalent neuf : 2\s050\s\$\./);
    await expect(baro.getByText(montant('Neuf 2 050 $'))).toBeVisible();
    await expect(page.getByText(/9 offres · prix par voyageur/)).toBeVisible();
    // « Meilleure affaire » : la revente la moins chère du vol direct
    const best = dans(page, '[data-offre="revente:d-r816"]');
    await expect(best).toContainText('Meilleure affaire'); await expect(best).toContainText('Prix le plus bas en direct'); await expect(best).toContainText('Revente · détenteur vérifié');
    await expect(best).toContainText('18:05'); await expect(best).toContainText('07:10'); await expect(best).toContainText('+1'); await expect(best).toContainText(/7\sh\s05/); await expect(best).toContainText('Direct');
    await expect(best).toContainText('Revendable'); await expect(best).toContainText('Nominatif à J-1'); await expect(best).toContainText('Aérolys'); await expect(best).toContainText('Vol 816 · Économie');
    await expect(best).toContainText(montant('1 500 $')); await expect(best).toContainText(/−27\s%\svs neuf/);
    await expect(dans(page, '[data-offre="neuf:v-ae816"]')).toContainText('Neuf · émis via NexG-TT'); await expect(dans(page, '[data-offre="neuf:v-ae816"]')).toContainText('Prix neuf de référence');
    const ag = dans(page, '[data-offre="agence:oa-1"]'); await expect(ag).toContainText('Vendu par Agence Horizon (exemple)'); await expect(ag).toContainText('Offre d’agence partenaire'); await expect(ag).toContainText(montant('1 690 $')); await expect(ag).toContainText(/1\sescale · KEF/); await expect(ag).toContainText(/11\sh\s15/);
    await expect(dans(page, '[data-offre="revente:d-r224"]')).toContainText(montant('1 380 $')); await expect(dans(page, '[data-offre="revente:d-r224"]')).toContainText(/10\sh\s15/);
    await expect(page.getByText('Trop cher ? Dites votre prix')).toBeVisible(); await expect(page.getByText('Fonds réservés')).toBeVisible(); await expect(page.getByText('Aucun débit sans accord')).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/recherche-4-resultats.png' }); await page.screenshot({ path: '/tmp/recherche-4b-resultats-complet.png', fullPage: true });
  });

  test('un vol par groupe d’offres : les offres d’un même vol se suivent, les directs d’abord', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    const ids = await page.locator('[data-offre]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.offre!));
    expect(ids.slice(0, 5)).toEqual(['revente:d-r816', 'revente:d-r816b', 'revente:d-r816c', 'revente:d-r816d', 'neuf:v-ae816']);
    expect(ids).toHaveLength(9); expect(new Set(ids.slice(5, 7))).toEqual(new Set(['revente:d-r224', 'neuf:v-no224'])); expect(new Set(ids.slice(7))).toEqual(new Set(['agence:oa-1', 'neuf:v-no220']));
  });

  test('onglets : Revente, Neuf, Agences filtrent ; Drops vide propose de tout voir', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    const onglets = page.getByRole('group', { name: 'Filtrer par source' });
    await onglets.getByRole('button', { name: /^Revente/ }).click(); await expect(onglets.getByRole('button', { name: /^Revente/ })).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('[data-offre]')).toHaveCount(5); await expect(page.locator('[data-type="revente"]')).toHaveCount(5); await expect(page.getByText(/5 offres · prix/)).toBeVisible();
    await expect(dans(page, '[data-offre="revente:d-r816"]')).toContainText('Meilleure affaire'); // la meilleure affaire reste signalée
    await onglets.getByRole('button', { name: /^Neuf/ }).click(); await expect(page.locator('[data-type="neuf"]')).toHaveCount(3);
    await onglets.getByRole('button', { name: /^Agences/ }).click(); await expect(page.locator('[data-offre]')).toHaveCount(1); await expect(page.getByText('1 offre · prix par voyageur')).toBeVisible();
    await onglets.getByRole('button', { name: /^Drops/ }).click(); await expect(page.getByRole('heading', { name: /Aucune offre « Drops »/ })).toBeVisible();
    await page.getByRole('button', { name: 'Voir toutes les offres' }).click(); await expect(page.locator('[data-offre]')).toHaveCount(9);
  });

  test('tris : prix croissant, heure de départ, durée', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    const prix = () => page.locator('[data-offre] .montant').allInnerTexts().then((l) => l.map((t) => Number(t.replace(/\D/g, ''))));
    await page.getByRole('button', { name: /Trier : Recommandé/ }).click(); const f = page.getByRole('dialog', { name: 'Trier les offres' }); await expect(f).toBeVisible();
    await f.getByText('Prix croissant', { exact: true }).click(); await expect(f).toBeHidden(); await expect(page.getByRole('button', { name: /Trier : Prix croissant/ })).toBeVisible();
    const p = await prix(); expect(p).toEqual([...p].sort((a, b) => a - b)); expect(p[0]).toBe(1380);
    await page.getByRole('button', { name: /Trier :/ }).click(); await page.getByText('Heure de départ', { exact: true }).click();
    expect(await page.locator('[data-offre]').first().getAttribute('data-offre')).toMatch(/oa-1|no220/); // 16:40 : NO 220, l'offre d'agence d'abord
    await page.getByRole('button', { name: /Trier :/ }).click(); await page.getByText('Durée du trajet', { exact: true }).click();
    expect(await page.locator('[data-offre]').first().innerText()).toContain('7 h 05'.replace(/ /g, ' '));
  });

  test('toucher une offre ouvre son détail (identifiant encodé), le clavier aussi', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    await dans(page, '[data-offre="revente:d-r816"] a.etendu').click(); await expect.poll(() => page.url()).toContain('/offre/revente%3Ad-r816'); await expect(page.getByRole('heading', { name: 'Offre de revente' })).toBeVisible();
    await page.goBack(); await expect(page.locator('[data-offre]').first()).toBeVisible();
    await dans(page, '[data-offre="neuf:v-ae816"] a.etendu').focus(); await page.keyboard.press('Enter'); await expect.poll(() => page.url()).toContain('/offre/neuf%3Av-ae816');
  });

  test('l’agence d’une carte mène à sa vitrine, le reste de la carte à l’offre', async ({ page }) => {
    await ouvrir(page, R, { connecte: ALEX });
    await dans(page, '[data-offre="agence:oa-1"]').getByRole('link', { name: /Vendu par Agence Horizon/ }).click(); await expect.poll(() => chemin(page)).toBe('/agence/horizon');
    await page.goBack(); await dans(page, '[data-offre="agence:oa-1"] a.etendu').click(); await expect.poll(() => page.url()).toContain('/offre/agence%3Aoa-1');
  });

  test('drop membres : prix masqué sans Pass, lien « Découvrir le Pass NexG » ; visible avec le Pass', async ({ page }) => {
    const PUJ = '/resultats?de=YUL&vers=PUJ&jour=2027-02-21&n=2';
    await ouvrir(page, PUJ, { connecte: 'ACC-0301', preparer: dropActif });
    const drop = page.locator('.drop'); await expect(drop).toBeVisible(); await expect(drop).toContainText('Drop membres'); await expect(drop).toContainText('Prix masqué'); await expect(drop).toContainText('Réservé aux membres du Pass NexG'); await expect(drop).toContainText('Prix et horaires visibles avec le Pass.');
    await expect(page.getByText('+ 1 drop membres non affiché : prix visible avec le Pass NexG')).toBeVisible(); // espace insécable avant « : »
    await expect(page.getByText('Aucune offre sous le prix équivalent neuf pour l’instant', { exact: false })).toBeVisible();
    await expect(drop).not.toContainText('200'); await expect(page.getByText(/2\svoyageurs/).first()).toBeVisible();
    await page.screenshot({ path: '/tmp/recherche-4c-drop.png' });
    await drop.getByRole('link', { name: /Découvrir le Pass NexG/ }).click(); await expect.poll(() => chemin(page)).toBe('/pass');
  });

  test('avec le Pass, le drop est visible avec son prix et un écart signé', async ({ page }) => {
    await ouvrir(page, '/resultats?de=YUL&vers=PUJ&jour=2027-02-21&n=1', { connecte: ALEX, preparer: dropActif });
    const drop = dans(page, '[data-type="drop"]'); await expect(drop).toBeVisible(); await expect(drop).toContainText(montant('200 $')); await expect(drop).toContainText(/−79\s%\svs neuf/);
    await expect(page.getByText(/non affiché/)).toHaveCount(0); await expect(page.getByText(/1 offre sous le prix équivalent neuf, dès\s+200\s\$/)).toBeVisible();
  });

  test('état vide : dates proches avec des vols, élargir, toutes les destinations, modifier', async ({ page }) => {
    await ouvrir(page, '/resultats?de=YUL&vers=CDG&jour=2026-12-16&n=1', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Aucun vol ne correspond à cette recherche' })).toBeVisible(); await expect(page.getByText('Dates proches avec des vols')).toBeVisible();
    const dates = page.locator('.dates a'); await expect(dates.first()).toContainText('lun. 14 déc.'); await expect(dates.first()).toContainText(/1 vol · 2 jours plus tôt/); await expect(dates.nth(1)).toContainText('ven. 18 déc.'); await expect(dates.nth(1)).toContainText(/3 vols · 2 jours plus tard/);
    await expect(page.getByRole('link', { name: /Élargir à ±3\sjours/ })).toBeVisible(); await expect(page.getByRole('link', { name: /Voir toutes les destinations/ })).toBeVisible(); await expect(page.getByText('Trop cher ? Dites votre prix')).toBeVisible();
    await page.screenshot({ path: '/tmp/recherche-4d-vide.png' });
    await dates.nth(1).click(); await expect.poll(() => page.url()).toContain('jour=2026-12-18'); await expect(page.locator('[data-offre]').first()).toBeVisible();
    await page.goto('/resultats?de=YUL&vers=CDG&jour=2026-12-16&n=1'); await page.getByRole('link', { name: /Élargir à ±3/ }).click(); await expect(page.getByText(/ven\.|mer\. 16 déc\. ±3\sjours/).first()).toBeVisible(); await expect(page.locator('[data-offre]').first()).toBeVisible();
  });

  test('adresse incomplète ou inconnue : message clair et retour au formulaire', async ({ page }) => {
    await ouvrir(page, '/resultats?de=YUL&vers=ZZZ&jour=2026-12-18', { connecte: ALEX });
    await expect(page.getByRole('alert')).toContainText('Cette recherche est incomplète.'); await expect(page.getByRole('alert')).toContainText('Destination inconnue : ZZZ.');
    await page.getByRole('link', { name: 'Modifier la recherche' }).first().click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
    await page.goto('/resultats'); await expect(page.getByRole('alert')).toContainText('Aucune destination choisie.');
  });

  test('chargement et erreur de chargement (?etat=…) ; hors ligne annoncé', async ({ page, context }) => {
    await ouvrir(page, R + '&etat=chargement', { connecte: ALEX }); await expect(page.locator('[aria-busy="true"]')).toBeVisible(); await expect(page.getByText('Chargement des offres…')).toBeAttached();
    await page.goto(R + '&etat=erreur'); await expect(page.getByRole('alert')).toContainText('Les prix n’ont pas pu être chargés.'); await page.getByRole('link', { name: 'Réessayer' }).click(); await expect(page.locator('[data-offre]').first()).toBeVisible();
    await context.setOffline(true); await expect(page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible(); await context.setOffline(false); await expect(page.getByText('Vous êtes hors ligne')).toHaveCount(0);
  });

  test('la carte « Dites votre prix » mène à l’intention d’achat ; modifier la recherche garde les paramètres', async ({ page }) => {
    await ouvrir(page, R + '&flex=1', { connecte: ALEX });
    await expect(page.getByText(/ven\. 18 déc\. ±3\sjours · 1\svoyageur/)).toBeVisible();
    await page.getByRole('link', { name: 'Modifier la recherche' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher'); await expect(page.locator('#to')).toHaveValue('Paris (CDG)'); await expect(page.locator('#date-out')).toHaveText(/18 déc\. 2026/); await expect(page.locator('#flex3')).toBeChecked();
    await page.goBack(); await page.getByRole('link', { name: /Trop cher/ }).click(); await expect.poll(() => chemin(page)).toBe('/intention/nouvelle');
  });

  test('première vue à 390 × 700 : en-tête, onglets, baromètre visibles ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrir(page, R, { connecte: ALEX });
    await expect(page.getByRole('region', { name: 'Baromètre du marché' })).toBeInViewport(); await expect(page.getByRole('button', { name: /^Tous/ })).toBeInViewport(); await expect(page.getByText('YUL → CDG', { exact: true })).toBeInViewport();
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: /Trier :/ }).click(); expect(await sansDebordement(page)).toBe(true);
  });

  test('sans compte, les résultats sont lisibles', async ({ page }) => {
    await ouvrir(page, R); await expect(page.locator('[data-offre]').first()).toBeVisible(); await expect.poll(() => chemin(page)).toBe('/resultats');
  });
});

/** Un jour de l'état pour les tests d'offre. */
const sansAnnonce = (e: Etat) => { const d = e.monde.droits.find((x) => x.id === 'd-r816')!; d.statut = 'detenu'; delete d.annonce; };

test.describe('Détail de l’offre', () => {
  const O = '/offre/' + encodeURIComponent('revente:d-r816');
  test('revente : billet, prix, écart signé, prix équivalent neuf, graphique, droits, vendeur, conditions, achat', async ({ page }) => {
    await ouvrir(page, O, { connecte: 'ACC-0402' });
    await expect(page.getByRole('heading', { name: 'Offre de revente' })).toBeVisible();
    const billet = page.getByRole('region', { name: /Billet Montréal YUL vers Paris CDG/ });
    await expect(billet).toContainText('Aérolys · Vol 816'); await expect(billet).toContainText('Économie'); await expect(billet).toContainText('YUL'); await expect(billet).toContainText('CDG'); await expect(billet).toContainText('18:05'); await expect(billet).toContainText('07:10'); await expect(billet).toContainText('+1');
    await expect(billet).toContainText(/7\sh\s05 · direct/); await expect(billet).toContainText('Vendredi 18 décembre 2026'); await expect(billet).toContainText('Prix demandé'); await expect(billet).toContainText(montant('1 500 $')); await expect(billet).toContainText(/−27\s%\svs neuf/);
    await expect(billet).toContainText('Prix équivalent neuf aujourd’hui'); await expect(billet).toContainText(montant('2 050 $'));
    await expect(page.getByRole('link', { name: /Retourner le billet : voir son cours/ })).toHaveAttribute('href', '/cours/v-ae816'); await expect(page.getByText('Historique, offres et demandes')).toBeVisible();
    // graphique : titre honnête sur la période, variation signée, alternative textuelle
    await expect(page.getByRole('heading', { name: 'Prix équivalent depuis juillet' })).toBeVisible(); await expect(page.getByText('Indicatif', { exact: true })).toBeVisible();
    await expect(page.getByText(/^[+−]\d+\s\$\sdepuis juil\.$/)).toBeVisible(); await expect(page.getByText(/Prix demandé\s+1\s500\s\$/).first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Prix équivalent neuf depuis juillet : de .* à 2\s050\s\$ aujourd’hui \([+−]\d+\s\$\)/ })).toBeVisible();
    await page.getByText('Voir les valeurs').click(); await expect(page.getByRole('table')).toBeVisible(); await expect(page.getByRole('row', { name: /Aujourd’hui 2\s050\s\$/ })).toBeVisible();
    // droits : dates calculées par echeanceDe (J-1)
    await expect(page.getByRole('heading', { name: 'Vos droits avec ce billet' })).toBeVisible();
    await expect(page.getByText('Revendre jusqu’à J-1')).toBeVisible(); await expect(page.getByText('Mettez-le en vente jusqu’au jeu. 17 déc. 18:05.')).toBeVisible(); await expect(page.getByText('Transférer à un proche')).toBeVisible(); await expect(page.getByText('Donnez-le à un autre compte NexG-TT.')).toBeVisible();
    await expect(page.getByText('Bagages inclus revendables')).toBeVisible(); await expect(page.getByText('Hypothèse', { exact: true })).toBeVisible(); await expect(page.getByText('Nommer le voyageur avant le 17 déc. 18:05')).toBeVisible(); await expect(page.getByText('Vous ou un proche. Le billet devient alors nominatif.')).toBeVisible();
    await expect(page.getByText('Plafond de revente')).toBeVisible(); await expect(page.getByText(/Sur ce vol\s: 2\s050\s\$ au plus/)).toBeVisible(); await expect(page.getByText('Règle à valider')).toBeVisible();
    // vendeur : chaîne de détention de la revente
    await expect(page.getByRole('heading', { name: 'Vendeur' })).toBeVisible(); await expect(page.getByText('Détenteur vérifié', { exact: true })).toBeVisible(); await expect(page.getByText('1er détenteur de ce billet')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Historique de détention' }).getByRole('listitem')).toHaveText(['Émission', '1er · vendeur', 'Vous']); await expect(page.getByText('Chaque changement de détenteur est inscrit au registre interne de NexG-TT.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conditions' })).toBeVisible(); await expect(page.getByText('Selon le tarif de la compagnie')).toBeVisible(); await expect(page.getByText('À confirmer', { exact: true })).toBeVisible(); await expect(page.getByText('Remboursement au détenteur')).toBeVisible(); await expect(page.getByText('À valider', { exact: true })).toBeVisible();
    const acheter = page.getByRole('link', { name: /Acheter · 1\s500\s\$/ }); await expect(acheter).toBeInViewport(); await expect(acheter).toHaveAttribute('href', '/paiement/revente%3Ad-r816');
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/recherche-5-offre.png' }); await page.screenshot({ path: '/tmp/recherche-5b-offre-complet.png', fullPage: true });
  });

  test('première vue à 390 × 700 : le billet, le prix et « Acheter » sont visibles, rien n’est recouvert', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrir(page, O, { connecte: 'ACC-0402' });
    for (const t of [/Prix demandé/, /−27\s%\svs neuf/, /Prix équivalent neuf aujourd’hui/]) await expect(page.getByText(t).first()).toBeInViewport();
    const acheter = page.getByRole('link', { name: /Acheter · / }); await expect(acheter).toBeInViewport({ ratio: 1 });
    const ligne = (await page.getByText('Prix équivalent neuf aujourd’hui').first().boundingBox())!, barre = (await acheter.boundingBox())!; expect(ligne.y + ligne.height).toBeLessThanOrEqual(barre.y);
  });

  test('l’alerte de prix crée une Alerte, annoncée, et se retire', async ({ page }) => {
    await ouvrir(page, O, { connecte: 'ACC-0402' });
    const cloche = page.getByRole('button', { name: 'Créer une alerte' }); await expect(cloche).toHaveAttribute('aria-pressed', 'false');
    await cloche.click(); await expect(cloche).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('status').filter({ hasText: 'Alerte créée : vous serez prévenu si le prix change.' })).toBeVisible();
    const e = await lireEtat(page); expect(e.monde.alertes.at(-1)).toMatchObject({ compteId: 'ACC-0402', de: 'YUL', vers: 'CDG', prixMax: 1500, actif: true });
    await page.reload(); await expect(page.getByRole('button', { name: 'Créer une alerte' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Créer une alerte' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Alerte retirée.' })).toBeVisible(); expect((await lireEtat(page)).monde.alertes.filter((a) => a.compteId === 'ACC-0402')).toHaveLength(0);
  });

  test('sans compte : lisible, l’alerte demande de se connecter', async ({ page }) => {
    await ouvrir(page, O); await expect(page.getByRole('heading', { name: 'Offre de revente' })).toBeVisible();
    await page.getByRole('button', { name: 'Créer une alerte' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Connectez-vous pour créer une alerte de prix.' })).toBeVisible();
  });

  test('neuf et agence : même écran, vendeur et chaîne adaptés', async ({ page }) => {
    await ouvrir(page, '/offre/' + encodeURIComponent('neuf:v-ae816'), { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Offre neuve' })).toBeVisible(); await expect(page.getByText('Prix neuf', { exact: true })).toBeVisible(); await expect(page.getByText(/vs neuf/)).toHaveCount(0); await expect(page.getByRole('link', { name: /Acheter · 2\s050\s\$/ })).toHaveAttribute('href', '/paiement/neuf%3Av-ae816');
    await expect(page.getByText('Billet neuf émis via NexG-TT')).toBeVisible(); await expect(page.getByRole('list', { name: 'Historique de détention' }).getByRole('listitem')).toHaveText(['Émission', 'NexG-TT · vendeur', 'Vous']);
    await page.goto('/offre/' + encodeURIComponent('agence:oa-1'));
    await expect(page.getByRole('heading', { name: 'Offre d’agence' })).toBeVisible(); await expect(page.getByText(montant('1 690 $')).first()).toBeVisible(); await expect(page.getByText(/−2[0-9]\s%\svs neuf/)).toBeVisible(); await expect(page.getByText('Prix de l’agence').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Voir la vitrine de Agence Horizon/ })).toHaveAttribute('href', '/agence/horizon'); await expect(page.getByRole('list', { name: 'Historique de détention' }).getByRole('listitem')).toHaveText(['Émission', 'Agence · vendeur', 'Vous']);
    await expect(page.getByRole('link', { name: /Acheter · 1\s690\s\$/ })).toHaveAttribute('href', '/paiement/agence%3Aoa-1'); await expect(page.getByText(/1\sescale · KEF/)).toBeVisible();
  });

  test('un billet déjà revendu 2 fois affiche sa chaîne : « 3e détenteur de ce billet »', async ({ page }) => {
    await ouvrir(page, '/offre/' + encodeURIComponent('revente:d-ppt'), { connecte: 'ACC-0402', preparer: (e) => { const d = e.monde.droits.find((x) => x.id === 'd-ppt')!; d.statut = 'en_vente'; d.annonce = { prix: 1700, depuis: 0 }; d.detenteurId = 'ACC-0301'; } });
    await expect(page.getByText('3e détenteur de ce billet')).toBeVisible(); await expect(page.getByRole('list', { name: 'Historique de détention' }).getByRole('listitem')).toHaveText(['Émission', '1er détenteur', '2e détenteur', '3e · vendeur', 'Vous']);
    await expect(page.getByText('Mettez-le en vente jusqu’au')).toContainText('8 mai'); await expect(page.getByText(/−\d+\s%\svs neuf/)).toBeVisible();
  });

  test('ma propre annonce : l’achat est inactif et expliqué', async ({ page }) => {
    await ouvrir(page, '/offre/' + encodeURIComponent('revente:d-hav'), { connecte: ALEX });
    await expect(page.getByText('C’est votre annonce : gérez-la depuis votre portefeuille.')).toBeVisible(); const b = page.getByRole('button', { name: /Acheter · / }); await expect(b).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByRole('link', { name: /Acheter · / })).toHaveCount(0);
  });

  test('échéance passée : alerte claire, achat inactif', async ({ page }) => {
    await ouvrir(page, '/offre/' + encodeURIComponent('neuf:v-ae816') + '?maintenant=2026-12-18T10:00', { connecte: 'ACC-0402' });
    await expect(page.getByRole('alert').filter({ hasText: 'L’échéance de ce vol est passée' })).toBeVisible(); await expect(page.getByRole('button', { name: /Acheter · / })).toHaveAttribute('aria-disabled', 'true');
  });

  test('offre déjà vendue ou inconnue : état d’erreur clair avec une suite', async ({ page }) => {
    await ouvrir(page, O, { connecte: ALEX, preparer: sansAnnonce });
    await expect(page.getByRole('heading', { name: 'Offre indisponible' })).toBeVisible(); const a = page.getByRole('alert'); await expect(a).toContainText('Cette offre n’existe plus'); await expect(a).toContainText('Ce billet vient d’être vendu ou retiré de la vente.');
    await expect(page.getByRole('link', { name: /Acheter/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Voir les offres de ce trajet' }).click(); await expect.poll(() => page.url()).toContain('/resultats?de=YUL&vers=CDG&jour=2026-12-18'); await expect(page.locator('[data-offre]').first()).toBeVisible(); await expect(page.locator('[data-offre="revente:d-r816"]')).toHaveCount(0);
    await page.goto('/offre/n-importe-quoi'); await expect(page.getByRole('alert')).toContainText('Offre introuvable'); await page.getByRole('link', { name: 'Rechercher un autre vol' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
  });

  test('un drop n’est pas achetable ici : renvoi vers le Pass ou vers les drops', async ({ page }) => {
    await ouvrir(page, '/offre/' + encodeURIComponent('drop:drop-128'), { connecte: 'ACC-0301', preparer: dropActif }); await expect(page.getByRole('alert')).toContainText('Pass NexG'); await expect(page.getByRole('link', { name: 'Découvrir le Pass NexG' })).toHaveAttribute('href', '/pass');
    await page.goto('/offre/' + encodeURIComponent('drop:drop-128')); // Inès n'a pas le Pass dans le seed : même état
  });

  test('chargement et erreur (?etat=…) ; 320 px sans débordement ; retour', async ({ page }) => {
    await ouvrir(page, O + '?etat=chargement', { connecte: 'ACC-0402' }); await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await page.goto(O + '?etat=erreur'); await expect(page.getByRole('alert')).toContainText('L’offre n’a pas pu être chargée.');
    await page.setViewportSize({ width: 320, height: 640 }); await page.goto(O); await expect(page.getByRole('heading', { name: 'Offre de revente' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByText('Voir les valeurs').click(); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('Vitrine agence', () => {
  test('Agence Horizon : identité vérifiée, « Vendu par », offres et cartes', async ({ page }) => {
    await ouvrir(page, '/agence/horizon', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: /Agence Horizon \(exemple\)/, level: 1 })).toBeVisible(); await expect(page.getByRole('img', { name: 'Monogramme AH, emplacement du logo' })).toBeVisible();
    await expect(page.getByText('Agence partenaire vérifiée')).toBeVisible(); await expect(page.getByText('Vendu par Agence Horizon via NexG-TT')).toBeVisible(); await expect(page.getByText('Forfaits vol + hôtel possibles')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Offres · 2' })).toHaveAttribute('aria-selected', 'true');
    const cartes = page.locator('.of'); await expect(cartes).toHaveCount(2);
    await expect(cartes.first()).toContainText('Vol seul'); await expect(cartes.first()).toContainText('YUL → KEF'); await expect(cartes.first()).toContainText('Reykjavik'); await expect(cartes.first()).toContainText('Depuis Montréal · vol direct'); await expect(cartes.first()).toContainText('ven. 27 nov. 2026 · Nordelle'); await expect(cartes.first()).toContainText('Vendu par Agence Horizon'); await expect(cartes.first()).toContainText(montant('520 $')); await expect(cartes.first()).toContainText('par personne'); await expect(cartes.first()).toContainText(/−\d+\s%\svs neuf/);
    await expect(cartes.nth(1)).toContainText('Paris'); await expect(cartes.nth(1)).toContainText(/1\sescale · KEF/); await expect(cartes.nth(1)).toContainText(montant('1 690 $'));
    await expect(page.getByText('Prix indicatifs. Les billets achetés ici rejoignent votre portefeuille NexG-TT.')).toBeVisible();
    expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: '/tmp/recherche-6-agence.png' }); await page.screenshot({ path: '/tmp/recherche-6b-agence-complet.png', fullPage: true });
    await cartes.nth(1).click(); await expect.poll(() => page.url()).toContain('/offre/agence%3Aoa-1');
  });

  test('onglet « À propos » : clavier, spécialités déduites, permis d’exemple, ce que « vérifiée » veut dire', async ({ page }) => {
    await ouvrir(page, '/agence/horizon', { connecte: ALEX });
    const offres = page.getByRole('tab', { name: 'Offres · 2' }); await offres.focus(); await page.keyboard.press('ArrowRight');
    const apropos = page.getByRole('tab', { name: 'À propos' }); await expect(apropos).toHaveAttribute('aria-selected', 'true'); await expect(apropos).toBeFocused();
    await expect(page.getByRole('tabpanel')).toContainText('Agence de voyages montréalaise (exemple fictif).'); await expect(page.getByText('Spécialités')).toBeVisible(); await expect(page.getByText('Europe', { exact: true })).toBeVisible(); await expect(page.getByText('Basée à')).toBeVisible(); await expect(page.getByText('Montréal', { exact: true })).toBeVisible();
    await expect(page.getByText('Permis d’agent de voyages')).toBeVisible(); await expect(page.getByText('n° 000000 (exemple)')).toBeVisible(); await expect(page.getByText('Ce que « vérifiée » veut dire')).toBeVisible(); await expect(page.getByText('Processus à définir.')).toBeVisible();
    await page.screenshot({ path: '/tmp/recherche-6c-apropos.png', fullPage: true }); await page.keyboard.press('ArrowLeft'); await expect(offres).toHaveAttribute('aria-selected', 'true');
  });

  test('écrire à un conseiller : message vide refusé, envoi simulé, notification', async ({ page }) => {
    await ouvrir(page, '/agence/horizon', { connecte: ALEX });
    const bouton = page.getByRole('button', { name: 'Écrire à un conseiller' }); await expect(bouton).toHaveAttribute('aria-expanded', 'false'); await bouton.click(); await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    const zone = page.getByLabel('Votre message à Agence Horizon'); await expect(zone).toBeFocused(); await expect(page.getByText('Ne partagez ni numéro de carte ni mot de passe.')).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer (démo)' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Écrivez votre message avant de l’envoyer.' })).toBeVisible(); await expect(zone).toHaveAttribute('aria-invalid', 'true'); await expect(zone).toBeFocused();
    await zone.fill('Bonjour, je cherche un séjour en mars pour deux personnes.'); await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Envoyer (démo)' }).click(); await expect(page.getByText('Message envoyé (démo). La réponse arrivera dans vos notifications NexG-TT.')).toBeVisible(); await expect(zone).toHaveCount(0);
    const e = await lireEtat(page); expect(e.monde.notifications[0]).toMatchObject({ compteId: ALEX, titre: 'Message envoyé à Agence Horizon' }); expect((e.tranches.recherche as { messages: { agenceId: string }[] }).messages[0].agenceId).toBe('horizon');
    await bouton.click(); await page.getByRole('button', { name: 'Annuler' }).click(); await expect(zone).toHaveCount(0);
  });

  test('forfait vol + hôtel : le message est prérempli ; sans compte, il faut se connecter', async ({ page }) => {
    await ouvrir(page, '/agence/horizon');
    await page.getByRole('button', { name: 'Demander un forfait' }).click(); await expect(page.getByLabel('Votre message à Agence Horizon')).toHaveValue(/forfait vol \+ hôtel avec Agence Horizon/);
    await page.getByRole('button', { name: 'Envoyer (démo)' }).click(); const a = page.getByRole('alert').filter({ hasText: 'Connectez-vous pour écrire à un conseiller.' }); await expect(a).toBeVisible(); await expect(a.getByRole('link', { name: 'Se connecter' })).toBeVisible();
  });

  test('une autre agence, une agence inconnue, une vitrine sans offre', async ({ page }) => {
    await ouvrir(page, '/agence/cap-nord', { connecte: ALEX }); await expect(page.getByRole('heading', { name: /Cap Nord Voyages/ })).toBeVisible(); await expect(page.getByRole('img', { name: /Monogramme CN/ })).toBeVisible(); await expect(page.getByRole('tab', { name: 'Offres · 1' })).toBeVisible(); await expect(page.getByText('Forfaits vol + hôtel possibles')).toHaveCount(0);
    await page.goto('/agence/nexiste-pas'); await expect(page.getByRole('alert')).toContainText('Agence introuvable'); await page.getByRole('link', { name: 'Rechercher un vol' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
  });
  test('vitrine sans offre : message utile ; non vérifiée : mention', async ({ page }) => {
    await ouvrir(page, '/agence/cap-nord', { connecte: ALEX, preparer: (e) => { e.monde.offresAgence = e.monde.offresAgence.filter((o) => o.agenceId !== 'cap-nord'); e.monde.agences.find((a) => a.id === 'cap-nord')!.permisVerifie = false; } });
    await expect(page.getByText('Aucune offre publiée pour l’instant.')).toBeVisible(); await expect(page.getByRole('tab', { name: 'Offres · 0' })).toBeVisible(); await expect(page.getByText('Vérification en cours')).toBeVisible(); await expect(page.getByText('Agence partenaire vérifiée')).toHaveCount(0);
  });
  test('320 px : aucun débordement (offres, à propos, message)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/agence/horizon', { connecte: ALEX }); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: 'Écrire à un conseiller' }).click(); await page.getByRole('button', { name: 'Envoyer (démo)' }).click(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('tab', { name: 'À propos' }).click(); expect(await sansDebordement(page)).toBe(true);
  });
});
