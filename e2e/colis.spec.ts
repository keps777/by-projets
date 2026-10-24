// (g) Un colis de bout en bout : Aïcha l'envoie et le paie, Fatou le reçoit au guichet, Mado le réceptionne au relais, Samuel le livre à moto
// contre le code de Marie, et le suivi d'Aïcha raconte chaque étape.
import { aller, entrerEn, expect, lireMonde, ouvrir, taper, test } from './aide';

test('(g) envoi → paiement → guichet → relais → livreur → livré, suivi côté voyageuse', async ({ page }) => {
  // 1. Aïcha prépare l'envoi : carton M pour Marie, livraison moto, puis paie 4 000 F en MoMo
  await ouvrir(page, '/colis/envoi', { connecte: 'p-aicha' });
  await page.getByRole('button', { name: /Marie · Douala/ }).click();
  await page.getByRole('button', { name: /Livraison moto/ }).click();
  await page.getByRole('button', { name: /^Payer 4 000 F et déposer au guichet/ }).click();
  await expect(page).toHaveURL(/\/paiement\?colis=/);
  await expect(page.getByText('livraison moto · assurance 50 000 F')).toBeVisible();
  await page.getByRole('button', { name: /^Payer 4 000 F/ }).click();
  await expect(page).toHaveURL(/\/paiement\/attente$/);
  await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/colis\/suivi\?colis=/);
  const colis = (await lireMonde(page)).colis.find((c) => c.expediteurId === 'p-aicha' && c.id !== 'col-1')!;
  expect(colis).toMatchObject({ statut: 'cree', prix: 4000, options: { moto: true, assurance: true, contreRemboursement: false }, relaisId: 'p-mado' });
  expect((await lireMonde(page)).paiements.find((p) => p.id === colis.paiementId)).toMatchObject({ statut: 'ok', montant: 4000, moyen: 'momo' });
  await expect(page.getByText(colis.code).first()).toBeVisible();
  await expect(page.getByText('Déposé au guichet Mvan')).toBeVisible();

  // 2. Fatou, au guichet, scanne le code et confirme le dépôt
  await entrerEn(page, 'p-fatou');
  await aller(page, '/depot');
  await page.getByLabel('Code du colis').fill(colis.code);
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByText('Colis reconnu')).toBeVisible();
  await page.getByRole('button', { name: /Confirmer le dépôt/ }).click();
  expect((await lireMonde(page)).colis.find((c) => c.id === colis.id)!.statut).toBe('depose');

  // 3. Mado, au relais de Douala, le réceptionne : une course moto est proposée aux livreurs
  await entrerEn(page, 'p-mado');
  await page.getByRole('button', { name: new RegExp(`Réceptionner le colis ${colis.code}`) }).click();
  await expect(page.getByText(/course moto proposée/).first()).toBeVisible();
  let m = await lireMonde(page);
  expect(m.colis.find((c) => c.id === colis.id)!.statut).toBe('au_relais');
  expect(m.notifications.some((n) => n.destId === 'p-samuel' && n.titre === 'Course disponible')).toBe(true);

  // 4. Samuel accepte la course, avance et livre contre le code de Marie
  await entrerEn(page, 'p-samuel');
  await page.getByRole('article', { name: `Mission ${colis.code}` }).getByRole('button', { name: 'Accepter' }).click();
  const course = page.getByRole('article', { name: `Course ${colis.code}` });
  await expect(course).toBeVisible();
  for (let i = 0; i < 4 && !(await course.getByText(/Preuve de livraison/).isVisible()); i++) await course.getByRole('button', { name: /^Étape suivante/ }).click();
  await expect(course.getByText(/Preuve de livraison/)).toBeVisible();
  await taper(course.locator('.pad'), '0000'); // mauvais code : refusé
  await expect(page.getByText(/Code (incorrect|erroné|invalide)/i).first()).toBeVisible();
  expect((await lireMonde(page)).colis.find((c) => c.id === colis.id)!.statut).toBe('en_livraison');
  await taper(course.locator('.pad'), colis.codeRetrait);
  await expect(page.getByText(/Livré · \+1 000 F/)).toBeVisible();
  m = await lireMonde(page);
  const livre = m.colis.find((c) => c.id === colis.id)!;
  expect(livre.statut).toBe('livre');
  expect(livre.etapes.map((e) => e.statut)).toEqual(['cree', 'depose', 'au_relais', 'en_livraison', 'livre']);

  // 5. Aïcha retrouve toute l'histoire dans son suivi
  await entrerEn(page, 'p-aicha');
  await aller(page, `/colis/suivi?colis=${colis.id}`);
  await expect(page.getByText('Livré à Marie')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Étapes du colis' }).getByRole('listitem')).toHaveCount(6);
  await aller(page, '/notifications');
  await expect(page.getByText(`Colis ${colis.code}`).first()).toBeVisible();
});
