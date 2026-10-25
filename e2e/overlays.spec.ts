// Fenêtres globales : l'orbe (Ctrl/⌘ + K, bouton central du dock) et les notifications (cloche) s'affichent SUR la page courante, sans changer l'URL.
import type { Page } from '@playwright/test';
import { expect, test, ouvrir, aller, chemin, entrerEn, lireMonde, sansDebordement, MAINTENANT } from './aide';
import { mkdirSync } from 'node:fs';

const orbe = (page: Page) => page.getByRole('dialog', { name: 'Tout AfriMove' });
const notifs = (page: Page) => page.getByRole('dialog', { name: 'Notifications' });
const ouvrirOrbeClavier = async (page: Page) => { await page.keyboard.press('Control+k'); await expect(orbe(page)).toBeVisible(); };
const j = (hdeb: number) => Date.parse(MAINTENANT) - hdeb * 3_600_000;
/** Notifications de démonstration réparties sur trois jours (aujourd'hui, hier, plus tôt) pour p-aicha. */
const preparerNotifs = (e: import('../src/domain/types').Etat) => {
  e.monde.notifications = [
    { id: 'n1', destId: 'p-aicha', ts: j(1), titre: 'Billet confirmé', sous: 'Yaoundé → Douala · demain 08:00', lu: false, lien: '/pass', type: 'billet' },
    { id: 'n2', destId: 'p-aicha', ts: j(2), titre: 'Retard +15 min', sous: 'Nouveau départ 08:15', lu: false, lien: '/direct/retard', type: 'retard' },
    { id: 'n3', destId: 'p-aicha', ts: j(30), titre: 'Colis livré', sous: 'AM-C-9Q2 remis à Marie', lu: true, lien: '/colis/suivi', type: 'colis' },
    { id: 'n4', destId: 'p-aicha', ts: j(24 * 6), titre: 'Bienvenue à bord', sous: 'Tes points fidélité t’attendent', lu: true, type: 'fidelite' }
  ];
};
const fermetures = async (page: Page, boite: (p: Page) => ReturnType<typeof orbe>, ouvrirFn: () => Promise<void>) => {
  const url = await chemin(page);
  await ouvrirFn(); await page.keyboard.press('Escape'); await expect(boite(page)).toHaveCount(0); expect(await chemin(page)).toBe(url);
  await ouvrirFn(); await page.mouse.click(195, 6); await expect(boite(page)).toHaveCount(0); expect(await chemin(page)).toBe(url); // le voile, au-dessus de la fenêtre haute
  await ouvrirFn(); await expect(page.locator('.feuille')).toBeVisible();
  await expect.poll(async () => { const a = (await page.locator('.poignee').boundingBox())!.y; await page.waitForTimeout(120); return a === (await page.locator('.poignee').boundingBox())!.y; }).toBe(true); // la montée est finie
  const p = (await page.locator('.poignee').boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + 10); await page.mouse.down(); await page.mouse.move(p.x + p.width / 2, p.y + 90); await page.mouse.move(p.x + p.width / 2, p.y + 220, { steps: 4 }); await page.mouse.up();
  await expect(boite(page)).toHaveCount(0); expect(await chemin(page)).toBe(url);
};

test('l’orbe s’ouvre sur /pass et /covoit sans changer d’URL, et se ferme (Échap, voile, glisser)', async ({ page }) => {
  for (const url of ['/pass', '/covoit']) {
    if (url === '/pass') await ouvrir(page, '/pass', { connecte: 'p-aicha' }); else await aller(page, '/covoit');
    await expect(page).toHaveURL(new RegExp(`${url}`));
    await ouvrirOrbeClavier(page);
    expect(await chemin(page)).toContain(url);
    await expect(orbe(page).getByPlaceholder(/Chercher une action/)).toBeVisible();
    // la page reste derrière : sa barre du bas est toujours dans le document
    await expect(page.locator('nav.dock')).toBeAttached();
    expect((await sansDebordement(page)).ok).toBe(true);
    await page.keyboard.press('Escape'); await expect(orbe(page)).toHaveCount(0);
    await fermetures(page, orbe, async () => { if (!(await orbe(page).count())) await ouvrirOrbeClavier(page); });
  }
});

test('l’orbe en fenêtre cherche « douala demain » et une action ferme la fenêtre puis navigue', async ({ page }) => {
  await ouvrir(page, '/pass', { connecte: 'p-aicha' });
  await ouvrirOrbeClavier(page);
  await orbe(page).locator('#orbe-q').fill('douala demain');
  await expect(orbe(page).getByText(/Yaoundé → Douala|→ Douala/).first()).toBeVisible();
  await orbe(page).locator('#orbe-q').fill('');
  await orbe(page).getByRole('link', { name: 'Covoiturage' }).click();
  await expect(orbe(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/covoit$/);
  // sur la nouvelle page, l'orbe se rouvre : même fenêtre, nouvelle page derrière
  await ouvrirOrbeClavier(page);
  await orbe(page).getByRole('link', { name: 'Mes billets' }).click();
  await expect(page).toHaveURL(/\/pass$/);
  await expect(orbe(page)).toHaveCount(0);
});

test('l’orbe ne reste pas ouverte après un retour arrière, ni sur la page /orbe, ni pour un agent', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-aicha' });
  await aller(page, '/pass');
  await ouvrirOrbeClavier(page);
  await page.goBack(); // retour à /covoit : la fenêtre ne doit pas suivre
  await expect(page).toHaveURL(/\/covoit/);
  await expect(orbe(page)).toHaveCount(0);
  await page.goForward();
  await expect(orbe(page)).toHaveCount(0);
  // la route /orbe reste une page autonome (pas de fenêtre en plus)
  await aller(page, '/orbe');
  await expect(page.locator('#orbe-q')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.feuille')).toHaveCount(0);
  // un agent n'a pas d'orbe
  await entrerEn(page, 'p-fatou');
  await page.keyboard.press('Control+k');
  await expect(page.locator('.feuille')).toHaveCount(0);
  await entrerEn(page, 'p-luther');
  await page.keyboard.press('Control+k');
  await expect(page.locator('.feuille')).toHaveCount(0);
});

test('notifications : la cloche ouvre une fenêtre groupée par jour, tout marquer lu, ouvrir une notification', async ({ page }) => {
  await ouvrir(page, '/moi', { connecte: 'p-aicha', preparer: preparerNotifs });
  await page.getByRole('button', { name: /Notifications, 2 non lues/ }).click();
  await expect(notifs(page)).toBeVisible();
  expect(await chemin(page)).toContain('/moi');
  await expect(notifs(page).getByText('2 non lues')).toBeVisible();
  await expect(notifs(page).getByText('Aujourd’hui')).toBeVisible();
  await expect(notifs(page).getByText('Hier')).toBeVisible();
  await expect(notifs(page).getByText('Plus tôt')).toBeVisible();
  expect((await sansDebordement(page)).ok).toBe(true);
  await notifs(page).getByRole('button', { name: 'Tout marquer lu' }).click();
  await expect(notifs(page).getByText('Tout est lu')).toBeVisible();
  expect((await lireMonde(page)).notifications.filter((n) => n.destId === 'p-aicha' && !n.lu)).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible(); // le badge de la cloche a disparu
  await notifs(page).getByRole('link', { name: /Retard \+15 min/ }).click();
  await expect(notifs(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/direct\/retard$/);
});

test('notifications : ouvrir une notification la marque lue ; fermeture par Échap, voile et glisser', async ({ page }) => {
  await ouvrir(page, '/pass', { connecte: 'p-aicha', preparer: preparerNotifs });
  await aller(page, '/moi');
  const cloche = page.getByRole('button', { name: /^Notifications/ });
  await fermetures(page, notifs, async () => { if (!(await notifs(page).count())) await cloche.click(); await expect(notifs(page)).toBeVisible(); });
  await cloche.click();
  await notifs(page).getByRole('link', { name: /Billet confirmé/ }).click();
  await expect(page).toHaveURL(/\/pass$/);
  expect((await lireMonde(page)).notifications.find((n) => n.id === 'n1')!.lu).toBe(true);
  // retour arrière avec la fenêtre ouverte : pas de fenêtre fantôme sur la page précédente
  await page.goBack();
  await expect(page).toHaveURL(/\/moi/);
  await cloche.click(); await expect(notifs(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/pass/);
  await expect(notifs(page)).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/moi/);
  await expect(notifs(page)).toHaveCount(0);
});

test('notifications : état vide', async ({ page }) => {
  await ouvrir(page, '/moi', { connecte: 'p-aicha', preparer: (e) => { e.monde.notifications = []; } });
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(notifs(page).getByText('Rien pour l’instant')).toBeVisible();
  await expect(notifs(page).getByText('Aucune notification')).toBeVisible();
});

test('notifications des agents : la cloche du patron ouvre la même fenêtre sur son tableau de bord', async ({ page }) => {
  await ouvrir(page, '/patron', { connecte: 'p-luther', preparer: (e) => { e.monde.notifications.unshift({ id: 'np1', destId: 'p-luther', ts: j(1), titre: 'Clôture à valider', sous: 'Gare de Yaoundé', lu: false, lien: '/patron/gare', type: 'caisse' }); } });
  await page.getByRole('button', { name: /^Alertes/ }).click();
  await expect(notifs(page)).toBeVisible();
  await expect(notifs(page).getByText('Clôture à valider')).toBeVisible();
  expect(await chemin(page)).toContain('/patron');
  await page.keyboard.press('Escape');
  await expect(notifs(page)).toHaveCount(0);
});

// Captures de la montée (images à ~100 ms d'intervalle) : AM_CAPTURES=<dossier> npx playwright test e2e/overlays.spec.ts -g captures
test('captures de la montée', async ({ page }) => {
  const dossier = process.env.AM_CAPTURES; test.skip(!dossier, 'AM_CAPTURES non défini');
  mkdirSync(dossier!, { recursive: true });
  await ouvrir(page, '/pass', { connecte: 'p-aicha', preparer: preparerNotifs });
  const cdp = await page.context().newCDPSession(page); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: Number(process.env.AM_RALENTI) || 1 }); // ralenti : la montée elle-même devient visible image par image
  await page.keyboard.press('Control+k');
  for (let i = 0; i < 9; i++) { await page.screenshot({ path: `${dossier}/orbe-${i}.png` }); await page.waitForTimeout(100); }
  await page.keyboard.press('Escape');
  await aller(page, '/moi');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  for (let i = 0; i < 9; i++) { await page.screenshot({ path: `${dossier}/notifs-${i}.png` }); await page.waitForTimeout(100); }
});

test('l’orbe propose le carrousel des personnages (édition agence) et un geste change de rôle', async ({ page }) => {
  await ouvrir(page, '/pass', { connecte: 'p-aicha' });
  await ouvrirOrbeClavier(page);
  const car = orbe(page).getByRole('list', { name: 'Changer de personnage' });
  await expect(car).toBeVisible();
  for (const role of ['Voyageur', 'Conducteur covoiturage', 'Guichet', 'Chauffeur', 'Patron', 'Point relais', 'Livreur moto']) await expect(car.getByRole('listitem').filter({ hasText: role }).first()).toBeAttached();
  await expect(car.getByRole('listitem').filter({ hasText: 'Voyageur' }).first()).toHaveAttribute('aria-current', 'true');
  await car.getByRole('listitem').filter({ hasText: 'Patron' }).first().click();
  await expect(page).toHaveURL(/\/patron/);
});
