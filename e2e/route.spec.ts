// Parcours « route » : suivi du bus, retard, réseau, course, montée en route, covoiturage. Le monde est créé le 2 nov. 20:00 (billet d'Aïcha pour le 3 nov. 08:00),
// puis l'horloge saute avec `?maintenant=` ; une garde réécrit la dernière activité pour que la session ne soit pas expirée par ces sauts.
import { expect, test, type Page } from '@playwright/test';
import { lireEtat } from './aide';

async function entrer(page: Page) {
  await page.goto('/entree?maintenant=2026-11-02T20:00');
  await page.getByRole('button', { name: 'Entrer directement comme Aïcha' }).click();
  await page.waitForTimeout(300);
  await page.addInitScript(() => {
    try {
      const t = new URLSearchParams(location.search).get('maintenant'), e = JSON.parse(localStorage.getItem('afrimove.v1') || 'null');
      if (e && t) { e.session.derniereActivite = Date.parse(t); localStorage.setItem('afrimove.v1', JSON.stringify(e)); }
    } catch { /* stockage indisponible */ }
  });
}
const aller = async (page: Page, chemin: string, t: string) => { await page.goto(`${chemin}${chemin.includes('?') ? '&' : '?'}maintenant=${t}`); };
const monde = (page: Page) => lireEtat(page);

test('Mon bus : carte en relief, arrivée estimée, avance simulée, retard annoncé', async ({ page }) => {
  await entrer(page);
  await aller(page, '/direct', '2026-11-03T09:30');
  await expect(page.getByText('Ton bus', { exact: true })).toBeVisible();
  await expect(page.getByText('11:15').first()).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText('du trajet');
  await expect(page.getByText('3C')).toBeVisible();
  const avant = await page.locator('.st.cur').innerText();
  await page.getByRole('button', { name: 'Simuler l’avance' }).click();
  await expect(page.locator('.st.cur')).not.toHaveText(avant);
  await aller(page, '/direct', '2026-11-03T07:30');
  await page.getByRole('button', { name: /Annoncer un retard de 45 min/ }).click();
  await expect(page.getByRole('link', { name: /Retard annoncé/ })).toBeVisible();
  await expect(page.getByText('+45 min').first()).toBeVisible();
});

test('Retard : annuler et se faire rembourser crédite le geste commercial', async ({ page }) => {
  await entrer(page);
  await aller(page, '/direct', '2026-11-03T07:30');
  await page.getByRole('button', { name: /Annoncer un retard de 45 min/ }).click();
  await page.getByRole('link', { name: /Retard annoncé/ }).click();
  await expect(page).toHaveURL(/\/direct\/retard/);
  await expect(page.getByText('08:45').first()).toBeVisible();
  await page.getByRole('radio', { name: /Annuler · remboursement total/ }).click();
  await page.getByRole('button', { name: 'Annuler et me rembourser' }).click();
  await page.getByRole('button', { name: /Oui, annuler et rembourser/ }).click();
  await expect(page).toHaveURL(/\/pass\/annule\?billet=/);
  await page.reload();
  const e = await monde(page);
  expect(e.monde.billets.find((b) => b.id === 'b-aicha1')!.statut).toBe('rembourse');
  expect(e.tranches.route.cagnotte['p-aicha']).toBe(500);
});

test('Réseau : bus en route sur la carte, filtre par compagnie', async ({ page }) => {
  await entrer(page);
  await aller(page, '/reseau', '2026-11-03T09:30');
  await expect(page.getByRole('heading', { name: /Carte du réseau/ }).or(page.getByRole('group', { name: /Carte du réseau/ }))).toBeVisible();
  const tous = await page.locator('button.mb').count();
  expect(tous).toBeGreaterThan(3);
  await page.getByRole('button', { name: /^AV/ }).click();
  const av = await page.locator('button.mb').count();
  expect(av).toBeLessThan(tous);
  await page.locator('button.mb').first().click();
  await expect(page.getByRole('link', { name: 'Monter en route sur ce bus' })).toBeVisible();
});

test('Course : commander une moto et la suivre jusqu’à la gare', async ({ page }) => {
  await entrer(page);
  await aller(page, '/course', '2026-11-03T07:00');
  await page.getByRole('button', { name: /^Commander/ }).click();
  await expect(page.getByText('Moto en route').first()).toBeVisible();
  for (const t of ['Moto arrivée', 'Vers la gare', 'Arrivée à la gare']) { await page.getByRole('button', { name: /Simuler l’étape suivante/ }).click(); await expect(page.getByText(t).first()).toBeVisible(); }
  const e = await (async () => { await page.reload(); return monde(page); })();
  expect(e.tranches.route.courses[0]).toMatchObject({ statut: 'terminee', prix: 700 });
});

test('Monter en route : billet sans siège au prix prorata, puis paiement', async ({ page }) => {
  await entrer(page);
  await aller(page, '/arret', '2026-11-03T08:40');
  await page.getByRole('radio', { name: /Edéa/ }).click();
  await page.getByRole('button', { name: /Monter ici/ }).click();
  await expect(page).toHaveURL(/\/paiement\?paiement=/);
  await page.reload();
  const e = await monde(page);
  const b = e.monde.billets.find((x) => x.siege === null && x.acheteurId === 'p-aicha')!; // les billets sans siège du siège web (démo) ne sont pas à elle
  expect(b.prix).toBe(2150); expect(b.statut).toBe('attente_paiement');
});

test('Covoiturage : publier, recevoir une réservation, démarrer, terminer', async ({ page }) => {
  await entrer(page);
  await aller(page, '/covoit', '2026-11-02T20:00');
  await expect(page.getByText('Moussa K.')).toBeVisible();
  await page.getByRole('button', { name: /Fiche de Moussa/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'je conduis' }).click();
  await expect(page).toHaveURL(/\/covoit\/conduire/);
  await page.getByRole('button', { name: 'Publier le trajet' }).click();
  await page.getByRole('button', { name: 'Simuler une réservation' }).click();
  await page.getByRole('button', { name: 'Démarrer le trajet' }).click();
  await page.getByRole('button', { name: 'Terminer le trajet' }).click();
  await expect(page.getByText(/versés sur MoMo/)).toBeVisible();
});
