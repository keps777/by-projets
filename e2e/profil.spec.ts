import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

/** Nouveau compte (comme après /code) : copie d'un compte du seed, prénom et nom vides, ni carte ni identité. */
const preparer = (e: Etat) => {
  const base = e.monde.comptes.find((c) => c.id === 'ACC-0187')!;
  e.monde.comptes.push({ ...base, id: 'ACC-0999', prenom: '', nom: '', email: 'nouveau@exemple.test', tel: '', carte4: undefined, identiteVerifiee: undefined, partage: { offres: true, analyses: false, partenaires: false }, prefsNotif: 'essentiel' });
  e.session.inscription = { etape: 2 };
};
const ouvrirNouveau = (page: Page, route: string) => ouvrir(page, route, { connecte: 'ACC-0999', preparer });
const compteNouveau = async (page: Page) => (await lireEtat(page)).monde.comptes.find((c) => c.id === 'ACC-0999')!;
const suivant = (page: Page, nom: string | RegExp) => page.getByRole('button', { name: nom });

test.describe('garde d’accès', () => {
  for (const r of ['/profil', '/partage', '/bienvenue-notifications', '/carte', '/identite', '/pret']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test('parcours nominal : profil → partage → notifications → prêt → accueil', async ({ page }) => {
  await ouvrirNouveau(page, '/profil');
  await expect(page.getByRole('heading', { name: 'Faisons connaissance', level: 1 })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 2 sur 4'); await expect(page.getByText('Étape 2 sur 4')).toBeVisible();
  await expect(page.locator('#pf-airport')).toHaveValue('Montréal (YUL)');
  await page.getByLabel('Prénom').fill('Léa'); await expect(page.getByText('Nous vous dirons « Bonjour Léa ».')).toBeVisible();
  await page.getByLabel('Nom', { exact: true }).fill('Roy');
  await expect(page.getByText('2 choix sélectionnés sur 6')).toBeVisible();
  await page.getByRole('button', { name: 'Voyages en famille' }).click(); await expect(page.getByText('3 choix sélectionnés sur 6')).toBeVisible();
  await page.screenshot({ path: '/tmp/profil-1.png' });
  await suivant(page, /^Continuer/).click(); await expect.poll(() => chemin(page)).toBe('/partage');

  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 3 sur 4');
  await expect(page.getByText('Activés : le nécessaire, plus 2 réglages facultatifs sur 4.')).toBeVisible();
  await page.getByRole('switch', { name: /Offres partenaires/ }).click(); await page.getByRole('switch', { name: /Mesure d.audience/ }).click();
  await expect(page.getByText('plus 4 réglages facultatifs sur 4.')).toBeVisible();
  await page.screenshot({ path: '/tmp/profil-2.png' });
  await suivant(page, /Enregistrer mes choix/).click(); await expect.poll(() => chemin(page)).toBe('/bienvenue-notifications');

  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 4 sur 4');
  await page.getByRole('radio', { name: /Tout/ }).check();
  await page.getByRole('button', { name: 'Activer les notifications' }).click();
  const feuille = page.getByRole('dialog', { name: 'Autoriser les notifications ?' }); await expect(feuille).toBeVisible();
  await page.screenshot({ path: '/tmp/profil-3.png' });
  await feuille.getByRole('button', { name: 'Autoriser', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Notifications activées' })).toBeVisible();
  await suivant(page, /^Continuer/).click(); await expect.poll(() => chemin(page)).toBe('/pret');

  await expect(page.getByRole('heading', { name: 'Votre espace est prêt, Léa' })).toBeVisible();
  await expect(page.getByText('Léa Roy · YUL')).toBeVisible(); await expect(page.getByText('Tout', { exact: true })).toBeVisible();
  await expect(page.getByText('4 réglages activés')).toBeVisible();
  await page.screenshot({ path: '/tmp/profil-6.png', fullPage: true });
  const e = await lireEtat(page); const c = e.monde.comptes.find((x) => x.id === 'ACC-0999')!;
  expect([c.prenom, c.nom, c.aeroport, c.prefsNotif]).toEqual(['Léa', 'Roy', 'YUL', 'tout']);
  expect(c.partage).toEqual({ offres: true, analyses: true, partenaires: true }); expect(e.session.inscription).toEqual({ etape: 1 });
  expect(e.tranches.profil).toMatchObject({ interets: ['last', 'drops', 'family'], rappelsJ1: true, permission: 'accordee' });
  await suivant(page, /Découvrir/).click(); await expect.poll(() => chemin(page)).toBe('/');
});

test.describe('étape 2 · profil', () => {
  test('un aéroport inconnu est signalé, « Plus tard » passe sans rien écrire', async ({ page }) => {
    await ouvrirNouveau(page, '/profil');
    await page.getByLabel('Aéroport habituel').fill('Atlantide'); await expect(page.locator('.code')).toHaveText('···');
    await suivant(page, /^Continuer/).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Aéroport inconnu' })).toBeVisible(); expect(chemin(page)).toBe('/profil');
    await page.getByLabel('Aéroport habituel').fill('Paris (CDG)'); await expect(page.locator('.code')).toHaveText('CDG'); await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Prénom').fill('Zoé');
    await page.getByRole('link', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/partage');
    expect((await compteNouveau(page)).prenom).toBe('');
  });
  test('tout est facultatif : on continue sans rien remplir, le clavier suffit', async ({ page }) => {
    await ouvrirNouveau(page, '/profil');
    const famille = page.getByRole('button', { name: 'Voyages en famille' }); await famille.focus(); await page.keyboard.press('Space'); await expect(famille).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Dernière minute' }).click(); await page.getByRole('button', { name: 'Drops membres' }).click();
    await page.getByRole('button', { name: 'Voyages en famille' }).click();
    await expect(page.getByText('Aucun choix pour l’instant : c’est permis.')).toBeVisible();
    await page.getByLabel('Prénom').focus(); await page.keyboard.press('Enter'); await expect.poll(() => chemin(page)).toBe('/partage');
    const c = await compteNouveau(page); expect([c.prenom, c.aeroport]).toEqual(['', 'YUL']);
  });
});

test.describe('étape 3 · partage', () => {
  test('interrupteurs accessibles au clavier, explications dépliables', async ({ page }) => {
    await ouvrirNouveau(page, '/partage');
    const audience = page.getByRole('switch', { name: /Mesure d.audience anonyme/ });
    await expect(audience).toHaveAttribute('aria-checked', 'false'); await audience.focus(); await page.keyboard.press('Space'); await expect(audience).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: /Rappels d.échéance J-1/ })).toContainText('Recommandé');
    const pq = page.getByRole('button', { name: /Pourquoi est-ce verrouillé/ }); await expect(pq).toHaveAttribute('aria-expanded', 'false'); await pq.click();
    await expect(page.getByText('Sans ces données, impossible de créer votre compte')).toBeVisible();
    await page.getByRole('button', { name: /Lire la politique de confidentialité/ }).click(); await expect(page.getByText('Maquette : le texte de la politique')).toBeVisible();
    await page.getByRole('switch', { name: /Alertes de prix et de drops/ }).click();
    await suivant(page, /Enregistrer mes choix/).click(); await expect.poll(() => chemin(page)).toBe('/bienvenue-notifications');
    const e = await lireEtat(page);
    expect(e.monde.comptes.find((c) => c.id === 'ACC-0999')!.partage).toEqual({ offres: false, analyses: true, partenaires: false });
  });
});

test.describe('étape 4 · notifications', () => {
  test('jamais d’appel réel à Notification.requestPermission ; refuser est sans conséquence', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __demande: number }).__demande = 0; try { (window as any).Notification = Object.assign(function () {}, { permission: 'default', requestPermission: () => { (window as any).__demande++; return Promise.resolve('granted'); } }); } catch { /* absent */ } });
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await expect(page.getByText('Votre téléphone affichera ensuite sa propre demande d\'autorisation.')).toBeVisible();
    await page.getByRole('button', { name: 'Activer les notifications' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ne pas autoriser' }).click();
    await expect(page.getByText('Pas de souci : vous pourrez les activer plus tard')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__demande)).toBe(0);
    await suivant(page, /^Continuer/).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    expect((await lireEtat(page)).tranches.profil).toMatchObject({ permission: 'refusee' });
  });
  test('la feuille se ferme avec Échap, « Annuler (démo) » revient en arrière', async ({ page }) => {
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await page.getByRole('button', { name: 'Activer les notifications' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Activer les notifications' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Autoriser', exact: true }).click();
    await page.getByRole('button', { name: 'Annuler (démo)' }).click(); await expect(page.getByRole('button', { name: 'Activer les notifications' })).toBeVisible();
  });
  test('« Rien » se confirme sans demande ; « Plus tard » passe', async ({ page }) => {
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await page.getByRole('radio', { name: /Rien/ }).check(); await expect(page.getByRole('button', { name: 'Activer les notifications' })).toHaveCount(0);
    await suivant(page, /^Continuer/).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    expect((await compteNouveau(page)).prefsNotif).toBe('rien');
  });
  test('« Plus tard » ne change rien', async ({ page }) => {
    await ouvrirNouveau(page, '/bienvenue-notifications');
    await page.getByRole('link', { name: 'Plus tard' }).click(); await expect.poll(() => chemin(page)).toBe('/pret');
    expect((await compteNouveau(page)).prefsNotif).toBe('essentiel');
  });
});

test.describe('carte facultative', () => {
  test('« Plus tard » revient là où on était (retour assaini)', async ({ page }) => {
    await ouvrirNouveau(page, '/carte?retour=/identite');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pas obligatoire.'); await expect(page.getByText('Vous ne payez rien maintenant.')).toBeVisible();
    await page.screenshot({ path: '/tmp/profil-4.png' });
    await suivant(page, 'Plus tard').click(); await expect.poll(() => chemin(page)).toBe('/identite');
    await ouvrirNouveau(page, '/carte?retour=https://evil.test'); await suivant(page, 'Plus tard').click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
  test('erreurs de saisie, puis enregistrement : seuls les 4 derniers chiffres sont gardés', async ({ page }) => {
    await ouvrirNouveau(page, '/carte');
    await suivant(page, 'Ajouter une carte maintenant').click(); await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '16 chiffres' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: 'Date invalide' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: '3 chiffres' })).toBeVisible();
    await page.getByLabel('Numéro de carte (carte de test)').fill('4242424242424241'); await expect(page.getByLabel('Numéro de carte (carte de test)')).toHaveValue('4242 4242 4242 4241');
    await page.getByLabel('Expiration (MM/AA)').fill('1228'); await expect(page.getByLabel('Expiration (MM/AA)')).toHaveValue('12/28'); await page.getByLabel('Code de sécurité').fill('123');
    await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'n’est pas valide' })).toBeVisible();
    await page.getByLabel('Numéro de carte (carte de test)').fill('4242424242424242'); await page.getByLabel('Nom sur la carte').fill('Léa Roy');
    await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click();
    await expect(page.getByText('Carte de test enregistrée. Aucun montant débité.')).toBeVisible(); await expect(page.getByRole('img', { name: /se terminant par 4242/ })).toBeVisible();
    await page.screenshot({ path: '/tmp/profil-4b.png' });
    const e = await lireEtat(page); expect(e.monde.comptes.find((c) => c.id === 'ACC-0999')!.carte4).toBe('4242');
    const brut = JSON.stringify(e); expect(brut).not.toContain('4242 4242 4242'); expect(brut).not.toContain('4242424242424242'); expect(brut).not.toContain('Léa Roy');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('4242424242424242');
    await page.getByRole('button', { name: 'Retirer' }).click(); await expect(page.getByRole('img', { name: /Emplacement de carte vide/ })).toBeVisible();
    expect((await compteNouveau(page)).carte4).toBeUndefined();
  });
  test('hors ligne : message d’erreur et enregistrement bloqué', async ({ page, context }) => {
    await ouvrirNouveau(page, '/carte'); await suivant(page, 'Ajouter une carte maintenant').click();
    await context.setOffline(true);
    await expect(page.getByRole('alert').filter({ hasText: 'hors ligne' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Enregistrer la carte de test' })).toBeDisabled();
    await context.setOffline(false); await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('identité facultative', () => {
  test('explique pourquoi, puis simule la vérification jusqu’au résultat', async ({ page }) => {
    await ouvrirNouveau(page, '/identite?retour=/carte');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vérifier votre identité, seulement quand il le faut');
    await expect(page.getByRole('row', { name: /Revendre un billet ou un bagage.*Oui/ })).toBeVisible(); await expect(page.getByRole('row', { name: /Explorer et acheter.*Non/ })).toBeVisible();
    await page.screenshot({ path: '/tmp/profil-5.png', fullPage: true });
    await suivant(page, 'Vérifier maintenant').click(); await expect(page.getByText('Démo : étape 1 ouverte.')).toBeVisible();
    await page.getByRole('radio', { name: 'Permis de conduire' }).check();
    await page.getByRole('button', { name: 'Envoyer pour vérification' }).click(); await expect(page.getByRole('alert').filter({ hasText: '6 à 12' })).toBeVisible();
    await page.getByLabel('Numéro du document (démo)').fill('AB123456');
    await page.getByRole('button', { name: 'Envoyer pour vérification' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Vérification en cours' })).toBeVisible();
    await expect(page.getByText('Identité vérifiée.')).toBeVisible({ timeout: 6000 });
    const e = await lireEtat(page); expect(e.monde.comptes.find((c) => c.id === 'ACC-0999')!.identiteVerifiee).toBeGreaterThan(0); expect(JSON.stringify(e)).not.toContain('AB123456');
    await suivant(page, /^Continuer/).click(); await expect.poll(() => chemin(page)).toBe('/carte');
  });
  test('un document illisible est refusé, on peut réessayer ou arrêter ; « Plus tard » revient', async ({ page }) => {
    await ouvrirNouveau(page, '/identite');
    await suivant(page, 'Vérifier maintenant').click(); await page.getByLabel('Numéro du document (démo)').fill('000000');
    await page.getByRole('button', { name: 'Envoyer pour vérification' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Document illisible' })).toBeVisible({ timeout: 6000 }); expect((await compteNouveau(page)).identiteVerifiee).toBeUndefined();
    await suivant(page, 'Réessayer').click(); await suivant(page, 'Arrêter la vérification (démo)').click(); await expect(suivant(page, 'Vérifier maintenant')).toBeVisible();
    await suivant(page, 'Plus tard').click(); await expect.poll(() => chemin(page)).toBe('/pret');
  });
  test('on peut arrêter pendant l’attente', async ({ page }) => {
    await ouvrirNouveau(page, '/identite'); await suivant(page, 'Vérifier maintenant').click(); await page.getByLabel('Numéro du document (démo)').fill('AB123456');
    await page.getByRole('button', { name: 'Envoyer pour vérification' }).click(); await suivant(page, 'Arrêter la vérification (démo)').click();
    await page.waitForTimeout(2600); await expect(page.getByText('Identité vérifiée.')).toHaveCount(0); expect((await compteNouveau(page)).identiteVerifiee).toBeUndefined();
  });
});

test.describe('écran prêt', () => {
  test('propose de compléter la carte et l’identité, avec retour vers /pret', async ({ page }) => {
    await ouvrirNouveau(page, '/pret');
    await expect(page.locator('li', { hasText: 'Carte : plus tard' })).toBeVisible(); await expect(page.locator('li', { hasText: 'Identité : plus tard' })).toBeVisible();
    await page.getByRole('link', { name: /Ajouter/ }).click(); await expect.poll(() => page.url()).toContain('/carte?retour=/pret');
    await suivant(page, 'Plus tard').click(); await expect.poll(() => chemin(page)).toBe('/pret');
    await page.getByRole('link', { name: /Vérifier/ }).click(); await expect.poll(() => page.url()).toContain('/identite?retour=/pret');
  });
  test('Alex (carte et identité faites) : récapitulatif complet', async ({ page }) => {
    await ouvrir(page, '/pret', { connecte: 'ACC-0412' });
    await expect(page.getByText('•••• •••• •••• 4821')).toBeVisible(); await expect(page.locator('li', { hasText: 'Identité : vérifiée' })).toBeVisible(); await expect(page.getByRole('link', { name: /Ajouter/ })).toHaveCount(0);
  });
});

test('320 px : aucun débordement horizontal sur les six écrans (états ouverts compris)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const r of ['/profil', '/partage', '/bienvenue-notifications', '/carte', '/identite', '/pret']) {
    await ouvrirNouveau(page, r); await expect(page.locator('main')).toBeVisible(); expect(await sansDebordement(page), r).toBe(true);
  }
  await ouvrirNouveau(page, '/carte'); await suivant(page, 'Ajouter une carte maintenant').click(); await page.getByRole('button', { name: 'Enregistrer la carte de test' }).click(); expect(await sansDebordement(page)).toBe(true);
  await ouvrirNouveau(page, '/identite'); await suivant(page, 'Vérifier maintenant').click(); await page.getByRole('button', { name: 'Envoyer pour vérification' }).click(); expect(await sansDebordement(page)).toBe(true);
});
