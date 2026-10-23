import { expect } from '@playwright/test';
import { test, aller, confirmerPaiement, ouvrir, ouvrirDemo, pasDeDebordement } from './aide';

/** Routes membres et portails (celles qui demandent un contexte — paiement en cours, contrat — sont vues dans leurs parcours plus bas). */
const ROUTES: [string, RegExp][] = [
  ['/', /^Accueil/], ['/piliers', /^Piliers/], ['/notifications', /^Notifications/], ['/pay/scan', /^Payer/], ['/pay/facture?id=f-1190', /^Facture/],
  ['/prelevement', /^Prélèvement sur salaire/], ['/prelevement/notif', /^Jour de paie/], ['/profil', /^Profil/], ['/profil/appareils', /^Sécurité/],
  ['/score', /^AssureScore/], ['/score/conseils', /^Gagner des points/], ['/score/carte', /^Ma carte/], ['/coffres', /^Coffres/], ['/coffres/nouveau', /^Nouveau coffre/],
  ['/coffres/cf-rentree', /^Coffre/], ['/sante', /^Santé/], ['/sante/facture/f-1190', /^Facture santé/], ['/ecole', /^Éducation/], ['/ecole/frais', /^Frais de rentrée/],
  ['/ecole/plan', /^Plan de paiement/], ['/ecole/bulletin/lisa', /^Bulletin/], ['/logement', /^Logement/], ['/logement/avance', /^Avance de loyer/],
  ['/logement/justificatifs', /^Bail et bailleur/], ['/logement/bailleur', /^Bailleur payé/], ['/auto', /^Mobilité/], ['/auto/catalogue', /^Catalogue/],
  ['/diaspora', /^Payer pour un proche/], ['/diaspora/suivi', /^Suivi/], ['/commerce', /^Encaisser/], ['/commerce/stock', /^Stock/], ['/protection', /^Protection/],
  ['/energie', /^Énergie/], ['/portail/hopital', /^Portail hôpital/], ['/portail/ecole', /^Portail école/], ['/portail/concession', /^Portail concessionnaire/],
  ['/portail/entreprise', /^Espace employeur/], ['/portail/entreprise/inscription', /^Inscription entreprise/], ['/biometrie', /^Biométrie/], ['/notifications-permission', /^Notifications/]
];

test.describe('petit écran (320 px)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('aucune page ne déborde horizontalement, chaque page a son titre', async ({ page }) => {
    await ouvrirDemo(page);
    for (const [chemin, titre] of ROUTES) {
      await aller(page, chemin);
      await expect(page.getByRole('status', { name: 'Chargement' })).toHaveCount(0);
      await expect(page).toHaveTitle(new RegExp(`${titre.source}.*AssureMe$`));
      await pasDeDebordement(page, chemin);
    }
    await aller(page, '/cette-page-n-existe-pas');
    await expect(page).toHaveTitle('Page introuvable · AssureMe');
    await pasDeDebordement(page, 'page introuvable');
  });

  test('parcours : feuilles, confirmation de paiement, simulation et contrat auto restent dans l’écran', async ({ page }) => {
    await ouvrirDemo(page);
    await page.getByRole('button', { name: 'Historique' }).click();
    await pasDeDebordement(page, 'historique');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await pasDeDebordement(page, 'notifications');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('button', { name: 'Recharger', exact: true }).first().click();
    await pasDeDebordement(page, 'recharge');
    await page.getByRole('button', { name: 'Annuler' }).click();

    await page.getByRole('link', { name: /Facture Clinique Les Palmiers à régler/ }).click();
    await page.getByRole('button', { name: /Confirmer · 7 100 FCFA/ }).click();
    await expect(page).toHaveURL(/\/pay\/confirme$/);
    await pasDeDebordement(page, 'confirmation du paiement');
    await confirmerPaiement(page);
    await pasDeDebordement(page, 'paiement réussi');
    await aller(page, '/pay/recu?ref=' + new URL(page.url()).searchParams.get('ref'));
    await pasDeDebordement(page, 'reçu');

    await aller(page, '/auto/catalogue');
    await page.getByRole('button', { name: 'Motos' }).click();
    await page.getByRole('button', { name: /Simuler la Haojue/ }).click();
    await pasDeDebordement(page, 'simulation auto');
    await page.getByRole('button', { name: 'Demander la décision' }).click();
    await expect(page.getByRole('link', { name: 'Accepter et signer' })).toBeVisible();
    await pasDeDebordement(page, 'décision auto');
    await page.getByRole('link', { name: 'Accepter et signer' }).click();
    await expect(page).toHaveURL(/\/auto\/contrat$/);
    await pasDeDebordement(page, 'contrat auto');
    await aller(page, '/auto/livraison');
    await pasDeDebordement(page, 'livraison auto');
  });
});

test.describe('accessibilité de base', () => {
  test('tout bouton, lien ou champ visible a un nom accessible', async ({ page }) => {
    await ouvrirDemo(page);
    for (const [chemin] of ROUTES) {
      await aller(page, chemin);
      await expect(page.getByRole('status', { name: 'Chargement' })).toHaveCount(0);
      const sansNom = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=radio], [role=tab]')]
        .filter((e) => {
          const visible = !!(e as HTMLElement).offsetParent || getComputedStyle(e).position === 'fixed';
          if (!visible) return false;
          const nom = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e as HTMLElement).innerText || e.textContent || e.getAttribute('title') || e.getAttribute('placeholder') || '').trim();
          const etiquette = e.id && document.querySelector(`label[for="${e.id}"]`);
          return !nom && !etiquette && !e.closest('label');
        }).map((e) => `${e.tagName.toLowerCase()}.${e.className}`));
      expect(sansNom, `${chemin} : contrôles sans nom`).toEqual([]);
    }
  });

  test('la langue, le viewport et la couleur du thème sont déclarés', async ({ page }) => {
    await ouvrir(page, '/bienvenue');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#07090F');
    await expect(page).toHaveTitle(/AssureMe/);
  });
});
