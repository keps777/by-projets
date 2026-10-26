import { chemin, expect, ouvrir, sansDebordement, test } from './aide';

test('sans compte, l’accueil renvoie vers l’ouverture ; avec un compte, il s’affiche', async ({ page }) => {
  await ouvrir(page, '/'); await expect.poll(() => chemin(page)).toBe('/ouverture');
});
test('Alex connecté voit l’accueil provisoire et l’annuaire des écrans', async ({ page }) => {
  await ouvrir(page, '/', { connecte: 'ACC-0412' });
  await expect(page.getByText('Bonjour Alex')).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
  await page.goto('/ecrans'); await expect(page.getByRole('heading', { name: 'Tous les écrans', level: 1 }).or(page.getByText('Tous les écrans').first())).toBeVisible();
});
test('une page inconnue affiche 404 et ramène à l’accueil', async ({ page }) => {
  await ouvrir(page, '/nimporte-quoi', { connecte: 'ACC-0412' }); await expect(page.getByText('404')).toBeVisible();
  await page.getByRole('button', { name: /Retour à l’accueil/ }).click(); await expect(page.getByText('Bonjour Alex')).toBeVisible();
});
