import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187';
/** Le drop du seed se termine 4 min 31 s après « maintenant » : on le prolonge de 3 h pour les parcours qui prennent du temps. */
const ouvert = (e: Etat) => { e.monde.drops[0].fin += 3 * 3_600_000; };
const epuise = (e: Etat) => { e.monde.drops[0].restantes = 0; e.monde.drops[0].servis = ['ACC-0233', 'ACC-0301', 'ACC-0319', 'ACC-0356', 'ACC-0402', 'ACC-0187']; };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });

test.describe('drop en direct', () => {
  test('le drop N° 128 : trajet, compte à rebours, places, prix, réservation', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX });
    await expect(page.getByText('Drop N° 128 · en direct')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'YUL → PUJ' })).toBeVisible(); await expect(page.getByText(/Punta Cana · dim\. 21 févr\. 2027 · Nordelle/)).toBeVisible(); await expect(page.getByText('Direct · 07:30 → 12:15 · 1 voyageur')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /^Fin du drop dans 4 min \d+ s$/);
    await expect(page.getByText('Minutes', { exact: true })).toBeVisible(); await expect(page.getByText('Secondes', { exact: true })).toBeVisible();
    await expect(page.getByText(/^3\srestantes sur 6$/)).toBeVisible(); await expect(page.getByText('Prix membre')).toBeVisible(); await expect(page.getByText(/^200\s\$$/).first()).toBeVisible();
    await expect(page.getByText(/≈\s1\s000\s\$/)).toBeVisible(); await expect(page.getByText('Vous êtes membre du Pass NexG')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Réserver · 200\s\$/ })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Drops' })).toHaveAttribute('aria-current', 'page');
  });
  test('prochains drops masqués, comment ça marche, règles du drop', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert });
    await expect(page.getByRole('heading', { name: 'Prochains drops' })).toBeVisible(); await expect(page.getByText('Heure de Montréal')).toBeVisible();
    await expect(page.getByText('Destination masquée')).toHaveCount(3); await expect(page.getByText('Europe', { exact: true })).toBeVisible(); await expect(page.getByText('Caraïbes', { exact: true })).toBeVisible(); await expect(page.getByText('Asie', { exact: true })).toBeVisible();
    await expect(page.getByText('La destination exacte est révélée à l’ouverture du drop.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comment ça marche' })).toBeVisible(); await expect(page.getByText('Seuls les membres du Pass NexG peuvent réserver pendant le drop.')).toBeVisible(); await expect(page.getByText('Attribution au premier arrivé.')).toBeVisible();
    const regles = page.getByRole('button', { name: 'Règles du drop' }); await expect(regles).toHaveAttribute('aria-expanded', 'false'); await expect(page.getByText('Une place par membre et par drop.')).toHaveCount(0);
    await regles.click(); await expect(regles).toHaveAttribute('aria-expanded', 'true'); await expect(page.getByText('Une place par membre et par drop.')).toBeVisible(); await expect(page.getByText('Règles provisoires — hypothèses à valider.')).toBeVisible();
  });
  test('le compte à rebours avance chaque seconde ; la voix n’annonce que les paliers', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX });
    const timer = page.getByRole('timer'); const a = await timer.getAttribute('aria-label'); await page.waitForTimeout(2200); const b = await timer.getAttribute('aria-label'); expect(b).not.toBe(a);
    const live = page.locator('p[aria-live="polite"]'); await expect(live).toHaveText('Moins de 5 minutes avant la fin du drop.'); await page.waitForTimeout(2200); await expect(live).toHaveText('Moins de 5 minutes avant la fin du drop.');
    await expect(timer).not.toHaveAttribute('aria-live', /./);
  });
  test('à la fin du temps, l’écran bascule en « Drop terminé »', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: (e) => { e.monde.drops[0].fin += -4 * 60_000 - 28_000; } }); // 3 s restantes
    await expect(page.getByRole('timer')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Drop terminé' })).toBeVisible({ timeout: 8000 }); await expect(page.getByRole('timer')).toHaveCount(0); await expect(page.getByText('Complet')).toHaveCount(0);
    await expect(page.getByText('Terminé', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: /Créer une alerte YUL → PUJ/ })).toBeVisible();
  });
  test('première vue à 390 × 700 : texte et action principale non recouverts par la barre', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrir(page, '/drops', { connecte: ALEX });
    const cta = (await page.getByRole('button', { name: /^Réserver/ }).boundingBox())!; const barre = (await nav(page).boundingBox())!;
    expect(cta.y + cta.height).toBeLessThanOrEqual(barre.y + 1); expect(cta.y).toBeGreaterThan(300);
    await expect(page.getByText('Prix membre')).toBeInViewport(); await expect(page.getByRole('timer')).toBeInViewport();
    await page.screenshot({ path: '/tmp/nxt/e2e-drop-700.png' });
  });
  test('sans débordement à 320 px, en direct comme épuisé', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/drops', { connecte: ALEX }); await expect(page.getByRole('timer')).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    const cta = (await page.getByRole('button', { name: /^Réserver/ }).boundingBox())!; expect(cta.x + cta.width).toBeLessThanOrEqual(320);
    await page.goto('/drops?etat=epuise'); await expect(page.getByRole('heading', { name: /Parti en/ })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
  });
  test('le compte à rebours à plusieurs heures montre les heures sans déborder', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert }); await expect(page.getByText('Heures', { exact: true })).toBeVisible(); await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /^Fin du drop dans 3 h \d+ min \d+ s$/); expect(await sansDebordement(page)).toBe(true);
  });
  test('capture : le drop en direct (à comparer à la planche m2-12)', async ({ page }) => { await ouvrir(page, '/drops', { connecte: ALEX }); await expect(page.getByRole('timer')).toBeVisible(); await page.screenshot({ path: '/tmp/nxt/e2e-drop.png' }); });
});

test.describe('réserver', () => {
  test('payer la place : restantes −1, droit « drop » dans le portefeuille, chaîne « drop », confirmation', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert });
    await page.getByRole('button', { name: /^Réserver/ }).click();
    const feuille = page.getByRole('dialog', { name: 'Réserver ce drop' }); await expect(feuille).toBeVisible();
    await expect(feuille.getByRole('note')).toHaveText('MODE DÉMO — aucun paiement réel'); await expect(feuille.getByText(/Carte •••• 4821/)).toBeVisible(); await expect(feuille.getByText('Total')).toBeVisible();
    await feuille.getByRole('button', { name: /^Payer 200\s\$ \(démo\)$/ }).click();
    await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\/d-/);
    const e = await lireEtat(page); const dr = e.monde.drops[0]; expect(dr.restantes).toBe(2); expect(dr.servis).toEqual([ALEX]);
    const d = e.monde.droits.find((x) => x.dropId === 'drop-128')!; expect(d).toMatchObject({ detenteurId: ALEX, origine: 'drop', statut: 'detenu', prixPaye: 200 }); expect(d.chaine.at(-1)?.type).toBe('drop');
    expect(e.monde.notifications.some((n) => n.type === 'drop' && n.lien === `/droit/${d.id}`)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Vous détenez ce droit de voyage' })).toBeVisible();
  });
  test('une place par membre : on revoit sa place, pas de seconde réservation ; payer avec le solde NexG', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: (e) => { ouvert(e); e.monde.drops[0].servis.push(ALEX); e.monde.drops[0].restantes = 2; } });
    await expect(page.getByText('Votre place est réservée')).toBeVisible(); await expect(page.getByRole('button', { name: /^Réserver/ })).toHaveCount(0); await expect(page.getByText('Une place par membre et par drop', { exact: false }).first()).toBeVisible();
  });
  test('paiement par le solde NexG : écriture au grand livre', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert });
    await page.getByRole('button', { name: /^Réserver/ }).click(); const f = page.getByRole('dialog'); await f.getByLabel(/Solde NexG/).check(); await f.getByRole('button', { name: /^Payer/ }).click();
    await expect.poll(() => chemin(page)).toMatch(/^\/confirmation\//);
    const e = await lireEtat(page); expect(e.monde.ecritures.at(-1)).toMatchObject({ compteId: ALEX, type: 'achat', montant: -200 }); expect(e.monde.comptes.find((c) => c.id === ALEX)!.solde).toBe(952);
  });
  test('hors ligne : la réservation exige une connexion, rien n’est débité', async ({ page, context }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert }); await page.getByRole('button', { name: /^Réserver/ }).click(); await context.setOffline(true);
    const f = page.getByRole('dialog'); await f.getByRole('button', { name: /^Payer/ }).click(); await expect(f.getByRole('alert')).toContainText('exige une connexion'); expect(chemin(page)).toBe('/drops'); await context.setOffline(false);
    expect((await lireEtat(page)).monde.drops[0].restantes).toBe(3);
  });
  test('clavier : Entrée ouvre la feuille, Échap la ferme et rend le focus', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: ouvert });
    const b = page.getByRole('button', { name: /^Réserver/ }); await b.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(b).toBeFocused();
  });
  test('sans le Pass : prix masqué et invitation à rejoindre le Pass', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: CAMILLE, preparer: ouvert });
    await expect(page.getByText('Réservé aux membres du Pass NexG')).toBeVisible(); await expect(page.getByRole('button', { name: /^Réserver/ })).toHaveCount(0); await expect(page.getByLabel('Prix réservé aux membres du Pass NexG')).toBeVisible();
    await page.getByRole('link', { name: /Rejoindre le Pass NexG/ }).click(); await expect.poll(() => chemin(page)).toBe('/pass');
  });
  test('sans compte : le drop se voit (public), sans prix membre', async ({ page }) => {
    await ouvrir(page, '/drops', { preparer: ouvert }); await expect(page.getByRole('timer')).toBeVisible(); expect(chemin(page)).toBe('/drops'); await expect(page.getByRole('link', { name: /Rejoindre le Pass NexG/ })).toBeVisible();
  });
});

test.describe('drop épuisé', () => {
  test('?etat=epuise : « Parti en 0,8 seconde », déroulé, prochain drop, reventes et alerte', async ({ page }) => {
    await ouvrir(page, '/drops?etat=epuise', { connecte: ALEX });
    await expect(page.getByText('Complet')).toBeVisible(); await expect(page.getByRole('heading', { name: /Parti en 0,8 seconde/ })).toBeVisible();
    await expect(page.getByText('Les 6 places ont été attribuées dans l’ordre d’arrivée. Votre demande est arrivée une demi-seconde après la dernière. Aucun montant n’a été débité.')).toBeVisible();
    await expect(page.getByText('YUL → PUJ · Punta Cana')).toBeVisible(); await expect(page.getByText(/^0\srestante sur 6$/)).toBeVisible();
    await expect(page.getByText('Ouverture du drop')).toBeVisible(); await expect(page.getByText('6 places sur 6 attribuées')).toBeVisible(); await expect(page.getByText('Votre demande — non retenue')).toBeVisible(); await expect(page.getByText(/^\d\d:\d\d:\d\d,8$/)).toBeVisible();
    await expect(page.getByText('Prochain drop dans')).toBeVisible(); await expect(page.getByText(/^\d+ j \d+ h$/)).toBeVisible(); await expect(page.getByText(/mer\. 12:00 · Europe · destination masquée/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Disponible en revente' })).toBeVisible(); await expect(page.getByText(/Prix équivalent d’un billet neuf : 940\s\$/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Créer une alerte YUL → PUJ/ })).toHaveAttribute('href', '/alertes?de=YUL&vers=PUJ'); await expect(nav(page).getByRole('link', { name: 'Drops' })).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: '/tmp/nxt/e2e-epuise.png' });
  });
  test('plus aucune place : même route, bascule d’écran, réservation impossible', async ({ page }) => {
    await ouvrir(page, '/drops', { connecte: ALEX, preparer: (e) => { ouvert(e); epuise(e); } });
    await expect(page.getByRole('heading', { name: /Parti en/ })).toBeVisible(); expect(chemin(page)).toBe('/drops'); await expect(page.getByRole('button', { name: /^Réserver/ })).toHaveCount(0); await expect(page.getByRole('timer')).toHaveCount(0);
  });
  test('prochain drop : la liste se déplie, M’alerter active puis retire l’alerte (enregistrée)', async ({ page }) => {
    await ouvrir(page, '/drops?etat=epuise', { connecte: ALEX });
    await page.getByRole('button', { name: 'Voir les prochains drops' }).click(); await expect(page.getByRole('heading', { name: 'Prochains drops' })).toBeVisible();
    const b = page.getByRole('button', { name: /M’alerter pour le drop Europe de mercredi 12:00/ }); await b.click(); await expect(page.getByRole('button', { name: /Retirer l’alerte pour le drop Europe/ })).toHaveAttribute('aria-pressed', 'true');
    expect((await lireEtat(page)).monde.dropsAVenir.find((d) => d.id === 'dv-1')!.alerteIds).toEqual([ALEX]);
    await page.getByRole('button', { name: /Retirer l’alerte pour le drop Europe/ }).click(); expect((await lireEtat(page)).monde.dropsAVenir.find((d) => d.id === 'dv-1')!.alerteIds).toEqual([]);
  });
  test('reventes du même trajet : cartes avec prix et prix équivalent, lien vers l’offre', async ({ page }) => {
    await ouvrir(page, '/drops?etat=epuise', { connecte: ALEX });
    const carte = page.getByRole('link', { name: /YUL.*PUJ/ }).first(); await expect(carte).toContainText(/510\s\$/); await expect(carte).toContainText(/Prix équivalent 690\s\$/); await carte.click(); await expect.poll(() => chemin(page)).toBe('/offre/revente%3Ad-r902');
  });
  test('capture : l’écran épuisé à 320 px sans débordement et le test clavier du dépliant', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrir(page, '/drops?etat=epuise', { connecte: ALEX }); expect(await sansDebordement(page)).toBe(true);
    const v = page.locator('button[aria-controls="prochains-liste"]'); await v.focus(); await page.keyboard.press('Enter'); await expect(v).toHaveAttribute('aria-expanded', 'true'); expect(await sansDebordement(page)).toBe(true);
  });
});
