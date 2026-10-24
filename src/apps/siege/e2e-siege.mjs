// Parcours Playwright du siège (Chromium préinstallé). Usage : npx vite build && npx vite preview --port 4190 &  puis  AM_PORT=4190 node src/apps/siege/e2e-siege.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.AM_PORT || 4190}`, hor = 'maintenant=2026-11-03T07:30', dossier = process.env.CAPTURES || '.';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const erreurs = [];
async function session(largeur, nom, pin) {
  const ctx = await b.newContext({ viewport: { width: largeur, height: largeur > 600 ? 820 : 844 }, locale: 'fr-FR', timezoneId: 'Africa/Douala', serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage(); page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`${base}/entree?${hor}`); await page.getByText(nom).first().click();
  for (const c of pin) await page.locator('.pad button', { hasText: new RegExp(`^${c}$`) }).click();
  await page.waitForTimeout(300); return page;
}
const va = async (page, chemin) => { await page.goto(`${base}${chemin}${chemin.includes('?') ? '&' : '?'}${hor}`); await page.waitForTimeout(700); };

// 1. Luther (patron), 1280 px
let p = await session(1280, 'Luther', '0001');
await va(p, '/siege/comptable/rapprochement');
assert.equal(await p.locator('tbody tr').count(), 4);
await p.getByRole('button', { name: 'Associer' }).first().click(); await p.waitForTimeout(300);
assert.match(await p.locator('h1 + span').innerText(), /^3 transactions/);
await p.getByRole('button', { name: 'Rembourser' }).first().click(); await p.waitForTimeout(300);
await p.screenshot({ path: `${dossier}/rapprochement-1280.png`, fullPage: true });
// export CSV
await va(p, '/siege/comptable');
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Ventes CSV/ }).click()]);
assert.match(dl.suggestedFilename(), /^afrimove-ventes-\d{4}-\d{2}-\d{2}\.csv$/);
// config : prix d'une ligne puis horaires
await va(p, '/siege/config/ligne?ligne=l-BX-bafoussam');
await p.getByRole('button', { name: /Augmenter le prix Classique/ }).click();
await p.getByRole('button', { name: /^Enregistrer/ }).click(); await p.waitForTimeout(400);
assert.match(await p.locator('[role=status]', { hasText: /enregistré|modifié/ }).first().innerText(), /enregistré/);
await va(p, '/siege/config');
assert.match(await p.locator('tr', { hasText: 'Yaoundé → Bafoussam' }).innerText(), /5 500/);
// équipe : ajout d'une personne
await va(p, '/siege/config/personne?nouvelle=1');
await p.getByLabel('Prénom').fill('Awa'); await p.getByLabel('Nom', { exact: true }).fill('Tchamba'); await p.getByLabel('Téléphone').fill('6 55 44 33 22');
await p.getByLabel('PIN à 4 chiffres').fill('5927'); await p.getByRole('button', { name: 'Ajouter la personne' }).click(); await p.waitForTimeout(500);
assert.match(await p.locator('h1').innerText(), /Awa Tchamba/);
// salle de contrôle et santé
await va(p, '/siege/controle/sante'); await p.getByRole('button', { name: 'Relancer' }).click();
assert.match(await p.locator('[role=status]').first().innerText(), /tout est ok/);
// parcours public : « Jouer en tant que »
await va(p, '/parcours'); await p.getByRole('button', { name: /Jouer en tant que Fatou/ }).first().click(); await p.waitForTimeout(500);
assert.equal(new URL(p.url()).pathname, '/guichet'); await p.context().close();

// 2. Nadège (comptable) : seulement la comptabilité
p = await session(1280, 'Nadège', '0002');
await va(p, '/siege/analyses'); assert.equal(new URL(p.url()).pathname, '/siege/comptable');
assert.equal(await p.locator('nav[aria-label="Navigation siège"] a').count(), 3); await p.context().close();

// 3. 390 px : pas de débordement horizontal sur aucun écran
p = await session(390, 'Luther', '0001');
for (const c of ['/siege/analyses', '/siege/analyses/ligne', '/siege/analyses/bus', '/siege/comptable', '/siege/comptable/rapprochement', '/siege/config', '/siege/config/ligne?ligne=l-BX-bafoussam', '/siege/config/personne?personne=p-fatou', '/siege/controle', '/siege/controle/sante', '/parcours']) {
  await va(p, c); const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw, `${c} déborde : ${sw} > ${cw}`);
  await p.screenshot({ path: `${dossier}/390-${c.replace(/\W+/g, '_')}.png`, fullPage: true });
}
await p.context().close(); await b.close();
assert.deepEqual(erreurs, []); console.log('OK : parcours du siège');
