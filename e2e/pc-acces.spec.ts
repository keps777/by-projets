// Variantes PC (face jour) des écrans d'entrée et d'accès : ouverture, langue, promesses, inscription, code, connexion.
// Planches : design/maquettes/Web{Ouverture,Langue,Promesse,Inscription,Code,Connexion}.dc.html (rendu : node scripts/maquette.mjs <Planche> /tmp/x.png 1440 900).
import { chemin, CODE_DEMO, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Page } from '@playwright/test';

const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
const appareilAlex = (e: { tranches: Record<string, unknown> }) => { e.tranches.acces = { appareil: { compteId: 'ACC-0412' } }; };
const LARGEURS = [900, 1024, 1280, 1440] as const;

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

/** Aucun élément ne dépasse à droite de la fenêtre (en plus de l'absence de défilement horizontal). */
const toutDedans = (page: Page) => page.evaluate(() => [...document.body.querySelectorAll('main *, header *, footer *')].filter((e) => {
  const r = e.getBoundingClientRect(); const st = getComputedStyle(e);
  return st.display !== 'none' && st.position !== 'fixed' && r.width > 0 && r.right > document.documentElement.clientWidth + 1;
}).map((e) => e.className || e.tagName).slice(0, 5));

async function versCode(page: Page, email = 'lea@exemple.test') {
  await ouvrir(page, '/inscription'); await page.getByLabel('Adresse courriel').fill(email);
  await page.getByLabel(/J’accepte les conditions/).check(); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
  await expect.poll(() => chemin(page)).toBe('/code');
}

test.describe('Ouverture (PC)', () => {
  test('tableau des départs, titre et appel à l’action côte à côte ; en-tête à liens ; pied « Mode démo »', async ({ page }) => {
    await ouvrir(page, '/ouverture'); await page.waitForTimeout(2200);
    const entete = page.locator('header.pc-entete'), tableau = page.getByRole('img', { name: /Tableau des départs/ }), carte = page.getByRole('region', { name: 'Commencer' });
    await expect(entete.getByRole('link', { name: 'NexG-TT, accueil' })).toBeVisible();
    await expect(entete.getByRole('link', { name: 'Explorer sans compte' })).toBeVisible(); await expect(entete.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Un billet,\s*deux faces\./);
    await expect(page.getByText('Réservez votre vol. Revendez-le si vos plans changent. Nommez le voyageur avant le départ.')).toBeVisible();
    await expect(carte.getByRole('heading', { level: 2, name: 'Par où commencer ?' })).toBeVisible();
    await expect(carte.getByText('Chercher, réserver, partir')).toBeVisible(); await expect(carte.getByText('Revendre, transférer, nommer')).toBeVisible();
    await expect(carte.getByText('Prototype · données fictives · aucun paiement réel')).toBeVisible();
    await expect(carte.getByRole('link', { name: 'Explorer sans compte' })).toBeHidden();
    // côte à côte : le tableau à gauche, la carte à droite, de même hauteur
    const t = (await tableau.boundingBox())!, c = (await carte.boundingBox())!, panneau = (await page.locator('main.principal').boundingBox())!;
    expect(c.x).toBeGreaterThan(t.x + t.width); expect(Math.abs(c.y - panneau.y)).toBeLessThan(2); expect(Math.abs(c.height - panneau.height)).toBeLessThan(2); expect(t.width).toBeGreaterThan(c.width);
    await expect(page.locator('footer.pc-pied')).toContainText('Mode démo');
    await expect.poll(() => page.locator('[data-flap]').evaluateAll((l) => l.map((e) => e.firstChild?.textContent ?? '').join(''))).toBe('NEXG·TTCDGPUJLIS');
    await expect(page.getByRole('link', { name: /Commencer/ })).toHaveCSS('min-height', '56px');
    await page.screenshot({ path: `${CAPTURES}/pc-ouverture.png`, fullPage: true });
  });
  test('navigation : Commencer, J’ai déjà un compte (en-tête), Explorer sans compte', async ({ page }) => {
    await ouvrir(page, '/ouverture');
    await page.getByRole('link', { name: /Commencer/ }).click(); await expect.poll(() => chemin(page)).toBe('/langue');
    await page.goto('/ouverture'); await page.locator('header.pc-entete').getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
    await page.goto('/ouverture'); await page.locator('header.pc-entete').getByRole('link', { name: 'Explorer sans compte' }).click(); await expect.poll(() => chemin(page)).toBe('/explorer');
  });
  test('hors ligne : message sur toute la largeur, connexion désactivée (en-tête et carte)', async ({ page, context }) => {
    await ouvrir(page, '/ouverture'); await context.setOffline(true);
    await expect(page.locator('.pc-hors')).toBeVisible(); await expect(page.locator('.pc-hors')).toContainText('Se connecter ou créer un compte demande le réseau');
    for (const l of await page.getByRole('link', { name: 'J’ai déjà un compte' }).all()) await expect(l).toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: `${CAPTURES}/pc-ouverture-hors-ligne.png` });
    await context.setOffline(false); await expect(page.locator('.pc-hors')).toBeHidden();
  });
  test('chargement : tableau en squelette', async ({ page }) => {
    await ouvrir(page, '/ouverture?etat=chargement'); await expect(page.getByRole('status').filter({ hasText: 'Chargement' })).toContainText('Chargement du tableau des départs');
    await expect(page.locator('.sq').first()).toBeVisible(); await page.screenshot({ path: `${CAPTURES}/pc-ouverture-chargement.png` });
  });
  test('sous 1100 px, la carte passe sous le tableau (comme la planche)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 }); await ouvrir(page, '/ouverture');
    const t = (await page.getByRole('img', { name: /Tableau des départs/ }).boundingBox())!, c = (await page.getByRole('region', { name: 'Commencer' }).boundingBox())!;
    expect(c.y).toBeGreaterThan(t.y + t.height - 1); await expect(page.getByRole('link', { name: /Commencer/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/pc-ouverture-1024.png`, fullPage: true });
  });
});

test.describe('Langue et région (PC)', () => {
  test('cartes côte à côte, région et départs, aperçu sombre qui suit la langue et la région', async ({ page }) => {
    await ouvrir(page, '/langue');
    await expect(page.locator('header.pc-entete').getByRole('link', { name: 'Explorer sans compte' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Choisissez votre langue' })).toBeVisible(); await expect(page.getByText('Choose your language')).toBeVisible();
    const fr = page.getByRole('radio', { name: /Français/ }), en = page.getByRole('radio', { name: /English/ });
    const a = (await fr.boundingBox())!, b = (await en.boundingBox())!; expect(b.x).toBeGreaterThan(a.x + a.width - 2); expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    const apercu = page.getByRole('region', { name: 'Aperçu' });
    await expect(apercu).toBeVisible(); await expect(apercu.getByRole('img', { name: /18:05, Paris CDG, à l’heure/ })).toBeVisible();
    await expect(apercu.getByText('« Votre vol pour Paris part à 18 h 05. »')).toBeVisible(); await expect(apercu.getByText('Canada · $ CA')).toBeVisible(); await expect(apercu.getByText('Montréal (YUL)')).toBeVisible();
    await expect(apercu.getByText('[H]')).toBeVisible();
    const g = (await page.getByRole('heading', { level: 1 }).boundingBox())!, p = (await apercu.boundingBox())!; expect(p.x).toBeGreaterThan(g.x + 400);
    await page.screenshot({ path: `${CAPTURES}/pc-langue.png`, fullPage: true });
    await en.click();
    await expect(apercu.getByText('“Your flight to Paris departs at 6:05 PM.”')).toBeVisible();
    await page.getByLabel('Region and currency').selectOption('us'); await expect(apercu.getByText('United States · $ US')).toBeVisible();
    await page.getByLabel('Usual airport').fill('Boston (bos)'); await expect(page.getByText('BOS', { exact: true })).toBeVisible(); await expect(apercu.getByText('Boston (bos)')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/pc-langue-en.png`, fullPage: true });
    await page.getByRole('link', { name: 'Continue' }).click(); await expect.poll(() => chemin(page)).toBe('/promesses');
    const e = await lireEtat(page); expect(e.session.langue).toBe('en'); expect(e.tranches.entree).toEqual({ region: 'us', aeroport: 'Boston (bos)' });
  });
  test('Retour mène à l’ouverture ; l’aperçu reste visible en défilant', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 }); await ouvrir(page, '/langue');
    await page.mouse.wheel(0, 400); await page.waitForTimeout(200); await expect(page.getByRole('region', { name: 'Aperçu' })).toBeInViewport();
    await page.goto('/ouverture'); await page.getByRole('link', { name: /Commencer/ }).click(); await page.getByRole('button', { name: 'Retour' }).click(); await expect.poll(() => chemin(page)).toBe('/ouverture');
  });
});

test.describe('Trois promesses (PC)', () => {
  test('les trois promesses côte à côte, sans carrousel ; Passer, Créer mon compte, Explorer', async ({ page }) => {
    await ouvrir(page, '/promesses');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ce que vous pouvez faire');
    for (const [k, t] of [['1 / 3 · Voyager', 'Trouvez un vol, neuf ou en revente'], ['2 / 3 · Revendre', 'Revendre si vos plans changent'], ['3 / 3 · Nommer', 'Nommez le voyageur à la fin']] as const) {
      await expect(page.getByRole('article').getByText(k, { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { level: 2, name: t })).toBeVisible();
    }
    const art = page.getByRole('article'); await expect(art).toHaveCount(3);
    const x = await art.evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().x))); expect(x[0]).toBeLessThan(x[1]); expect(x[1]).toBeLessThan(x[2]);
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeHidden(); await expect(page.getByRole('group', { name: /Diapositives/ })).toBeHidden();
    await expect(art.nth(0).getByText('Montréal → Paris')).toBeVisible(); await expect(art.nth(0).getByText('Prix fictifs')).toBeVisible();
    await expect(art.nth(1)).toContainText('Revente encadrée'); await expect(art.nth(1).getByText('Part à votre place')).toBeVisible();
    await expect(art.nth(2).getByText('Échéance de nommage', { exact: true })).toBeVisible(); await expect(art.nth(2).getByText(/^\d\d:\d\d:\d\d$/)).toBeVisible(); await expect(art.nth(2).getByText('Nommer avant le 13 déc. 18:05')).toBeVisible();
    await expect(art.nth(2).getByText('Échéance de nommage : la veille du départ (J-1) est une hypothèse à valider.')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/pc-promesses.png`, fullPage: true });
    await page.getByRole('link', { name: 'Passer' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription'); expect((await lireEtat(page)).session.vuTuto).toBe(true);
    await page.goto('/promesses'); await page.getByRole('link', { name: /Créer mon compte/ }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
    await page.goto('/promesses'); await page.locator('main').getByRole('link', { name: 'Explorer sans compte' }).click(); await expect.poll(() => chemin(page)).toBe('/explorer');
  });
  test('Retour mène à la langue ; en-tête : J’ai déjà un compte', async ({ page }) => {
    await ouvrir(page, '/promesses'); await page.getByRole('button', { name: 'Retour' }).click(); await expect.poll(() => chemin(page)).toBe('/langue');
    await page.goto('/promesses'); await page.locator('header.pc-entete').getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
  });
});

test.describe('Créer un compte (PC)', () => {
  test('deux cartes à gauche, panneau sombre à droite, en-tête à liens', async ({ page }) => {
    await ouvrir(page, '/inscription');
    const haut = page.getByRole('navigation', { name: 'Accès au compte' });
    await expect(haut.getByRole('link', { name: 'Explorer sans compte' })).toBeVisible(); await expect(haut.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Créez votre compte en 1 minute' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Où recevoir votre code ?' })).toBeVisible(); await expect(page.getByRole('heading', { level: 2, name: 'Vos consentements' })).toBeVisible();
    await expect(page.getByText('Apple et Google : fournisseurs d’identité à valider.')).toBeVisible();
    const panneau = page.getByRole('complementary', { name: 'Ce que nous ne vous demandons pas' });
    for (const t of ['Aucune carte demandée', 'Explorer sans compte possible', 'Identité vérifiée seulement pour revendre']) await expect(panneau.getByRole('list').getByText(t)).toBeVisible();
    await expect(panneau.getByText('Moment de la vérification d’identité : à valider.')).toBeVisible();
    const a = (await page.getByRole('button', { name: 'Continuer avec Apple' }).boundingBox())!, g = (await page.getByRole('button', { name: 'Continuer avec Google' }).boundingBox())!; expect(g.x).toBeGreaterThan(a.x + a.width - 2); expect(Math.abs(a.y - g.y)).toBeLessThan(2);
    const cta = (await page.getByRole('button', { name: /Recevoir mon code/ }).boundingBox())!, p = (await panneau.boundingBox())!; expect(p.x).toBeGreaterThan(cta.x + cta.width); expect(cta.height).toBeGreaterThanOrEqual(56);
    await expect(page.locator('.pied')).toBeHidden(); await expect(page.getByRole('button', { name: /Recevoir mon code/ })).toHaveCount(1);
    await page.screenshot({ path: `${CAPTURES}/pc-inscription.png`, fullPage: true });
  });
  test('erreurs annoncées, puis parcours jusqu’au code', async ({ page }) => {
    await ouvrir(page, '/inscription'); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Ce champ est vide : indiquez où recevoir le code.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Deux points à corriger' })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/pc-inscription-erreurs.png`, fullPage: true });
    await page.getByRole('button', { name: 'Lire les conditions en bref' }).click(); await expect(page.getByText('Texte complet en cours de rédaction avec un juriste (prototype).')).toBeVisible();
    await page.getByRole('button', { name: 'Continuer avec Google' }).click(); await expect(page.getByText('Démo : la connexion avec Google n’est pas encore branchée')).toBeVisible();
    await page.getByRole('tab', { name: 'Téléphone' }).click(); await expect(page.getByLabel('Numéro de téléphone mobile')).toBeVisible();
    await page.getByRole('tab', { name: 'Courriel' }).click();
    await page.getByLabel('Adresse courriel').fill('lea.roy@exemple.test'); await page.getByLabel(/J’accepte les conditions/).check(); await page.getByRole('button', { name: /Recevoir mon code/ }).click();
    await expect.poll(() => chemin(page)).toBe('/code');
  });
  test('liens du bas : Explorer sans compte, J’ai déjà un compte ; hors ligne', async ({ page, context }) => {
    await ouvrir(page, '/inscription');
    await page.locator('.liens-cta').getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
    await page.goto('/inscription'); await page.getByRole('navigation', { name: 'Accès au compte' }).getByRole('link', { name: 'Explorer sans compte' }).click(); await expect.poll(() => chemin(page)).toBe('/explorer');
    await page.goto('/inscription'); await context.setOffline(true); await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible(); await page.screenshot({ path: `${CAPTURES}/pc-inscription-hors-ligne.png`, fullPage: true });
  });
});

test.describe('Code de vérification (PC)', () => {
  test('étapes, saisie, renvoi, carte de démonstration à droite', async ({ page }) => {
    await versCode(page);
    await expect(page.getByRole('navigation', { name: 'Accès au compte' }).getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Création du compte' })).toHaveAttribute('aria-valuetext', /Étape 1 sur 4/);
    await expect(page.getByText('Ensuite : profil, alertes, clé d’accès')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Entrez le code reçu' })).toBeVisible(); await expect(page.getByText('lea@exemple.test')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Modifier l’adresse' })).toBeVisible(); await expect(page.getByText(/Renvoyer le code dans/)).toBeVisible();
    await expect(page.getByText('Rien reçu ? Vérifiez le dossier des indésirables.')).toBeVisible();
    const demo = page.getByRole('region', { name: /MODE DÉMO/ });
    await expect(demo.getByText('Code de démonstration :')).toBeVisible(); await expect(demo.locator('.pc-t .mono')).toHaveText(CODE_DEMO);
    await expect(demo.getByText('Longueur du code (6 chiffres), nombre d’essais (3) et délai de renvoi (0:42) : valeurs de démonstration à valider.')).toBeVisible();
    const d = (await demo.boundingBox())!, h = (await page.getByRole('heading', { level: 1 }).boundingBox())!; expect(d.x).toBeGreaterThan(h.x + 500);
    const suite = page.getByRole('button', { name: /Continuer · entrez les 6 chiffres/ }); await expect(suite).toBeVisible(); await expect(page.locator('.pied')).toBeHidden();
    const c = (await page.locator('.case').first().boundingBox())!; expect(c.height).toBe(64);
    await page.screenshot({ path: `${CAPTURES}/pc-code.png`, fullPage: true });
    await page.getByRole('button', { name: 'Simuler un code erroné' }).click();
    await expect(page.getByRole('alert')).toContainText('Ce code ne correspond pas. Il vous reste 2 essais.'); await page.screenshot({ path: `${CAPTURES}/pc-code-erreur.png`, fullPage: true });
    await page.getByRole('button', { name: 'Simuler le bon code' }).click();
    await expect(page.getByText('Courriel vérifié')).toBeVisible(); await page.screenshot({ path: `${CAPTURES}/pc-code-ok.png`, fullPage: true });
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible(); await expect.poll(() => chemin(page), { timeout: 5000 }).toBe('/profil');
  });
  test('Retour revient à l’inscription ; le code se saisit au clavier', async ({ page }) => {
    await versCode(page); await expect(page.getByLabel('Code à 6 chiffres')).toBeFocused(); await page.keyboard.type('4829'); await expect(page.getByLabel('Code à 6 chiffres')).toHaveValue('4829');
    await page.getByRole('button', { name: 'Retour' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
  });
});

test.describe('Bon retour (PC)', () => {
  test('appareil connu : avatar et titre côte à côte, clé d’accès, encart de sécurité à droite', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex });
    const haut = page.getByRole('navigation', { name: 'Accès au compte' });
    await expect(haut.getByRole('link', { name: 'Explorer sans compte' })).toBeVisible(); await expect(haut.getByRole('link', { name: 'Créer un compte' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    const titre = page.getByRole('heading', { level: 1, name: 'Bon retour, Alex' }); await expect(titre).toBeVisible();
    const av = (await page.getByText('AT', { exact: true }).boundingBox())!, t = (await titre.boundingBox())!; expect(t.x).toBeGreaterThan(av.x + av.width); expect(av.width).toBe(84);
    await expect(page.getByText('alex.tremblay@exemple.test')).toBeVisible(); await expect(page.getByText('Aucun mot de passe : votre téléphone confirme que c’est bien vous.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Recevoir un code par courriel/ })).toBeVisible(); await expect(page.getByRole('button', { name: 'Ce n’est pas moi' })).toBeVisible(); await expect(page.getByText('Prototype · données fictives', { exact: true })).toBeVisible();
    const cle = (await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).boundingBox())!; expect(cle.height).toBeGreaterThanOrEqual(112);
    const sec = page.getByRole('complementary'); await expect(sec).toBeVisible(); await expect(sec.getByText('Nous ne vous demanderons jamais votre code par téléphone.')).toBeVisible();
    await expect(sec.getByText('Ne le communiquez à personne, même à quelqu’un qui se présente comme NexG-TT.')).toBeVisible(); await expect(sec.getByText('[H]')).toBeVisible();
    const s = (await sec.boundingBox())!; expect(s.x).toBeGreaterThan(cle.x + cle.width);
    await page.screenshot({ path: `${CAPTURES}/pc-connexion.png`, fullPage: true });
    await page.getByRole('button', { name: /Se connecter avec une clé d’accès/ }).click();
    await expect(page.getByRole('dialog', { name: 'Clé d’accès' })).toBeVisible(); await page.screenshot({ path: `${CAPTURES}/pc-connexion-cle.png` });
    await expect.poll(() => chemin(page), { timeout: 5000 }).toBe('/'); expect((await lireEtat(page)).session.compteId).toBe('ACC-0412');
  });
  test('sans appareil connu : identifiant, encart de sécurité, en-tête à liens ; « Ce n’est pas moi »', async ({ page }) => {
    await ouvrir(page, '/connexion');
    await expect(page.getByRole('heading', { level: 1, name: 'Connectez-vous' })).toBeVisible(); await expect(page.getByRole('complementary')).toBeVisible();
    await expect(page.locator('main .liens')).toBeHidden(); await page.screenshot({ path: `${CAPTURES}/pc-connexion-identifiant.png`, fullPage: true });
    await page.getByRole('navigation', { name: 'Accès au compte' }).getByRole('link', { name: 'Créer un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
  });
  test('« Ce n’est pas moi » oublie l’appareil et affiche la saisie de l’identifiant', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex }); await page.getByRole('button', { name: 'Ce n’est pas moi' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Connectez-vous' })).toBeVisible(); await expect(page.getByLabel('Courriel ou téléphone')).toBeVisible();
  });
  test('code par courriel : mène à /code?mode=connexion', async ({ page }) => {
    await ouvrir(page, '/connexion', { preparer: appareilAlex }); await page.getByRole('button', { name: /Recevoir un code par courriel/ }).click();
    await expect.poll(() => page.url()).toContain('/code?mode=connexion'); await expect(page.getByRole('heading', { level: 1, name: 'Entrez le code reçu' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
});

test.describe('Aucun débordement et mobile masqué', () => {
  for (const largeur of LARGEURS) {
    test(`les écrans à ${largeur} px : pas de défilement horizontal, rien qui dépasse`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 800 });
      for (const chem of ['/ouverture', '/langue', '/promesses', '/inscription', '/connexion']) {
        await ouvrir(page, chem); await page.waitForTimeout(chem === '/ouverture' ? 2200 : 150);
        expect(await sansDebordement(page), `${chem} à ${largeur}`).toBe(true); expect(await toutDedans(page), `${chem} à ${largeur}`).toEqual([]);
      }
      await page.goto('/ouverture'); await versCode(page); expect(await sansDebordement(page), `/code à ${largeur}`).toBe(true); expect(await toutDedans(page)).toEqual([]);
      await page.screenshot({ path: `${CAPTURES}/pc-code-${largeur}.png`, fullPage: true });
    });
  }
  test('connexion avec appareil connu, sans débordement à 900 et 1024 px', async ({ page }) => {
    for (const l of [900, 1024]) { await page.setViewportSize({ width: l, height: 800 }); await ouvrir(page, '/connexion', { preparer: appareilAlex }); await page.goto('/connexion'); expect(await sansDebordement(page)).toBe(true); expect(await toutDedans(page)).toEqual([]); }
  });
  test('à 1024 × 768 : captures de contrôle, un seul bouton Retour, une seule liste de promesses', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const [chem, nom] of [['/langue', 'langue'], ['/promesses', 'promesses'], ['/inscription', 'inscription'], ['/connexion', 'connexion']] as const) {
      await ouvrir(page, chem); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await page.screenshot({ path: `${CAPTURES}/pc-${nom}-1024.png`, fullPage: true });
    }
    await ouvrir(page, '/inscription'); await expect(page.getByRole('button', { name: 'Retour', exact: true })).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Ce que nous ne vous demandons pas' })).toHaveCount(1);
  });
});
