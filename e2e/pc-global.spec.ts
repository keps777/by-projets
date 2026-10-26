// Passe globale PC : aucun débordement horizontal sur les écrans de l'application, à 900, 1280 et 1440 px.
import { expect, ouvrir, sansDebordement, test } from './aide';

test.use({ isMobile: false, hasTouch: false });
const ALEX = 'ACC-0412';
const ECRANS = [
  '/', '/explorer', '/rechercher', '/resultats?de=YUL&vers=NCE', '/offre/revente%3Ad-r816', '/radar', '/revente', '/agence/horizon',
  '/paiement/revente%3Ad-r816', '/voyage/d-812', '/nommer/d-812', '/pret-a-voyager/d-812', '/bagages', '/bagages/ajouter', '/intentions', '/intention/nouvelle',
  '/portefeuille', '/droit/d-812', '/echeances', '/importer', '/indices', '/cours/v-ae816', '/ordre/v-ae816', '/liquidite/d-812', '/revendre/d-812',
  '/transferer/d-812', '/drops', '/soute/v-ae816', '/marche-intentions', '/compte', '/solde', '/pass', '/notifications', '/notifications/preferences', '/alertes', '/aide',
];
const LARGEURS = [900, 1280, 1440];

for (const w of LARGEURS) {
  test(`aucun débordement horizontal à ${w} px (application)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await ouvrir(page, '/', { connecte: ALEX });
    const fautifs: string[] = [];
    for (const r of ECRANS) {
      await page.goto(r); await page.waitForLoadState('load'); await page.waitForTimeout(150);
      if (!(await sansDebordement(page))) fautifs.push(r);
    }
    expect(fautifs).toEqual([]);
  });
}

test('aucun débordement horizontal à 1280 px (accès et administration)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fautifs: string[] = [];
  await ouvrir(page, '/ouverture');
  for (const r of ['/ouverture', '/langue', '/promesses', '/inscription', '/connexion', '/admin']) {
    await page.goto(r); await page.waitForTimeout(150);
    if (!(await sansDebordement(page))) fautifs.push(r);
  }
  expect(fautifs).toEqual([]);
});
