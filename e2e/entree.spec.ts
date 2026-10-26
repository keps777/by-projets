import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';

const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
const cellules = (page: import('@playwright/test').Page) => page.locator('[data-flap]').evaluateAll((l) => l.map((e) => e.firstChild?.textContent ?? '').join(''));

test('parcours : ouverture → langue → promesses → inscription', async ({ page }) => {
  await ouvrir(page, '/ouverture');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Un billet,\s*deux faces\./);
  await expect(page.getByRole('img', { name: /Tableau des départs/ })).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/entree-ouverture.png` });
  await page.getByRole('link', { name: /Commencer/ }).click();
  await expect.poll(() => chemin(page)).toBe('/langue');
  await expect(page.getByRole('heading', { level: 1, name: 'Choisissez votre langue' })).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/entree-langue.png` });
  await page.getByRole('link', { name: 'Continuer' }).click();
  await expect.poll(() => chemin(page)).toBe('/promesses');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trouvez un vol, neuf ou en revente');
  await page.waitForTimeout(700); await page.screenshot({ path: `${CAPTURES}/entree-promesse1.png` });
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revendre si vos plans changent');
  await page.waitForTimeout(700); await page.screenshot({ path: `${CAPTURES}/entree-promesse2.png` });
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nommez le voyageur à la fin');
  await page.waitForTimeout(700); await page.screenshot({ path: `${CAPTURES}/entree-promesse3.png` });
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explorer sans compte' })).toBeVisible();
  await page.getByRole('link', { name: /Créer mon compte/ }).click();
  await expect.poll(() => chemin(page)).toBe('/inscription');
  expect((await lireEtat(page)).session.vuTuto).toBe(true);
});

test('ouverture : « j’ai déjà un compte » et « explorer sans compte »', async ({ page }) => {
  await ouvrir(page, '/ouverture');
  await page.getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
  await page.goto('/ouverture'); await page.getByRole('link', { name: 'Explorer sans compte' }).click(); await expect.poll(() => chemin(page)).toBe('/explorer');
  await expect(page.getByText('Bienvenue sur NexG-TT')).toBeVisible();
});

test('ouverture : le panneau se pose sur NEXG·TT et sur les trois départs', async ({ page }) => {
  await ouvrir(page, '/ouverture');
  await expect.poll(() => cellules(page), { timeout: 6000 }).toBe('NEXG·TTCDGPUJLIS');
});

test('ouverture : mouvement réduit, texte statique dès le départ', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page, '/ouverture');
  expect(await cellules(page)).toBe('NEXG·TTCDGPUJLIS');
  await page.screenshot({ path: `${CAPTURES}/entree-ouverture-final.png` });
  await expect(page.getByRole('link', { name: /Commencer/ })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1');
});

test('ouverture : hors ligne, la connexion est désactivée et le message annoncé', async ({ page, context }) => {
  await ouvrir(page, '/ouverture');
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Hors ligne' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toHaveAttribute('aria-disabled', 'true');
  await context.setOffline(false);
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).not.toHaveAttribute('aria-disabled', 'true');
});

test('ouverture : un compte déjà connecté va directement à l’accueil', async ({ page }) => {
  await ouvrir(page, '/ouverture', { connecte: 'ACC-0412' });
  await expect.poll(() => chemin(page)).toBe('/'); await expect(page.getByText('Bonjour Alex')).toBeVisible();
});

test('langue : bascule FR/EN, mémorisée, région et aéroport écrits', async ({ page }) => {
  await ouvrir(page, '/langue');
  const fr = page.getByRole('radio', { name: /Français/ }), en = page.getByRole('radio', { name: /English/ });
  await expect(fr).toHaveAttribute('aria-checked', 'true');
  await en.click();
  await expect(en).toHaveAttribute('aria-checked', 'true'); await expect(fr).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('Region and departures')).toBeVisible();
  await expect(page.getByLabel('Region and currency')).toBeVisible();
  await page.getByLabel('Region and currency').selectOption('us');
  await page.getByLabel('Usual airport').fill('Boston (bos)');
  await expect(page.getByText('BOS', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${CAPTURES}/entree-langue-en.png` });
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect.poll(() => chemin(page)).toBe('/promesses');
  const e = await lireEtat(page); expect(e.session.langue).toBe('en'); expect(e.tranches.entree).toEqual({ region: 'us', aeroport: 'Boston (bos)' });
  await page.goto('/langue'); await expect(page.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Usual airport')).toHaveValue('Boston (bos)');
});

test('langue : flèches du clavier entre les deux langues', async ({ page }) => {
  await ouvrir(page, '/langue');
  await page.getByRole('radio', { name: /Français/ }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /English/ })).toBeFocused(); await expect(page.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('radio', { name: /Français/ })).toHaveAttribute('aria-checked', 'true');
});

test('langue : avec un compte connecté, langue et région du compte sont écrites', async ({ page }) => {
  await ouvrir(page, '/langue', { connecte: 'ACC-0412' });
  await page.getByRole('radio', { name: /English/ }).click(); await page.getByLabel('Region and currency').selectOption('fr'); await page.getByRole('link', { name: 'Continue' }).click();
  const c = (await lireEtat(page)).monde.comptes.find((x) => x.id === 'ACC-0412')!; expect(c.langue).toBe('en'); expect(c.region).toBe('France · EUR');
});

test('promesses : clavier, points, annonce vocale, retour', async ({ page }) => {
  await ouvrir(page, '/promesses');
  const titre = page.getByRole('heading', { level: 1 }), annonce = page.locator('.carrousel [role=status]');
  await expect(annonce).toHaveText('Diapositive 1 sur 3 : Voyager');
  await page.getByRole('group', { name: /Diapositives/ }).focus();
  await page.keyboard.press('ArrowRight'); await expect(titre).toHaveText('Revendre si vos plans changent'); await expect(annonce).toHaveText('Diapositive 2 sur 3 : Revendre');
  await page.keyboard.press('ArrowRight'); await expect(titre).toHaveText('Nommez le voyageur à la fin');
  await page.keyboard.press('ArrowRight'); await expect(titre).toHaveText('Nommez le voyageur à la fin');
  await page.keyboard.press('Home'); await expect(titre).toHaveText('Trouvez un vol, neuf ou en revente');
  await page.getByRole('button', { name: 'Page 3 sur 3 : Nommer le voyageur' }).click();
  await expect(titre).toHaveText('Nommez le voyageur à la fin'); await expect(page.getByRole('button', { name: /Page 3 sur 3/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Suivant' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Précédent' }).click(); await expect(titre).toHaveText('Revendre si vos plans changent');
});

test('promesses : le balayage change de diapositive', async ({ page }) => {
  await ouvrir(page, '/promesses');
  await page.locator('.piste').evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: 'instant' }));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revendre si vos plans changent');
  await expect(page.locator('.carrousel [role=status]')).toHaveText('Diapositive 2 sur 3 : Revendre');
});

test('promesses : « Passer » mène à l’inscription et marque le tutoriel comme vu', async ({ page }) => {
  await ouvrir(page, '/promesses'); await page.getByRole('link', { name: 'Passer' }).click();
  await expect.poll(() => chemin(page)).toBe('/inscription'); expect((await lireEtat(page)).session.vuTuto).toBe(true);
});

test('promesses : « J’ai déjà un compte » à la fin mène à la connexion', async ({ page }) => {
  await ouvrir(page, '/promesses'); await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Page 3 sur 3 : Nommer le voyageur' }).click();
  await page.getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
});

test('promesses : mouvement réduit, aucune animation en boucle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page, '/promesses');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revendre si vos plans changent');
  expect(await page.locator('.passe').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Suivant' }).click();
  expect(await page.locator('.pt').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});

for (const largeur of [320, 390]) {
  test(`aucun débordement horizontal à ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 700 });
    await ouvrir(page, '/ouverture');
    await expect(page.getByRole('link', { name: /Commencer/ })).toBeInViewport(); expect(await sansDebordement(page)).toBe(true);
    await page.goto('/langue'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByRole('radio', { name: /English/ }).click(); expect(await sansDebordement(page)).toBe(true);
    await page.goto('/promesses');
    for (let i = 0; i < 3; i++) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
      expect(await page.locator('.slide.actif .visuel').evaluate((v) => [...v.querySelectorAll('*')].every((e) => e.getBoundingClientRect().right <= v.getBoundingClientRect().right + 1 || getComputedStyle(e).position === 'absolute'))).toBe(true);
      if (i < 2) await page.getByRole('button', { name: 'Suivant' }).click();
    }
    await expect(page.getByRole('link', { name: /Créer mon compte/ })).toBeInViewport();
  });
}

// Sur un iPhone avec la barre de Safari (≈ 390 × 700), tout le texte de l'ouverture est visible dès la première vue : rien n'est recouvert par la feuille du bas.
for (const [l, h] of [[390, 844], [390, 700], [390, 640], [360, 640]] as const) {
  test(`ouverture ${l} × ${h} : tout le texte est visible sans défiler`, async ({ page }) => {
    await page.setViewportSize({ width: l, height: h }); await ouvrir(page, '/ouverture'); await page.waitForTimeout(2400);
    await expect(page.getByText('Nommez le voyageur avant le départ.')).toBeVisible();
    const boite = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const para = await boite('.titre p'), feuille = await boite('.feuille'), demo = await boite('.demo'), cta = await boite('.commencer');
    expect(para.y + para.height, 'le texte ne passe pas sous la feuille').toBeLessThanOrEqual(feuille.y + 1);
    expect(demo.y + demo.height, 'la mention de démo est dans l’écran').toBeLessThanOrEqual(h);
    expect(cta.y + cta.height).toBeLessThanOrEqual(h); expect(cta.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(h + 1);
  });
}
