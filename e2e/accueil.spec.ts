import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const alex = (page: Page, route = '/', preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: ALEX, preparer });
const val = (t: string) => new RegExp(`^${t.replace(/\$/g, '\\$').replace(/ /g, '\\s')}$`);
/** Le navigateur de test est à l'heure de Montréal (UTC−4 en octobre), le processus de test peut être ailleurs : on recale les instants du drop sur « lundi 12 octobre, 09:00 » à Montréal. */
const MONTREAL = (iso: string) => Date.parse(`${iso}-04:00`);
const recaler = (e: Etat) => { const maintenant = MONTREAL('2026-10-12T09:00'); e.monde.drops[0].ouvre = maintenant - 3 * 3_600_000; e.monde.drops[0].fin = maintenant + 271_000; e.monde.dropsAVenir[0].ouvre = MONTREAL('2026-10-14T12:00'); };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });
const haut = async (page: Page, loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!;

test.describe('accueil · face Voyager', () => {
  test('affiche le prochain voyage, les bandes, la recherche, le radar et les reventes de la semaine', async ({ page }) => {
    await alex(page);
    await expect(page.getByText('Bonjour Alex · lundi 12 octobre')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal', level: 1 })).toBeVisible();
    const billet = page.getByRole('link', { name: /Prochain voyage/ });
    await expect(billet).toContainText('Dans 63 jours'); await expect(billet).toContainText('YUL'); await expect(billet).toContainText('CDG');
    await expect(billet).toContainText('Montréal · 18:05'); await expect(billet).toContainText('Paris · 07:10 +1');
    await expect(billet).toContainText('Lun. 14 déc. 2026 · Aérolys 812 · direct 7 h 05'); await expect(billet).toContainText('Nommer le voyageur avant le 13 déc.');
    await expect(billet).toHaveAttribute('href', '/voyage/d-812');
    await expect(page.getByRole('link', { name: /Votre 2e bagage est inutilisé/ })).toContainText('D’autres passagers du vol 812 en cherchent.');
    const intention = page.getByRole('link', { name: /Votre intention/ });
    await expect(intention).toContainText('Votre intention YUL → CDG · max 1 300 $'); await expect(intention).toContainText('3 propositions reçues · fonds réservés');
    await expect(page.getByRole('link', { name: /Où partir/ })).toContainText('Montréal (YUL) · dates flexibles · neuf et revente');
    await expect(page.getByRole('link', { name: /Radar des destinations/ })).toContainText('10 destinations sur le radar');
    await expect(page.getByRole('heading', { name: 'Ces billets cherchent un voyageur' })).toBeVisible();
    const cartes = page.getByRole('group', { name: 'Billets en revente cette semaine' }).getByRole('link');
    await expect(cartes).toHaveCount(6);
    await expect(cartes.first()).toContainText('Départ dans 2 jours'); await expect(cartes.first()).toContainText('Paris'); await expect(cartes.first()).toContainText('YUL → CDG · mer. 14 oct. · 19:20');
    await expect(cartes.first()).toContainText('870 $'); await expect(cartes.first()).toContainText('Neuf équivalent : 1 210 $'); await expect(cartes.first()).toContainText('À nommer avant mar. 13 oct. 19:20');
    await expect(nav(page).getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/accueil-voyage.png', fullPage: true });
  });
  test('les cartes mènent aux écrans prévus', async ({ page }) => {
    await alex(page);
    await page.getByRole('link', { name: /Prochain voyage/ }).click(); await expect.poll(() => chemin(page)).toBe('/voyage/d-812'); await page.goBack();
    await page.getByRole('link', { name: /Où partir/ }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher'); await page.goBack();
    await page.getByRole('link', { name: /Radar des destinations/ }).click(); await expect.poll(() => chemin(page)).toBe('/radar'); await expect(page.getByRole('heading', { name: 'Jusqu’où, pour combien ?' })).toBeVisible(); await page.goBack();
    await page.getByRole('group', { name: 'Billets en revente cette semaine' }).getByRole('link').first().click(); await expect.poll(() => chemin(page)).toBe('/revente'); await page.goBack();
    await page.getByRole('link', { name: /Votre 2e bagage/ }).click(); await expect.poll(() => chemin(page)).toBe('/bagages'); await page.goBack();
    await page.getByRole('link', { name: /Votre intention/ }).click(); await expect.poll(() => chemin(page)).toBe('/intentions');
  });
  test('l’échéance suit l’horloge : nommé, le droit affiche le voyageur', async ({ page }) => {
    await alex(page, '/', (e) => { const d = e.monde.droits.find((x) => x.id === 'd-812')!; d.statut = 'nomme'; d.voyageur = { prenom: 'Camille', nom: 'Tremblay', pourSoi: false }; });
    await expect(page.getByRole('link', { name: /Prochain voyage/ })).toContainText('Voyageur nommé : Camille');
  });
  test('sans droit : pas de carte de voyage, ni bagage ni intention', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'ACC-0233' });
    await expect(page.getByRole('heading', { name: 'Aucun voyage pour l’instant' })).toBeVisible(); await expect(page.getByRole('link', { name: /bagage/ })).toHaveCount(0);
  });
  test('première vue à 390 × 700 : le voyage et la barre d’onglets ne se recouvrent pas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await alex(page); await expect(page.getByRole('link', { name: /Prochain voyage/ })).toBeVisible();
    const b = await haut(page, page.getByRole('link', { name: /Prochain voyage/ })), n = await haut(page, nav(page));
    expect(b.y + b.height).toBeLessThanOrEqual(n.y); expect(n.y + n.height).toBeLessThanOrEqual(700 + 1);
    await page.screenshot({ path: '/tmp/accueil-voyage-700.png' });
  });
});

test.describe('accueil · face Mes actifs', () => {
  test('la bascule retourne l’écran, mémorise la face et garde le même cadre', async ({ page }) => {
    await alex(page);
    const voyager = page.getByRole('button', { name: 'Voyager' }), actifs = page.getByRole('button', { name: 'Mes actifs' });
    await expect(voyager).toHaveAttribute('aria-pressed', 'true'); await expect(actifs).toHaveAttribute('aria-pressed', 'false');
    await actifs.click();
    await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible(); await expect(actifs).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.nx.ecran')).toHaveAttribute('data-face', 'nuit'); await expect(page.getByText('Bonjour Alex', { exact: true })).toBeVisible();
    expect((await lireEtat(page)).session.face).toBe('marche');
    await page.reload(); await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Voyager' }).click(); await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal' })).toBeVisible(); await expect(page.locator('.nx.ecran')).toHaveAttribute('data-face', 'jour');
    expect((await lireEtat(page)).session.face).toBe('voyage');
  });
  test('le portefeuille, le drop en direct, la soute, les intentions et les départs qui montent viennent du monde', async ({ page }) => {
    await alex(page, '/', (e) => { e.session.face = 'marche'; recaler(e); });
    const pf = page.getByRole('region', { name: /Mon portefeuille/ });
    await expect(pf).toContainText('Mon portefeuille · 3 droits de voyage'); await expect(pf).toContainText('Prix équivalent aujourd’hui'); await expect(pf).toContainText('4 730 $'); await expect(pf).toContainText('Payé 3 050 $'); await expect(pf).toContainText('+1 680 $');
    await expect(pf.getByRole('link', { name: /nommez le voyageur avant le 13 déc\. 18:05/ })).toContainText('YUL → CDG : nommez le voyageur avant le 13 déc. 18:05');
    await expect(pf.getByRole('link', { name: /Soute du vol 812/ })).toContainText('7 bagages proposés'); await expect(pf.getByRole('link', { name: /Soute du vol 812/ })).toContainText('dès 90 $');
    await expect(pf.getByRole('link', { name: /intentions d’achat/ })).toContainText('2 intentions d’achat sur vos vols'); await expect(pf.getByRole('link', { name: /intentions d’achat/ })).toContainText('Fonds réservés');
    const drop = page.getByRole('link', { name: /Drop membres/ });
    await expect(drop).toContainText('YUL → PUJ'); await expect(drop).toContainText('Punta Cana · dim. 21 févr. 2027 · Nordelle'); await expect(drop).toContainText('200 $'); await expect(drop).toContainText('1 000 $'); await expect(drop).toContainText('3 places');
    await expect(drop.getByRole('timer')).toHaveText(/^00:0[34]:\d\d$/);
    const avant = await drop.getByRole('timer').textContent(); await page.waitForTimeout(2200); expect(await drop.getByRole('timer').textContent()).not.toBe(avant);
    const montent = page.getByRole('region', { name: 'Départs qui montent' });
    await expect(montent.getByRole('link')).toHaveCount(6); // « Tout voir », 4 lignes et « Indices NexG »
    await expect(montent.locator('.delta').first()).toHaveText(/^(Hausse de )?\+\d/);
    await expect(page.getByRole('link', { name: /Indices NexG/ })).toContainText('Prix équivalents par région, au départ de Montréal');
    expect(await sansDebordement(page)).toBe(true);
    await page.screenshot({ path: '/tmp/accueil-actifs.png', fullPage: true });
  });
  test('le bandeau des prix se met en pause au clavier', async ({ page }) => {
    await alex(page, '/', (e) => { e.session.face = 'marche'; });
    const b = page.getByRole('button', { name: 'Mettre en pause le défilement des prix' }); await b.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Reprendre le défilement des prix' })).toBeVisible();
    expect(await page.locator('.piste').evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused');
  });
  test('un drop terminé laisse la place au prochain drop', async ({ page }) => {
    await alex(page, '/', (e) => { e.session.face = 'marche'; recaler(e); e.monde.drops[0].fin = MONTREAL('2026-10-12T08:00'); });
    await expect(page.getByText('Aucun drop en direct')).toBeVisible(); await expect(page.getByText(/Prochain drop\s: mer\. 14 oct\. · 12:00 · Europe/)).toBeVisible();
  });
  test('un compte sans droit voit un portefeuille vide', async ({ page }) => {
    await ouvrir(page, '/', { connecte: 'ACC-0233', preparer: (e) => { e.session.face = 'marche'; } });
    await expect(page.getByText('Mon portefeuille · aucun droit de voyage')).toBeVisible(); await expect(page.getByText('votre premier droit de voyage apparaîtra ici')).toBeVisible();
  });
  test('les liens du verso pointent vers les routes réservées', async ({ page }) => {
    await alex(page, '/', (e) => { e.session.face = 'marche'; recaler(e); });
    await page.getByRole('link', { name: /Mon portefeuille/ }).first().click(); await expect.poll(() => chemin(page)).toBe('/portefeuille'); await page.goBack();
    await page.getByRole('link', { name: /Drop membres/ }).click(); await expect.poll(() => chemin(page)).toBe('/drops'); await page.goBack();
    await page.getByRole('link', { name: /Indices NexG/ }).click(); await expect.poll(() => chemin(page)).toBe('/indices'); await page.goBack();
    await page.getByRole('region', { name: 'Départs qui montent' }).getByRole('link').nth(1).click(); await expect.poll(() => chemin(page)).toMatch(/^\/cours\/v-/);
  });
});

test.describe('explorer sans compte', () => {
  test('version réduite : ni « Mes actifs » ni cloche ni avatar, mais l’invitation à créer un compte', async ({ page }) => {
    await ouvrir(page, '/explorer');
    await expect(page.getByText('Bienvenue · lundi 12 octobre')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mes actifs' })).toHaveCount(0); await expect(page.getByRole('link', { name: /Notifications/ })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Prochain voyage/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Radar des destinations/ })).toBeVisible();
    expect(await sansDebordement(page)).toBe(true); await page.screenshot({ path: '/tmp/accueil-explorer.png', fullPage: true });
    await page.getByRole('link', { name: 'Créer un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
    await page.goBack(); await page.getByRole('link', { name: 'J’ai déjà un compte' }).click(); await expect.poll(() => chemin(page)).toBe('/connexion');
  });
  test('la face mémorisée « Mes actifs » ne s’ouvre pas sans compte', async ({ page }) => {
    await ouvrir(page, '/explorer', { preparer: (e) => { e.session.face = 'marche'; } }); await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal' })).toBeVisible();
  });
  test('le radar et les reventes se consultent sans compte', async ({ page }) => {
    await ouvrir(page, '/radar'); await expect(page.getByRole('heading', { name: 'Jusqu’où, pour combien ?' })).toBeVisible();
    await page.goto('/revente'); await expect(page.getByRole('heading', { name: 'Ces billets cherchent un voyageur' })).toBeVisible();
  });
});

test.describe('radar des destinations', () => {
  test('dix destinations, une fiche, la liste dans le budget', async ({ page }) => {
    await alex(page, '/radar');
    await expect(page.getByRole('heading', { name: 'Jusqu’où, pour combien ?', level: 1 })).toBeVisible();
    const radar = page.getByRole('group', { name: /Radar des destinations depuis Montréal/ }); await expect(radar.getByRole('button')).toHaveCount(10);
    await expect(page.getByRole('button', { name: /^Neuf$/ })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('button', { name: /^Revente$/ })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('button', { name: /^Drops$/ })).toHaveAttribute('aria-pressed', 'false');
    const fiche = page.getByRole('region', { name: 'Punta Cana' }); await expect(fiche).toContainText('PUJ'); await expect(fiche).toContainText('Direction sud-est'); await expect(fiche).toContainText('510 $'); await expect(fiche).toContainText('Revente');
    await radar.getByRole('button', { name: /^Paris, CDG/ }).click(); await expect(page.getByRole('region', { name: 'Paris' })).toContainText('est-nord-est'); await expect(page.getByRole('region', { name: 'Paris' })).toContainText('870 $');
    await expect(radar.getByRole('button', { name: /^Paris, CDG/ })).toHaveAttribute('aria-pressed', 'true');
    const liste = page.getByRole('region', { name: 'Dans votre budget' }); await expect(liste).toContainText(/\d+ destinations? sur 10/);
    await page.screenshot({ path: '/tmp/accueil-radar.png', fullPage: true });
    const voir = page.getByRole('link', { name: 'Voir les billets pour Paris' }); await expect(voir).toHaveAttribute('href', '/resultats?de=YUL&vers=CDG&jour=2026-10-14');
    await voir.click(); await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe('/resultats?de=YUL&vers=CDG&jour=2026-10-14');
  });
  test('le budget se règle au clavier et change ce qui est « dans le budget »', async ({ page }) => {
    await alex(page, '/radar');
    const curseur = page.getByRole('slider', { name: 'Budget max' }); await expect(curseur).toHaveAttribute('aria-valuetext', val('1 200 $'));
    await curseur.focus(); await page.keyboard.press('Home'); await expect(curseur).toHaveAttribute('aria-valuetext', val('200 $'));
    await expect(page.getByText('Rien sur le radar pour l’instant')).toBeVisible(); await expect(page.getByText('Aucune destination sous 200 $ avec ces filtres. Augmentez le budget max ou ajoutez la revente.')).toBeVisible();
    await expect(page.getByText('Au-dessus de votre budget max (200 $).')).toBeVisible();
    await page.keyboard.press('End'); await expect(curseur).toHaveAttribute('aria-valuetext', val('2 500 $')); await expect(page.getByText(/10 destinations sur 10/)).toBeVisible();
    await page.keyboard.press('ArrowLeft'); await expect(curseur).toHaveAttribute('aria-valuetext', val('2 450 $'));
  });
  test('Drops : le drop membres devient la meilleure offre de Punta Cana ; sans type, message dédié', async ({ page }) => {
    await alex(page, '/radar', recaler); await page.getByRole('button', { name: /^Drops$/ }).click();
    const fiche = page.getByRole('region', { name: 'Punta Cana' }); await expect(fiche).toContainText('200 $'); await expect(fiche).toContainText('Drop membres'); await expect(fiche).toContainText('Drop réservé aux membres du Pass NexG');
    await page.getByRole('button', { name: /^Neuf$/ }).click(); await page.getByRole('button', { name: /^Revente$/ }).click(); await page.getByRole('button', { name: /^Drops$/ }).click();
    await expect(page.getByText('Aucun type d’offre sélectionné. Activez Neuf, Revente ou Drops.')).toBeVisible(); await expect(page.getByRole('region', { name: 'Punta Cana' })).toContainText('—');
  });
  test('la liste alternative donne accès aux billets sans toucher le radar', async ({ page }) => {
    await alex(page, '/radar'); const premiere = page.getByRole('region', { name: 'Dans votre budget' }).getByRole('link').first();
    await expect(premiere).toContainText('dès'); const href = await premiere.getAttribute('href'); expect(href).toMatch(/^\/resultats\?de=YUL&vers=[A-Z]{3}&jour=\d{4}-\d\d-\d\d$/);
    await premiere.click(); await expect.poll(() => chemin(page)).toBe('/resultats');
  });
  test('retour, recherche détaillée, hors ligne', async ({ page, context }) => {
    await alex(page, '/radar'); await expect(page.getByRole('link', { name: 'Recherche détaillée' })).toHaveAttribute('href', '/rechercher');
    await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await expect(page.getByText('Hors ligne : ces prix datent de votre dernière visite.')).toBeVisible();
    await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await expect(page.getByText('Hors ligne')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click(); await expect.poll(() => chemin(page)).toBe('/');
  });
  test('première vue à 390 × 700 : titre, filtres et début du radar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await alex(page, '/radar');
    for (const t of ['Jusqu’où, pour combien ?', 'Neuf', 'Revente', 'Drops']) { const el = page.getByText(t, { exact: true }).first(); await expect(el).toBeVisible(); const b = (await el.boundingBox())!; expect(b.y + b.height).toBeLessThanOrEqual(700); }
    await page.screenshot({ path: '/tmp/accueil-radar-700.png' });
  });
});

test.describe('ces billets cherchent un voyageur', () => {
  test('la pile : six billets de la semaine, Passer fait défiler, Je le prends mène à l’offre', async ({ page }) => {
    await alex(page, '/revente');
    await expect(page.getByText('Partir ce week-end', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Ces billets cherchent un voyageur' })).toBeVisible();
    await expect(page.getByText('1/6')).toBeVisible();
    const pile = page.getByRole('region', { name: 'Pile de billets en revente' });
    const premier = pile.getByRole('article').first(); await expect(premier).toContainText('Paris'); await expect(premier).toContainText('Décolle dans'); await expect(premier).toContainText('Le détenteur ne part plus');
    await expect(premier).toContainText('1 210 $'); await expect(premier).toContainText('870 $'); await expect(premier).toContainText('−28,1 %'); await expect(premier).toContainText('vs prix équivalent neuf'); await expect(premier).toContainText('Nommer avant mar. 13 oct.');
    await expect(premier.locator('.decompte')).toHaveText(/^2 j \d\d:\d\d:\d\d$/);
    await expect(page.getByRole('link', { name: 'Je le prends : Paris, 870 $' })).toHaveAttribute('href', '/offre/revente:d-r830');
    await page.screenshot({ path: '/tmp/accueil-revente.png' });
    await page.getByRole('button', { name: 'Passer' }).click(); await expect(page.getByText('2/6')).toBeVisible();
    await expect(page.getByRole('link', { name: /Je le prends : Lisbonne, 590 \$/ })).toHaveAttribute('href', '/offre/revente:d-r611'); await expect(page.getByText('Billet 2 sur 6 : Lisbonne')).toBeAttached();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Passer' }).click(); await expect(page.getByText('6/6')).toBeVisible();
    await page.getByRole('button', { name: 'Passer' }).click(); await expect(page.getByText('1/6')).toBeVisible();
    await page.getByRole('link', { name: /Je le prends/ }).click(); await expect.poll(() => chemin(page)).toBe('/offre/revente:d-r830');
  });
  test('la liste complète se trie et chaque ligne mène à son offre', async ({ page }) => {
    await alex(page, '/revente'); const liste = page.getByRole('region', { name: 'Toutes les reventes de la semaine' }); const lignes = liste.getByRole('link');
    await expect(lignes).toHaveCount(6); await expect(lignes.first()).toContainText('Paris'); await expect(lignes.first()).toContainText('−28,1 %'); await expect(lignes.first()).toContainText('870 $'); await expect(lignes.first()).toContainText('1 210 $');
    await page.getByLabel('Trier').selectOption('prix'); await expect(lignes.first()).toContainText('La Havane'); await expect(lignes.first()).toContainText('470 $'); await expect(lignes.nth(1)).toContainText('Punta Cana');
    await page.getByLabel('Trier').selectOption('ecart'); await expect(lignes.first()).toContainText('−34,7 %'); await expect(lignes.nth(1)).toContainText('Lisbonne'); await expect(lignes.last()).toContainText('Tokyo');
    await lignes.first().click(); await expect.poll(() => chemin(page)).toMatch(/^\/offre\/revente:d-/);
  });
  test('ses propres annonces ne sont pas proposées ; sans revente, un état vide mène au radar', async ({ page }) => {
    await alex(page, '/revente', (e) => { for (const d of e.monde.droits) if (d.statut === 'en_vente') { d.statut = 'detenu'; delete d.annonce; } });
    await expect(page.getByRole('heading', { name: 'Aucun billet en revente cette semaine' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Passer' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Explorer le radar' }).click(); await expect.poll(() => chemin(page)).toBe('/radar');
  });
  test('première vue à 390 × 700 : le billet, Passer et Je le prends restent visibles au-dessus de la barre d’action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await alex(page, '/revente');
    const pass = page.getByRole('button', { name: 'Passer' }), prend = page.getByRole('link', { name: /Je le prends/ }); await expect(pass).toBeVisible(); await expect(prend).toBeVisible();
    const p = await haut(page, pass); expect(p.y + p.height).toBeLessThanOrEqual(700); expect(p.height).toBeGreaterThanOrEqual(44);
    const art = await haut(page, page.getByRole('region', { name: 'Pile de billets en revente' }).getByRole('article').first()); expect(art.y + art.height).toBeLessThanOrEqual(p.y + 1);
    const prix = await haut(page, page.getByRole('region', { name: 'Pile de billets en revente' }).getByRole('article').first().locator('.prix')); expect(prix.y + prix.height).toBeLessThanOrEqual(p.y);
    await expect(page.getByText('Vous serez le voyageur nommé')).toBeVisible(); await page.screenshot({ path: '/tmp/accueil-revente-700.png' });
  });
});

test.describe('accessibilité et mouvement', () => {
  for (const [nom, route, face] of [['accueil Voyager', '/', 'voyage'], ['accueil Mes actifs', '/', 'marche'], ['explorer', '/explorer', 'voyage'], ['radar', '/radar', 'voyage'], ['revente', '/revente', 'voyage']] as const) {
    test(`${nom} : aucun débordement horizontal à 320 px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 }); await ouvrir(page, route, { connecte: route === '/explorer' ? undefined : ALEX, preparer: (e) => { e.session.face = face; } });
      await expect(page.locator('main').first()).toBeVisible(); await page.waitForTimeout(500); expect(await sansDebordement(page)).toBe(true);
      await page.screenshot({ path: `/tmp/accueil-320-${nom.replace(/\W+/g, '-')}.png` });
    });
  }
  test('mouvement réduit : la face apparaît en fondu, le bandeau reste immobile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await alex(page, '/', (e) => { e.session.face = 'marche'; });
    await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible();
    expect(await page.locator('.face').first().evaluate((el) => getComputedStyle(el).animationName)).toMatch(/nx-fondu/);
    expect(await page.locator('.piste').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Voyager' }).click(); expect(await page.locator('.face').first().evaluate((el) => getComputedStyle(el).animationName)).toMatch(/nx-fondu/);
  });
  test('mouvement normal : la face jour se lève (nx-dawn), la face nuit se retourne (nx-flap)', async ({ page }) => {
    await alex(page); expect(await page.locator('.face').first().evaluate((el) => getComputedStyle(el).animationName)).toMatch(/nx-dawn/);
    await page.getByRole('button', { name: 'Mes actifs' }).click(); await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible(); expect(await page.locator('.face').first().evaluate((el) => getComputedStyle(el).animationName)).toMatch(/nx-flap/);
  });
  test('au clavier : la bascule, puis les cartes, sont atteignables et ont un focus visible', async ({ page }) => {
    await alex(page); await page.keyboard.press('Tab'); // lien d'évitement
    await page.getByRole('button', { name: 'Mes actifs' }).focus(); await page.keyboard.press('Space'); await expect(page.getByRole('heading', { name: 'Mes actifs', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Voyager' }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: 'Le monde, à partir de Montréal' })).toBeVisible();
    await page.getByRole('link', { name: /Où partir/ }).focus(); expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
  });
  test('les cibles tactiles font au moins 44 px (bascule, chips, curseur, boutons de pile)', async ({ page }) => {
    await alex(page); for (const n of ['Voyager', 'Mes actifs']) expect((await haut(page, page.getByRole('button', { name: n }))).height).toBeGreaterThanOrEqual(44);
    await page.goto('/radar'); for (const n of [/^Neuf$/, /^Revente$/, /^Drops$/]) expect((await haut(page, page.getByRole('button', { name: n }))).height).toBeGreaterThanOrEqual(44);
    expect((await haut(page, page.getByRole('slider', { name: 'Budget max' }))).height).toBeGreaterThanOrEqual(44);
    for (const b of await page.getByRole('group', { name: /Radar des destinations depuis/ }).getByRole('button').all()) { const r = (await b.boundingBox())!; expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44); }
  });
});
