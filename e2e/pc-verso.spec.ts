// Verso · variante PC (≥ 900 px) : chaque écran se rend à 1440 × 900 et 1024 × 768 sans débordement horizontal ; l'en-tête PC navigue.
import { expect, ouvrir, sansDebordement, test, chemin } from './aide';
import { mkdirSync } from 'node:fs';

const ECRANS: [string, string][] = [
  ['/portefeuille', 'portefeuille'], ['/droit/d-812', 'droit'], ['/echeances', 'echeances'], ['/importer', 'importer'], ['/indices', 'indices'],
  ['/cours/v-ae816', 'cours'], ['/ordre/v-ae816', 'ordre'], ['/liquidite/d-812', 'liquidite'], ['/revendre/d-812', 'revendre'], ['/marche-intentions', 'intentions'], ['/marche-intentions/proposer/INT-9HAV', 'proposer'],
  ['/solde', 'solde'], ['/compte', 'compte'], ['/pass', 'pass'], ['/alertes', 'alertes'], ['/notifications', 'notifications'], ['/notifications/preferences', 'preferences'], ['/aide', 'aide'], ['/aide/contact', 'contact'],
  ['/drops', 'drops'], ['/drops?etat=epuise', 'drops-epuise'],
  ['/transferer/d-812', 'transfert-choisir'], ['/transferer/d-812/sans-compte', 'transfert-sans-compte'], ['/transferer/d-812/confirmer', 'transfert-confirmer'], ['/transferer/d-812/echeance', 'transfert-echeance'], ['/transferer/d-812/fait', 'transfert-fait'], ['/transferer/d-812/erreur', 'transfert-erreur'],
  ['/soute/v-ae812', 'soute'], ['/bagages/vendre', 'bagage-vendre'], ['/bagages/demande', 'bagage-demande']
];
const TAILLES = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }];
test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
mkdirSync('/tmp/pcv', { recursive: true });

for (const [route, nom] of ECRANS) {
  test(`PC · ${route} : rendu sans débordement`, async ({ page }) => {
    for (const t of TAILLES) {
      await page.setViewportSize(t);
      await ouvrir(page, route, { connecte: 'ACC-0412' });
      await expect(page.locator('main#contenu')).toBeVisible();
      await page.waitForTimeout(250);
      expect(await sansDebordement(page), `${route} à ${t.width} px`).toBe(true);
      if (t.width === 1440) await page.screenshot({ path: `/tmp/pcv/${nom}.png`, fullPage: true });
      await page.goto('about:blank');
    }
  });
}
