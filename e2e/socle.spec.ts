import { chemin, expect, ouvrir, sansDebordement, test } from './aide';

test('à la première visite, le lien de l’application ouvre l’écran d’ouverture ; une page réservée y renvoie aussi', async ({ page }) => {
  await ouvrir(page, '/'); await expect.poll(() => chemin(page)).toBe('/ouverture'); await expect(page.getByRole('button', { name: /Commencer/ }).or(page.getByRole('link', { name: /Commencer/ })).first()).toBeVisible();
  await page.goto('/explorer'); await expect(page.getByText('Bienvenue sur NexG-TT')).toBeVisible();
  await page.goto('/prive'); await expect.poll(() => chemin(page)).toBe('/ouverture');
});
test('un appareil qui connaît déjà un compte ouvre directement la connexion', async ({ page }) => {
  await ouvrir(page, '/', { preparer: (e) => { e.tranches.acces = { appareil: { compteId: 'ACC-0412' } }; } }); await expect.poll(() => chemin(page)).toBe('/connexion');
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
