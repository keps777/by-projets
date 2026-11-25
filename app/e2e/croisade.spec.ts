import { expect, test } from '@playwright/test';

test('Croisade : réglage, bloc du jour avec Day, temps et suivi, dans le texte du rapport', async ({ page }) => {
  await page.goto('/rapports');
  await page.getByRole('button', { name: /Ajouter une croisade/ }).click();
  await page.getByRole('button', { name: 'Enregistrer la croisade' }).click();
  const carte = page.getByRole('region', { name: 'Croisade' });
  await expect(carte).toContainText('Day : 1/40');
  await expect(carte).toContainText('Recherche de Dieu seul : 0h00/6h');
  await expect(carte).toContainText('Un profil ZTF écouté : Non, 0/40');
  await carte.getByRole('button', { name: 'Un profil ZTF écouté' }).click();
  await expect(carte).toContainText('Un profil ZTF écouté : Oui, 1/40');
  await expect(page.getByRole('region', { name: 'Croisade' })).toBeVisible();
});
