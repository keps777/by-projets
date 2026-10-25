// Panorama de l'accueil : carrousel cylindrique en 3D (tranches voisines tournées vers l'arrière), glissement avec inertie et aimantation, clavier, vue Liste, pièges 3D.
import type { Page } from '@playwright/test';
import { expect, ouvrir, test } from './aide';

const MAINTENANT = '2026-11-03T07:30'; // demain : 19 départs Yaoundé → Douala, tranche 06–09 h en face
async function accueil(page: Page) {
  await ouvrir(page, '/', { connecte: 'p-aicha', maintenant: MAINTENANT });
  await expect(page.locator('.hd .pl')).toContainText('19 départs');
  await expect(page.locator('.colm.front')).toBeVisible();
}
const devant = (page: Page) => page.locator('.colm.front .hh');
const attente = (page: Page, ms: number) => page.waitForTimeout(ms); // laisse le temps au geste (inertie, pointeur), jamais à une assertion
/** Pose lue dans le style en ligne de chaque tranche : rotation Y, profondeur, échelle, opacité, filtre. */
async function poses(page: Page) {
  return page.locator('.colm').evaluateAll((els) => els.map((e) => {
    const h = e as HTMLElement, t = h.style.transform;
    const nombre = (re: RegExp) => Number(t.match(re)?.[1] ?? 0);
    return {
      i: Number(h.dataset.i), angle: Number(h.dataset.angle), rotation: nombre(/rotateY\((-?[\d.]+)deg\)/), z: Number(t.match(/translate3d\([^,]+,[^,]+, (-?[\d.]+)px\)/)?.[1] ?? 0),
      echelle: nombre(/scale\(([\d.]+)\)/), opacite: Number(h.style.opacity), filtre: h.style.filter, evenements: h.style.pointerEvents, envers: /rotateY\(180deg\)/.test(t)
    };
  }));
}
async function glisser(page: Page, dx: number, pas: number, delai: number, relacher = true) {
  const b = (await page.locator('.pano').boundingBox())!;
  await page.mouse.move(b.x + 195, b.y + 200); await page.mouse.down();
  for (let i = 1; i <= pas; i++) { await page.mouse.move(b.x + 195 + (dx * i) / pas, b.y + 200); await attente(page, delai); }
  if (relacher) await page.mouse.up();
}

test('au repos, la tranche de face est droite et nette ; les voisines tournent fortement vers l’arrière', async ({ page }) => {
  await accueil(page);
  const p = await poses(page);
  const face = p.find((x) => x.angle === 0)!, droite = p.find((x) => x.angle === 45)!, gauche = p.find((x) => x.angle === -45)!, fond = p.find((x) => Math.abs(x.angle) === 180)!;
  expect(face).toMatchObject({ rotation: 0, echelle: 1, opacite: 1, filtre: 'none', evenements: 'auto', envers: false });
  for (const v of [droite, gauche]) {
    expect(Math.abs(v.rotation), 'voisine fortement tournée').toBeGreaterThanOrEqual(55);
    expect(v.z, 'voisine reculée').toBeLessThan(face.z - 100);
    expect(v.echelle, 'voisine plus petite').toBeLessThan(face.echelle);
    expect(v.opacite).toBeLessThan(1);
    expect(v.filtre, 'voisine assombrie et floutée').toMatch(/brightness\(0\.\d+\) blur\(/);
    expect(v.evenements).toBe('auto');
  }
  expect(Math.sign(droite.rotation)).toBe(1); expect(Math.sign(gauche.rotation)).toBe(-1);
  expect(fond.opacite, 'le fond est estompé').toBeLessThan(0.5);
  expect(fond.z).toBeLessThan(droite.z);
  expect(fond.evenements).toBe('none');
  expect(fond.envers).toBe(true); // vue de dos : retournée pour rester lisible
  // les voisines sont visibles de chaque côté de la tranche de face
  const bf = (await page.locator('.colm.front').boundingBox())!;
  const bd = (await page.locator('.colm[data-angle="45.0"]').boundingBox())!, bg = (await page.locator('.colm[data-angle="-45.0"]').boundingBox())!;
  expect(bd.x + bd.width).toBeGreaterThan(bf.x + bf.width + 20); expect(bg.x).toBeLessThan(bf.x - 20);
  expect(bf.x).toBeGreaterThan(30); expect(bf.x + bf.width).toBeLessThan(360);
});

test('la scène est un vrai cylindre : perspective 900–1100 px, anneau en preserve-3d, sol, aucune colonne en overflow ni backdrop-filter', async ({ page }) => {
  await accueil(page);
  const s = await page.evaluate(() => {
    const pano = getComputedStyle(document.querySelector('.pano')!), ring = getComputedStyle(document.querySelector('.ring')!), c = getComputedStyle(document.querySelector('.colm')!);
    return { perspective: parseFloat(pano.perspective), ring: ring.transformStyle, sol: !!document.querySelector('.sol'), overflow: c.overflow, backdrop: c.backdropFilter || (c as unknown as Record<string, string>).webkitBackdropFilter || 'none' };
  });
  expect(s.perspective).toBeGreaterThanOrEqual(900); expect(s.perspective).toBeLessThanOrEqual(1100);
  expect(s.ring).toBe('preserve-3d'); expect(s.sol).toBe(true);
  expect(s.overflow).toBe('visible'); expect(s.backdrop).toBe('none');
});

test('pendant le glissement tout tourne autour de l’axe vertical, puis s’aimante sur une tranche', async ({ page }) => {
  await accueil(page);
  await expect(devant(page)).toContainText('06');
  await glisser(page, 60, 6, 40, false); // milieu de geste, doigt toujours posé
  const milieu = await poses(page);
  const f = milieu.find((x) => Math.abs(x.angle) < 30 && x.angle !== 0 && x.i === 2)!;
  expect(f, 'la tranche d’origine a quitté la face sans être aimantée').toBeTruthy();
  expect(f.angle).toBeGreaterThan(15); expect(f.angle).toBeLessThan(40);
  expect(Math.abs(f.rotation)).toBeGreaterThan(20);
  await page.mouse.up(); // geste lent → pas d'élan : la tranche la plus proche
  await expect(page.locator('.colm.front')).toHaveAttribute('data-i', '1');
  await expect.poll(async () => (await poses(page)).find((x) => x.i === 1)!.angle).toBe(0);
  await expect(devant(page)).toContainText('03');
});

test('un lancer rapide va plus loin qu’un glissement lent de même distance (inertie)', async ({ page }) => {
  await accueil(page);
  await glisser(page, -100, 10, 90); // lent
  await expect(page.locator('.colm.front')).toHaveAttribute('data-i', '3');
  await expect.poll(async () => (await poses(page)).find((x) => x.i === 3)!.angle).toBe(0);
  await page.locator('.tick', { hasText: '6h' }).click();
  await expect(page.locator('.colm.front')).toHaveAttribute('data-i', '2');
  // vif : doigt synthétique, un coup par image (≈ 1,5 px/ms) → de l'élan ; horloge de la page, donc insensible à la charge de la machine
  await page.evaluate(async () => {
    const pano = document.querySelector('.pano')!, r = pano.getBoundingClientRect(), y = r.y + 200;
    const ev = (type: string, x: number) => pano.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    const image = () => new Promise((ok) => requestAnimationFrame(ok));
    ev('pointerdown', r.x + 300); await image();
    for (let i = 1; i <= 7; i++) { ev('pointermove', r.x + 300 - i * 25); await image(); }
    ev('pointerup', r.x + 125);
  });
  const rapide = Number(await page.locator('.colm.front').getAttribute('data-i'));
  expect(rapide, "plus loin que le glissement lent (3)").toBeGreaterThan(3);
  await expect.poll(async () => (await poses(page)).find((x) => x.i === rapide)!.angle).toBe(0);
});

test('cliquer une tranche voisine fait tourner vers elle ; les tranches du fond ne reçoivent aucun clic', async ({ page }) => {
  await accueil(page);
  const b = (await page.locator('.colm[data-angle="45.0"]').boundingBox())!;
  const bf = (await page.locator('.colm.front').boundingBox())!;
  await page.mouse.click((bf.x + bf.width + Math.min(b.x + b.width, 388)) / 2, b.y + b.height / 2 + 20); // la partie visible de la voisine de droite
  await expect(page.locator('.colm.front')).toHaveAttribute('data-i', '3');
  await expect(devant(page)).toContainText('09');
});

test('clavier : flèches, Home et Fin, annonce vocale, et mouvement réduit sans animation', async ({ page }) => {
  await accueil(page);
  await page.locator('.pano').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(devant(page)).toContainText('12');
  await expect(page.locator('p.sr')).toContainText('Tranche 12 – 15 h');
  await page.keyboard.press('ArrowLeft');
  await expect(devant(page)).toContainText('09');
  await page.keyboard.press('Home'); await expect(devant(page)).toContainText('00');
  await page.keyboard.press('End'); await expect(devant(page)).toContainText('21');
  await expect(page.locator('.pano')).toHaveAttribute('aria-roledescription', 'panorama');
  await expect(page.locator('.colm[aria-hidden="true"]')).toHaveCount(7);
  await expect(page.locator('.colm.front')).not.toHaveAttribute('aria-hidden', /.*/);
  // mouvement réduit : la tranche suivante est en face tout de suite, sans glisser
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Home');
  await expect.poll(async () => (await poses(page)).find((x) => x.i === 0)!.angle).toBe(0);
  await page.keyboard.press('ArrowRight');
  expect((await poses(page)).find((x) => x.i === 1)!.angle, 'aucune animation').toBe(0);
});

test('les départs, les badges et la vue Liste restent là', async ({ page }) => {
  await accueil(page);
  const lignes = page.locator('.colm.front .bus');
  await expect(lignes).toHaveCount(3);
  await expect(page.locator('.colm.front')).toContainText('06:15 · Finex');
  await expect(page.locator('.colm.front .bd2').first()).toBeVisible(); // badge : « + que 4 pl. »
  await expect(page.locator('.colm.front')).toContainText('+ que 4 pl.');
  await expect(page.locator('.colm.front')).toContainText('+ 3 autres départs');
  await page.getByRole('radio', { name: 'Liste', exact: true }).click();
  await expect(page.locator('.pano')).toHaveCount(0);
  expect(await page.locator('.lst .bus').count()).toBe(19);
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await expect(page.locator('.pano')).toBeVisible();
});

test('cibles tactiles : tranche de face, repères horaires et voisines ≥ 44 px', async ({ page }) => {
  await accueil(page);
  const mesurer = async (sel: string) => { const l = page.locator(sel); const n = await l.count(); expect(n, sel).toBeGreaterThan(0); for (let i = 0; i < n; i++) { const b = (await l.nth(i).boundingBox())!; expect(b.height, `${sel} #${i} hauteur`).toBeGreaterThanOrEqual(43.5); expect(b.width, `${sel} #${i} largeur`).toBeGreaterThanOrEqual(43.5); } };
  await mesurer('.colm.front .chc'); await mesurer('.colm.front .bus'); await mesurer('.colm.front .foot .b'); await mesurer('.colm.front .more'); await mesurer('.ribbon .tick');
  // une tranche voisine se touche sur toute sa partie visible (≥ 44 px de large)
  const b = (await page.locator('.colm[data-angle="45.0"]').boundingBox())!, bf = (await page.locator('.colm.front').boundingBox())!;
  expect(Math.min(b.x + b.width, 390) - (bf.x + bf.width)).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  // tranche à une seule offre : bouton principal
  await page.locator('.tick', { hasText: '0h' }).click();
  await expect(page.locator('.colm.front')).toHaveAttribute('data-i', '0');
  await expect.poll(async () => (await poses(page)).find((x) => x.i === 0)!.angle).toBe(0);
  await mesurer('.colm.front .cta');
});

test('aucun débordement horizontal du panorama à 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await accueil(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const b = (await page.locator('.colm.front').boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(320);
});
