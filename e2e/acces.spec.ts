import { chemin, CODE_DEMO, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Page } from '@playwright/test';

const appareilAlex = (e: { tranches: Record<string, unknown> }) => { e.tranches.acces = { appareil: { compteId: 'ACC-0412' } }; };
const consentir = (page: Page) => page.getByLabel(/J’accepte les conditions/).check();
const saisirCode = async (page: Page, code: string) => { await page.getByLabel('Code à 6 chiffres').fill(code); };

test.describe('Créer un compte', () => {
  test('parcours nominal par courriel : compte créé, connecté, appareil mémorisé, étape 2, puis /profil', async ({ page }) => {
    await ouvrir(page, '/inscription');
    await expect(page.getByRole('heading', { level: 1, name: 'Créez votre compte en 1 minute' })).toBeVisible();
    for (const t of ['Aucune carte demandée', 'Explorer sans compte possible', 'Identité vérifiée seulement pour revendre']) await expect(page.getByRole('list', { name: 'Ce que nous ne vous demandons pas' }).getByText(t)).toBeVisible();
    await page.screenshot({ path: '/tmp/acces-inscription.png' });
    await page.getByLabel('Adresse courriel').fill('lea.roy@exemple.test'); await consentir(page);
    await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect(page.getByRole('button', { name: /Envoi du code en cours/ })).toBeVisible();
    await expect.poll(() => chemin(page)).toBe('/code'); await expect(page.getByText('lea.roy@exemple.test')).toBeVisible();
    await expect(page.getByText(`Mode démo : le code est ${CODE_DEMO}`)).toBeVisible();
    await saisirCode(page, CODE_DEMO); await expect(page.getByText('Courriel vérifié')).toBeVisible();
    await page.screenshot({ path: '/tmp/acces-code-ok.png' });
    await expect.poll(() => chemin(page)).toBe('/profil');
    const e = await lireEtat(page);
    const c = e.monde.comptes.find((x) => x.email === 'lea.roy@exemple.test')!;
    expect(c).toBeTruthy(); expect(e.session.compteId).toBe(c.id); expect(e.session.inscription.etape).toBe(2);
    expect((e.tranches.acces as { appareil: { compteId: string } }).appareil.compteId).toBe(c.id);
  });

  test('onglet Téléphone : flèches du clavier, mise en forme du numéro, compte créé par téléphone', async ({ page }) => {
    await ouvrir(page, '/inscription');
    const courriel = page.getByRole('tab', { name: 'Courriel' }), tel = page.getByRole('tab', { name: 'Téléphone' });
    await expect(courriel).toHaveAttribute('aria-selected', 'true'); await courriel.focus(); await page.keyboard.press('ArrowRight');
    await expect(tel).toHaveAttribute('aria-selected', 'true'); await expect(tel).toBeFocused();
    await page.keyboard.press('ArrowLeft'); await expect(courriel).toHaveAttribute('aria-selected', 'true');
    await tel.click(); await page.getByLabel('Numéro de téléphone mobile').fill('4385550199'); await expect(page.getByLabel('Numéro de téléphone mobile')).toHaveValue('438 555 0199');
    await consentir(page); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect.poll(() => chemin(page)).toBe('/code'); await saisirCode(page, CODE_DEMO); await expect.poll(() => chemin(page)).toBe('/profil');
    const e = await lireEtat(page); expect(e.monde.comptes.some((c) => c.tel === '438 555 0199' && c.email === '')).toBe(true);
  });

  test('erreurs : champ vide, format invalide, conditions non cochées ; rien n’est créé', async ({ page }) => {
    await ouvrir(page, '/inscription'); const envoyer = page.getByRole('button', { name: /Recevoir mon code/ });
    await envoyer.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Ce champ est vide : indiquez où recevoir le code.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Cochez cette case pour recevoir votre code.' })).toBeVisible();
    await expect(page.getByLabel('Adresse courriel')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByLabel('Adresse courriel')).toBeFocused();
    await expect(page.locator('.panneau')).toHaveCSS('animation-name', /nx-shake|secoue/);
    await page.getByLabel('Adresse courriel').fill('pas-un-courriel'); await consentir(page); await envoyer.click();
    await expect(page.getByText('Cette adresse courriel semble incomplète')).toBeVisible(); expect(chemin(page)).toBe('/inscription');
    await page.getByRole('tab', { name: 'Téléphone' }).click(); await page.getByLabel('Numéro de téléphone mobile').fill('555'); await envoyer.click();
    await expect(page.getByText('Ce numéro doit compter 10 chiffres')).toBeVisible();
    const e = await lireEtat(page); expect(e.session.compteId).toBeNull();
  });

  test('mouvement réduit : la secousse est désactivée', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await ouvrir(page, '/inscription');
    await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect(page.locator('.panneau')).toHaveCSS('animation-name', 'none');
  });

  test('un identifiant déjà connu mène à une connexion, sans créer de second compte', async ({ page }) => {
    await ouvrir(page, '/inscription'); const n = (await lireEtat(page)).monde.comptes.length;
    await page.getByLabel('Adresse courriel').fill('Alex.Tremblay@exemple.test'); await consentir(page); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect.poll(() => page.url()).toContain('/code?mode=connexion'); await saisirCode(page, CODE_DEMO);
    await expect(page.getByText('Connexion confirmée')).toBeVisible(); await expect.poll(() => chemin(page)).toBe('/');
    const e = await lireEtat(page); expect(e.session.compteId).toBe('ACC-0412'); expect(e.monde.comptes.length).toBe(n);
  });

  test('liens, lecture des conditions et connexion Apple de démonstration', async ({ page }) => {
    await ouvrir(page, '/inscription');
    await page.getByRole('button', { name: 'Lire les conditions en bref' }).click(); await expect(page.getByText('Texte complet en cours de rédaction avec un juriste (prototype).')).toBeVisible();
    await page.getByRole('button', { name: 'Continuer avec Apple' }).click(); await expect(page.getByText('Démo : la connexion avec Apple n’est pas encore branchée')).toBeVisible();
    await page.getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
    await page.goBack(); await page.getByRole('link', { name: 'Explorer sans compte' }).click(); await expect.poll(() => chemin(page)).toBe('/explorer');
  });

  test('hors ligne : le formulaire reste utilisable, l’envoi est suspendu ; échec d’envoi : Réessayer', async ({ page, context }) => {
    await ouvrir(page, '/inscription'); await context.setOffline(true);
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
    await page.getByLabel('Adresse courriel').fill('lea@exemple.test'); await consentir(page); await page.getByRole('button', { name: /Recevoir mon code/ }).click({ force: true });
    await expect(page.getByRole('button', { name: /Recevoir mon code/ })).toHaveAttribute('aria-disabled', 'true'); await page.waitForTimeout(1200); expect(chemin(page)).toBe('/inscription'); await context.setOffline(false); await expect(page.getByText('Hors ligne', { exact: true })).toBeHidden();
    await page.goto('/inscription?etat=erreur'); await page.getByLabel('Adresse courriel').fill('lea@exemple.test'); await consentir(page); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Le code n’a pas pu être envoyé' })).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer' }).click(); await expect.poll(() => chemin(page)).toBe('/code');
  });
});

test.describe('Code de vérification', () => {
  const versCode = async (page: Page, email = 'lea@exemple.test') => { await ouvrir(page, '/inscription'); await page.getByLabel('Adresse courriel').fill(email); await consentir(page); await page.getByRole('button', { name: /Recevoir mon code/ }).click(); await expect.poll(() => chemin(page)).toBe('/code'); };

  test('attributs de saisie, collage, retour arrière, focus automatique', async ({ page }) => {
    await versCode(page); const champ = page.getByLabel('Code à 6 chiffres');
    await expect(champ).toHaveAttribute('inputmode', 'numeric'); await expect(champ).toHaveAttribute('autocomplete', 'one-time-code'); await expect(champ).toBeFocused();
    await expect(page.getByRole('button', { name: /Continuer · entrez les 6 chiffres/ })).toBeVisible();
    await page.keyboard.type('4829'); await expect(champ).toHaveValue('4829'); await page.keyboard.press('Backspace'); await expect(champ).toHaveValue('482');
    await champ.fill('48a-2 9'); await expect(champ).toHaveValue('4829');
    await page.screenshot({ path: '/tmp/acces-code.png' });
    await champ.fill(' 482 915 '); await expect.poll(() => chemin(page)).toBe('/profil');
  });

  test('code incorrect : message annoncé, 3 essais puis blocage ; « Modifier l’adresse » revient à l’inscription', async ({ page }) => {
    await versCode(page); await saisirCode(page, '111111');
    await expect(page.getByRole('alert')).toContainText('Ce code ne correspond pas. Il vous reste 2 essais.'); await expect(page.locator('.saisie')).toHaveCSS('animation-name', /nx-shake|secoue/);
    await page.screenshot({ path: '/tmp/acces-code-erreur.png' });
    await page.getByLabel('Code à 6 chiffres').press('Backspace'); await page.keyboard.type('2'); await expect(page.getByRole('alert')).toContainText('Il vous reste 1 essai.');
    await page.getByLabel('Code à 6 chiffres').press('Backspace'); await page.keyboard.type('3'); await expect(page.getByRole('alert')).toContainText('Trop d’essais. Demandez un nouveau code pour continuer.');
    await page.getByRole('button', { name: 'Simuler le bon code' }).click({ force: true, trial: true }).catch(() => {}); // désactivé pendant le blocage
    await expect(page.getByRole('button', { name: 'Simuler le bon code' })).toBeDisabled(); expect(chemin(page)).toBe('/code');
    await page.getByRole('link', { name: 'Modifier l’adresse' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
  });

  test('renvoi : compte à rebours de 30 s (horloge réelle), puis nouveau code qui rend les essais', async ({ page }) => {
    await page.clock.install(); await versCode(page);
    await expect(page.getByText(/Renvoyer le code dans/)).toBeVisible(); await expect(page.getByText(/^0:(29|30)$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renvoyer le code' })).toHaveCount(0);
    await saisirCode(page, '111111'); await expect(page.getByRole('alert')).toContainText('2 essais');
    await page.clock.fastForward(31_000); await expect(page.getByRole('button', { name: 'Renvoyer le code' })).toBeVisible();
    await page.getByRole('button', { name: 'Renvoyer le code' }).click(); await page.clock.runFor(1000);
    await expect(page.getByText('Nouveau code envoyé (démo). L’ancien ne fonctionne plus.')).toBeVisible(); await expect(page.getByLabel('Code à 6 chiffres')).toHaveValue('');
    await expect(page.getByText(/Renvoyer le code dans/)).toBeVisible();
  });

  test('boutons de démonstration et saisie suspendue hors ligne', async ({ page, context }) => {
    await versCode(page); await page.getByRole('button', { name: 'Simuler un code erroné' }).click(); await expect(page.getByRole('alert')).toContainText('Il vous reste 2 essais');
    await context.setOffline(true); await expect(page.getByText('La vérification du code demande le réseau')).toBeVisible(); await expect(page.getByRole('button', { name: 'Simuler le bon code' })).toBeDisabled();
    await context.setOffline(false); await page.getByLabel('Code à 6 chiffres').fill(CODE_DEMO); await expect.poll(() => chemin(page)).toBe('/profil');
  });
  test('accès direct à /code sans brouillon : retour à l’inscription', async ({ page }) => { await ouvrir(page, '/code'); await expect.poll(() => chemin(page)).toBe('/inscription'); });
});

test.describe('Bon retour', () => {
  test('appareil connu : clé d’accès simulée puis accueil, compte connecté', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex });
    await expect(page.getByRole('heading', { level: 1, name: 'Bon retour, Alex' })).toBeVisible(); await expect(page.getByText('alex.tremblay@exemple.test')).toBeVisible(); await expect(page.getByText('AT', { exact: true })).toBeVisible();
    await expect(page.getByText('Nous ne vous demanderons jamais votre code par téléphone.')).toBeVisible(); await expect(page.getByText('Aucun mot de passe : votre téléphone confirme que c’est bien vous.')).toBeVisible();
    await expect(page.getByText('Connexion par clé d’accès : hypothèse à valider')).toBeVisible();
    await page.screenshot({ path: '/tmp/acces-connexion.png' });
    await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).click();
    await expect(page.getByRole('dialog', { name: 'Clé d’accès' })).toContainText('Confirmez avec votre empreinte, votre visage ou le code de votre appareil');
    await page.screenshot({ path: '/tmp/acces-connexion-cle.png' });
    await expect.poll(() => chemin(page), { timeout: 5000 }).toBe('/'); expect((await lireEtat(page)).session.compteId).toBe('ACC-0412');
  });
  test('annuler la feuille ne connecte pas ; échec de la clé : message et Réessayer', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex });
    await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).click(); await page.getByRole('button', { name: 'Fermer' }).click(); await page.waitForTimeout(1500);
    expect(chemin(page)).toBe('/connexion'); expect((await lireEtat(page)).session.compteId).toBeNull();
    await page.goto('/connexion?etat=erreur'); await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Clé d’accès non reconnue' })).toBeVisible({ timeout: 5000 }); await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
  test('repli par code courriel, puis connexion', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex }); await page.getByRole('button', { name: 'Recevoir un code par courriel' }).click();
    await expect.poll(() => page.url()).toContain('/code?mode=connexion'); await expect(page.getByText('alex.tremblay@exemple.test')).toBeVisible();
    await expect(page.getByText('Étape 1 sur 4')).toHaveCount(0); await saisirCode(page, CODE_DEMO); await expect.poll(() => chemin(page)).toBe('/'); expect((await lireEtat(page)).session.compteId).toBe('ACC-0412');
  });
  test('« Ce n’est pas moi » oublie l’appareil ; identifiant inconnu puis connu', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex }); await page.getByRole('button', { name: 'Ce n’est pas moi' }).click();
    await expect(page.getByLabel('Courriel ou téléphone')).toBeVisible(); expect((await lireEtat(page)).tranches.acces).toEqual({});
    await page.getByRole('button', { name: /Continuer/ }).click(); await expect(page.getByRole('alert')).toContainText('Ce champ est vide');
    await page.getByLabel('Courriel ou téléphone').fill('inconnu@exemple.test'); await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('alert')).toContainText('Aucun compte pour cet identifiant'); await page.screenshot({ path: '/tmp/acces-connexion-id.png' });
    await expect(page.getByRole('alert').getByRole('link', { name: 'Créer un compte' })).toBeVisible();
    await page.getByLabel('Courriel ou téléphone').fill('514 555 0142'); await page.getByRole('button', { name: /Continuer/ }).click();
    await expect.poll(() => page.url()).toContain('/code?mode=connexion'); await saisirCode(page, CODE_DEMO); await expect.poll(() => chemin(page)).toBe('/');
    const e = await lireEtat(page); expect(e.session.compteId).toBe('ACC-0412'); expect((e.tranches.acces as { appareil: { compteId: string } }).appareil.compteId).toBe('ACC-0412');
  });
  test('sans appareil connu : saisie d’identifiant, pas de clé d’accès', async ({ page }) => {
    await ouvrir(page, '/connexion'); await expect(page.getByLabel('Courriel ou téléphone')).toBeVisible(); await expect(page.getByRole('button', { name: /clé d’accès/ })).toHaveCount(0);
    await expect(page.getByText('Nous ne vous demanderons jamais votre code par téléphone.')).toBeVisible();
  });
  test('hors ligne : clé d’accès et code suspendus', async ({ page }) => {
    await ouvrir(page, '/connexion?etat=horsligne', { preparer: appareilAlex });
    await expect(page.getByText('La connexion demande le réseau')).toBeVisible();
    await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).click({ force: true }); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Recevoir un code par courriel' }).click({ force: true }); expect(chemin(page)).toBe('/connexion');
  });
});

test.describe('Mise en page 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const [nom, url] of [['inscription', '/inscription'], ['code', '/code'], ['connexion (appareil connu)', '/connexion'], ['connexion (identifiant)', '/connexion?etat=erreur']] as const) {
    test(`${nom} sans débordement horizontal`, async ({ page }) => {
      await ouvrir(page, url, { preparer: (e) => { if (nom.includes('appareil')) appareilAlex(e); if (url === '/code') e.session.inscription = { email: 'une.adresse.assez.longue@exemple.test', etape: 1 }; } });
      await page.getByRole('heading', { level: 1 }).waitFor(); expect(await sansDebordement(page)).toBe(true);
      if (url === '/inscription') { await page.getByRole('button', { name: /Recevoir mon code/ }).click(); await page.getByRole('button', { name: 'Lire les conditions en bref' }).click(); expect(await sansDebordement(page)).toBe(true); }
      await page.screenshot({ path: `/tmp/acces-320-${url.replace(/\W/g, '')}.png` });
    });
  }
});
