import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const ouvrirAlex = (page: Page, route: string, preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: ALEX, preparer });
const sansDroits = (e: Etat) => { e.monde.droits = e.monde.droits.filter((d) => d.detenteurId !== ALEX); e.monde.bagages = e.monde.bagages.filter((b) => b.detenteurId !== ALEX); };

test.describe('garde d’accès', () => {
  for (const r of ['/portefeuille', '/droit/d-812', '/echeances', '/importer', '/indices']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('portefeuille', () => {
  test('agrégats, onglets avec compteurs, cartes de droits et premier regard à 390 × 700', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrirAlex(page, '/portefeuille');
    await expect(page.getByRole('heading', { name: 'Portefeuille', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3 droits de voyage actifs' })).toBeVisible();
    await expect(page.getByTestId('equivalent-total')).toHaveText(/^4\s730\s\$$/); await expect(page.getByTestId('paye-total')).toHaveText(/^3\s050\s\$$/); await expect(page.getByTestId('ecart-total')).toHaveText(/^\+1\s680\s\$$/);
    await expect(page.getByText('Indicatif : ce n’est ni une offre de rachat ni un gain garanti.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actifs\s*\(3\)$/ })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('button', { name: /^En revente\s*\(2\)$/ })).toBeVisible();
    // le total et les liens sont visibles sans défiler ; la première carte commence dans l'écran
    for (const t of [page.getByTestId('equivalent-total'), page.getByRole('link', { name: 'Calendrier des échéances' }), page.getByRole('link', { name: 'Solde et versements' }), page.getByRole('button', { name: /^Actifs/ })]) { const b = (await t.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700); }
    const c1 = page.getByRole('article', { name: /YUL vers CDG, Paris/ }); await expect(c1).toContainText('Aérolys · Vol 812'); await expect(c1).toContainText('Paris · lun. 14 déc. 2026'); await expect(c1).toContainText('À nommer'); await expect(c1).toContainText(/2\s000\s\$/); await expect(c1).toContainText(/\+100\s%/);
    await expect(page.getByRole('link', { name: /Nommez le voyageur avant le 13 déc\. 18:05\s*J-62/ })).toBeVisible();
    const c2 = page.getByRole('article', { name: /YUL vers PUJ, Punta Cana/ }); await expect(c2).toContainText('Détenu'); await expect(c2).toContainText('Obtenu via Drop'); await expect(c2).toContainText(/\+370\s%/);
    const c3 = page.getByRole('article', { name: /YUL vers PPT, Papeete/ }); await expect(c3).toContainText('Revente · 3e détenteur'); await expect(c3).toContainText(/1\s850\s\$/); await expect(c3).toContainText(/−3,2\s%/); await expect(c3).toContainText('1 escale LAX');
    await page.screenshot({ path: '/tmp/portefeuille-390x700.png' });
  });

  test('un clic sur un droit ouvre /droit/:id ; les liens mènent au calendrier, au solde et à l’import', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille');
    await page.getByRole('article', { name: /YUL vers PUJ/ }).getByRole('link', { name: /Ouvrir le droit de voyage/ }).click(); await expect.poll(() => chemin(page)).toBe('/droit/d-puj');
    await page.goBack(); await expect(page.getByTestId('equivalent-total')).toBeVisible();
    await page.getByRole('link', { name: 'Calendrier des échéances' }).click(); await expect.poll(() => chemin(page)).toBe('/echeances'); await page.goBack();
    await page.getByRole('link', { name: 'Solde et versements' }).click(); await expect.poll(() => chemin(page)).toBe('/solde'); await page.goBack();
    await page.getByRole('link', { name: 'Importer un billet acheté ailleurs' }).click(); await expect.poll(() => chemin(page)).toBe('/importer');
  });

  test('la carte entière est cliquable et la bannière de nommage mène à /nommer', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille');
    const c1 = page.getByRole('article', { name: /YUL vers CDG, Paris/ }); const b = (await c1.boundingBox())!; await page.mouse.click(b.x + 40, b.y + b.height - 12); await expect.poll(() => chemin(page)).toBe('/droit/d-812'); await page.goBack();
    await page.getByRole('link', { name: /Nommez le voyageur avant le 13 déc\./ }).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
  });

  test('onglet « En revente » : droit annoncé, retrait automatique, droit de bagage', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille');
    await page.getByRole('button', { name: /^En revente/ }).click(); await expect(page.getByRole('button', { name: /^En revente/ })).toHaveAttribute('aria-pressed', 'true');
    const c = page.getByRole('article', { name: /YUL vers HAV, La Havane/ }); await expect(c).toContainText('En revente'); await expect(c).toContainText(/620\s\$/); await expect(c).toContainText(/650\s\$/); await expect(c).toContainText(/480\s\$/); await expect(c).toContainText('Votre prix');
    await expect(page.getByText(/Retrait automatique de l’annonce à J-1 \(29 janv\. 2027\)\. Commission prélevée seulement si la vente a lieu — taux en hypothèse\./)).toBeVisible();
    await expect(page.getByText('Droit de bagage · même vol')).toBeVisible(); const bag = page.getByRole('link', { name: /Bagage en soute AE 812, CDG, 23 kg, en vente/ }); await expect(bag).toContainText(/100\s\$/);
    await expect(page.getByText(/Plafond : prix compagnie 150\s\$ \(règle provisoire\)/)).toBeVisible();
    await c.getByRole('link', { name: /Ouvrir le droit/ }).click(); await expect.poll(() => chemin(page)).toBe('/droit/d-hav');
  });

  test('onglet « Historique » : transactions de la chaîne de détention, puis billet revendu', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille');
    await page.getByRole('button', { name: 'Historique' }).click();
    const l = page.getByRole('list').filter({ hasText: 'Drop membre obtenu' }); await expect(l.getByRole('listitem')).toHaveCount(4);
    await expect(l.getByRole('listitem').first()).toContainText('Drop membre obtenu'); await expect(l).toContainText('YUL → PPT · 2 détenteurs avant vous'); await expect(l).toContainText('Achat neuf');
    await expect(page.getByText('Aucun billet cédé ni voyagé pour l’instant')).toBeVisible(); await expect(page.getByText('Vos billets cédés et voyagés apparaîtront ici, avec leur chaîne de détention.')).toBeVisible();
  });

  test('un billet revendu quitte les actifs et apparaît cédé dans l’historique', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille?onglet=historique', (e) => {
      const d = e.monde.droits.find((x) => x.id === 'd-ppt')!; d.chaine.push({ id: 'm-v', quand: Date.parse('2026-10-10T10:00'), type: 'revente', de: ALEX, vers: 'ACC-0301', prix: 1900, commission: 237.5 }); d.detenteurId = 'ACC-0301';
    });
    await expect(page.getByRole('article', { name: /YUL vers PPT, revendu/ })).toContainText(/Payé 1\s850\s\$\s*· revendu 1\s900\s\$/); await expect(page.getByRole('list').filter({ hasText: 'Revente' })).toContainText('billet vendu');
    await page.getByRole('button', { name: /^Actifs\s*\(2\)$/ }).click(); await expect(page.getByTestId('equivalent-total')).toHaveText(/^2\s940\s\$$/);
  });

  test('états vides : aucun droit', async ({ page }) => {
    await ouvrirAlex(page, '/portefeuille', sansDroits);
    await expect(page.getByRole('heading', { name: 'Aucun droit de voyage actif' })).toBeVisible(); await expect(page.getByText('Achetez un billet neuf ou en revente : votre premier droit de voyage apparaîtra ici')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actifs\s*\(0\)$/ })).toBeVisible(); await page.getByRole('link', { name: 'Chercher un voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
    await page.goBack(); await page.getByRole('button', { name: /^En revente/ }).click(); await expect(page.getByText('Aucune annonce en cours')).toBeVisible();
    await page.getByRole('button', { name: 'Historique' }).click(); await expect(page.getByText('Aucun billet cédé ni voyagé pour l’instant')).toBeVisible();
  });

  test('clavier : onglets et cartes se parcourent au Tab ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrirAlex(page, '/portefeuille'); await expect(page.getByTestId('equivalent-total')).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: /^Actifs/ }).focus(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: /^En revente/ })).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.getByRole('button', { name: /^En revente/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await sansDebordement(page)).toBe(true); await page.getByRole('button', { name: 'Historique' }).click(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: /^Actifs/ }).click(); await page.getByRole('link', { name: /Ouvrir le droit de voyage/ }).first().focus(); await page.keyboard.press('Enter'); await expect.poll(() => chemin(page)).toBe('/droit/d-812');
  });

  test('hors ligne : bandeau d’information, prix du dernier relevé', async ({ page, context }) => {
    await ouvrirAlex(page, '/portefeuille'); await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Hors ligne : prix indicatifs du dernier relevé' })).toBeVisible(); await expect(page.getByTestId('equivalent-total')).toBeVisible(); await context.setOffline(false);
  });
});

test.describe('mon droit de voyage', () => {
  test('billet recto : trajet, horaires, statut, registre ; valeur indicative, actions et chaîne', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812');
    const recto = page.locator('article[aria-label="Billet YUL vers CDG, AE 812, recto"]');
    await expect(recto).toContainText('Aérolys · Vol 812'); await expect(recto).toContainText('YUL'); await expect(recto).toContainText('CDG'); await expect(recto).toContainText('18:05'); await expect(recto).toContainText('07:10'); await expect(recto).toContainText('Direct · 7 h 05');
    await expect(recto).toContainText('À nommer avant le 13 déc. 18:05'); await expect(recto).toContainText('Statut : détenu · Alex T.'); await expect(recto).toContainText('Registre NXG-7Q2M');
    await expect(page.getByTestId('paye')).toHaveText(/^1\s000\s\$$/); await expect(page.getByTestId('equivalent')).toHaveText(/^2\s000\s\$$/); await expect(page.getByTestId('ecart')).toHaveText(/\+100\s%/);
    await expect(page.getByText('Payé le 12 janv.')).toBeVisible(); await expect(page.getByText('Que faire de ce droit ?')).toBeVisible();
    await expect(page.getByRole('link', { name: /Revendre\s*Vous fixez le prix, plafond 2\s000\s\$/ })).toBeVisible(); await expect(page.getByRole('link', { name: /Nommer le voyageur\s*Avant le 13 déc\. 18:05/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transférer à un proche/ })).toBeVisible(); await expect(page.getByRole('link', { name: /Vendre maintenant ou attendre/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chaîne de détention' })).toBeVisible(); await expect(page.getByRole('list').getByText('Achat neuf', { exact: true })).toBeVisible(); await expect(page.getByText('Échéance de finalisation')).toBeVisible(); await expect(page.getByText('Départ YUL → CDG')).toBeVisible();
    await expect(page.getByText('Vous êtes détenteur. Votre place est réservée chez Aérolys')).toBeVisible();
  });

  test('première vue à 390 × 700 : billet, statut et début de la valeur indicative', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrirAlex(page, '/droit/d-812');
    for (const t of [page.getByText('Registre NXG-7Q2M'), page.getByRole('button', { name: 'Retourner le billet' }), page.getByText('Valeur indicative')]) { const b = (await t.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700); }
    await page.screenshot({ path: '/tmp/droit-recto-390x700.png' });
  });

  test('le billet se retourne au clic (aria-pressed, verso lisible) puis revient', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812');
    const bouton = page.getByRole('button', { name: 'Retourner le billet' }); await expect(bouton).toHaveAttribute('aria-pressed', 'false');
    const verso = page.locator('article[aria-label$="verso"]'), recto = page.locator('article[aria-label$="recto"]');
    await expect(recto).toHaveAttribute('aria-hidden', 'false'); await expect(verso).toHaveAttribute('aria-hidden', 'true');
    await bouton.click(); await expect(bouton).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByText('Verso · Mes actifs').last()).toBeVisible();
    await expect(verso).toHaveAttribute('aria-hidden', 'false'); await expect(recto).toHaveAttribute('aria-hidden', 'true');
    await expect(verso).toContainText('N° NXG-7Q2M'); await expect(verso).toContainText(/2\s000\s\$/); await expect(verso).toContainText(/Payé 1\s000\s\$/); await expect(verso).toContainText(/\+100\s%/); await expect(verso).toContainText('Chaîne de détention'); await expect(verso).toContainText('À nommer avant le 13 déc. 18:05');
    await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/droit-verso.png' });
    await bouton.click(); await expect(bouton).toHaveAttribute('aria-pressed', 'false'); await expect(recto).toHaveAttribute('aria-hidden', 'false');
  });

  test('le billet se retourne aussi au défilement (et revient en haut de page)', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812'); const bouton = page.getByRole('button', { name: 'Retourner le billet' });
    await page.evaluate(() => window.scrollTo(0, 400)); await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.scrollTo(0, 0)); await expect(bouton).toHaveAttribute('aria-pressed', 'false');
  });

  test('mouvement réduit : bascule instantanée, aucune rotation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await ouvrirAlex(page, '/droit/d-812');
    const bouton = page.getByRole('button', { name: 'Retourner le billet' }), pivot = page.locator('.pivot');
    await bouton.click(); await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    expect(await pivot.evaluate((e) => getComputedStyle(e).transform)).toBe('none'); const verso = page.locator('article[aria-label$="verso"]'), recto = page.locator('article[aria-label$="recto"]'); await expect(verso).toBeVisible(); expect(await recto.evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
    await bouton.click(); await expect(recto).toBeVisible();
  });

  test('actions : revendre, nommer, vendre ou attendre, cours, bagages', async ({ page }) => {
    for (const [nom, vers] of [[/^Revendre/, '/revendre/d-812'], [/^Nommer le voyageur/, '/nommer/d-812'], [/^Vendre maintenant ou attendre/, '/liquidite/d-812'], [/Voir le cours/, '/cours/v-ae812'], [/Mes bagages de ce vol/, '/bagages'], [/Voir la soute du vol/, '/soute/v-ae812']] as const) {
      await page.goto('about:blank'); await ouvrirAlex(page, '/droit/d-812'); await page.getByRole('link', { name: nom }).click(); await expect.poll(() => chemin(page)).toBe(vers);
    }
  });

  test('transférer : volet explicatif puis « Choisir le proche » ; rachat : volet d’information', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812');
    const t = page.getByRole('button', { name: /Transférer à un proche/ }); await expect(t).toHaveAttribute('aria-expanded', 'false'); await t.click(); await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Votre proche, titulaire d’un compte NexG-TT, devient détenteur de ce droit, sans vente\./)).toBeVisible(); await expect(page.getByText('Frais de transfert : hypothèse à valider.')).toBeVisible();
    await page.getByRole('link', { name: /Choisir le proche/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812');
    await page.goBack(); const r = page.getByRole('button', { name: 'Demander un rachat à NexG-TT' }); await r.click(); await expect(page.getByText(/NexG-TT vous propose un prix ferme/)).toBeVisible(); await expect(page.getByText('Règles de rachat : hypothèse à valider.')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click(); await expect(page.getByText(/NexG-TT vous propose un prix ferme/)).toHaveCount(0);
  });

  test('droit en vente : annonce, retrait de l’annonce mène à /revendre/:id', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-hav');
    await expect(page.locator('article[aria-label$="recto"]')).toContainText(/En revente · 620\s\$/); await expect(page.getByRole('status').filter({ hasText: /Votre annonce à 620\s\$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transférer à un proche/ })).toHaveCount(0); await page.getByRole('link', { name: /Retirer l’annonce/ }).click(); await expect.poll(() => chemin(page)).toBe('/revendre/d-hav');
  });

  test('droit nommé : actions fermées, liens vers le voyage', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812', (e) => { const d = e.monde.droits.find((x) => x.id === 'd-812')!; d.statut = 'nomme'; d.voyageur = { prenom: 'Alex', nom: 'Exemple', pourSoi: true }; });
    await expect(page.getByRole('heading', { name: 'Voyageur nommé : actions fermées' })).toBeVisible(); await expect(page.getByText('Que faire de ce droit ?')).toHaveCount(0); await expect(page.locator('article[aria-label$="recto"]')).toContainText('Voyageur nommé · Alex Exemple');
    await expect(page.getByText('Alex Exemple').last()).toBeVisible(); await page.getByRole('link', { name: 'Préparer mon voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/voyage/d-812');
  });

  test('droit gelé : message d’alerte avec la raison, aucune action', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-gele', (e) => { e.monde.droits.find((x) => x.id === 'd-gele')!.detenteurId = ALEX; });
    await expect(page.getByRole('alert').filter({ hasText: 'Ce droit est gelé' })).toContainText('Vérification d’identité en cours'); await expect(page.getByText('Que faire de ce droit ?')).toHaveCount(0); await expect(page.locator('article[aria-label$="recto"]')).toContainText('Droit gelé');
  });

  test('droit voyagé et échéance passée : messages, pas d’action', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-812', (e) => { e.monde.droits.find((x) => x.id === 'd-812')!.statut = 'voyage'; }); await expect(page.getByRole('heading', { name: 'Voyage effectué' })).toBeVisible();
  });

  test('droit introuvable ou à quelqu’un d’autre : écran d’erreur utile', async ({ page }) => {
    await ouvrirAlex(page, '/droit/d-r816');
    const a = page.getByRole('alert'); await expect(a).toContainText('Droit introuvable'); await expect(a).toContainText('n’est plus dans votre portefeuille');
    await page.getByRole('link', { name: 'Voir mon portefeuille' }).click(); await expect.poll(() => chemin(page)).toBe('/portefeuille');
  });

  test('320 px sans débordement, recto et verso', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, '/droit/d-812'); await expect(page.getByRole('button', { name: 'Retourner le billet' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('button', { name: 'Retourner le billet' }).click(); await page.waitForTimeout(800); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('calendrier des échéances', () => {
  test('prochaine échéance, compte à rebours en direct, liens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await ouvrirAlex(page, '/echeances');
    await expect(page.getByRole('heading', { name: 'Calendrier des échéances' })).toBeVisible(); await expect(page.getByText('Chaque droit de voyage doit être finalisé, voyageur nommé, au plus tard 24 h avant le départ.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prochaine échéance' })).toBeVisible(); await expect(page.getByText('YUL → CDG').first()).toBeVisible(); await expect(page.getByText('dim. 13 déc. 2026 · 18:05')).toBeVisible(); await expect(page.getByText('Départ lun. 14 déc. · Aérolys · vol 812')).toBeVisible();
    const t = page.getByRole('timer'); await expect(t).toHaveAttribute('aria-label', /^Temps restant avant l’échéance : 62 jours, \d+ heures?, \d+ minutes?$/);
    const avant = await t.textContent(); await page.waitForTimeout(2100); expect(await t.textContent()).not.toBe(avant);
    const b = (await page.getByRole('link', { name: 'Nommer le voyageur', exact: true }).boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: '/tmp/echeances-390x700.png' });
    await page.getByRole('link', { name: 'Nommer le voyageur', exact: true }).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-812'); await page.goBack();
    await page.getByRole('link', { name: 'Ou le revendre avant l’échéance' }).click(); await expect.poll(() => chemin(page)).toBe('/liquidite/d-812');
  });

  test('rappels J-30 / J-7 / J-2 : interrupteurs, mémorisés dans la tranche « portefeuille », frise mise à jour', async ({ page }) => {
    await ouvrirAlex(page, '/echeances');
    const j30 = page.getByRole('switch', { name: /Rappel J-30/ }), j7 = page.getByRole('switch', { name: /Rappel J-7/ }), j2 = page.getByRole('switch', { name: /Rappel J-2/ });
    await expect(j30).toHaveAttribute('aria-checked', 'true'); await expect(j7).toHaveAttribute('aria-checked', 'true'); await expect(j2).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Prochain rappel : ven. 13 nov. · YUL → CDG (J-30)')).toBeVisible(); await expect(page.getByText('Rappel J-2 · YUL → CDG')).toHaveCount(0);
    await j2.click(); await expect(j2).toHaveAttribute('aria-checked', 'true'); await expect(page.getByText('Rappel J-2 · YUL → CDG')).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: 'Rappel J-2 activé.' })).toHaveCount(1);
    await j30.click(); await j7.click(); await j2.click(); await expect(page.getByText('Aucun rappel programmé : vous ne serez pas prévenu avant les échéances.')).toBeVisible();
    const e = await lireEtat(page); expect((e.tranches.portefeuille as { rappels: unknown }).rappels).toEqual({ j30: false, j7: false, j2: false });
    await page.reload(); await expect(page.getByRole('switch', { name: /Rappel J-30/ })).toHaveAttribute('aria-checked', 'false');
  });

  test('frise : regroupement par mois, échéances, rappels, droits et statuts', async ({ page }) => {
    await ouvrirAlex(page, '/echeances');
    await expect(page.getByText('Oct. 2026 → mai 2027 · 4 droits de voyage')).toBeVisible(); await expect(page.getByText('Aujourd’hui · lun. 12 oct.')).toBeVisible(); await expect(page.getByText('1 échéance · 2 rappels').first()).toBeVisible(); await expect(page.getByText('Aucune échéance').first()).toBeVisible();
    const cdg = page.getByRole('link', { name: /YUL → CDG/ }).last(); await expect(cdg).toContainText('Échéance dim. 13 déc. · 18:05'); await expect(cdg).toContainText('Nommer le voyageur avant cette date.'); await expect(cdg).toContainText(/Proche · dans 62 j/);
    const hav = page.getByRole('link', { name: /YUL → HAV/ }); await expect(hav).toContainText(/En revente · 620\s\$/); await expect(hav).toContainText('Retrait automatique de l’annonce à cette date.'); await expect(hav).toContainText(/Moyenne · dans 109 j/); await expect(hav).toContainText('ven. 29 janv. · 08:15');
    await expect(page.getByRole('link', { name: /YUL → PPT/ })).toContainText(/Lointaine · dans 208 j/);
    await expect(page.getByRole('heading', { name: 'Si personne n’est nommé avant l’échéance' })).toBeVisible(); await expect(page.getByText('Le détenteur est nommé voyageur par défaut à l’échéance.')).toBeVisible();
    await hav.click(); await expect.poll(() => chemin(page)).toBe('/droit/d-hav');
  });

  test('320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, '/echeances'); await expect(page.getByRole('heading', { name: 'Calendrier des échéances' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
  });
  test('sans droit : message et lien vers la recherche', async ({ page }) => {
    await ouvrirAlex(page, '/echeances', sansDroits); await expect(page.getByText('Aucune échéance à agir')).toBeVisible(); await expect(page.getByText('0 droit de voyage')).toBeVisible(); await expect(page.getByText('Aucun rappel programmé')).toBeVisible();
    await page.getByRole('link', { name: 'Chercher un voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
  });
});

test.describe('importer un billet externe', () => {
  const remplir = async (page: Page, o: { cie?: string; pnr?: string; nom?: string; prix?: string } = {}) => {
    await page.getByLabel('1 · Compagnie').selectOption(o.cie ?? 'aerolys'); await page.getByLabel(/2 · Référence de réservation/).fill(o.pnr ?? 'Q7RT2M'); await page.getByLabel('Nom de famille du passager').fill(o.nom ?? 'Exemple'); await page.getByLabel(/Prix payé/).fill(o.prix ?? '1 250');
  };
  test('formulaire vide : étapes, bouton de confirmation désactivé, erreurs à la validation', async ({ page }) => {
    await ouvrirAlex(page, '/importer');
    await expect(page.getByRole('heading', { name: 'Confiez un billet acheté ailleurs' })).toBeVisible(); await expect(page.getByText('Phase pilote · hypothèse')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Compagnie' }).first()).toHaveAttribute('aria-current', 'step');
    const confier = page.getByRole('button', { name: 'Confier mon billet à NexG-TT' }); await expect(confier).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Vérifiez d’abord l’éligibilité (étape 3).')).toBeVisible();
    await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choisissez la compagnie qui a émis le billet.' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: 'La référence compte 6 lettres ou chiffres.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Indiquez le nom tel qu’il figure sur la réservation.' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: 'Indiquez le prix que vous avez payé.' })).toBeVisible();
    await expect(page.getByLabel('1 · Compagnie')).toBeFocused();
  });

  test('parcours nominal : vérification en attente, éligible, import : le droit rejoint le portefeuille', async ({ page }) => {
    await ouvrirAlex(page, '/importer'); const avant = (await lireEtat(page)).monde.droits.length;
    await remplir(page); await expect(page.getByLabel(/2 · Référence/)).toHaveValue('Q7RT2M');
    await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Vérification en cours…' })).toBeVisible();
    const ok = page.getByRole('status').filter({ hasText: 'Éligible sous réserve d’accord' }); await expect(ok).toBeVisible(); await expect(ok).toContainText('Aérolys, partenaire pilote (hypothèse)'); await expect(ok).toContainText('Q7RT2M · EXEMPLE'); await expect(ok).toContainText('AE 822'); await expect(ok).toContainText('NexG-TT devient gestionnaire de la réservation');
    await expect(page.getByText('Autres issues possibles')).toBeVisible(); await expect(page.getByText('Tarif non transférable')).toBeVisible();
    await page.screenshot({ path: '/tmp/importer-eligible.png', fullPage: true });
    await page.getByRole('button', { name: 'Confier mon billet à NexG-TT' }).click();
    await expect(page.getByRole('heading', { name: 'Billet importé' })).toBeVisible(); await expect(page.getByText('Démo : aucun billet réel n’a été transféré.')).toBeVisible(); await expect(page.getByText(/^1\s250\s\$$/)).toBeVisible();
    const e = await lireEtat(page); expect(e.monde.droits.length).toBe(avant + 1);
    const d = e.monde.droits.at(-1)!; expect(d).toMatchObject({ detenteurId: ALEX, origine: 'import', statut: 'detenu', prixPaye: 1250, volId: 'v-ae822', pnr: 'Q7RT2M' }); expect(d.chaine).toHaveLength(1); expect(d.chaine[0].type).toBe('import');
    await page.getByRole('link', { name: 'Voir mon droit de voyage' }).click(); await expect.poll(() => chemin(page)).toBe(`/droit/${d.id}`); await expect(page.locator('article[aria-label$="recto"]')).toContainText('Vol 822');
    await page.goto('/portefeuille'); await expect(page.getByRole('heading', { name: '4 droits de voyage actifs' })).toBeVisible(); await expect(page.getByText('Billet importé')).toBeVisible();
  });

  test('refus : compagnie non partenaire', async ({ page }) => {
    await ouvrirAlex(page, '/importer'); await remplir(page, { cie: 'nordelle', pnr: 'N5X7PC' }); await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click();
    const r = page.getByRole('alert').filter({ hasText: 'Compagnie pas encore partenaire' }); await expect(r).toContainText('On vous prévient dès que l’import est possible. Votre billet reste géré par la compagnie, sans changement.');
    await expect(page.getByText('Import impossible pour l’instant avec cette compagnie.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Confier mon billet à NexG-TT' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Modifier la saisie' }).click(); await expect(page.getByRole('button', { name: 'Vérifier l’éligibilité' })).toBeVisible();
  });
  test('refus : référence inconnue, tarif non transférable ; aucune création', async ({ page }) => {
    await ouvrirAlex(page, '/importer'); const avant = (await lireEtat(page)).monde.droits.length;
    await remplir(page, { pnr: 'ZZ9ZZ9' }); await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Réservation introuvable' })).toContainText('ne retrouve pas cette référence');
    await page.getByLabel(/2 · Référence/).fill('T9R2NF'); await page.getByLabel('Nom de famille du passager').fill('Durand'); await expect(page.getByRole('alert').filter({ hasText: 'Réservation introuvable' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Tarif non transférable' })).toBeVisible();
    expect((await lireEtat(page)).monde.droits.length).toBe(avant);
  });
  test('un billet déjà importé est refusé', async ({ page }) => {
    await ouvrirAlex(page, '/importer', (e) => { e.monde.droits.find((d) => d.id === 'd-812')!.pnr = 'Q7RT2M'; });
    await remplir(page); await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Billet déjà dans NexG-TT' })).toBeVisible();
  });
  test('prix payé invalide ; référence limitée à 6 caractères en majuscules', async ({ page }) => {
    await ouvrirAlex(page, '/importer'); await remplir(page, { pnr: 'q7-rt2m9x', prix: 'abc' }); await expect(page.getByLabel(/2 · Référence/)).toHaveValue('Q7RT2M');
    await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click(); const e = page.getByRole('alert').filter({ hasText: 'Indiquez un montant en dollars' }); await expect(e).toBeVisible(); await expect(page.getByLabel(/Prix payé/)).toHaveAttribute('aria-invalid', 'true');
  });
  test('hors ligne : la vérification est refusée avec un message', async ({ page, context }) => {
    await ouvrirAlex(page, '/importer'); await remplir(page); await context.setOffline(true);
    await page.getByRole('button', { name: 'Vérifier l’éligibilité' }).click({ force: true }); await expect(page.getByRole('alert').filter({ hasText: 'Hors ligne' })).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: 'Vérification en cours' })).toHaveCount(0); await context.setOffline(false);
  });
  test('clavier, 320 px et première vue à 390 × 700', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, '/importer'); await expect(page.getByRole('heading', { name: 'Confiez un billet acheté ailleurs' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByLabel('1 · Compagnie').focus(); await page.keyboard.press('Tab'); await expect(page.getByLabel(/2 · Référence/)).toBeFocused();
    await page.setViewportSize({ width: 390, height: 700 }); const b = (await page.getByRole('button', { name: 'Confier mon billet à NexG-TT' }).boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: '/tmp/importer-390x700.png' });
  });
});

test.describe('indices NexG', () => {
  test('indices par région calculés, périodes 7 j / 30 j / 90 j, extrêmes et carte de chaleur', async ({ page }) => {
    await ouvrirAlex(page, '/indices');
    await expect(page.getByRole('heading', { name: 'Le prix du voyage, région par région', level: 1 })).toBeVisible(); await expect(page.getByText('Au départ de Montréal (YUL)')).toBeVisible();
    await expect(page.getByRole('button', { name: '30 j' })).toHaveAttribute('aria-pressed', 'true');
    for (const z of ['NexG Caraïbes', 'NexG Europe', 'NexG Amériques', 'NexG Asie', 'NexG Océanie']) await expect(page.getByRole('heading', { name: z })).toBeVisible();
    const car = page.getByRole('article').filter({ hasText: 'NexG Caraïbes' }); await expect(car).toContainText('La Havane, Punta Cana'); await expect(car).toContainText(/sur 30 j/); await expect(car).toContainText(/Depuis l’origine de l’indice/); const v30 = await car.locator('.chg').first().textContent();
    await page.getByRole('button', { name: '7 j' }).click(); await expect(page.getByRole('button', { name: '7 j' })).toHaveAttribute('aria-pressed', 'true'); await expect(car).toContainText(/sur 7 j/); expect(await car.locator('.chg').first().textContent()).not.toBe(v30);
    await page.getByRole('button', { name: '90 j' }).click(); await expect(page.getByText('Variation sur 90 jours · touchez une route pour voir son cours')).toBeVisible();
    await expect(car.locator('.chg').first()).toHaveText((await car.locator('.chg').last().textContent())!); // 90 j = depuis l'origine
    await expect(page.getByText('Plus forte hausse')).toBeVisible(); await expect(page.getByText('Plus forte baisse')).toBeVisible(); await expect(page.getByText('Baisse ≤ −15 %')).toBeVisible();
    await expect(page.getByRole('link', { name: /^CDG, Paris, [+−]/ })).toBeVisible();
  });
  test('un indice change quand le monde change (aucune valeur figée)', async ({ page }) => {
    await ouvrirAlex(page, '/indices', (e) => { for (const v of e.monde.vols.filter((x) => x.vers === 'HAV')) v.courbe = v.courbe.map((_, i) => Math.round(1000 - i * 4)); });
    await page.getByRole('button', { name: '90 j' }).click(); await expect(page.getByText('Plus forte baisse').locator('..')).toContainText('HAV'); await expect(page.getByText('Plus forte baisse').locator('..')).toContainText(/−\d/);
    const car = page.getByRole('article').filter({ hasText: 'NexG Caraïbes' }); await expect(car.locator('.chg').first()).toContainText('−');
  });
  test('une tuile mène au cours du vol ; le défilement se met en pause ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, '/indices'); await expect(page.getByRole('heading', { name: 'NexG Caraïbes' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    const p = page.getByRole('button', { name: 'Mettre le défilement en pause' }); await p.click(); await expect(page.getByRole('button', { name: 'Reprendre le défilement' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: /^PPT, Papeete/ }).click(); await expect.poll(() => chemin(page)).toMatch(/^\/cours\/v-ae41/);
  });
  test('première vue à 390 × 700 et capture', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/indices');
    const b = (await page.getByRole('button', { name: '30 j' }).boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700); await page.screenshot({ path: '/tmp/indices-390x700.png' });
  });
});
