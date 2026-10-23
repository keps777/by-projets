import { expect, test } from '@playwright/test';
import { aller, confirmerPaiement, contient, ouvrirDemo, solde } from './aide';

/** Les portails partenaires lisent et écrivent la même tranche que l'application membre. */
test.describe('portails partenaires ↔ application membre', () => {
  test('école : publier une grille change les frais vus par la famille, avec une notification', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/portail/ecole');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Frais de scolarité' }).click();
    const champ = page.getByLabel('3e', { exact: true });
    await expect(champ).toHaveValue(contient('250 000'));
    await champ.fill('260000');
    await page.getByRole('button', { name: 'Publier la grille' }).click();
    await expect(page.getByRole('status').or(page.getByText(/publiée|Grille publiée/i)).first()).toBeVisible();

    // côté famille : Lisa passe en 3e à 260 000, le total rentrée et le financement suivent
    await aller(page, '/ecole/frais');
    const t = page.locator('body');
    await expect(t).toContainText(contient('Lisa · 3e'));
    await expect(t).toContainText(contient('Total rentrée · 3 enfants 610 000'));
    await expect(t).toContainText(contient('À financer 450 000'));
    await aller(page, '/notifications');
    await expect(t).toContainText('Collège La Rochelle a mis à jour ses frais');
  });

  test('hôpital : la clinique émet une facture, le membre la voit (accueil, santé, paiements) et la règle une seule fois', async ({ page }) => {
    await ouvrirDemo(page);
    // portail : lecture de la carte (simulation du scan du QR), puis une facture d'imagerie
    await aller(page, '/portail/hopital');
    await page.getByRole('button', { name: /Lire la carte/ }).click();
    await expect(page.getByText('Couverture active')).toBeVisible();
    await page.getByLabel('Acte principal').fill('Radiographie');
    await page.getByLabel('Médecin').fill('Dr Essomba');
    await page.getByLabel('Libellé').first().fill('Radio du poignet');
    await page.getByLabel('Montant').first().fill('20000');
    await page.getByRole('button', { name: /Valider la facture|Émettre|Valider/ }).first().click();
    await expect(page.getByText(/Facture F-2026-\d+ validée pour Aïcha Ndiba/)).toBeVisible();

    // membre : deux factures à régler sur l'accueil (les Palmiers d'hier et la radio), 4 000 pour la radio (80 % pris en charge)
    await aller(page, '/');
    const cartes = page.getByRole('link', { name: /Facture Clinique Les Palmiers à régler/ });
    await expect(cartes).toHaveCount(2);
    await expect(page.getByText(/4 000 à payer avant le/)).toBeVisible();
    await cartes.last().click();
    await expect(page).toHaveURL(/\/pay\/facture\?id=/);
    await expect(page.locator('body')).toContainText(contient('Radio du poignet 20 000'));
    await expect(page.locator('body')).toContainText(contient('Votre part 4 000'));

    // payée depuis les paiements : plus qu'une facture à régler, ni sur l'accueil ni dans l'écran Santé
    await page.getByRole('button', { name: /Confirmer · 4 000 FCFA/ }).click();
    await confirmerPaiement(page);
    await aller(page, '/');
    await expect(page.getByRole('link', { name: /Facture Clinique Les Palmiers à régler/ })).toHaveCount(1);
    await expect.poll(() => solde(page)).toBe(82_500);
    await aller(page, '/sante');
    await expect(page.getByRole('button', { name: /Régler ma part/ }).or(page.getByRole('link', { name: /Régler ma part/ }))).toHaveCount(1);
    await expect(page.locator('body')).toContainText(contient('Lisa Ndiba · Consultation pédiatrie'));
    await expect(page.locator('body')).not.toContainText(contient('Aïcha Ndiba · Radiographie'));
  });
});

test.describe('portail entreprise ↔ prélèvement du membre', () => {
  test('le fichier de retenues de l’employeur et le prélèvement du membre disent la même chose (69 000), et la part employeur pilote le Pass', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/portail/entreprise?vue=retenues');
    const ligne = page.getByRole('row', { name: /NDL-0412/ });
    await expect(ligne).toContainText(contient('Aïcha Ndiba 12 500 44 000 12 500 69 000 Validé'));

    // l'employeur ne prend plus rien en charge : le Pass d'Aïcha passe à 25 000, le fichier et l'application suivent
    await aller(page, '/portail/entreprise?vue=parametres');
    await page.getByRole('radio', { name: 'Aucune' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Paramètres enregistrés')).toBeVisible();
    await aller(page, '/portail/entreprise?vue=retenues');
    await expect(page.getByRole('row', { name: /NDL-0412/ })).toContainText(contient('Aïcha Ndiba 25 000 44 000 12 500 81 500 Validé'));

    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('81 500');
    await expect(page.getByRole('button', { name: /Pass Famille, 25 000/ })).toBeVisible();
    await aller(page, '/profil');
    await expect(page.locator('body')).toContainText(contient('Pass Famille 25 000 FCFA / mois'));
  });

  test('le portail entreprise suit le compte du membre : un coffre suspendu disparaît du fichier de retenues', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/coffres');
    await page.getByRole('link', { name: /Détail/ }).or(page.getByRole('button', { name: /Détail/ })).first().click();
    await page.getByRole('switch', { name: 'Versement automatique' }).click();
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('56 500');
    await aller(page, '/portail/entreprise?vue=retenues');
    await expect(page.getByRole('row', { name: /NDL-0412/ })).toContainText(contient('Aïcha Ndiba 12 500 44 000 0 56 500 Validé'));
  });
});
