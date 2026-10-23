import { expect, test } from '@playwright/test';
import { aller, attendreEnregistrement, contient, etatEnregistre, ouvrirDemo, patcherEtat } from './aide';

test.describe('règle des 33 % et crédit auto', () => {
  test('Yaris en 36 mois avec 500 000 d’apport : refusée à 40 % à cause du crédit scolaire', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/auto/catalogue');
    await page.getByRole('button', { name: 'Simuler la Yaris' }).click();
    await expect(page).toHaveURL(/\/auto\/simulation$/);
    const corps = page.locator('body');
    await expect(corps).toContainText(contient('162 610'));
    await expect(corps).toContainText(contient('40 % du salaire net'));
    await expect(corps).toContainText(contient('dont ce crédit 31 % + 44 000 déjà prélevés'));
    await expect(corps).toContainText('TROP LOURD');
    // l'apport proposé est celui du vrai coffre « Apport voiture » (500 000), pas un montant inventé
    await expect(corps).toContainText(contient('Coffre voiture : 500 000 disponibles'));
    await page.getByRole('button', { name: /Demander quand même la décision/ }).click();
    await expect(page).toHaveURL(/\/auto\/decision$/);
    await expect(corps).toContainText(/REFUSÉ/i);
    await expect(corps).toContainText(/40 %/);

    // aucun crédit n'est créé, le prélèvement reste à 69 000, une notification de refus est envoyée
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');
    await page.getByRole('button', { name: /Notifications|Retour/ }).first().click().catch(() => {});
    await attendreEnregistrement(page, (e) => e?.notifications?.some((n: any) => n.titre === 'Crédit auto refusé'));
    const e = await etatEnregistre(page);
    expect(e.credits.filter((c: any) => c.produit === 'auto')).toHaveLength(0);
  });

  test('au-delà de 33 %, l’étalement d’une facture est indisponible (même règle que le crédit)', async ({ page }) => {
    await ouvrirDemo(page);
    await patcherEtat(page, (e) => {
      e.credits.push({ id: 'c-test', produit: 'logement', libelle: 'Crédit de test', capital: 1_000_000, mensualite: 130_000, duree: 10, payees: 0, prochaine: '2026-10-28', statut: 'actif' });
    });
    await aller(page, '/pay/facture?id=f-1190');
    const etaler = page.getByRole('radio', { name: /Étaler sur 3 mois/ });
    await expect(etaler).toBeDisabled();
    await expect(page.getByText('Indisponible : dépasserait 33 % de votre salaire')).toBeVisible();
    // payer comptant reste possible
    await expect(page.getByRole('radio', { name: /Payer maintenant/ })).toBeChecked();
    // la même règle côté santé : l'écran de la facture santé refuse aussi l'étalement
    await aller(page, '/sante/facture/f-1190');
    await page.getByRole('radio', { name: /Étaler sur 3 mois/ }).click();
    await expect(page.getByRole('alert')).toContainText(/Mensualités totales 34 %/);
    await expect(page.getByRole('button', { name: /^Confirmer/ })).toBeDisabled();
  });
});
