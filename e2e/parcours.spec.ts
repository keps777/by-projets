// Le parcours d'accès de bout en bout, tel que le vivra une nouvelle voyageuse : ouverture → langue → promesses → inscription → code → profil → partage → notifications → prêt → accueil.
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';

test('une nouvelle voyageuse crée son compte de bout en bout', async ({ page }) => {
  await ouvrir(page, '/ouverture');
  await page.getByRole('button', { name: /Commencer/ }).or(page.getByRole('link', { name: /Commencer/ })).first().click();
  await expect.poll(() => chemin(page)).toBe('/langue');
  await page.getByRole('button', { name: /Continuer/ }).or(page.getByRole('link', { name: /Continuer/ })).first().click();
  await expect.poll(() => chemin(page)).toBe('/promesses');
  await page.getByRole('button', { name: /Passer/ }).or(page.getByRole('link', { name: /Passer/ })).first().click();
  await expect.poll(() => chemin(page)).toMatch(/^\/(inscription|promesses)$/);
  await page.goto('/inscription');
  await page.getByLabel('Adresse courriel').fill('lea.roy@exemple.test'); await page.getByLabel(/J’accepte les conditions/).check();
  await page.getByRole('button', { name: /Recevoir mon code/ }).click();
  await expect.poll(() => chemin(page)).toBe('/code');
  await page.getByLabel('Code à 6 chiffres').fill('482915');
  await expect.poll(() => chemin(page), { timeout: 8000 }).toBe('/profil');
  expect((await lireEtat(page)).session.compteId).toMatch(/^ACC-/);
  await page.getByLabel(/Prénom/).fill('Léa'); await page.getByLabel(/^Nom/).fill('Roy');
  await page.getByRole('button', { name: /Continuer/ }).first().click(); await expect.poll(() => chemin(page)).toBe('/partage');
  await page.getByRole('button', { name: /Enregistrer mes choix/ }).click(); await expect.poll(() => chemin(page)).toBe('/bienvenue-notifications');
  await page.getByRole('link', { name: /Plus tard/ }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
  expect(await sansDebordement(page)).toBe(true);
  await page.getByRole('button', { name: /Découvrir/ }).or(page.getByRole('link', { name: /Découvrir/ })).first().click(); await expect.poll(() => chemin(page)).toBe('/');
  const e = await lireEtat(page); const c = e.monde.comptes.find((x) => x.id === e.session.compteId)!;
  expect(c.prenom).toBe('Léa'); expect(c.nom).toBe('Roy'); expect(c.carte4).toBeUndefined(); expect(c.identiteVerifiee).toBeUndefined();
  await expect(page.getByText('Bonjour Léa')).toBeVisible();
});

test('un compte connu se reconnecte par le code puis arrive sur l’accueil', async ({ page }) => {
  await ouvrir(page, '/connexion');
  await page.getByLabel(/courriel|téléphone|identifiant/i).first().fill('alex.tremblay@exemple.test');
  await page.getByRole('button', { name: /Continuer|Recevoir/ }).first().click();
  await expect.poll(() => chemin(page)).toBe('/code');
  await page.getByLabel('Code à 6 chiffres').fill('482915');
  await expect.poll(() => chemin(page), { timeout: 8000 }).toBe('/');
  await expect(page.getByText('Bonjour Alex')).toBeVisible();
});
