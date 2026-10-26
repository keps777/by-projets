// Variante PC (≥ 900 px) de l'achat : paiement, confirmation, mon voyage, nommer le voyageur, prêt à voyager, bagages, intentions.
// Chaque écran : rendu des blocs de la planche, navigation de l'en-tête PC, aucun débordement à 900, 1024 et 1440 px, capture dans /tmp.
import type { Page } from '@playwright/test';
import { chemin, expect, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
const ouvrirAlex = (page: Page, route: string, preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: ALEX, preparer });
const nommerAvant = (e: Etat) => {
  const d = e.monde.droits.find((x) => x.id === 'd-812')!;
  d.statut = 'nomme'; d.pnr = '6K4P9X'; d.voyageur = { prenom: 'Alex', nom: 'Exemple', pourSoi: true, naissance: '1990-03-14' };
  d.chaine.push({ id: 'm-test', quand: Date.parse('2026-10-12T09:00'), type: 'nommage', de: ALEX, vers: ALEX, prix: 0 });
};
/** Aucun débordement horizontal à 900, 1024 et 1440 px. */
async function largeurs(page: Page) {
  for (const w of [900, 1024, 1440]) { await page.setViewportSize({ width: w, height: 900 }); expect(await sansDebordement(page), `débordement à ${w} px`).toBe(true); }
  await page.setViewportSize({ width: 1440, height: 900 });
}
const x = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test.describe('paiement PC', () => {
  test('formulaire à gauche, récapitulatif collant à droite avec le bouton Payer', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await expect(page.getByRole('heading', { level: 1, name: 'Paiement' })).toBeVisible();
    await expect(page.getByText('Voyager · YUL → CDG · ven. 18 déc. 2026')).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'MODE DÉMO — aucun paiement réel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offre' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Récapitulatif' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Carte de test' })).toBeVisible();
    await expect(page.getByText('Billet (droit de voyage)')).toBeVisible(); await expect(page.getByText('hypothèse', { exact: true })).toBeVisible();
    await expect(page.getByText('Paiement traité par un prestataire certifié. NexG-TT ne conserve pas votre carte.')).toBeVisible();
    // trois moyens de paiement côte à côte, formulaire à gauche et récapitulatif à droite
    const form = (await page.locator('#form-paiement').boundingBox())!, aside = (await page.locator('aside').boundingBox())!;
    expect(aside.x).toBeGreaterThan(form.x + form.width - 2); expect(Math.abs(aside.y - form.y)).toBeLessThan(40);
    const [t1, t2, t3] = [await x(page, 'label[for="pm-card"]'), await x(page, 'label[for="pm-wallet"]'), await x(page, 'label[for="pm-mobile"]')];
    expect(t2.x).toBeGreaterThan(t1.x + t1.width - 2); expect(t3.x).toBeGreaterThan(t2.x + t2.width - 2);
    const payer = page.getByRole('button', { name: /^Payer .* \(démo\)$/ });
    await expect(payer).toHaveText(/Payer\s1\s500\s\$\s\(démo\)/);
    const b = (await payer.boundingBox())!; expect(b.x).toBeGreaterThan(aside.x - 1); expect(b.height).toBeGreaterThanOrEqual(44);
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-paiement.png`, fullPage: true });
  });
  test('le récapitulatif reste collé en haut quand on défile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await page.getByRole('radio', { name: /Mobile money/ }).check();
    const avant = (await page.locator('aside').boundingBox())!.y;
    await page.mouse.wheel(0, 500); await page.waitForTimeout(300);
    const apres = (await page.locator('aside').boundingBox())!.y;
    expect(apres).toBeLessThan(avant); expect(apres).toBeGreaterThanOrEqual(0); expect(apres).toBeLessThan(40);
  });
  test('autres moyens, erreur de saisie, puis paiement : confirmation du droit', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await page.getByRole('radio', { name: /Wallet/ }).check();
    await expect(page.getByText('Vous choisirez une carte déjà enregistrée dans le wallet de votre téléphone, puis confirmerez')).toBeVisible();
    await page.getByRole('radio', { name: /Mobile money/ }).check();
    await expect(page.getByRole('heading', { level: 2, name: 'Mobile money' })).toBeVisible(); await expect(page.getByLabel('Numéro de téléphone (mobile money)')).toBeVisible();
    await page.getByRole('radio', { name: /Carte/ }).check();
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cochez cette case pour continuer.' })).toBeVisible();
    await expect(page.getByText('À l’échéance, le détenteur est nommé voyageur par défaut.')).toBeVisible();
    await page.getByLabel('Numéro de carte').fill('4242 4242 4242 4242'); await page.getByLabel('Expiration (MM/AA)').fill('12/28');
    await page.getByLabel('Code de sécurité').fill('123'); await page.getByLabel('Nom sur la carte').fill('ALEX T. (TEST)');
    await page.getByLabel(/J’accepte les règles/).check();
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect.poll(() => chemin(page), { timeout: 15_000 }).toMatch(/^\/confirmation\//);
    await expect(page.getByRole('heading', { level: 1, name: 'Vous détenez ce droit de voyage' })).toBeVisible();
  });
  test('hors ligne : bandeau et bouton Payer inactif', async ({ page, context }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Le paiement demande le réseau : le bouton Payer se réactive à son retour. Rien n’a été débité.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Payer/ })).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
  });
  test('l’en-tête PC navigue (Rechercher, face Mes actifs)', async ({ page }) => {
    await ouvrirAlex(page, '/paiement/revente%3Ad-r816');
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Rechercher' }).click();
    await expect.poll(() => chemin(page)).toBe('/rechercher');
  });
});

test.describe('confirmation PC', () => {
  test('billet horizontal, « Et maintenant » à gauche, « Et ensuite » à droite', async ({ page }) => {
    await ouvrirAlex(page, '/confirmation/d-812');
    await expect(page.getByRole('heading', { level: 1, name: 'Vous détenez ce droit de voyage' })).toBeVisible();
    await expect(page.getByText('Paiement de démonstration accepté — aucun débit réel.')).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'MODE DÉMO — aucun paiement réel' })).toBeVisible();
    await expect(page.getByText('Votre billet', { exact: true })).toBeVisible();
    await expect(page.getByText('YUL', { exact: true }).first()).toBeVisible(); await expect(page.getByText('CDG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^À nommer avant le 13 déc\.\s18:05$/)).toBeVisible();
    await expect(page.getByText('NXG-7Q2M')).toBeVisible(); await expect(page.getByText('Payé (démo)')).toBeVisible(); await expect(page.getByText(/^1\s000\s\$$/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Et maintenant' })).toBeVisible();
    await expect(page.getByText('Vous ou un proche. À l’échéance, sans action de votre part, le détenteur est nommé voyageur par défaut.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Et ensuite' })).toBeVisible();
    await expect(page.getByText('Votre droit de voyage est dans votre portefeuille. L’échéance pour nommer le voyageur est le 13 déc. à 18:05.')).toBeVisible();
    const maint = (await page.getByRole('heading', { level: 2, name: 'Et maintenant' }).boundingBox())!, suite = (await page.getByRole('heading', { level: 2, name: 'Et ensuite' }).boundingBox())!;
    expect(suite.x).toBeGreaterThan(maint.x + 400);
    await expect(page.getByRole('link', { name: /Voir mon portefeuille/ })).toBeVisible(); await expect(page.getByRole('link', { name: 'Voir mon prochain voyage' })).toBeVisible();
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-confirmation.png`, fullPage: true });
    await page.getByRole('link', { name: 'Nommer le voyageur maintenant' }).click();
    await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
  });
  test('voyageur déjà nommé : « Voir mon voyage »', async ({ page }) => {
    await ouvrirAlex(page, '/confirmation/d-812', nommerAvant);
    await expect(page.getByText('Voyageur nommé')).toBeVisible();
    await page.getByRole('link', { name: 'Voir mon voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/voyage/d-812');
  });
});

test.describe('mon voyage PC', () => {
  test('titre, carte J-n, route, préparation, destination et revente', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-812');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon voyage' })).toBeVisible();
    await expect(page.getByText('Voyager · Montréal → Paris · lun. 14 déc. 2026')).toBeVisible();
    await expect(page.getByText('Suivez l’échéance pour nommer le voyageur, préparez votre départ et gardez la main sur votre billet jusqu’à J-1.')).toBeVisible();
    await expect(page.getByText('J-63')).toBeVisible(); await expect(page.getByText('Décollage dans')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'La route jusqu’à Paris' })).toBeVisible();
    await expect(page.getByText('À l’échéance, sans action de votre part, le détenteur est nommé voyageur par défaut.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'À préparer' })).toBeVisible(); await expect(page.getByText('Prêt : 0 / 4')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Paris', exact: true })).toBeVisible(); await expect(page.getByText(/^\+6\sh$/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Plans changés/ })).toBeVisible();
    await expect(page.getByText('Revente possible jusqu’au 13 déc. 18:05, depuis l’espace Mes actifs.')).toBeVisible();
    // deux colonnes : la route à gauche, la préparation à droite
    const route = (await page.getByRole('heading', { level: 2, name: 'La route jusqu’à Paris' }).boundingBox())!, prep = (await page.getByRole('heading', { level: 2, name: 'À préparer' }).boundingBox())!;
    expect(prep.x).toBeGreaterThan(route.x + 500);
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-voyage.png`, fullPage: true });
  });
  test('cocher la préparation et le lien Nommer fonctionnent ; l’en-tête PC navigue', async ({ page }) => {
    await ouvrirAlex(page, '/voyage/d-812');
    await page.getByLabel(/Passeport valide/).check(); await expect(page.getByText('Prêt : 1 / 4')).toBeVisible();
    await page.getByRole('link', { name: 'Gérer mes bagages' }).click(); await expect.poll(() => chemin(page)).toBe('/bagages');
    await page.goBack(); await page.getByRole('link', { name: 'Nommer le voyageur' }).click(); await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Accueil' }).click(); await expect.poll(() => chemin(page)).toBe('/');
  });
  test('hors ligne : Nommer, bagages et revente sont inactifs', async ({ page, context }) => {
    await ouvrirAlex(page, '/voyage/d-812');
    await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Vous voyez votre voyage tel qu’enregistré sur cet appareil.', { exact: false })).toBeVisible();
    await expect(page.locator('[role="link"][aria-disabled="true"]')).toHaveCount(3);
    await context.setOffline(false);
  });
});

test.describe('nommer le voyageur PC', () => {
  test('formulaire à gauche, échéance et récapitulatif à droite, confirmation', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812');
    await expect(page.getByRole('heading', { level: 1, name: 'Nommer le voyageur' })).toBeVisible();
    await expect(page.getByText('Voyager · YUL → CDG · lun. 14 déc. 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mon voyage' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Échéance de finalisation' })).toBeVisible();
    await expect(page.getByText('Qui voyage ?')).toBeVisible(); await expect(page.getByText('Tel qu’inscrit sur le passeport')).toBeVisible();
    await expect(page.getByText('Action définitive :')).toBeVisible(); await expect(page.getByText('Voyageur transmis')).toBeVisible();
    const [t1, t2, t3] = [await x(page, 'label[for="who-moi"]'), await x(page, 'label[for="who-proche"]'), await x(page, 'label[for="who-nouveau"]')];
    expect(t2.x).toBeGreaterThan(t1.x + t1.width - 2); expect(t3.x).toBeGreaterThan(t2.x + t2.width - 2);
    const form = (await page.locator('#f-nom').boundingBox())!, resume = (await page.getByText('Voyageur transmis').boundingBox())!;
    expect(resume.x).toBeGreaterThan(form.x + form.width);
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-nommer.png`, fullPage: true });
    const bouton = page.getByRole('button', { name: /Confirmer et transmettre à Aérolys/ });
    await expect(bouton).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Cochez la confirmation pour continuer.')).toBeVisible();
    await page.getByLabel('Naissance', { exact: false }).first().fill('1990-03-14').catch(() => {});
    await page.getByLabel('Date de naissance').fill('1990-03-14');
    await page.getByLabel(/Je confirme que ces informations/).check();
    await bouton.click();
    await expect.poll(() => chemin(page)).toBe('/pret-a-voyager/d-812');
  });
  test('champs manquants : bandeau d’erreur et rien n’est transmis', async ({ page }) => {
    await ouvrirAlex(page, '/nommer/d-812');
    await page.getByRole('radio', { name: /Nouveau voyageur/ }).check();
    await page.getByLabel(/Je confirme que ces informations/).check();
    await page.getByRole('button', { name: /Confirmer et transmettre/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Rien n’a été transmis à Aérolys.' })).toBeVisible();
    expect(chemin(page)).toBe('/nommer/d-812');
  });
});

test.describe('prêt à voyager PC', () => {
  test('carte d’embarquement et chaîne de détention côte à côte', async ({ page }) => {
    await ouvrirAlex(page, '/pret-a-voyager/d-812', nommerAvant);
    await expect(page.getByRole('heading', { level: 1, name: 'Prêt à voyager' })).toBeVisible();
    await expect(page.getByText('Nommé — prêt à voyager')).toBeVisible(); await expect(page.getByText('ALEX EXEMPLE', { exact: true })).toBeVisible();
    const carte = (await page.getByRole('heading', { level: 2, name: 'ALEX EXEMPLE' }).boundingBox())!, chaine = (await page.getByRole('heading', { level: 2, name: 'Chaîne de détention' }).boundingBox())!;
    expect(chaine.x).toBeGreaterThan(carte.x + 300);
    await expect(page.getByRole('button', { name: /Ajouter au portefeuille du téléphone/ })).toBeVisible();
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-pret.png`, fullPage: true });
    await page.getByRole('button', { name: 'Mon voyage' }).click(); await expect.poll(() => chemin(page)).toBe('/voyage/d-812');
  });
});

/** Écrans sans planche PC : colonne centrée de 640 px au plus (deux colonnes pour « Mes bagages »), pas de débordement. */
const centree = async (page: Page, sel: string) => { const b = (await page.locator(sel).first().boundingBox())!; expect(b.width).toBeLessThanOrEqual(641); expect(Math.abs(b.x + b.width / 2 - 720)).toBeLessThan(2); };
test.describe('bagages et intentions PC', () => {
  test('mes bagages : deux colonnes', async ({ page }) => {
    await ouvrirAlex(page, '/bagages');
    await expect(page.getByRole('heading', { level: 1, name: 'Mes bagages' })).toBeAttached();
    const intro = (await page.getByRole('heading', { level: 2, name: /2 bagages inclus/ }).boundingBox())!, cmp = (await page.getByRole('heading', { level: 2, name: 'Un bagage en plus, deux options' }).boundingBox())!;
    expect(cmp.x).toBeGreaterThan(intro.x + 400);
    await largeurs(page);
    await page.screenshot({ path: `${CAPTURES}/pc-bagages.png`, fullPage: true });
  });
  test('ajouter des bagages : colonne centrée, achat dans la colonne', async ({ page }) => {
    await ouvrirAlex(page, '/bagages/ajouter?droit=d-812');
    await expect(page.getByRole('heading', { level: 1, name: 'Ajouter des bagages' })).toBeAttached();
    await centree(page, '.pc-col');
    await expect(page.getByRole('button', { name: /Acheter 2 bagages/ })).toBeVisible();
    const col = (await page.locator('.pc-col').boundingBox())!, bt = (await page.getByRole('button', { name: /Acheter 2 bagages/ }).boundingBox())!;
    expect(bt.x).toBeGreaterThanOrEqual(col.x - 1); expect(bt.x + bt.width).toBeLessThanOrEqual(col.x + col.width + 1);
    await largeurs(page);
  });
  const MAI = Date.parse('2026-10-12T09:00:00-04:00'), H = 3_600_000;
  const fraiches = (e: Etat) => { const p = e.monde.intentions.find((i) => i.id === 'INT-4F7K')!.propositions; p[0].quand = MAI - 30 * H; p[1].quand = MAI - 23 * H; p[2].quand = MAI - 1 * H; };
  for (const [nom, route, h1] of [['dites votre prix', '/intention/nouvelle?de=YUL&vers=CDG&jour=2026-12-18', 'Dites votre prix'], ['réserver les fonds', '/intention/fonds', null], ['mes intentions', '/intentions', 'Mes intentions'], ['proposition reçue', '/intentions/INT-4F7K/proposition/p-2', null]] as const) {
    test(`${nom} : colonne centrée de 640 px au plus`, async ({ page }) => {
      await ouvrirAlex(page, route, fraiches);
      await page.waitForTimeout(300);
      if (h1) await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeAttached();
      await centree(page, '.pc-col');
      await largeurs(page);
      await page.screenshot({ path: `${CAPTURES}/pc-int-${nom.replace(/\s/g, '-')}.png`, fullPage: true });
    });
  }
  test('bagage transféré et accord : cadre PC sans bouton fermer dans l’en-tête', async ({ page }) => {
    await ouvrirAlex(page, '/bagages/transfere'); await centree(page, '.pc-col'); await largeurs(page);
    await ouvrirAlex(page, '/intentions/INT-4F7K/accord'); await centree(page, '.pc-col'); await largeurs(page);
  });
});
