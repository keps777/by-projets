// Parcours du règlement : siège → paiement → attente → pass, refus puis réessai, annulation, hors ligne, bus entier, proche, covoiturage.
import type { Page } from '@playwright/test';
import { expect, test } from './aide'; // le test d'aide échoue à la moindre exception de page ou console.error

const CAPTURES = process.env.AM_CAPTURES ?? '';
const DEPART = 'd-2026-11-10-BX-Classique-mvan-aller-0700'; // 14 places libres : les jours proches sont presque pleins (l'historique du patron y a vendu des billets)
const shot = async (page: Page, nom: string) => { if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/${nom}.png` }); };

async function entrerCommeAicha(page: Page) {
  await page.goto('/entree?maintenant=2026-11-02T07:30');
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await page.evaluate(() => dispatchEvent(new Event('pagehide'))); // l'état est écrit dans le stockage
}
const siegeLibre = (page: Page, depuisLaFin: number) => page.locator('button.st:not([disabled])').nth(-1 - depuisLaFin);
async function aller(page: Page, chemin: string) { await page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')); }, chemin); }

test.describe('règlement', () => {
  test.beforeEach(async ({ page }) => { await entrerCommeAicha(page); });

  test('siège → paiement MoMo → attente → pass avec QR', async ({ page }) => {
    await aller(page, `/siege?depart=${DEPART}`);
    await expect(page.getByRole('heading', { name: /Choisis ta place/ }).or(page.getByText('Choisis ta place'))).toBeVisible();
    await shot(page, '01-siege');
    await siegeLibre(page, 0).click();
    await shot(page, '02-siege-choisi');
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page).toHaveURL(/\/paiement(\?|$)/);
    await expect(page.getByText('Frais de service AfriMove')).toBeVisible();
    await shot(page, '03-paiement');
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page).toHaveURL(/\/paiement\/attente$/);
    await shot(page, '04-attente');
    await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
    await expect(page.getByText('Paiement confirmé').first()).toBeVisible();
    await shot(page, '05-confirme');
    await expect(page).toHaveURL(/\/pass\?billet=/, { timeout: 6000 });
    await expect(page.getByRole('img', { name: /Code à scanner au quai/ })).toBeVisible();
    await expect(page.getByText('signé · valable sans réseau')).toBeVisible();
    await shot(page, '06-pass');
  });

  test('numéro en 00 : refusé, places gardées, réessai avec Orange Money', async ({ page }) => {
    await aller(page, `/siege?depart=${DEPART}`);
    await siegeLibre(page, 1).click();
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await page.getByLabel('Numéro MoMo').fill('691221100');
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page).toHaveURL(/\/paiement\/refus$/, { timeout: 8000 });
    await expect(page.getByText('Solde MoMo insuffisant')).toBeVisible();
    await expect(page.getByText(/place gardée/)).toBeVisible();
    await shot(page, '07-refus');
    await page.getByRole('button', { name: /Réessayer avec Orange Money/ }).click();
    await expect(page).toHaveURL(/\/paiement(\?|$)/);
    await expect(page.getByLabel('Numéro Orange Money')).toBeVisible();
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await page.getByRole('button', { name: /Simuler la validation Orange/ }).click();
    await expect(page).toHaveURL(/\/pass\?billet=/, { timeout: 6000 });
  });

  test('carte : formulaire validé avant de payer', async ({ page }) => {
    await aller(page, `/siege?depart=${DEPART}`);
    await siegeLibre(page, 2).click();
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await page.getByRole('radio', { name: /Carte bancaire/ }).click();
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page.getByText('Numéro de carte invalide')).toBeVisible();
    await shot(page, '08-carte');
    await page.getByLabel('Numéro de carte').fill('4111111111111111');
    await page.getByLabel('Expiration').fill('1230');
    await page.getByLabel('Code', { exact: true }).fill('123');
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page).toHaveURL(/\/paiement\/attente$/);
    await page.getByRole('button', { name: /Simuler la validation/ }).click();
    await expect(page).toHaveURL(/\/pass\?billet=/, { timeout: 6000 });
  });

  test('visage : Face ID confirme tout seul', async ({ page }) => {
    await aller(page, `/siege?depart=${DEPART}`);
    await siegeLibre(page, 3).click();
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await page.getByRole('radio', { name: /Face ID/ }).click();
    await page.getByRole('button', { name: 'Confirmer par le visage' }).click();
    await expect(page.getByText('Reconnue · aucun code à taper')).toBeVisible();
    await shot(page, '09-visage');
    await page.getByRole('button', { name: /^Payer 7 000 F/ }).click();
    await expect(page).toHaveURL(/\/pass\?billet=/, { timeout: 10000 });
  });

  test('billet d’Aïcha : hologramme, hors ligne, annulation avec remboursement', async ({ page }) => {
    await aller(page, '/pass');
    await expect(page.getByText('AM-7F3K-22')).toBeVisible();
    const holo = page.getByRole('group', { name: /Billet holographique/ });
    const boite = (await holo.boundingBox())!;
    await page.mouse.move(boite.x + boite.width * 0.85, boite.y + boite.height * 0.15);
    await shot(page, '10-holo-incline');
    // « Sans réseau » s'ouvre dans une fenêtre sur la page Billets : l'adresse ne change pas
    await page.getByRole('button', { name: 'Sans réseau' }).click();
    const hors = page.getByRole('dialog', { name: 'Sans réseau' });
    await expect(hors.getByText('sceau vérifié sur ce téléphone')).toBeVisible();
    await expect(hors.getByText('Billet signé, valable sans internet.')).toBeVisible();
    await expect(page).toHaveURL(/\/pass(\?|$)/);
    await shot(page, '11-hors-ligne');
    await page.keyboard.press('Escape');
    await expect(hors).toBeHidden();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    const annule = page.getByRole('dialog', { name: 'Annuler ce billet' });
    await expect(annule.getByText('− 750 F')).toBeVisible();
    await expect(annule.getByText('6 750 F').first()).toBeVisible();
    await shot(page, '12-annule');
    await annule.getByRole('button', { name: 'Confirmer l’annulation' }).click();
    await expect(annule.getByText('6 750 F renvoyés sur MoMo')).toBeVisible();
    await shot(page, '13-annule-fait');
    await annule.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByText('REMBOURSÉ', { exact: true })).toBeVisible();
  });

  test('liens profonds : /pass/hors-ligne et /pass/annule restent des pages valides', async ({ page }) => {
    await aller(page, '/pass/hors-ligne?billet=b-aicha1');
    await expect(page.getByText('sceau vérifié sur ce téléphone')).toBeVisible();
    await shot(page, '11b-hors-ligne-page');
    await aller(page, '/pass/annule?billet=b-aicha1');
    await expect(page.getByText('− 750 F')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer l’annulation' }).click();
    await expect(page.getByText('6 750 F renvoyés sur MoMo')).toBeVisible();
  });

  test('bus entier : cagnotte, démo, part payée', async ({ page }) => {
    await aller(page, '/groupe');
    await expect(page.getByText('260 000 F').first()).toBeVisible();
    await shot(page, '14-groupe');
    await page.getByRole('button', { name: '30 pl.' }).click();
    await expect(page.getByText('180 000 F').first()).toBeVisible();
    await page.getByRole('button', { name: /un participant/ }).click();
    await page.getByRole('button', { name: /Partager le lien/ }).click();
    await expect(page.getByText('Message WhatsApp envoyé')).toBeVisible();
    await page.getByRole('link', { name: /Payer ma part · 6 000 F/ }).click();
    await expect(page).toHaveURL(/\/paiement(\?|$)/);
    await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
    await page.getByRole('button', { name: /Simuler la validation/ }).click();
    await expect(page).toHaveURL(/\/groupe$/, { timeout: 6000 });
    await expect(page.getByText('2 parts payées sur 30.')).toBeVisible();
  });

  test('pour un proche : Aïcha paie le voyage de Marie', async ({ page }) => {
    await aller(page, `/siege?depart=${DEPART}`);
    await siegeLibre(page, 4).click();
    await page.getByRole('button', { name: 'Pour un proche' }).click();
    await expect(page).toHaveURL(/\/proche/);
    await expect(page.getByText(/AfriMove : Aïcha a payé ton billet/)).toBeVisible();
    await shot(page, '15-proche');
    await page.getByRole('button', { name: /Payer 7 000 F pour Marie/ }).click();
    await expect(page).toHaveURL(/\/paiement\/attente$/);
    await page.getByRole('button', { name: /Simuler la validation/ }).click();
    await expect(page).toHaveURL(/\/pass\?billet=/, { timeout: 6000 });
  });

  test('covoiturage : réserver 2 places', async ({ page }) => {
    await aller(page, '/paiement?covoit=v1');
    await expect(page.getByText('4 500 F').first()).toBeVisible();
    await page.getByRole('button', { name: 'Une place de plus' }).click();
    await expect(page.getByText('9 000 F').first()).toBeVisible();
    await shot(page, '16-covoit');
    await page.getByRole('button', { name: /^Payer 9 000 F/ }).click();
    await page.getByRole('button', { name: /Simuler la validation/ }).click();
    await expect(page.getByText('Paiement confirmé').first()).toBeVisible();
  });
});
