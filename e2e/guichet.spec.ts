// Le guichet, le quai, le superviseur et la caisse partagent un seul monde : (d) une vente en espèces est scannable au quai, visible chez le superviseur et dans la caisse ;
// (e) une clôture avec écart est validée au PIN par le superviseur.
import { aller, entrerEn, expect, lireMonde, nombre, ouvrir, taper, test } from './aide';

const placeLibre = (page: import('@playwright/test').Page) => page.locator('[aria-label^="Place "]:not([aria-label*="prise"]):not([aria-label*="libre"])').last();

test('(d) vente au guichet en espèces → scan OK puis « déjà scanné » au quai → superviseur et caisse', async ({ page }) => {
  // le superviseur ouvre sa gare (la journée de démonstration s'amorce) et note les ventes du jour
  await ouvrir(page, '/superviseur', { connecte: 'p-abdou' });
  const ventes = page.locator('.gl', { hasText: 'Ventes du jour' }).first();
  await expect(ventes).toContainText('F');
  const v0 = nombre(await ventes.locator('.ttl').first().textContent());

  // Fatou vend une place à 07 h 30 pour Bafoussam, en espèces
  await entrerEn(page, 'p-fatou');
  await aller(page, '/caisse');
  await expect(page.getByText('ATTENDU EN ESPÈCES', { exact: false })).toBeVisible();
  const a0 = nombre(await page.locator('.gl.ac .big, .big').first().textContent());
  await aller(page, '/vente');
  await placeLibre(page).click();
  await page.getByPlaceholder('Client guichet').fill('Nadia Essono');
  await page.getByRole('button', { name: 'Encaisser et imprimer' }).click();
  await expect(page).toHaveURL(/\/vente\/ticket/);
  await expect(page.getByText('Payé espèces')).toBeVisible();
  const monde = await lireMonde(page);
  const billet = [...monde.billets].reverse().find((b) => b.caisseId === 'c-fatou' && b.passager.nom === 'Nadia Essono')!;
  expect(billet).toMatchObject({ statut: 'valide', canal: 'guichet', acheteurId: 'p-fatou' });
  expect(monde.paiements.find((p) => p.id === billet.paiementId)).toMatchObject({ moyen: 'especes', statut: 'ok' });

  // la caisse de Fatou : une vente de plus en espèces
  await aller(page, '/caisse');
  await expect.poll(async () => nombre(await page.locator('.big').first().textContent())).toBe(a0 + billet.prix);

  // Ibrahim, au quai : le billet passe, puis « déjà scanné »
  await entrerEn(page, 'p-ibrahim');
  await page.getByRole('link', { name: 'Scanner un billet' }).first().click();
  await page.getByLabel('Code du billet').fill(billet.code);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page).toHaveURL(/\/quai\/ok\?passage=/);
  await expect(page.getByRole('heading', { name: /Billet valide/ }).or(page.getByText('Billet valide').first())).toBeVisible();
  await expect(page.getByText('Nadia Essono')).toBeVisible();
  await page.getByRole('link', { name: 'Retour au radar' }).first().click();
  await page.getByRole('link', { name: 'Scanner un billet' }).first().click();
  await page.getByLabel('Code du billet').fill(billet.code);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page).toHaveURL(/\/quai\/refus\?passage=/);
  await expect(page.getByText('Déjà scanné').first()).toBeVisible();
  await expect(page.getByText(/déjà utilisé/)).toBeVisible();
  const apres = await lireMonde(page);
  expect(apres.billets.find((b) => b.id === billet.id)).toMatchObject({ statut: 'scanne', scannePar: 'p-ibrahim' });
  // un seul refus consigné pour ce scan (pas de doublon dans le journal)
  expect(apres.evenements.filter((e) => /^scan_refus/.test(e.type) && e.ref === billet.id)).toHaveLength(1);

  // le superviseur : ventes du jour +prix, le scan refusé remonte en alerte
  await entrerEn(page, 'p-abdou');
  await expect(page.locator('.al', { hasText: 'Scan refusé au quai' }).first()).toContainText(billet.code);
  const v1 = nombre(await page.locator('.gl', { hasText: 'Ventes du jour' }).first().locator('.ttl').first().textContent());
  expect(v1 - v0).toBe(billet.prix);
});

// 1 pixel PNG : le « bordereau de dépôt » photographié
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('(e) clôture de caisse avec écart : justification et bordereau exigés, puis validation au PIN par le superviseur', async ({ page }) => {
  await ouvrir(page, '/caisse', { connecte: 'p-fatou' });
  await expect(page.getByText('ATTENDU EN ESPÈCES')).toBeVisible();
  const attendu = nombre(await page.locator('.big').first().textContent());
  expect(attendu).toBe(20_000); // le fond de caisse seul : rien n'a encore été encaissé
  // 22 000 F comptés : +2 000 F d'écart
  for (const [valeur, n] of [['10 000', 2], ['2 000', 1]] as const) for (let i = 0; i < n; i++) await page.getByRole('button', { name: `Plus un billet de ${valeur} F` }).click();
  await expect(page.getByText('+2 000 F').first()).toBeVisible();
  // sans justification ni bordereau, la clôture est refusée
  await page.getByRole('button', { name: /^Clôturer/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByPlaceholder('Ex. monnaie rendue en trop à un passager').fill('Trop-perçu sur un billet, client rappelé');
  await page.getByRole('button', { name: /^Clôturer/ }).click();
  await expect(page.getByRole('alert')).toContainText(/bordereau/i);
  await page.getByLabel('Photographier le bordereau de dépôt').setInputFiles({ name: 'bordereau.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: 'Bordereau de dépôt photographié' })).toBeVisible();
  await page.getByRole('button', { name: /^Clôturer/ }).click();
  await page.getByRole('button', { name: /Confirmer : clôturer avec 22 000 F/ }).click();
  await expect(page.getByText('en attente de validation').first()).toBeVisible();
  let m = await lireMonde(page);
  const caisse = m.caisses.find((c) => c.id === 'c-fatou')!;
  expect(caisse).toMatchObject({ statut: 'fermee', attendu: 20_000, ecart: 2000, justification: 'Trop-perçu sur un billet, client rappelé' });
  const abdou = m.notifications.filter((n) => n.destId === 'p-abdou' && n.titre === 'Clôture à valider');
  expect(abdou.length).toBeGreaterThan(0);

  // Abdou : la clôture attend sa décision ; un mauvais PIN est refusé, le bon valide
  await entrerEn(page, 'p-abdou');
  await aller(page, '/superviseur/valider');
  await expect(page.getByText('2 en attente')).toBeVisible();
  await page.getByRole('link', { name: /20 000 F attendus/ }).click();
  await expect(page.getByText('Trop-perçu sur un billet, client rappelé')).toBeVisible();
  await expect(page.getByText('22 000 F').first()).toBeVisible();
  await taper(page.locator('.pad'), '0000');
  await page.getByRole('button', { name: /^Valider la clôture/ }).click();
  await expect(page.getByRole('alert')).toContainText('PIN incorrect');
  expect((await lireMonde(page)).caisses.find((c) => c.id === 'c-fatou')!.statut).toBe('fermee');
  await taper(page.locator('.pad'), '1357');
  await page.getByRole('button', { name: /^Valider la clôture/ }).click();
  await expect(page.getByText('Clôture validée').first()).toBeVisible();
  m = await lireMonde(page);
  expect(m.caisses.find((c) => c.id === 'c-fatou')).toMatchObject({ statut: 'validee', validePar: 'p-abdou' });

  // Fatou voit sa clôture validée
  await entrerEn(page, 'p-fatou');
  await aller(page, '/caisse');
  await expect(page.getByText('clôture validée').first()).toBeVisible();
});
