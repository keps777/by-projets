// La voyageuse (Aïcha) de bout en bout, dans Chromium 390 × 844, à l'heure figée du mardi 3 novembre 2026, 07 h :
// (a) du logo au pass avec QR, (b) paiement refusé puis réessai, (c) annulation avec remboursement de 90 %.
import { aller, chemin, expect, lireMonde, ouvrir, siegeLibre, test } from './aide';

test('(a) splash → tuto → connexion → panorama → départ → siège → paiement MoMo → attente → pass avec QR', async ({ page }) => {
  await ouvrir(page, '/splash');
  await expect(page.getByRole('heading', { name: 'AfriMove' })).toBeVisible();
  await page.getByRole('link', { name: 'Commencer' }).click();
  await expect(page).toHaveURL(/\/tuto$/);
  await page.getByRole('button', { name: 'Suivant' }).click(); await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('link', { name: 'C’est parti' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await page.getByRole('button', { name: 'Lancer la reconnaissance' }).click();
  await expect(page.getByRole('heading', { name: 'Salut Aïcha' })).toBeVisible();
  await page.getByRole('button', { name: 'Voir les départs' }).click();
  await expect(page).toHaveURL(/\/$/);

  // panorama 3D : on choisit le Finex de 06 h 15 (21 places) demain
  const bus = page.locator('.colm.front .bus', { hasText: '06:15' });
  await bus.click();
  await expect(page.locator('.sel')).toContainText('06:15 · Finex');
  const lien = page.locator('.sel a.b.p');
  await expect(lien).toHaveAttribute('href', /^\/siege\?depart=d-2026-11-04-FX-Classique-mvan-aller-0615&prix=6000$/);
  await lien.click();
  await expect(page).toHaveURL(/\/siege\?depart=/);
  await expect(page.getByText('Choisis ta place')).toBeVisible();

  // siège 3D → récapitulatif → MoMo
  await siegeLibre(page).click();
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await expect(page).toHaveURL(/\/paiement(\?|$)/);
  await expect(page.getByText('Frais de service AfriMove')).toBeVisible();
  await expect(page.getByLabel('Numéro MoMo')).toHaveValue('691221008');
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await expect(page).toHaveURL(/\/paiement\/attente$/);
  await expect(page.getByText('On attend MoMo').first()).toBeVisible();
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page.getByText('Paiement confirmé').first()).toBeVisible();
  await expect(page).toHaveURL(/\/pass\?billet=/);
  await expect(page.getByRole('img', { name: /Code à scanner au quai/ })).toBeVisible();
  await expect(page.getByText('signé · valable sans réseau')).toBeVisible();

  // le monde : billet valide, signé, rattaché à Aïcha ; paiement MoMo accepté
  const m = await lireMonde(page);
  const billet = m.billets.find((b) => b.id !== 'b-aicha1' && b.acheteurId === 'p-aicha')!;
  expect(billet).toMatchObject({ statut: 'valide', prix: 6000, canal: 'app' });
  expect(billet.sceau).toMatch(/^[0-9a-f]+$/);
  expect(m.paiements.find((p) => p.id === billet.paiementId)).toMatchObject({ statut: 'ok', moyen: 'momo', montant: 6000 });
  expect(m.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Billet confirmé')).toBe(true);
});

test('(b) paiement refusé (numéro en 00) : la place reste gardée, puis réessai avec Orange Money', async ({ page }) => {
  await ouvrir(page, '/siege?depart=d-2026-11-04-FX-Classique-mvan-aller-0615', { connecte: 'p-aicha' });
  await siegeLibre(page, 1).click();
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await page.getByLabel('Numéro MoMo').fill('691221100');
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await expect(page).toHaveURL(/\/paiement\/refus$/);
  await expect(page.getByText('Solde MoMo insuffisant')).toBeVisible();
  await expect(page.getByText(/place gardée/)).toBeVisible();
  let m = await lireMonde(page);
  expect(m.paiements.filter((p) => p.statut === 'refuse').length).toBe(1);
  expect(m.paiements.filter((p) => p.statut === 'attente' && p.payeurId === 'p-aicha').length).toBe(1); // la même place, retenue de nouveau jusqu'à l'échéance

  await page.getByRole('button', { name: /Réessayer avec Orange Money/ }).click();
  await expect(page).toHaveURL(/\/paiement(\?|$)/);
  await expect(page.getByLabel('Numéro Orange Money')).toBeVisible();
  await page.getByRole('button', { name: /^Payer 6 000 F/ }).click();
  await page.getByRole('button', { name: /Simuler la validation Orange/ }).click();
  await expect(page).toHaveURL(/\/pass\?billet=/);
  m = await lireMonde(page);
  const billet = m.billets.find((b) => b.id !== 'b-aicha1' && b.acheteurId === 'p-aicha' && b.statut === 'valide')!;
  expect(billet).toBeTruthy();
  expect(m.paiements.find((p) => p.id === billet.paiementId)).toMatchObject({ statut: 'ok', moyen: 'om' });
  // aucune place retenue en double : un seul billet valide pour ce départ chez Aïcha
  expect(m.billets.filter((b) => b.departId === billet.departId && b.acheteurId === 'p-aicha' && (b.statut === 'valide' || b.statut === 'attente_paiement')).length).toBe(1);
});

test('(c) annulation : 10 % de frais retenus, place libérée, billet remboursé', async ({ page }) => {
  await ouvrir(page, '/pass', { connecte: 'p-aicha' });
  await expect(page.getByText('AM-7F3K-22')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click(); // fenêtre « Annuler ce billet » sur la page Billets
  const fenetre = page.getByRole('dialog', { name: 'Annuler ce billet' });
  await expect(page).toHaveURL(/\/pass(\?|$)/);
  await expect(fenetre.getByText('− 750 F')).toBeVisible();
  await expect(fenetre.getByText('6 750 F').first()).toBeVisible();
  const avant = (await lireMonde(page)).billets.find((b) => b.id === 'b-aicha1')!;
  expect(avant.statut).toBe('valide');
  await fenetre.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(fenetre.getByText('6 750 F renvoyés sur MoMo')).toBeVisible();
  const m = await lireMonde(page);
  const b = m.billets.find((x) => x.id === 'b-aicha1')!;
  expect(b).toMatchObject({ statut: 'rembourse', rembourse: 6750 });
  expect(m.paiements.find((p) => p.id === b.paiementId)?.statut).toBe('rembourse');
  expect(m.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Remboursement envoyé')).toBe(true);
  await page.keyboard.press('Escape');
  await aller(page, '/pass?billet=b-aicha1');
  await expect(page.getByText('REMBOURSÉ', { exact: true })).toBeVisible();
  expect(await chemin(page)).toBe('/pass?billet=b-aicha1');
});
