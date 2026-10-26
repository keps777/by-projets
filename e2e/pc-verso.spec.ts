// Verso · variante PC (≥ 900 px) : chaque écran se rend à 1440 × 900, 1024 × 768 et 900 × 700 sans débordement horizontal ; les blocs clés des planches WebPortefeuille et WebCompte sont là ; l'en-tête PC navigue.
import { chemin, expect, ouvrir, sansDebordement, test } from './aide';
import { mkdirSync } from 'node:fs';

/** [route, nom de capture, texte visible attendu]. */
const ECRANS: [string, string, RegExp | string][] = [
  ['/portefeuille', 'portefeuille', 'Mes droits de voyage'], ['/droit/d-812', 'droit', 'Que faire de ce droit'], ['/echeances', 'echeances', 'Calendrier des échéances'], ['/importer', 'importer', 'Confiez un billet'], ['/indices', 'indices', 'Le prix du voyage'],
  ['/cours/v-ae816', 'cours', 'Carnet d’ordres'], ['/ordre/v-ae816', 'ordre', 'Achetez automatiquement'], ['/liquidite/d-812', 'liquidite', 'Vendre maintenant ou attendre'], ['/revendre/d-812', 'revendre', 'Ce que vous recevez'],
  ['/marche-intentions', 'intentions', /Aucune intention d’achat|Tableau de la demande/i], ['/marche-intentions/proposer/INT-9HAV', 'proposer', /Intention indisponible|Proposer/],
  ['/solde', 'solde', 'Grand livre'], ['/compte', 'compte', 'Voyageurs enregistrés'], ['/pass', 'pass', 'Ce que le Pass ouvre'], ['/alertes', 'alertes', 'Nouvelle alerte'], ['/notifications', 'notifications', 'Toutes'],
  ['/notifications/preferences', 'preferences', 'Fréquence'], ['/aide', 'aide', 'Rechercher dans l’aide'], ['/aide/contact', 'contact', 'Votre message'],
  ['/drops', 'drops', 'Comment ça marche'], ['/drops?etat=epuise', 'drops-epuise', /Parti en|Disponible en revente/],
  ['/transferer/d-812', 'transfert-choisir', 'À qui le transférer'], ['/transferer/d-812/sans-compte', 'transfert-sans-compte', /compte/i], ['/transferer/d-812/confirmer', 'transfert-confirmer', /À qui le transférer|Confirmer le transfert/],
  ['/transferer/d-812/echeance', 'transfert-echeance', /À qui le transférer|échéance/], ['/transferer/d-812/fait', 'transfert-fait', /Transfert|proche|fait/i], ['/transferer/d-812/erreur', 'transfert-erreur', /Transfert|erreur|non effectué/i],
  ['/soute/v-ae812', 'soute', 'Carte de la soute'], ['/bagages/vendre', 'bagage-vendre', /bagage/i], ['/bagages/demande', 'bagage-demande', /bagage/i]
];
const TAILLES = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }];
test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
mkdirSync('/tmp/pcv', { recursive: true });
const alex = (page: Parameters<typeof ouvrir>[0], r: string) => ouvrir(page, r, { connecte: 'ACC-0412' });

for (const [route, nom, attendu] of ECRANS) {
  test(`PC · ${route} : rendu sans débordement`, async ({ page }) => {
    for (const t of TAILLES) {
      await page.setViewportSize(t);
      await alex(page, route);
      await expect(page.locator('main#contenu')).toBeVisible();
      await expect(page.locator('main#contenu').getByText(attendu).first()).toBeVisible();
      await page.waitForTimeout(200);
      expect(await sansDebordement(page), `${route} à ${t.width} px`).toBe(true);
      if (t.width === 1440) await page.screenshot({ path: `/tmp/pcv/${nom}.png`, fullPage: true });
      await page.goto('about:blank');
    }
  });
}

test.describe('Portefeuille PC (WebPortefeuille)', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await alex(page, '/portefeuille'); });
  test('titre, résumé, courbe, tableau et panneau du droit', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Portefeuille', level: 1 })).toBeVisible();
    await expect(page.getByText(/Alex T\. · 3 droits de voyage détenus · 1 en vente/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Importer un billet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir le marché' })).toBeVisible();
    await expect(page.getByText(/nommez le voyageur avant le dim\. 13 déc\. 2026, 18:05 \(dans 62 jours\)/)).toBeVisible();
    await expect(page.getByTestId('equivalent-total')).toHaveText('4 730 $');
    await expect(page.getByTestId('paye-total')).toHaveText('3 050 $');
    await expect(page.getByTestId('ecart-total')).toHaveText('+1 680 $');
    await expect(page.getByText(/Depuis le premier achat · 12 janv\. → 12 oct\. 2026/)).toBeVisible();
    await expect(page.getByText(/Paliers : achats du 12 janv\. \(YUL → CDG\)/)).toBeVisible();
    const lignes = page.locator('tbody tr');
    await expect(lignes).toHaveCount(4);
    await expect(page.getByRole('columnheader')).toHaveText(['Trajet', 'Date', 'Compagnie', 'Payé', 'Prix équivalent', 'Écart', 'Statut', 'Échéance de finalisation', 'Actions']);
    await expect(lignes.nth(0)).toContainText('YUL → CDG'); await expect(lignes.nth(0)).toContainText('+1 000 $'); await expect(lignes.nth(0)).toContainText('À nommer'); await expect(lignes.nth(0)).toContainText('13 déc. · 18:05');
    await expect(lignes.nth(2)).toContainText('−60 $'); await expect(lignes.nth(3)).toContainText('En revente');
    await expect(page.getByRole('complementary')).toContainText('YUL → CDG');
    await expect(page.getByRole('link', { name: 'Nommer le voyageur' }).last()).toBeVisible();
  });
  test('la sélection d’une ligne change le panneau ; un droit en vente propose de gérer l’annonce', async ({ page }) => {
    const panneau = page.getByRole('complementary');
    await page.locator('tbody tr').nth(1).getByRole('button').click();
    await expect(panneau.getByRole('heading', { level: 2 })).toHaveText(/YUL → PUJ/);
    await page.locator('tbody tr').nth(3).getByRole('button').click();
    await expect(panneau).toContainText(/En vente à 620\s\$ depuis le 5 oct\. Retirez/);
    await expect(panneau.getByRole('link', { name: 'Gérer l’annonce' })).toBeVisible();
    await expect(panneau.getByRole('link', { name: 'Revendre' })).toHaveCount(0);
  });
  test('les actions du tableau mènent aux écrans du droit', async ({ page }) => {
    await page.locator('tbody tr').nth(0).getByRole('link', { name: 'Revendre' }).click();
    await expect.poll(() => chemin(page)).toBe('/revendre/d-812');
    await page.goBack();
    await page.locator('tbody tr').nth(0).getByRole('link', { name: 'Nommer' }).click();
    await expect.poll(() => chemin(page)).toBe('/nommer/d-812');
  });
  test('pas de bascule Voyager / Mes actifs dans le contenu ni de barre d’onglets mobile', async ({ page }) => {
    await expect(page.locator('main#contenu').getByRole('group', { name: 'Face de l’application' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Onglets' })).toBeHidden();
  });
});

test.describe('Compte PC (WebCompte)', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await alex(page, '/compte'); });
  test('deux colonnes : profil à gauche, sécurité et préférences à droite', async ({ page }) => {
    await expect(page.getByText('Alex T. · espace Mes actifs')).toBeVisible();
    await expect(page.getByText('Identité vérifiée')).toBeVisible();
    const gauche = await page.getByText('Voyageurs enregistrés').boundingBox(), droite = await page.getByText('Sécurité et préférences').boundingBox();
    expect(gauche && droite && droite.x > gauche.x + 500).toBe(true);
    await expect(page.getByRole('button', { name: /Se déconnecter/ })).toBeVisible();
    await expect(page.getByText(/NexG-TT 4\.0 · prototype/)).toBeVisible();
    await expect(page.locator('main#contenu').getByRole('group', { name: 'Face de l’application' })).toBeHidden();
  });
});

test.describe('En-tête PC du verso', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  test('navigation : Portefeuille, Drops, Compte, cloche', async ({ page }) => {
    await alex(page, '/portefeuille');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'Portefeuille' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Drops' }).click();
    await expect.poll(() => chemin(page)).toBe('/drops');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Drops' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Mon compte' }).click();
    await expect.poll(() => chemin(page)).toBe('/compte');
    await page.getByRole('link', { name: /^Notifications/ }).first().click();
    await expect.poll(() => chemin(page)).toBe('/notifications');
  });
  test('la bascule Voyager ramène à l’accueil', async ({ page }) => {
    await alex(page, '/compte');
    await page.getByRole('button', { name: 'Voyager' }).click();
    await expect.poll(() => chemin(page)).toBe('/');
  });
  test('écrans pleins : logo et lien Retour ; contenu centré', async ({ page }) => {
    await alex(page, '/droit/d-812');
    await expect(page.getByRole('link', { name: 'NexG-TT, accueil' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour', exact: true }).click();
    await expect.poll(() => chemin(page)).toBe('/portefeuille');
    await alex(page, '/solde');
    const bloc = await page.locator('main#contenu .pc-duo').boundingBox();
    expect(bloc && bloc.width > 900).toBe(true);
  });
  test('le droit et le cours du vol passent sur deux colonnes', async ({ page }) => {
    await alex(page, '/droit/d-812');
    const a = await page.getByText('Valeur indicative').boundingBox(), b = await page.getByText('Que faire de ce droit ?').boundingBox();
    expect(a && b && b.x > a.x + 300).toBe(true);
    await alex(page, '/cours/v-ae816');
    const c = await page.getByText('Historique').first().boundingBox(), d = await page.getByRole('heading', { name: 'Carnet d’ordres' }).boundingBox();
    expect(c && d && d.x > c.x + 300).toBe(true);
  });
});
