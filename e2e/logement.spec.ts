import { expect, test } from '@playwright/test';
import { aller, contient, ouvrirDemo } from './aide';

// Pixel PNG : un vrai fichier image pour les justificatifs.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('logement : avance de loyer payée au bailleur', () => {
  test('refusée à 34 % avec 10 mois, acceptée à 12 mois ; pièces, compte vérifié par SMS, accord du bailleur, puis prélevée avec le loyer', async ({ page }) => {
    await ouvrirDemo(page);
    await aller(page, '/logement/avance');
    const corps = page.locator('body');
    // 80 000 de loyer, 6 mois d'avance, 10 mois : 34 % du salaire avec le crédit scolaire → au-dessus de 33 %
    await expect(corps).toContainText(contient('Versé au bailleur à la signature 480 000'));
    await expect(corps).toContainText(contient('34 % DU SALAIRE'));
    await expect(corps).toContainText('Au-dessus de 33 %');
    await page.getByRole('button', { name: 'Allongez le remboursement à 12 mois.' }).click();
    await expect(corps).toContainText(contient('32 % DU SALAIRE'));
    await page.getByRole('button', { name: 'Ajouter le bail et le bailleur' }).click();

    await page.getByLabel('Nom du logement', { exact: false }).fill('Appartement Test');
    await page.getByLabel('Nom du bailleur', { exact: false }).fill('Paul Essomba');
    for (const piece of ['Bail signé', 'CNI du bailleur', 'Photos du logement']) {
      await page.getByRole('button', { name: new RegExp(piece) }).click();
      await page.locator('input[type=file]').first().setInputFiles({ name: 'piece.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: 'Terminé' }).click();
    }
    await page.getByRole('button', { name: /Compte du bailleur/ }).click();
    await page.getByLabel(/Numéro du téléphone/i).fill('690123456');
    await page.getByLabel(/Titulaire/i).fill('ESSOMBA Paul');
    await page.getByRole('button', { name: /Enregistrer et envoyer le SMS/ }).click();
    await page.getByLabel(/Code reçu par le bailleur/i).fill('123456');
    await page.getByRole('button', { name: 'Vérifier le compte' }).click();
    await page.getByRole('button', { name: 'Envoyer au bailleur pour accord' }).click();

    await expect(page).toHaveURL(/\/logement\/bailleur$/);
    await expect(corps).toContainText(contient('Prélèvement, 12 mois 124 006 / mois'));
    await page.getByRole('button', { name: 'Lancer la décision' }).click();
    await expect(page.getByText('Dossier accepté')).toBeVisible();
    await page.getByRole('button', { name: /Le bailleur répond OUI/ }).click();
    await expect(page.getByRole('link', { name: 'Voir mon logement' })).toBeVisible();

    // le prélèvement du 28 oct. porte une seule ligne logement (loyer 80 000 + remboursement 1 / 12) : 193 006 au total,
    // sans alerte rouge : le plafond de 33 % vise les crédits (168 006 = 32 %), pas le Pass ni les coffres
    await aller(page, '/prelevement');
    await expect(page.getByTestId('total-preleve')).toContainText('193 006');
    await expect(page.getByRole('button', { name: /Logement · loyer et avance, 124 006/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Détails$/ })).toHaveCount(4);
    await expect(page.locator('.pct.dan')).toHaveCount(0);
  });
});
