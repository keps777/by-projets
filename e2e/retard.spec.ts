// (f) Le chauffeur annonce un retard : la voyageuse est prévenue, voit le nouvel horaire sur /direct/retard et choisit (garder ou annuler sans frais).
import { aller, billetAichaSur, entrerEn, expect, lireMonde, ouvrir, test } from './aide';

const DEPART = 'd-2026-11-03-BX-VIP-mvan-aller-0800';
const jourDuVoyage = { connecte: 'p-emile', preparer: (e: Parameters<typeof billetAichaSur>[0]) => billetAichaSur(e, DEPART) };

test('(f) retard annoncé par Émile → notification et écran « Retard annoncé » chez Aïcha, qui garde sa place', async ({ page }) => {
  await ouvrir(page, '/chauffeur', jourDuVoyage);
  await expect(page.getByText('Bus 08:00 Douala VIP')).toBeVisible();
  await page.getByRole('button', { name: '+15 min' }).click();
  await expect(page.getByText(/Retard de 15 min annoncé aux voyageurs/)).toBeVisible();
  let m = await lireMonde(page);
  expect(m.departs.find((d) => d.id === DEPART)!.retardMin).toBe(15);
  expect(m.notifications.find((n) => n.destId === 'p-aicha' && n.type === 'retard')).toMatchObject({ titre: 'Retard +15 min', sous: 'Nouveau départ 08:15', lien: '/direct/retard' });

  await entrerEn(page, 'p-aicha');
  await aller(page, '/notifications');
  await page.getByText('Retard +15 min').click();
  await expect(page).toHaveURL(/\/direct\/retard$/);
  await expect(page.getByText('Retard annoncé')).toBeVisible();
  await expect(page.getByText('08:15', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/au lieu de 08:00/)).toBeVisible();
  await expect(page.getByRole('radio', { name: /Garder ma place 3C à 08:15/ })).toBeChecked();
  await page.getByRole('button', { name: 'Garder · voir mon billet' }).click();
  await expect(page).toHaveURL(/\/pass/);
  m = await lireMonde(page);
  expect(m.billets.find((b) => b.id === 'b-aicha1')!.statut).toBe('valide');
  // l'écran « Direct » montre le même retard
  await aller(page, '/direct');
  await expect(page.getByText('Retard annoncé : +15 min')).toBeVisible();
});

test('(f) retard annoncé : Aïcha annule sans frais (remboursement total, place libérée)', async ({ page }) => {
  await ouvrir(page, '/chauffeur', jourDuVoyage);
  await page.getByRole('button', { name: '+30 min' }).click();
  await entrerEn(page, 'p-aicha');
  await aller(page, '/direct/retard');
  await page.getByRole('radio', { name: /Annuler · remboursement total/ }).click();
  await page.getByRole('button', { name: 'Annuler et me rembourser' }).click();
  await page.getByRole('button', { name: 'Oui, annuler et rembourser' }).click();
  await expect(page).toHaveURL(/\/pass\/annule\?billet=b-aicha1/);
  const m = await lireMonde(page);
  const b = m.billets.find((x) => x.id === 'b-aicha1')!;
  expect(b.statut).toBe('rembourse'); expect(b.rembourse).toBe(b.prix); // annulation par la compagnie : aucun frais retenu
  expect(m.departs.find((d) => d.id === DEPART)!.retardMin).toBe(30);
});
