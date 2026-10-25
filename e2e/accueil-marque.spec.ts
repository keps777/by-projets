// Accueil voyageur : dock à pastille glissante, première ligne « moment de marque » (et son sting), bandeau d'actions, bascule Liste / 3D, fenêtres branchées.
import { aller, expect, ouvrir, test } from './aide';


test.describe('dock', () => {
  for (const largeur of [320, 390]) {
    test(`six positions qui tiennent à ${largeur} px, orbe hors de la pastille`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 740 });
      await ouvrir(page, '/', { connecte: 'p-aicha' });
      const dock = page.getByRole('navigation', { name: 'Navigation principale' });
      await expect(dock.getByRole('link')).toHaveCount(6);
      const boite = (await dock.boundingBox())!;
      for (const l of await dock.getByRole('link').all()) {
        const b = (await l.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(boite.x - 1); expect(b.x + b.width).toBeLessThanOrEqual(boite.x + boite.width + 1);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
      const orbe = (await dock.getByRole('link', { name: 'Toutes les actions' }).boundingBox())!;
      const pastille = (await page.locator('.dock .pastille').boundingBox())!;
      expect(pastille.x + pastille.width <= orbe.x + 1 || pastille.x >= orbe.x + orbe.width - 1).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largeur);
    });
  }

  test('la pastille repart de l’ancien onglet et glisse vers le nouveau ; l’orbe n’ouvre plus /orbe', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    const dock = page.getByRole('navigation', { name: 'Navigation principale' });
    const x0 = (await page.locator('.dock .pastille').boundingBox())!.x;
    // premier affichage : posée sans animation sur « Voyager »
    expect(await page.locator('.dock .pastille').evaluate((n) => n.classList.contains('glisse'))).toBe(false);
    // échantillonne la position visuelle de la pastille à chaque image, avant et pendant le changement d’écran
    await page.evaluate(() => {
      const w = window as unknown as { __xs: number[]; __stop: boolean };
      w.__xs = []; w.__stop = false;
      const boucle = () => { const p = document.querySelector('.dock .pastille'); if (p) w.__xs.push(p.getBoundingClientRect().x); if (!w.__stop) requestAnimationFrame(boucle); };
      requestAnimationFrame(boucle);
    });
    await dock.getByRole('link', { name: 'Moi' }).click();
    await expect(page).toHaveURL(/\/moi$/);
    await expect(page.locator('.dock a.on')).toContainText('Moi');
    await page.waitForTimeout(700);
    const xs = await page.evaluate(() => { const w = window as unknown as { __xs: number[]; __stop: boolean }; w.__stop = true; return w.__xs; });
    const cible = (await page.locator('.dock a.on').boundingBox())!.x;
    // elle part de l’ancienne place, passe par des positions intermédiaires, et finit sous « Moi »
    const apres = xs.filter((v) => v !== xs[0]);
    expect(Math.abs(xs[0] - x0)).toBeLessThan(2);
    expect(apres.some((v) => v > x0 + 40 && v < cible - 40)).toBe(true);
    expect(Math.abs(xs[xs.length - 1] - cible)).toBeLessThan(3);
    // l’orbe : fenêtre sur la page courante, pas de navigation
    await dock.getByRole('link', { name: 'Toutes les actions' }).click();
    await expect(page).toHaveURL(/\/moi$/);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('première ligne', () => {
  test('rotation coupée sous automatisation : la salutation reste affichée', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    await expect(page.locator('.mq')).toContainText('Salut Aïcha');
    await page.waitForTimeout(1500);
    await expect(page.locator('.mq .marque')).toHaveCount(0);
  });

  test('?entete=rapide : le moment de marque apparaît puis revient à la salutation', async ({ page }) => {
    await ouvrir(page, '/?entete=rapide', { connecte: 'p-aicha' });
    await expect(page.locator('.mq .marque')).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.mq .marque .mot')).toContainText('AfriMove');
    await expect(page.locator('.mq .marque .promesse')).toHaveText('Tout le transport, dans ta poche.');
    await expect(page.locator('.mq .marque')).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator('.mq .salut')).toContainText('Salut Aïcha');
    await expect(page.locator('.hd .pl')).toContainText('départs');
  });

  test('mouvement réduit : jamais de rotation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrir(page, '/?entete=rapide', { connecte: 'p-aicha' });
    await page.waitForTimeout(2500);
    await expect(page.locator('.mq .marque')).toHaveCount(0);
  });

  test('le sting ne joue jamais au chargement, seulement après une interaction et avec « Sons et jingle »', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __sons: number }).__sons = 0;
      // activation « jamais touchée » imposée : seuls de vrais gestes de la personne comptent (le navigateur la garde d'une page à l'autre)
      try { Object.defineProperty(navigator, 'userActivation', { get: () => ({ hasBeenActive: false, isActive: false }) }); } catch { /* déjà figé */ }
      class Faux { state = 'running'; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
        createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n }; }
        createBiquadFilter() { return { frequency: {}, Q: {}, connect: (n: unknown) => n }; }
        createDelay() { return { delayTime: {}, connect: (n: unknown) => n }; }
        createOscillator() { (window as unknown as { __sons: number }).__sons++; return { frequency: {}, connect: (n: unknown) => n, start() {}, stop() {} }; } }
      (window as unknown as { AudioContext: unknown }).AudioContext = Faux;
    });
    await ouvrir(page, '/?entete=rapide', { connecte: 'p-aicha' });
    await expect(page.locator('.mq .marque')).toBeVisible({ timeout: 4000 });
    expect(await page.evaluate(() => (window as unknown as { __sons: number }).__sons)).toBe(0); // aucune interaction : silence
    await expect(page.locator('.mq .marque')).toHaveCount(0, { timeout: 4000 });
    await page.locator('.bd').click({ position: { x: 5, y: 5 } }); // geste de la personne
    await expect(page.locator('.mq .marque')).toBeVisible({ timeout: 6000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sons: number }).__sons)).toBeGreaterThan(0);
  });

  test('sons coupés dans Réglages : silence même après une interaction', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __sons: number }).__sons = 0;
      class Faux { state = 'running'; currentTime = 0; destination = {}; resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
        createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n }; }
        createBiquadFilter() { return { frequency: {}, Q: {}, connect: (n: unknown) => n }; }
        createDelay() { return { delayTime: {}, connect: (n: unknown) => n }; }
        createOscillator() { (window as unknown as { __sons: number }).__sons++; return { frequency: {}, connect: (n: unknown) => n, start() {}, stop() {} }; } }
      (window as unknown as { AudioContext: unknown }).AudioContext = Faux;
    });
    await ouvrir(page, '/?entete=rapide', { connecte: 'p-aicha', preparer: (e) => { (e.tranches as Record<string, unknown>).entree = { theme: 'sombre', sons: false, economieDonnees: false, alertes: { retard: true, colis: true, bonsPlans: false, proches: true }, permissions: { camera: true, position: true, notifications: true, contacts: false, micro: true }, jinglejoue: true, appareilId: 'p-aicha', fidelite: {} }; } });
    await page.locator('.bd').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.mq .marque')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.mq .marque')).toHaveCount(0, { timeout: 4000 });
    expect(await page.evaluate(() => (window as unknown as { __sons: number }).__sons)).toBe(0);
  });

  test('la cloche ouvre la fenêtre des notifications sans changer de page', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page).toHaveURL(/\/\?maintenant/);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('bandeau d’actions', () => {
  test('quatre vrais liens ≥ 44 px, juste après la première ligne, sans rangée de tri', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    const bandeau = page.getByRole('navigation', { name: 'Actions rapides' });
    for (const [nom, href] of [['Dis où tu vas', '/voix'], ['Dans la ville', '/ville'], ['Je conduis', '/covoit/conduire'], ['Réseau', '/reseau']] as const) {
      const l = bandeau.getByRole('link', { name: nom });
      await expect(l).toHaveAttribute('href', href);
      expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('.bd > *').first().evaluate((n) => n.classList.contains('bandeau'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Confort' })).toHaveCount(0);
    await bandeau.getByRole('link', { name: 'Je conduis' }).click();
    await expect(page).toHaveURL(/\/covoit\/conduire/);
  });

  test('?bandeau=anime : il défile en continu, copie masquée aux lecteurs d’écran, pause au toucher', async ({ page }) => {
    await ouvrir(page, '/?bandeau=anime', { connecte: 'p-aicha' });
    const piste = page.locator('.bandeau .piste');
    await expect(page.locator('.bandeau .moitie[aria-hidden="true"]')).toHaveCount(1);
    const pos = () => piste.evaluate((n) => new DOMMatrixReadOnly(getComputedStyle(n).transform).m41);
    const a = await pos(); await page.waitForTimeout(500); const b = await pos();
    expect(b).toBeLessThan(a);
    await piste.evaluate((n) => n.classList.add('appui'));
    const c = await pos(); await page.waitForTimeout(400); expect(await pos()).toBe(c);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('bascule Liste / 3D', () => {
  test('deux options visibles, flèches du clavier, la vue change', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    const groupe = page.getByRole('radiogroup', { name: 'Affichage des départs' });
    await expect(groupe.getByRole('radio')).toHaveCount(2);
    await expect(groupe.getByRole('radio', { name: '3D' })).toBeChecked();
    await expect(page.locator('.pano')).toBeVisible();
    await groupe.getByRole('radio', { name: '3D' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(groupe.getByRole('radio', { name: 'Liste' })).toBeChecked();
    await expect(page.locator('.lst')).toBeVisible();
    await expect(page.locator('.pano')).toHaveCount(0);
    await groupe.getByRole('radio', { name: '3D' }).click();
    await expect(page.locator('.pano')).toBeVisible();
  });
});

test.describe('fenêtres', () => {
  test('la ligne de trajet ouvre la fenêtre de trajet (plus /destination) et recentre au retour', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    await page.getByRole('button', { name: /Changer de trajet/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).not.toHaveURL(/destination/);
    await page.getByRole('button', { name: /Voir les départs/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.pano')).toBeVisible();
  });

  test('aucun débordement à 320 px, panorama et liste', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await aller(page, '/');
    await page.getByRole('radio', { name: 'Liste' }).click();
    expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('.bd, .scr')].map((n) => n.scrollWidth - n.clientWidth)))).toBeLessThanOrEqual(1);
  });
});

test.describe('Voyage personnel / Colis', () => {
  test('le basculement change les départs, les prix et le bouton du départ choisi', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    const choix = page.getByRole('radiogroup', { name: 'Voyage personnel ou colis' });
    await expect(choix.getByRole('radio', { name: 'Voyage personnel' })).toBeChecked();
    const nbVoyage = await page.locator('.hd .pl').innerText();
    await expect(page.locator('.sel')).toContainText('Choisir ma place');
    await choix.getByRole('radio', { name: 'Colis' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Taille du colis' })).toBeVisible();
    await expect(page.locator('.sel')).toContainText(/colis M · livré à Douala dans \d h \d\d/);
    await expect(page.locator('.sel a.b.p')).toContainText('Envoyer un colis');
    // le prix affiché est celui d’un colis (quelques milliers de francs au plus), pas celui du billet
    const prix = Number((await page.locator('.sel .ttl.t24').innerText()).replace(/\D/g, ''));
    expect(prix).toBeGreaterThan(1000); expect(prix).toBeLessThan(4000);
    await expect(page.locator('.sel a.b.p')).toHaveAttribute('href', /^\/colis\/envoi\?depart=d-.*&taille=M$/);
    // taille S : plus de covoiturages exclus, prix plus bas ; L : bus seulement, prix plus haut
    await page.getByRole('radio', { name: /^L · sac/ }).click();
    const prixL = Number((await page.locator('.sel .ttl.t24').innerText()).replace(/\D/g, ''));
    expect(prixL).toBeGreaterThan(prix);
    await expect(page.locator('.sel a.b.p')).toHaveAttribute('href', /taille=L$/);
    await page.getByRole('radio', { name: /^L · sac/ }).click();
    // retour au voyage : comportement d’origine
    await choix.getByRole('radio', { name: 'Voyage personnel' }).click();
    await expect(page.locator('.sel')).toContainText('Choisir ma place');
    await expect(page.locator('.hd .pl')).toHaveText(nbVoyage);
  });

  test('« Envoyer un colis » ouvre l’envoi avec le départ et la taille présélectionnés, au prix de la ligne', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    await page.getByRole('radio', { name: 'Colis' }).click();
    await page.getByRole('radio', { name: /^L · sac/ }).click();
    const prixAccueil = (await page.locator('.sel .ttl.t24').innerText()).replace(/\D/g, '');
    const heure = (await page.locator('.sel .ttl.t18').innerText()).slice(0, 5);
    await page.locator('.sel a.b.p').click();
    await expect(page).toHaveURL(/\/colis\/envoi\?depart=.*&taille=L/);
    await expect(page.getByRole('button', { name: /^L · sac/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hd')).toContainText(`bus de ${heure}`);
    // total = prix de la ligne + assurance (500 F, activée par défaut)
    const total = Number((await page.locator('.sheet .ttl.t24').innerText()).replace(/\D/g, ''));
    expect(total).toBe(Number(prixAccueil) + 500);
  });

  test('le mode est mémorisé dans la recherche et la ligne de trajet reste accessible à 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page, '/', { connecte: 'p-aicha' });
    await page.getByRole('radio', { name: 'Colis' }).click();
    await aller(page, '/moi'); await aller(page, '/');
    await expect(page.getByRole('radio', { name: 'Colis' })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('.bd, .scr')].map((n) => n.scrollWidth - n.clientWidth)))).toBeLessThanOrEqual(1);
  });
});
