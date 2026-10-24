// Le monde simulé de démonstration : remise à zéro complète (équipages, historique), stockage de taille raisonnable, comptes suspendus masqués, un seul numéro de quai.
import { aller, entrerEn, expect, lireEtat, ouvrir, tailleStockage, test } from './aide';

const LIMITE = 400_000;

test('« Remettre le monde à zéro » rejoue les démarrages : équipages, historique, et le stockage reste léger', async ({ page }) => {
  await ouvrir(page, '/entree');
  await expect(page.getByRole('button', { name: 'Entrer directement comme Aïcha' })).toBeVisible();
  const avant = await lireEtat(page);
  expect(avant.monde.billets.length).toBeGreaterThan(600); // l'historique du patron est chargé au démarrage
  expect(avant.monde.departs.filter((d) => d.chauffeurId === 'p-emile').length).toBeGreaterThan(10); // Émile conduit les 08:00 et 19:00 VIP, 13:00 Bafoussam
  expect(await tailleStockage(page)).toBeLessThan(LIMITE);

  // une activité de plus (la voyageuse paie un billet), puis tout remettre à zéro
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await aller(page, '/entree');
  await page.getByRole('button', { name: 'Remettre le monde à zéro' }).click();
  await expect.poll(async () => (await lireEtat(page)).monde.billets.length).toBeGreaterThan(600);
  const apres = await lireEtat(page);
  expect(apres.session.personneId).toBeNull();
  expect(apres.monde.departs.filter((d) => d.chauffeurId === 'p-emile').length).toBe(avant.monde.departs.filter((d) => d.chauffeurId === 'p-emile').length);
  expect(apres.monde.departs.filter((d) => d.convoyeurId === 'p-youssouf').length).toBeGreaterThan(10);
  expect((apres.tranches.patron as { historique?: { billets: number } }).historique?.billets).toBeGreaterThan(600);
  expect(apres.monde.caisses.filter((c) => c.id.startsWith('c-h-')).length).toBeGreaterThan(15);
  expect(await tailleStockage(page)).toBeLessThan(LIMITE);
  // et le monde remis à zéro est directement jouable : le patron lit des chiffres
  await entrerEn(page, 'p-luther');
  await expect(page.getByText('RECETTE DU JOUR', { exact: false })).toBeVisible();
});

test('les comptes suspendus ne figurent plus à l’entrée de démonstration', async ({ page }) => {
  await ouvrir(page, '/entree', { preparer: (e) => { e.monde.personnes.find((p) => p.id === 'p-ibrahim')!.actif = false; } });
  await expect(page.getByRole('button', { name: /Fatou Mbarga/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ibrahim Sali/ })).toHaveCount(0);
  await expect(page.getByText(/1 compte suspendu \(masqué\)/)).toBeVisible();
});

test('un seul numéro de quai par départ : celui du quai, du superviseur, du guichet et de la voyageuse', async ({ page }) => {
  await ouvrir(page, '/quai', { connecte: 'p-ibrahim' });
  const titre = await page.locator('.hd .ttl').first().textContent();
  const n = /^Quai (\d) · 07:30 Bafoussam/.exec(titre ?? '')?.[1];
  expect(n, titre ?? '').toBeTruthy();
  await entrerEn(page, 'p-abdou');
  await expect(page.locator('a.q', { hasText: '07:30' }).first().locator('.lab')).toHaveText(`Q${n}`);
  await entrerEn(page, 'p-fatou');
  await expect(page.locator('a.g-dep', { hasText: '07:30' }).first()).toContainText(`quai ${n}`);
});
