import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

/** Variante PC (≥ 900 px) des six écrans du parcours d'inscription : Étapes 2 à 4, carte, identité, « Votre espace est prêt ». */
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

/** Nouveau compte (comme après /code) : prénom « Alex », ni carte ni identité. */
const preparer = (e: Etat) => {
  const base = e.monde.comptes.find((c) => c.id === 'ACC-0187')!;
  e.monde.comptes.push({ ...base, id: 'ACC-0999', prenom: 'Alex', nom: 'Tremblay', email: 'nouveau@exemple.test', tel: '', aeroport: 'YUL', carte4: undefined, identiteVerifiee: undefined, partage: { offres: true, analyses: false, partenaires: false }, prefsNotif: 'essentiel' });
  e.session.inscription = { etape: 2 };
};
const ouvrirNouveau = (page: Page, route: string) => ouvrir(page, route, { connecte: 'ACC-0999', preparer });
const boite = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const ROUTES = ['/profil', '/partage', '/bienvenue-notifications', '/carte', '/identite', '/pret'];

test.describe('cadre PC', () => {
  for (const r of ROUTES) {
    for (const [w, h] of [[900, 700], [1024, 768], [1280, 800], [1440, 900]]) {
      test(`${r} à ${w} px : aucun débordement horizontal`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await ouvrirNouveau(page, r);
        await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
        expect(await sansDebordement(page)).toBe(true);
        await expect(page.getByRole('link', { name: 'NexG-TT, accueil' })).toBeVisible();
        await expect(page.getByText('Mode démo', { exact: true })).toBeVisible(); // pied PC
      });
    }
  }
  test('les éléments réservés au mobile sont absents : pas de barre d’action collante, pas de titre d’en-tête', async ({ page }) => {
    for (const r of ROUTES) { await ouvrirNouveau(page, r); await expect(page.locator('.pied .btn')).toHaveCount(0); }
  });
});

test.describe('étape 2 · profil (PC)', () => {
  test('deux colonnes, aperçu en direct, indicateur large, « Plus tard » en haut', async ({ page }) => {
    await ouvrirNouveau(page, '/profil');
    await expect(page.getByRole('heading', { name: 'Faisons connaissance', level: 1 })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 2 sur 4');
    await expect(page.getByText('Ensuite : vos choix de partage')).toBeVisible();
    const barres = await boite(page, '.etapes .barres'); expect(barres.width).toBeGreaterThan(500);
    const panneau = page.getByRole('complementary', { name: 'Aperçu' }); await expect(panneau).toBeVisible();
    const form = await boite(page, '#form-profil'); const apercu = await boite(page, '.apercu');
    expect(apercu.x).toBeGreaterThan(form.x + form.width); expect(Math.abs(apercu.y - barres.y)).toBeLessThan(60);
    await expect(panneau.getByText('Bonjour Alex')).toBeVisible(); await expect(panneau.getByText('Montréal (YUL)')).toBeVisible();
    await expect(panneau.getByText('Dernière minute')).toBeVisible(); await expect(panneau.getByText('Drops membres')).toBeVisible();
    // l'aperçu suit le formulaire
    await page.getByLabel('Prénom').fill('Léa'); await expect(panneau.getByText('Bonjour Léa')).toBeVisible();
    await page.getByLabel('Aéroport habituel').fill('Paris (CDG)'); await expect(panneau.getByText('Paris (CDG)')).toBeVisible(); await expect(page.locator('.code')).toHaveText('CDG');
    await page.getByRole('button', { name: 'Dernière minute' }).click(); await page.getByRole('button', { name: 'Drops membres' }).click();
    await expect(panneau.getByText('Aucun pour l’instant.')).toBeVisible();
    await page.getByRole('button', { name: 'Voyages en famille' }).click(); await expect(panneau.getByText('Voyages en famille')).toBeVisible();
    // le bouton de validation est dans la colonne, pas collé en bas d'écran
    const cta = page.getByRole('button', { name: /^Continuer/ }); await expect(cta).toHaveCount(1); await expect(cta).toBeVisible();
    expect((await cta.boundingBox())!.width).toBeGreaterThanOrEqual(280);
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/pc-profil-1.png', fullPage: true });
    await cta.click(); await expect.poll(() => chemin(page)).toBe('/partage');
    const c = (await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!; expect([c.prenom, c.aeroport]).toEqual(['Léa', 'CDG']);
  });
  test('« Plus tard » (en-tête) passe sans écrire ; « Retour » revient ; un aéroport inconnu est signalé', async ({ page }) => {
    await ouvrirNouveau(page, '/profil');
    await page.getByLabel('Aéroport habituel').fill('Atlantide'); await page.getByRole('button', { name: /^Continuer/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Aéroport inconnu' })).toBeVisible(); expect(chemin(page)).toBe('/profil');
    await page.getByLabel('Prénom').fill('Zoé');
    await page.getByRole('link', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/partage');
    expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.prenom).toBe('Alex');
    await page.getByRole('button', { name: 'Retour' }).click(); await expect.poll(() => chemin(page)).toBe('/profil');
  });
  test('à 1024 × 768 les deux colonnes tiennent côte à côte', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 }); await ouvrirNouveau(page, '/profil');
    const form = await boite(page, '#form-profil'); const apercu = await boite(page, '.apercu');
    expect(apercu.x).toBeGreaterThan(form.x + form.width - 1); expect(apercu.x + apercu.width).toBeLessThanOrEqual(1024);
  });
});

test.describe('étape 3 · partage (PC)', () => {
  test('récapitulatif en direct à droite, interrupteurs et explications', async ({ page }) => {
    await ouvrirNouveau(page, '/partage');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 3 sur 4'); await expect(page.getByText('Ensuite : notifications')).toBeVisible();
    const recap = page.getByRole('complementary', { name: 'Votre récapitulatif' }); await expect(recap).toBeVisible();
    const ligne = (t: string) => recap.getByRole('listitem').filter({ hasText: t });
    await expect(ligne('Nécessaire au service')).toContainText('Toujours actif');
    await expect(ligne('Alertes de prix et de drops')).toContainText('Activé'); await expect(ligne("Rappels d'échéance J-1")).toContainText('Activé');
    await expect(ligne('Offres partenaires')).toContainText('Désactivé'); await expect(ligne("Mesure d'audience anonyme")).toContainText('Désactivé');
    await expect(recap.getByText('Vous pouvez tout changer dans Compte › Données et consentements.')).toBeVisible(); await expect(recap.getByText('[H]')).toBeVisible();
    await page.getByRole('switch', { name: /Offres partenaires/ }).click(); await expect(ligne('Offres partenaires')).toContainText('Activé');
    await page.getByRole('switch', { name: /Alertes de prix et de drops/ }).click(); await expect(ligne('Alertes de prix et de drops')).toContainText('Désactivé');
    await expect(page.getByText('Activés : le nécessaire, plus 2 réglages facultatifs sur 4.')).toBeVisible();
    const interr = page.getByRole('switch', { name: /Mesure d.audience/ }); await interr.focus(); await page.keyboard.press('Space'); await expect(interr).toHaveAttribute('aria-checked', 'true');
    expect((await interr.boundingBox())!.height).toBeGreaterThanOrEqual(72);
    await page.getByRole('button', { name: /Pourquoi est-ce verrouillé/ }).click(); await expect(page.getByText('Sans ces données, impossible de créer votre compte')).toBeVisible();
    await page.getByRole('button', { name: /Lire la politique de confidentialité/ }).click(); await expect(page.getByText('Maquette : le texte de la politique')).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/pc-profil-2.png', fullPage: true });
    await page.getByRole('button', { name: /Enregistrer mes choix/ }).click(); await expect.poll(() => chemin(page)).toBe('/bienvenue-notifications');
    expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.partage).toEqual({ offres: false, analyses: true, partenaires: true });
  });
});

test.describe('étape 4 · notifications (PC)', () => {
  test('exemples de notifications à droite, activation simulée, jamais d’appel réel', async ({ page }) => {
    await page.addInitScript(() => { (window as any).__demande = 0; try { (window as any).Notification = Object.assign(function () {}, { permission: 'default', requestPermission: () => { (window as any).__demande++; return Promise.resolve('granted'); } }); } catch { /* absent */ } });
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 4 sur 4'); await expect(page.getByText('Dernière étape')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Être prévenu au bon moment', level: 1 })).toBeVisible();
    const fig = page.getByRole('figure'); await expect(fig).toBeVisible();
    for (const t of ['Drop membres : YUL → PUJ à 200 $ · 3 places', 'YUL → CDG : nommez le voyageur avant demain 18:05', 'Soute du vol 812 : un bagage à 95 $']) await expect(fig.getByText(t)).toBeVisible();
    await expect(fig.getByText('Exemples de notifications · données fictives')).toBeVisible(); await expect(fig.getByText('[H]')).toBeVisible();
    const gauche = await boite(page, 'h1'); const droite = await boite(page, 'figure'); expect(droite.x).toBeGreaterThan(gauche.x + 400);
    await expect(page.getByText('Votre appareil affichera ensuite sa propre demande d’autorisation.')).toBeVisible();
    await page.screenshot({ path: '/tmp/pc-profil-3.png', fullPage: true });
    await page.getByRole('radio', { name: /Tout/ }).check();
    await page.getByRole('button', { name: 'Activer les notifications' }).click();
    const feuille = page.getByRole('dialog', { name: 'Autoriser les notifications ?' }); await expect(feuille).toBeVisible(); await expect(feuille.getByText('Fenêtre simulée de l’appareil · démo')).toBeVisible();
    await feuille.getByRole('button', { name: 'Autoriser', exact: true }).click();
    const ok = page.getByRole('status').filter({ hasText: 'Notifications activées' }); await expect(ok).toBeVisible(); await expect(ok.getByText('Démo : la demande de l’appareil apparaîtrait ici.')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler (démo)' }).click(); await expect(page.getByRole('button', { name: 'Activer les notifications' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__demande)).toBe(0);
    await page.getByRole('button', { name: 'Activer les notifications' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Autoriser', exact: true }).click();
    await page.getByRole('button', { name: /^Continuer/ }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    expect((await lireEtat(page)).tranches.profil).toMatchObject({ permission: 'accordee' }); expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.prefsNotif).toBe('tout');
  });
  test('refuser : bandeau d’alerte « bloquées par l’appareil », on continue quand même', async ({ page }) => {
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await page.getByRole('button', { name: 'Activer les notifications' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Ne pas autoriser' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Notifications bloquées par l’appareil' })).toBeVisible();
    await page.getByRole('button', { name: /^Continuer/ }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
  test('« Plus tard » passe sans rien changer', async ({ page }) => {
    await ouvrirNouveau(page, '/bienvenue-notifications'); await page.getByRole('link', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.prefsNotif).toBe('essentiel');
  });
});

test.describe('carte facultative (PC)', () => {
  test('bandeau démo, deux colonnes, actions à droite ; formulaire en ligne, erreurs, enregistrement', async ({ page }) => {
    await ouvrirNouveau(page, '/carte?retour=/identite');
    await expect(page.getByRole('note').filter({ hasText: 'MODE DÉMO — aucun paiement réel' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Facultatif', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pas obligatoire.'); await expect(page.getByText('Vous ne payez rien maintenant.')).toBeVisible();
    const visuel = await boite(page, '[role=img]'); const ajouter = page.getByRole('button', { name: 'Ajouter une carte maintenant' });
    expect((await ajouter.boundingBox())!.x).toBeGreaterThan(visuel.x + visuel.width); expect(visuel.width).toBeLessThanOrEqual(381);
    await page.screenshot({ path: '/tmp/pc-profil-4.png', fullPage: true });
    await ajouter.click(); await expect(page.getByRole('note').filter({ hasText: 'MODE DÉMO — aucun paiement réel' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '16 chiffres' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: 'Date invalide' })).toBeVisible();
    await page.getByLabel('Numéro de carte (carte de test)').fill('4242424242424242'); await page.getByLabel('Expiration (MM/AA)').fill('1228'); await page.getByLabel('Code de sécurité').fill('123');
    await page.screenshot({ path: '/tmp/pc-profil-4a.png', fullPage: true });
    await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click();
    await expect(page.getByText('Carte de test enregistrée. Aucun montant débité.')).toBeVisible(); await expect(page.getByRole('img', { name: /se terminant par 4242/ })).toBeVisible();
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/pc-profil-4b.png', fullPage: true });
    expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.carte4).toBe('4242');
    await page.getByRole('button', { name: 'Continuer' }).click(); await expect.poll(() => chemin(page)).toBe('/identite');
  });
  test('annuler le formulaire, « Plus tard » revient (retour assaini) ; « Retour » aussi', async ({ page }) => {
    await ouvrirNouveau(page, '/carte'); await page.getByRole('button', { name: 'Ajouter une carte maintenant' }).click();
    await page.getByRole('button', { name: 'Annuler' }).click(); await expect(page.getByRole('button', { name: 'Ajouter une carte maintenant' })).toBeVisible();
    await ouvrirNouveau(page, '/carte?retour=https://evil.test'); await page.getByRole('button', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
});

test.describe('identité facultative (PC)', () => {
  test('bandeau sombre, tableau « Quand est-ce demandé ? », étapes à droite, vérification simulée', async ({ page }) => {
    await ouvrirNouveau(page, '/identite?retour=/carte');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vérifier votre identité, seulement quand il le faut');
    await expect(page.getByRole('main').getByText('Facultatif', { exact: true })).toBeVisible(); await expect(page.getByText('Pour l\'espace Mes actifs', { exact: false })).toBeVisible();
    await expect(page.getByRole('row', { name: /Revendre un billet ou un bagage.*Oui/ })).toBeVisible(); await expect(page.getByRole('row', { name: /Explorer et acheter.*Non/ })).toBeVisible();
    await expect(page.getByText('[H]')).toBeVisible();
    const tab = await boite(page, 'table'); const etapes = await boite(page, 'ol'); expect(etapes.x).toBeGreaterThan(tab.x + tab.width);
    await expect(page.getByRole('heading', { name: 'Si vous le faites maintenant' })).toBeVisible();
    await page.screenshot({ path: '/tmp/pc-profil-5.png', fullPage: true });
    await page.getByRole('button', { name: 'Vérifier maintenant' }).click(); await expect(page.getByText('Démo : étape 1 ouverte.')).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer pour vérification' }).click(); await expect(page.getByRole('alert').filter({ hasText: '6 à 12' })).toBeVisible();
    await page.getByLabel('Numéro du document (démo)').fill('AB123456'); await page.getByRole('button', { name: 'Envoyer pour vérification' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Vérification en cours' })).toBeVisible();
    await expect(page.getByText('Identité vérifiée.')).toBeVisible({ timeout: 6000 });
    expect(await sansDebordement(page)).toBe(true);
    expect((await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0999')!.identiteVerifiee).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Continuer/ }).click(); await expect.poll(() => chemin(page)).toBe('/carte');
  });
  test('« Plus tard » revient à l’écran prêt', async ({ page }) => {
    await ouvrirNouveau(page, '/identite'); await page.getByRole('button', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
});

test.describe('écran prêt (PC)', () => {
  test('deux grandes cartes côte à côte, « Reste facultatif » avec liens', async ({ page }) => {
    await ouvrirNouveau(page, '/pret');
    await expect(page.getByRole('heading', { name: 'Votre espace est prêt, Alex', level: 1 })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Prêt' })).toBeVisible();
    const voy = page.getByRole('link', { name: /Voyager.*Trouver un vol, préparer un voyage/ }); const act = page.getByRole('link', { name: /Mes actifs.*Suivre et revendre mes billets/ });
    await expect(voy).toBeVisible(); await expect(act).toBeVisible();
    const a = (await voy.boundingBox())!; const b = (await act.boundingBox())!; expect(b.x).toBeGreaterThan(a.x + a.width - 1); expect(Math.abs(a.y - b.y)).toBeLessThan(2); expect(a.height).toBeGreaterThanOrEqual(240);
    await expect(page.getByRole('heading', { name: 'Reste facultatif' })).toBeVisible();
    await expect(page.locator('li', { hasText: 'Carte : plus tard' })).toBeVisible(); await expect(page.locator('li', { hasText: 'Identité : plus tard' })).toBeVisible();
    await expect(page.getByText('Rien n\'est bloqué', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Découvrir/ })).toHaveCount(0);
    expect(await sansDebordement(page)).toBe(true);
    await page.waitForTimeout(1200); await page.screenshot({ path: '/tmp/pc-profil-6.png', fullPage: true });
    await page.getByRole('link', { name: /Ajouter/ }).click(); await expect.poll(() => page.url()).toContain('/carte?retour=/pret');
    await page.getByRole('button', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    await page.getByRole('link', { name: /Vérifier/ }).click(); await expect.poll(() => page.url()).toContain('/identite?retour=/pret');
  });
  test('les cartes ouvrent chaque espace : Voyager (accueil) et Mes actifs (face nuit)', async ({ page }) => {
    await ouvrirNouveau(page, '/pret'); await page.getByRole('link', { name: /Mes actifs.*Suivre et revendre/ }).click(); await expect.poll(() => chemin(page)).toBe('/');
    expect((await lireEtat(page)).session.face).toBe('marche'); expect((await lireEtat(page)).session.inscription).toEqual({ etape: 1 });
  });
  test('compte complet (Alex) : pas de « Reste facultatif »', async ({ page }) => {
    await ouvrir(page, '/pret', { connecte: 'ACC-0412' });
    await expect(page.getByRole('heading', { name: 'Votre espace est prêt, Alex', level: 1 })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Reste facultatif' })).toHaveCount(0);
  });
});

test.describe('parcours complet au clavier et à la souris (PC)', () => {
  test('profil → partage → notifications → prêt, puis retour au mobile : la barre d’action revient', async ({ page }) => {
    await ouvrirNouveau(page, '/profil');
    await page.getByLabel('Prénom').focus(); await page.keyboard.press('Enter'); await expect.poll(() => chemin(page)).toBe('/partage');
    await page.getByRole('button', { name: /Enregistrer mes choix/ }).click(); await expect.poll(() => chemin(page)).toBe('/bienvenue-notifications');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.pied').getByRole('button', { name: 'Activer les notifications' })).toBeVisible(); await expect(page.getByRole('figure')).toBeVisible();
    await expect(page.getByText('Votre téléphone affichera ensuite sa propre demande d\'autorisation.')).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.pied').getByRole('button')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Activer les notifications' })).toBeVisible();
    await page.getByRole('link', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
});
