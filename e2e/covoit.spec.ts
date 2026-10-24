// (h) Covoiturage : Moussa publie un trajet, Aïcha le réserve et le paie depuis le panorama, Moussa démarre puis termine et reçoit son gain.
import { aller, entrerEn, expect, lireEtat, lireMonde, ouvrir, test } from './aide';

test('(h) le conducteur publie → la voyageuse réserve et paie → le conducteur termine', async ({ page }) => {
  // 1. Moussa publie demain 09 h 30 de Mvolyé à Douala, 2 places à 5 000 F
  await ouvrir(page, '/covoit/conduire', { connecte: 'p-moussa' });
  await expect(page.getByRole('heading', { name: 'Je conduis' }).or(page.getByText('Publie ton trajet en 30 s'))).toBeVisible();
  await page.getByLabel('Jour').selectOption({ label: 'mer. 4 nov.' });
  await page.getByLabel('Heure de départ').fill('09:30');
  await page.getByLabel('Point de départ (quartier)').fill('Mvolyé');
  await page.getByRole('button', { name: 'Moins de places' }).click();
  await page.getByRole('button', { name: 'Publier le trajet' }).click();
  await expect(page.getByText('Mvolyé').first()).toBeVisible();
  let m = await lireMonde(page);
  const offre = m.covoits.find((o) => o.conducteurId === 'p-moussa' && o.heure === '09:30')!;
  expect(offre).toMatchObject({ statut: 'ouverte', jour: '2026-11-04', places: 2, prix: 5000, de: 'Yaoundé', vers: 'Douala' });

  // 2. Aïcha le trouve dans le panorama (onglet Covoit, tranche 9 h) et le réserve
  await entrerEn(page, 'p-aicha');
  await page.getByRole('button', { name: 'Covoit', exact: true }).click();
  await page.locator('.tick', { hasText: '9h' }).click();
  await expect(page.locator('.sel')).toContainText('Moussa K.');
  await page.locator('.sel a.b.p').click();
  await expect(page).toHaveURL(new RegExp(`/paiement\\?covoit=${offre.id}`));
  await expect(page.getByText('Covoiturage · Moussa 09:30')).toBeVisible();
  await page.getByRole('button', { name: /^Payer 5 000 F/ }).click();
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/covoit$/);
  m = await lireMonde(page);
  const o = m.covoits.find((x) => x.id === offre.id)!;
  expect(o.places).toBe(2); expect(o.reservations).toHaveLength(1); expect(o.reservations[0].places).toBe(1); // capacité 2, une place prise
  expect(m.paiements.find((p) => p.id === o.reservations[0].paiementId)).toMatchObject({ statut: 'ok', montant: 5000, payeurId: 'p-aicha', pour: { type: 'covoit' } });
  expect(m.notifications.some((n) => n.destId === 'p-moussa' && n.titre === 'Nouvelle réservation')).toBe(true);
  expect(m.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Covoiturage confirmé')).toBe(true);

  // 3. Moussa voit la réservation, démarre et termine : le gain (commission de 10 % déduite) lui est versé
  await entrerEn(page, 'p-moussa');
  await aller(page, '/covoit/conduire');
  const trajet = page.getByRole('article', { name: /Trajet Yaoundé vers Douala/ }).filter({ hasText: '09:30' });
  await expect(trajet).toContainText('1 / 2 places réservée');
  await expect(trajet).toContainText('Aïcha Ndiba');
  await trajet.getByRole('button', { name: 'Démarrer le trajet' }).click();
  await trajet.getByRole('button', { name: 'Terminer le trajet' }).click();
  await expect(trajet.getByText(/versés sur MoMo/)).toBeVisible();
  const e = await lireEtat(page);
  expect(e.monde.covoits.find((x) => x.id === offre.id)!.statut).toBe('terminee');
  expect((e.tranches.route as { versements: { offreId: string; personneId: string; montant: number }[] }).versements).toContainEqual(expect.objectContaining({ offreId: offre.id, personneId: 'p-moussa', montant: 4500 })); // 5 000 F moins 10 % de commission
});
