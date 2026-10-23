import { expect, type Page } from '@playwright/test';
import { test, aller, confirmerPaiement, contient, ouvrirDemo, patcherEtat, solde } from './aide';

async function versLaFacture(page: Page) {
  await ouvrirDemo(page);
  await page.getByRole('link', { name: /Facture Clinique Les Palmiers à régler/ }).click();
  await expect(page).toHaveURL(/\/pay\/facture\?id=f-1190/);
}

test.describe('facture des Palmiers (tiers payant)', () => {
  test('payer la part : 7 100 débités, AssureMe règle 28 400, la facture disparaît partout', async ({ page }) => {
    await versLaFacture(page);
    await expect(page.locator('body')).toContainText(contient('AssureMe paie la clinique · 80 % 28 400'));
    await page.getByRole('button', { name: /Confirmer · 7 100 FCFA/ }).click();
    await confirmerPaiement(page);
    const recu = page.locator('body');
    await expect(recu).toContainText('Payé. La clinique est réglée.');
    await expect(recu).toContainText(contient('Nouveau solde 79 400 FCFA'));
    await expect(recu).toContainText(contient('+4 · 746'));

    // accueil : solde débité, plus de facture à régler, un mouvement
    await aller(page, '/');
    await expect.poll(() => solde(page)).toBe(79_400);
    await expect(page.getByText('Facture Clinique Les Palmiers à régler')).toHaveCount(0);
    await page.getByRole('button', { name: 'Historique' }).click();
    await expect(page.getByRole('dialog')).toContainText('Clinique Les Palmiers');
    await expect(page.getByRole('dialog')).toContainText('−7 100');
    await page.getByRole('button', { name: 'Fermer' }).click();

    // score : +4 points, visibles dans le journal de l'écran Score (une seule voie pour tous les gains de points)
    await aller(page, '/score');
    await expect(page.locator('body')).toContainText(contient('Facture Clinique Les Palmiers payée à l’heure'));
    await expect(page.locator('body')).toContainText('+4');

    // santé : la même facture n'est plus à régler, le plafond a bougé (214 400 / 1 200 000), pas de double paiement possible
    await aller(page, '/sante');
    await expect(page.locator('body')).toContainText('Aucune facture à régler');
    await expect(page.locator('body')).toContainText('214 400 / 1 200 000');
    await aller(page, '/pay/facture?id=f-1190');
    await expect(page.getByText('Facture déjà réglée.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmer/ })).toHaveCount(0);
  });

  test('étaler sur 3 mois : solde intact, une seule ligne « Soins » de 2 438 au prochain prélèvement', async ({ page }) => {
    await versLaFacture(page);
    await page.getByRole('radio', { name: /Étaler sur 3 mois/ }).click();
    await page.getByRole('button', { name: /Confirmer · 2 438 FCFA × 3/ }).click();
    await confirmerPaiement(page);
    await expect(page.locator('body')).toContainText('Facture réglée, étalée sur salaire.');

    await aller(page, '/');
    await expect.poll(() => solde(page)).toBe(86_500);
    // prélèvement du 28 oct. : 69 000 + 2 438, la mensualité n'apparaît qu'une fois
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('71 438');
    await expect(page.getByRole('button', { name: /Soins · Clinique Les Palmiers, 2 438/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Détails$/ })).toHaveCount(4);

    // côté santé la facture est « étalée », elle n'est plus à régler
    await aller(page, '/sante');
    await expect(page.locator('body')).toContainText('Aucune facture à régler');
  });

  test('solde insuffisant : on propose de recharger, rien n’est débité', async ({ page }) => {
    await ouvrirDemo(page);
    await patcherEtat(page, (e) => { e.solde = 5_000; });
    expect(await solde(page)).toBe(5_000);
    await page.getByRole('link', { name: /Facture Clinique Les Palmiers à régler/ }).click();
    await expect(page.getByText(/Solde insuffisant : il vous manque 2 100 FCFA/)).toBeVisible();
    await page.getByRole('button', { name: /Recharger puis payer/ }).click();
    // la feuille de recharge s'ouvre avec le montant manquant arrondi (3 000)
    await expect(page.getByRole('button', { name: 'Recharger 3 000' })).toBeVisible();
    await page.getByRole('button', { name: 'Recharger 3 000' }).click();
    await expect.poll(() => solde(page)).toBe(8_000);
  });
});
