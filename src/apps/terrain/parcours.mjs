// Parcours de bout en bout des applications de terrain (Chromium, application construite servie par `vite preview`).
// Usage : npx vite build && npx vite preview --port 4187 &  puis  AM_PORT=4187 SHOTS=/chemin/captures node src/apps/terrain/parcours.mjs
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.AM_PORT || '4187', BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS || '/tmp/captures-terrain';
const MAINT = '2026-11-03T07:55';
mkdirSync(SHOTS, { recursive: true });
const dossier = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = readdirSync(dossier).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((v) => join(dossier, v, 'chrome-linux', 'chrome')).find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|getUserMedia|NotAllowed|NotFound/.test(m.text())) erreurs.push(`console: ${m.text()}`); });
process.on('uncaughtException', (e) => { console.log(`ERREURS PAGE : ${erreurs.join(' | ')}\n${e.message.split('\n')[0]}`); process.exit(1); });
let n = 0, echecs = 0;
const ok = (cond, msg) => { if (!cond) { echecs++; console.log('ECHEC', msg); } else console.log('ok  ', msg); };
const shot = async (nom) => page.screenshot({ path: join(SHOTS, `${String(++n).padStart(2, '0')}-${nom}.png`) });
const attendre = (ms) => page.waitForTimeout(ms);
async function connexion(nom, pin) {
  await page.goto(`${BASE}/entree?maintenant=${MAINT}`); await page.getByRole('button', { name: new RegExp(nom) }).first().click();
  for (const c of pin) await page.locator('.pad button', { hasText: new RegExp(`^${c}$`) }).click();
  await page.waitForLoadState('networkidle'); await attendre(400);
}
const chemin = () => new URL(page.url()).pathname;
const toast = async () => (await page.locator('[role=status].toast').textContent({ timeout: 3000 }).catch(() => '')) ?? '';

// ------------------------------------------------------------------ quai
await connexion('Ibrahim Sali', '1122');
ok(chemin() === '/quai', `Ibrahim arrive sur /quai (${chemin()})`);
await page.getByText('Quai ').first().waitFor();
await shot('quai-vide');
await page.getByRole('button', { name: 'Créer des billets de démonstration' }).click(); await attendre(300);
await shot('quai-attendus');
await page.getByRole('link', { name: 'Scanner un billet' }).first().click(); await attendre(500);
ok(chemin() === '/quai' && page.url().includes('scan=1'), 'le scanner s’ouvre');
await shot('quai-scanner');
await page.getByText('Simuler un scan').click();
await page.locator('.liste button', { hasText: 'valide' }).first().click(); await attendre(500);
ok(chemin() === '/quai/ok', `un billet valide ouvre /quai/ok (${chemin()})`);
await shot('quai-ok');
await page.waitForURL(/\/quai$/, { timeout: 4000 }).catch(() => {}); ok(chemin() === '/quai', 'retour automatique au radar');
await page.getByRole('link', { name: 'Scanner un billet' }).first().click();
await page.getByLabel('Code du billet').fill('zz9999zz'); await page.getByRole('button', { name: 'Valider' }).click(); await attendre(400);
ok(chemin() === '/quai/refus', 'un code inconnu ouvre /quai/refus');
await page.getByRole('link', { name: 'Retour' }).first().click().catch(() => {});
// billet déjà scanné : on rescanne le premier billet
await page.goto(`${BASE}/quai?scan=1`); await page.getByText('Simuler un scan').click();
await page.locator('.liste button', { hasText: 'essai' }).first().click(); await attendre(400);
ok(chemin() === '/quai/refus', 'un essai refusé ouvre /quai/refus'); await shot('quai-refus');
await page.getByRole('button', { name: 'Appeler le superviseur' }).click(); await attendre(300);
ok(/prévenu/.test(await toast()), 'Abdou est prévenu'); await shot('quai-refus-superviseur');
await page.getByRole('button', { name: 'Vérifier l’identité' }).click(); await shot('quai-refus-identite');
await page.goto(`${BASE}/quai`); await attendre(400); await shot('quai-radar-final');
ok(await page.locator('.radar .blip').count() > 0, 'le radar affiche des blips');

// ------------------------------------------------------------------ chauffeur
await connexion('Émile Fotso', '3344');
ok(chemin() === '/chauffeur', 'Émile arrive sur /chauffeur'); await shot('chauffeur-quai');
for (const l of await page.locator('label.chk input').all()) await l.check();
await page.getByRole('button', { name: '+10 min' }).click(); await attendre(200); ok(/Retard de 10 min/.test(await toast()), 'retard annoncé');
await shot('chauffeur-checklist');
const depart = page.getByRole('button', { name: /^Départ/ }); ok(await depart.isEnabled(), 'Départ disponible'); await depart.click(); await attendre(400);
await shot('chauffeur-route');
for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Accélérer (démo)' }).click();
ok(await page.getByText('trop vite').count() > 0, 'trop vite signalé'); await shot('chauffeur-vitesse');
await page.getByRole('button', { name: 'Arrivé à l’arrêt' }).first().click(); await attendre(400);
ok(chemin() === '/chauffeur/arret', `arrivée à l’arrêt ouvre /chauffeur/arret (${chemin()})`); await shot('chauffeur-arret');
await page.getByRole('button', { name: '+1 min (démo)' }).click();
await page.getByRole('button', { name: 'Signaler un incident' }).click(); await shot('chauffeur-incident'); await page.getByRole('button', { name: 'Prévenir la gare' }).click(); await attendre(200);
await page.getByRole('button', { name: /^Repartir/ }).click(); await attendre(300); ok(chemin() === '/chauffeur', 'repartir ramène à la feuille de route');

// ------------------------------------------------------------------ convoyeur
await connexion('Youssouf Bello', '5566');
ok(chemin() === '/convoyeur', 'Youssouf arrive sur /convoyeur'); await shot('convoyeur');
await page.getByLabel('Téléphone du passager').fill('690112233');
await page.getByRole('button', { name: /^\+1 espèces/ }).click(); await attendre(300); ok(/Vendu/.test(await toast()), 'vente en espèces'); await shot('convoyeur-vente');
await page.getByRole('switch', { name: 'Mode hors ligne' }).click(); await attendre(200);
await page.getByRole('button', { name: '+1 MoMo' }).click(); await attendre(300);
ok(await page.getByText(/File d’attente · 1/).count() > 0, 'une vente en file hors ligne'); await shot('convoyeur-hors-ligne');
await page.getByRole('switch', { name: 'Mode hors ligne' }).click(); await attendre(400);
ok(await page.getByText('synchronisé').count() > 0 && await page.getByText(/File d’attente/).count() === 0, 'synchronisation au retour du réseau'); await shot('convoyeur-sync');

// ------------------------------------------------------------------ contrôleuse
await connexion('Clarisse Eto', '7788');
ok(chemin() === '/controleur', 'Clarisse arrive sur /controleur'); await page.getByRole('button', { name: '+1 compté' }).click(); await page.getByRole('button', { name: '+1 compté' }).click(); await shot('controleur');
await page.getByRole('button', { name: 'Voyageur sans billet' }).click(); await page.getByLabel('Nom', { exact: true }).fill('Hervé Fouda'); await shot('controleur-sans-billet');
await page.getByRole('button', { name: /^Vendre le billet/ }).click(); await attendre(300);
await page.getByRole('button', { name: 'Envoyer le rapport à la gare' }).click(); await attendre(300); ok(/Rapport/.test(await toast()), 'rapport envoyé'); await shot('controleur-rapport');

// ------------------------------------------------------------------ conducteur
await connexion('Moussa Kaba', '0006');
ok(chemin() === '/conducteur', 'Moussa arrive sur /conducteur');
await page.getByRole('button', { name: 'Démo · simuler une réservation' }).click(); await page.getByRole('button', { name: 'Démo · simuler une réservation' }).click(); await attendre(200); await shot('conducteur');
await page.getByRole('button', { name: /^Démarrer/ }).click(); await attendre(200); await page.getByRole('button', { name: /^Terminer le trajet/ }).click(); await attendre(300); await shot('conducteur-termine');

// ------------------------------------------------------------------ vendeuse
await connexion('Brigitte Kouam', '0005');
ok(chemin() === '/vendeur', 'Brigitte arrive sur /vendeur'); await shot('vendeur');
await page.locator('.bigb').first().click(); await page.getByLabel('Téléphone du client').fill('699887766'); await shot('vendeur-vente');
await page.getByRole('button', { name: /^Vendre ·/ }).click(); await attendre(300);
await page.locator('.bigb').nth(1).click(); await page.getByRole('button', { name: 'MoMo compagnie' }).click(); await page.getByRole('button', { name: /^Vendre ·/ }).click(); await attendre(300);
ok(await page.getByText('2', { exact: true }).count() > 0, 'deux billets vendus'); await shot('vendeur-apres');

// ------------------------------------------------------------------ moi + déconnexion
await page.goto(`${BASE}/terrain/moi`); await attendre(300); await shot('moi');

// garde de rôle
await connexion('Brigitte Kouam', '0005'); await page.goto(`${BASE}/quai`); await attendre(500); ok(chemin() === '/entree', 'la vendeuse ne peut pas ouvrir /quai');

// largeur 320 : pas de débordement horizontal
await page.setViewportSize({ width: 320, height: 700 });
for (const [nom, pin, route] of [['Ibrahim Sali', '1122', '/quai'], ['Émile Fotso', '3344', '/chauffeur'], ['Youssouf Bello', '5566', '/convoyeur'], ['Clarisse Eto', '7788', '/controleur'], ['Moussa Kaba', '0006', '/conducteur'], ['Brigitte Kouam', '0005', '/vendeur']]) {
  await connexion(nom, pin); await page.goto(`${BASE}${route}?maintenant=${MAINT}`); await attendre(500);
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const bd = await page.evaluate(() => { const b = document.querySelector('.bd'); return b ? b.scrollWidth - b.clientWidth : 0; });
  ok(debord <= 0 && bd <= 0, `pas de débordement horizontal à 320 px sur ${route} (${debord}/${bd})`);
}
console.log(erreurs.length ? `ERREURS PAGE :\n${erreurs.join('\n')}` : 'aucune erreur de page'); if (erreurs.length) echecs++;
await browser.close(); console.log(echecs ? `${echecs} ÉCHEC(S)` : 'PARCOURS OK'); process.exit(echecs ? 1 : 0);
