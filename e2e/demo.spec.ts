import { expect, test } from '@playwright/test';
import { contient, ouvrirDemo, solde } from './aide';

const CODE_DEMO = '482916';

test.describe('compte de démonstration : accueil et prélèvement', () => {
  test('accueil : solde, score, facture à régler et prélèvement du 28 oct. de 69 000 comme dans la maquette', async ({ page }) => {
    await ouvrirDemo(page);
    expect(await solde(page)).toBe(86_500);
    const corps = page.locator('body');
    await expect(corps).toContainText(/niveau pro/i);
    await expect(corps).toContainText('742');
    await expect(corps).toContainText('Paie le 28 oct.');
    // facture des Palmiers : la part du membre (7 100) et l'échéance de la clinique
    await expect(page.getByText('Facture Clinique Les Palmiers à régler')).toBeVisible();
    await expect(page.getByText('7 100 à payer avant le 25 oct.')).toBeVisible();
    // bandeau « Prochain prélèvement » : 69 000 = Pass 12 500 + école 44 000 + coffre Rentrée 12 500
    const bandeau = page.getByRole('link', { name: /Prochain prélèvement/ });
    await expect(bandeau).toContainText('69 000');
    await expect(bandeau).toContainText('PASS 12 500');
    await expect(bandeau).toContainText('MENSUALITÉ 44 000');
    await expect(bandeau).toContainText('COFFRE 12 500');
    // deux notifications non lues
    await expect(page.getByRole('button', { name: 'Notifications, 2 non lues' })).toBeVisible();
  });

  test('prélèvement sur salaire : trois lignes sans doublon, Pass = 25 000 − 12 500 de l’employeur', async ({ page }) => {
    await ouvrirDemo(page);
    await page.getByRole('link', { name: /Prochain prélèvement/ }).click();
    await expect(page).toHaveURL(/\/prelevement$/);
    await expect(page.getByTestId('total-preleve')).toContainText('69 000');
    await expect(page.getByTestId('total-preleve')).toContainText('520 000');
    const lignes = page.getByRole('button', { name: /Détails$/ });
    await expect(lignes).toHaveCount(3);
    await expect(lignes.nth(0)).toHaveAccessibleName(/Pass Famille, 12 500/);
    await expect(lignes.nth(1)).toHaveAccessibleName(/Mensualité école 3 \/ 10, 44 000/);
    await expect(lignes.nth(2)).toHaveAccessibleName(/Coffre Rentrée 2027, 12 500/);
    await expect(page.getByText('13 % · PLAFOND 33 %')).toBeVisible();
    // le détail du Pass parle de la part de l'employeur
    await lignes.nth(0).click();
    await expect(page.getByRole('dialog')).toContainText('12 500');
  });

  test('la notification de la facture mène à la facture des Palmiers (pas à une page vide)', async ({ page }) => {
    await ouvrirDemo(page);
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await page.getByRole('button', { name: /Facture Les Palmiers à régler/ }).click();
    await expect(page).toHaveURL(/\/pay\/facture\?id=f-1190/);
    await expect(page.getByRole('heading', { name: 'Clinique Les Palmiers' })).toBeVisible();
    await expect(page.locator('body')).toContainText(contient('Votre part 7 100'));
  });
});
