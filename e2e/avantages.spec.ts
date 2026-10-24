// Les avantages de la voyageuse : le geste commercial d'un retard (cagnotte) et un bon de fidélité se lisent dans « Moi » et se déduisent au paiement.
import { aller, billetAichaSur, entrerEn, expect, lireEtat, ouvrir, siegeLibre, test } from './aide';

const FINEX = 'd-2026-11-04-FX-Classique-mvan-aller-0615';
const payerUnBillet = async (page: import('@playwright/test').Page, libelle: RegExp) => {
  await aller(page, `/siege?depart=${FINEX}`);
  await siegeLibre(page).click();
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await expect(page).toHaveURL(/\/paiement(\?|$)/);
  await expect(page.getByRole('button', { name: libelle })).toBeVisible();
};

test('la cagnotte d’un geste commercial est lisible dans « Moi » et déduite au paiement', async ({ page }) => {
  // Émile annonce 30 min de retard sur le départ d'Aïcha ; elle garde sa place et reçoit 500 F de geste commercial
  await ouvrir(page, '/chauffeur', { connecte: 'p-emile', preparer: (e) => billetAichaSur(e, 'd-2026-11-03-BX-VIP-mvan-aller-0800') });
  await page.getByRole('button', { name: '+30 min' }).click();
  await entrerEn(page, 'p-aicha');
  await aller(page, '/direct/retard');
  await page.getByRole('button', { name: 'Garder · voir mon billet' }).click();
  await expect(page.getByText(/500 F crédités sur ta cagnotte/)).toBeVisible();

  await aller(page, '/moi');
  await expect(page.getByTestId('avantages')).toContainText('cagnotte 500 F');
  await aller(page, '/moi/fidelite');
  await expect(page.getByTestId('cagnotte')).toContainText('500 F');

  // au paiement : −500 F, consommés à l'acceptation seulement
  await payerUnBillet(page, /^Payer 5 500 F/);
  await expect(page.getByTestId('remise')).toContainText('Cagnotte');
  await expect(page.getByTestId('remise')).toContainText('−500 F');
  await page.getByRole('button', { name: /^Payer 5 500 F/ }).click();
  await expect(page).toHaveURL(/\/paiement\/attente$/);
  expect(((await lireEtat(page)).tranches.route as { cagnotte: Record<string, number> }).cagnotte['p-aicha']).toBe(500); // pas encore débitée
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/pass\?billet=/);
  const e = await lireEtat(page);
  expect((e.tranches.route as { cagnotte: Record<string, number> }).cagnotte['p-aicha']).toBe(0);
  const billet = e.monde.billets.find((b) => b.id !== 'b-aicha1' && b.acheteurId === 'p-aicha' && b.departId === FINEX)!;
  expect(billet.prix).toBe(6000);
  expect(e.monde.paiements.find((p) => p.id === billet.paiementId)).toMatchObject({ statut: 'ok', montant: 5500, remise: { cagnotte: 500, bon: 0, consommee: true } });
  await aller(page, '/moi');
  await expect(page.getByTestId('avantages')).toHaveCount(0);
});

test('un bon de fidélité de 500 F se déduit du total, et peut être laissé de côté', async ({ page }) => {
  await ouvrir(page, '/moi/fidelite', { connecte: 'p-aicha' });
  await page.getByRole('button', { name: /^Utiliser 500 pts/ }).click();
  await expect(page.getByLabel('Bons de réduction')).toContainText('Bon de 500 F');
  await payerUnBillet(page, /^Payer 5 500 F/);
  // désactivé : plein tarif
  await page.getByRole('switch', { name: /Utiliser mes avantages/ }).click();
  await expect(page.getByRole('button', { name: /^Payer 6 000 F/ })).toBeVisible();
  await page.getByRole('switch', { name: /Utiliser mes avantages/ }).click();
  await page.getByRole('button', { name: /^Payer 5 500 F/ }).click();
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/pass\?billet=/);
  const e = await lireEtat(page);
  const fid = (e.tranches.entree as { fidelite: Record<string, { bons: { utilise: boolean }[] }> }).fidelite['p-aicha'];
  expect(fid.bons.every((b) => b.utilise)).toBe(true);
  await aller(page, '/moi/fidelite');
  await expect(page.getByLabel('Bons de réduction')).toHaveCount(0);
});

test('un billet réservé en route (sans siège) se règle depuis /paiement?paiement=…', async ({ page }) => {
  await ouvrir(page, '/arret', { connecte: 'p-aicha', maintenant: '2026-11-03T08:40' });
  await page.getByRole('radio', { name: /Edéa/ }).click();
  await page.getByRole('button', { name: /Monter ici/ }).click();
  await expect(page).toHaveURL(/\/paiement\?paiement=/);
  await expect(page.getByText('Sans siège attribué')).toBeVisible();
  await expect(page.getByText('Rien à payer')).toHaveCount(0);
  await page.getByRole('button', { name: /^Payer 2 150 F/ }).click();
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/pass\?billet=/);
  const e = await lireEtat(page);
  expect(e.monde.billets.find((b) => b.siege === null && b.acheteurId === 'p-aicha')).toMatchObject({ statut: 'valide', prix: 2150 });
});
