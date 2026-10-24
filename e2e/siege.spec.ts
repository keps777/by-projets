// (j) Le siège web (1280 × 820) : analyses du patron, comptabilité et rapprochement MoMo de Nadège, configuration d'une ligne que la voyageuse retrouve.
import { aller, entrerEn, expect, lireMonde, nombre, ouvrir, sansDebordement, test } from './aide';

test.use({ viewport: { width: 1280, height: 820 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
const SOIR = '2026-11-03T19:10';

test('(j) analyses : indicateurs, filtre de compagnie, détail d’une ligne', async ({ page }) => {
  await ouvrir(page, '/siege/analyses', { connecte: 'p-luther', maintenant: SOIR });
  await expect(page.getByRole('heading', { name: 'Analyses' })).toBeVisible();
  for (const k of [/^Recette$/i, /^Billets$/i, /^Remplissage$/i, /^Départs à l’heure$/i]) await expect(page.getByText(k).first()).toBeVisible();
  const recette = async () => (await page.getByText(/^Recette$/i).first().locator('xpath=following-sibling::*[1]').textContent()) ?? '';
  const avant = await recette();
  expect(nombre(avant)).toBeGreaterThan(0);
  await page.locator('select').first().selectOption({ label: 'Alpha VIP' });
  await expect.poll(recette).not.toBe(avant);
  await page.locator('select').first().selectOption({ label: 'Toutes les compagnies' });
  expect((await sansDebordement(page)).ok).toBe(true);
  // détail d'une ligne
  await page.getByRole('button', { name: /Yaoundé → Douala/ }).or(page.getByRole('link', { name: /Yaoundé → Douala/ })).first().click();
  await expect(page).toHaveURL(/\/siege\/analyses\/ligne/);
  await expect(page.getByText('Yaoundé → Douala').first()).toBeVisible();
  expect((await sansDebordement(page)).ok).toBe(true);
});

test('(j) comptable : accès limité à la comptabilité, rapprochement MoMo écrit dans le monde', async ({ page }) => {
  await ouvrir(page, '/siege/comptable', { connecte: 'p-nadege', maintenant: SOIR });
  await expect(page.getByRole('heading', { name: 'Comptabilité' })).toBeVisible();
  await expect(page.getByText('Journal des ventes')).toBeVisible();
  await page.getByRole('link', { name: /4 sans correspondance/ }).click();
  await expect(page).toHaveURL(/\/siege\/comptable\/rapprochement/);
  await expect(page.getByText('4 transactions sans vente AfriMove en face')).toBeVisible();
  const avant = await lireMonde(page);
  // MP2611-4410 : paiement resté en attente → on l'associe à son billet ; MP2611-4388 : on rembourse
  const ligne4410 = page.getByRole('row', { name: /MP2611-4410/ }).or(page.locator('tr', { hasText: 'MP2611-4410' }));
  await expect(ligne4410.first()).toBeVisible();
  await page.getByRole('button', { name: 'Associer' }).first().click();
  const m1 = await lireMonde(page);
  expect(m1.paiements.filter((p) => p.statut === 'ok').length).toBeGreaterThan(avant.paiements.filter((p) => p.statut === 'ok').length);
  await page.getByRole('button', { name: 'Rembourser' }).first().click();
  const m2 = await lireMonde(page);
  expect(m2.paiements.filter((p) => p.statut === 'rembourse').length).toBeGreaterThan(m1.paiements.filter((p) => p.statut === 'rembourse').length);
  await expect(page.getByText(/2 transactions sans vente/)).toBeVisible();
  // la garde : la comptable ne passe pas aux analyses (réservées au patron)
  await aller(page, '/siege/analyses');
  await expect(page.getByRole('heading', { name: 'Analyses' })).toHaveCount(0);
});

test('(j) configuration : le prix d’une ligne change chez la voyageuse (départs à venir) et reste journalisé', async ({ page }) => {
  await ouvrir(page, '/siege/config', { connecte: 'p-luther', maintenant: SOIR });
  await page.getByRole('link', { name: 'modifier' }).first().click();
  await expect(page).toHaveURL(/\/siege\/config\/ligne\?ligne=l-BX-Classique-mvan-aller/);
  await page.getByRole('button', { name: 'Baisser le prix Classique de 500 F' }).click();
  await expect(page.getByText(/6[\s\u202f\u00a0]500 F/).first()).toBeVisible();
  await page.getByRole('button', { name: /^Enregistrer/ }).click();
  await expect(page.getByText('Enregistré ✓').first()).toBeVisible();
  const m = await lireMonde(page);
  expect(m.lignes.find((l) => l.id === 'l-BX-Classique-mvan-aller')!.prix).toBe(6500);
  const futurs = m.departs.filter((d) => d.ligneId === 'l-BX-Classique-mvan-aller' && d.jour >= '2026-11-04');
  expect(futurs.length).toBeGreaterThan(20); expect(futurs.every((d) => d.prix === 6500)).toBe(true);
  expect(m.evenements.some((e) => /ligne/i.test(e.texte) && e.acteurId === 'p-luther')).toBe(true);
  // la voyageuse le voit au panorama
  await page.setViewportSize({ width: 390, height: 844 });
  await entrerEn(page, 'p-aicha');
  await page.locator('.tick', { hasText: '6h' }).click();
  await expect(page.locator('.colm.front .bus', { hasText: '07:00' })).toContainText(/6[\s  ]?500/);
});
