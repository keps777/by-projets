import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412';
const alex = (e: Etat) => e.monde.comptes.find((c) => c.id === ALEX)!;
const sansPass = (e: Etat) => { alex(e).pass = { actif: false }; };
const sansIdentite = (e: Etat) => { alex(e).identiteVerifiee = undefined; };
const NB = ' ';

test.describe('garde d’accès', () => {
  for (const r of ['/solde', '/compte', '/alertes', '/notifications', '/notifications/preferences', '/aide', '/aide/contact']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
  test('le Pass se consulte sans compte, l’achat demande un compte', async ({ page }) => {
    await ouvrir(page, '/pass');
    await expect(page.getByRole('heading', { name: 'Ce que le Pass ouvre' })).toBeVisible(); expect(chemin(page)).toBe('/pass');
    await page.getByRole('link', { name: 'Créer un compte pour activer le Pass' }).click(); await expect.poll(() => chemin(page)).toBe('/inscription');
  });
});

test.describe('solde et grand livre', () => {
  test('première vue à 390 × 700 : solde, versement et achat visibles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/solde', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Solde disponible' })).toBeVisible();
    await expect(page.getByText(`1${NB}152,00${NB}$`).first()).toBeAttached();
    const v = page.getByRole('button', { name: /Verser vers mon compte/ }), a = page.getByRole('link', { name: 'Utiliser pour un achat' });
    for (const b of [v, a]) { await expect(b).toBeVisible(); const r = (await b.boundingBox())!; expect(r.y + r.height).toBeLessThanOrEqual(700); }
    await page.screenshot({ path: '/tmp/nxc-solde-1.png' });
  });
  test('grand livre : revente puis commission en ligne distincte, soldes, filtres et totaux', async ({ page }) => {
    await ouvrir(page, '/solde', { connecte: ALEX });
    const lignes = page.locator('.mv'); await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0)).toContainText('Revente YUL → LIS'); await expect(lignes.nth(0)).toContainText(`+1${NB}280,00${NB}$`);
    await expect(lignes.nth(1)).toContainText('Commission de revente'); await expect(lignes.nth(1)).toContainText('Hypothèse'); await expect(lignes.nth(1)).toContainText(`−128,00${NB}$`); await expect(lignes.nth(1)).toContainText(`solde 1${NB}152,00${NB}$`);
    await expect(page.getByText(`+1${NB}280,00${NB}$`).first()).toBeVisible();
    await page.getByRole('button', { name: 'Entrées', exact: true }).click(); await expect(lignes).toHaveCount(1); await expect(page.getByText(/Filtre actif/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Entrées', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Sorties', exact: true }).click(); await expect(lignes).toHaveCount(1); await expect(lignes.first()).toContainText('Commission');
    await expect(lignes.first()).toContainText(`solde 1${NB}152,00${NB}$`); // le solde reste celui du livre complet
    await page.getByRole('button', { name: 'Tout', exact: true }).click(); await expect(lignes).toHaveCount(2);
  });
  test('versement : confirmation (frais, délai, mode démo), grand livre, en attente, puis réinitialisation', async ({ page }) => {
    await ouvrir(page, '/solde', { connecte: ALEX });
    await page.getByRole('button', { name: /Verser vers mon compte/ }).click();
    const g = page.getByRole('group', { name: 'Confirmer le versement' }); await expect(g).toBeVisible();
    await expect(g).toContainText(`1${NB}152,00${NB}$`); await expect(g).toContainText('•••• 4821'); await expect(g).toContainText(`0,00${NB}$`); await expect(g).toContainText('1 à 3 jours ouvrables (hypothèse)'); await expect(g).toContainText('MODE DÉMO — aucun paiement réel');
    await page.screenshot({ path: '/tmp/nxc-solde-2.png' });
    await g.getByRole('button', { name: 'Annuler' }).click(); await expect(g).toBeHidden(); expect((await lireEtat(page)).monde.ecritures.some((e) => e.type === 'versement')).toBe(false);
    await page.getByRole('button', { name: /Verser vers mon compte/ }).click(); await g.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Versement simulé lancé' })).toContainText(`1${NB}152,00${NB}$ vers •••• 4821`);
    await expect(page.getByText('Versement en cours · •••• 4821')).toBeVisible();
    await expect(page.locator('.mv').last()).toContainText('Versement · •••• 4821'); await expect(page.locator('.mv').last()).toContainText(`−1${NB}152,00${NB}$`);
    const e = await lireEtat(page), c = e.monde.comptes.find((x) => x.id === ALEX)!; expect(c.solde).toBe(0); expect(c.enAttente).toBe(1152); expect(e.monde.ecritures.at(-1)).toMatchObject({ type: 'versement', montant: -1152 });
    await page.getByRole('button', { name: 'Réinitialiser la démo' }).click();
    await expect(page.locator('.mv')).toHaveCount(2); const e2 = await lireEtat(page); expect(e2.monde.comptes.find((x) => x.id === ALEX)!.solde).toBe(1152); expect(chemin(page)).toBe('/solde'); expect(e2.session.compteId).toBe(ALEX);
  });
  test('sans identité vérifiée, le versement renvoie vers /identite?retour=/solde', async ({ page }) => {
    await ouvrir(page, '/solde', { connecte: ALEX, preparer: sansIdentite });
    await expect(page.getByRole('heading', { name: 'Identité à vérifier' })).toBeVisible();
    await page.getByRole('button', { name: /Verser vers mon compte/ }).click(); await expect.poll(() => chemin(page)).toBe('/identite');
    expect(new URL(page.url()).searchParams.get('retour')).toBe('/solde');
  });
  test('un solde nul n’ouvre pas la confirmation et l’explique', async ({ page }) => {
    await ouvrir(page, '/solde', { connecte: ALEX, preparer: (e) => { alex(e).solde = 0; } });
    await page.getByRole('button', { name: /Verser vers mon compte/ }).click({ force: true }); await expect(page.getByRole('alert')).toContainText('rien à verser'); await expect(page.getByRole('group', { name: 'Confirmer le versement' })).toBeHidden();
  });
  test('hors ligne : le versement ne se confirme pas', async ({ page, context }) => {
    await ouvrir(page, '/solde', { connecte: ALEX }); await page.getByRole('button', { name: /Verser vers mon compte/ }).click(); await context.setOffline(true);
    await expect(page.getByRole('alert').filter({ hasText: 'Hors ligne' })).toBeVisible(); await page.getByRole('button', { name: 'Confirmer' }).click({ force: true });
    expect((await lireEtat(page)).monde.ecritures.some((e) => e.type === 'versement')).toBe(false); await context.setOffline(false);
  });
  test('« Utiliser pour un achat » mène à la recherche, « Gérer » au compte', async ({ page }) => {
    await ouvrir(page, '/solde', { connecte: ALEX }); await page.getByRole('link', { name: 'Gérer' }).click(); await expect.poll(() => chemin(page)).toBe('/compte');
    await page.goBack(); await page.getByRole('link', { name: 'Utiliser pour un achat' }).click(); await expect.poll(() => chemin(page)).toBe('/rechercher');
  });
});

test.describe('compte', () => {
  test('profil, Pass, identité, voyageurs et liens', async ({ page }) => {
    await ouvrir(page, '/compte', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Alex T.', level: 1 })).toBeVisible(); await expect(page.getByRole('heading', { name: /Identité vérifiée/ })).toBeVisible(); await expect(page.getByText(/Vérifiée le 28 août 2026/)).toBeVisible();
    await expect(page.getByText('Camille T.')).toBeVisible(); await expect(page.getByText('Paul R.')).toBeVisible(); await expect(page.getByText('1 active')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Compte' })).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: '/tmp/nxc-compte-1.png' });
    const liens: [string | RegExp, string][] = [[/Solde et versements/, '/solde'], [/Carte de paiement/, '/carte'], [/Mes alertes/, '/alertes'], [/Pass NexG/, '/pass'], [/^Notifications\s+Niveau/, '/notifications/preferences'], [/^Aide$/, '/aide']];
    for (const [nom, vers] of liens) { await page.getByRole('link', { name: nom }).first().click(); await expect.poll(() => chemin(page)).toBe(vers); await page.goBack(); await expect(page.getByRole('heading', { name: 'Alex T.', level: 1 })).toBeVisible(); }
  });
  test('ajouter puis retirer un proche', async ({ page }) => {
    await ouvrir(page, '/compte', { connecte: ALEX });
    await page.getByRole('button', { name: /Ajouter un proche/ }).click();
    const d = page.getByRole('dialog', { name: 'Ajouter un proche' }); await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Ajouter ce proche' }).click(); await expect(d.getByRole('alert')).toContainText('Indiquez');
    await d.getByLabel('Courriel ou téléphone de votre proche').fill('personne@exemple.test'); await d.getByRole('button', { name: 'Ajouter ce proche' }).click(); await expect(d.getByRole('alert')).toContainText('Aucun compte');
    await d.getByLabel('Courriel ou téléphone de votre proche').fill('514 555 0301'); await d.getByRole('button', { name: 'Ajouter ce proche' }).click();
    await expect(d).toBeHidden(); await expect(page.getByText('Sophie L.', { exact: true })).toBeVisible(); expect((await lireEtat(page)).monde.comptes.find((c) => c.id === ALEX)!.proches).toContain('ACC-0301');
    await page.getByRole('button', { name: 'Retirer Sophie L. de mes proches' }).click(); await expect(page.getByText('Sophie L.', { exact: true })).toBeHidden(); expect((await lireEtat(page)).monde.comptes.find((c) => c.id === ALEX)!.proches).not.toContain('ACC-0301');
  });
  test('clé d’accès, langue et déconnexion', async ({ page }) => {
    await ouvrir(page, '/compte', { connecte: ALEX });
    const cle = page.getByRole('switch', { name: 'Clé d’accès' }); await expect(cle).toBeChecked(); await cle.click(); await expect(cle).not.toBeChecked(); expect((await lireEtat(page)).monde.comptes.find((c) => c.id === ALEX)!.passkey).toBe(false);
    await page.getByRole('button', { name: 'English' }).click(); await expect(page.getByText('La version anglaise n’est pas incluse')).toBeVisible(); await page.getByRole('button', { name: 'Français' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click(); await expect.poll(() => chemin(page)).toBe('/ouverture'); expect((await lireEtat(page)).session.compteId).toBeNull();
  });
  test('sans identité : invitation à vérifier avec retour au compte', async ({ page }) => {
    await ouvrir(page, '/compte', { connecte: ALEX, preparer: sansIdentite });
    await page.getByRole('link', { name: 'Vérifier mon identité' }).click(); await expect.poll(() => chemin(page)).toBe('/identite'); expect(new URL(page.url()).searchParams.get('retour')).toBe('/compte');
  });
});

test.describe('Pass NexG', () => {
  test('membre : carte, niveau, résiliation avec confirmation', async ({ page }) => {
    await ouvrir(page, '/pass', { connecte: ALEX });
    await expect(page.getByRole('img', { name: /Carte de membre Pass NexG au nom de Alex T\./ })).toBeVisible(); await expect(page.getByText(/Pass actif depuis le 12 mars 2026/)).toBeVisible();
    await expect(page.getByText(`10${NB}% au lieu de 12,5${NB}% sur chaque revente`)).toBeVisible(); await expect(page.getByText('Votre niveau')).toBeVisible();
    await page.getByRole('button', { name: 'Résilier le Pass' }).click(); const d = page.getByRole('dialog', { name: 'Résilier le Pass ?' }); await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Garder le Pass' }).click(); expect((await lireEtat(page)).monde.comptes.find((c) => c.id === ALEX)!.pass.actif).toBe(true);
    await page.getByRole('button', { name: 'Résilier le Pass' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Résilier le Pass' }).click();
    await expect(page.getByRole('button', { name: 'Activer le Pass (démo)' })).toBeVisible(); expect((await lireEtat(page)).monde.comptes.find((c) => c.id === ALEX)!.pass.actif).toBe(false);
  });
  test('non-membre : activer le Pass (démo), commission à 10 %', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/pass', { connecte: ALEX, preparer: sansPass });
    await expect(page.getByText(`9,99${NB}$`).first()).toBeVisible(); await expect(page.getByText(/Les drops sont limités/)).toBeVisible();
    const b = page.getByRole('button', { name: 'Activer le Pass (démo)' }); await expect(b).toBeVisible(); const r = (await b.boundingBox())!; expect(r.y + r.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: '/tmp/nxc-pass-1.png' });
    await b.click(); await expect(page.getByRole('status').filter({ hasText: 'Pass activé' })).toBeVisible();
    const e = await lireEtat(page); expect(alex(e).pass.actif).toBe(true); expect(alex(e).pass.depuis).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Résilier le Pass' })).toBeVisible();
  });
  test('le tableau comparatif est un vrai tableau', async ({ page }) => {
    await ouvrir(page, '/pass'); const t = page.getByRole('table'); await expect(t.getByRole('columnheader')).toHaveText(['Fonction', 'Gratuit', 'Pass']);
    await expect(t.getByRole('row', { name: /Commission de revente/ })).toContainText(`12,5${NB}%`); await expect(t.getByRole('row', { name: /Commission de revente/ })).toContainText(`10${NB}%`);
  });
});

test.describe('alertes', () => {
  test('liste, bascule, suppression', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX });
    const sw = page.getByRole('switch', { name: /Alerte YUL → Partout/ }); await expect(sw).toBeChecked(); await expect(page.getByText('1 active', { exact: true })).toBeVisible();
    await sw.click(); await expect(sw).not.toBeChecked(); await expect(page.getByText('Aucune active')).toBeVisible(); expect((await lireEtat(page)).monde.alertes[0].actif).toBe(false);
    await page.getByRole('button', { name: /Supprimer l’alerte YUL → Partout/ }).click(); await expect(page.getByText('Aucune alerte pour l’instant')).toBeVisible(); expect((await lireEtat(page)).monde.alertes).toHaveLength(0);
  });
  test('l’historique garde les alertes déclenchées et notifie une seule fois', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX, preparer: (e) => { alex(e).prefsNotif = 'tout'; } });
    await expect(page.getByRole('heading', { name: 'Alertes déclenchées' })).toBeVisible(); await expect(page.getByText(/Sous votre plafond d’alerte de 600/).first()).toBeVisible();
    const e = await lireEtat(page); const n = e.monde.notifications.filter((x) => x.type === 'prix' && x.compteId === ALEX).length; expect(n).toBeGreaterThan(1);
    await page.reload(); expect((await lireEtat(page)).monde.notifications.filter((x) => x.type === 'prix' && x.compteId === ALEX).length).toBe(n);
  });
  test('créer une alerte : aperçu en direct, budget, types, canaux, enregistrement', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX });
    await page.getByLabel('Destination').fill('Paris (CDG)'); await expect(page.getByText('YUL → CDG')).toBeVisible();
    await page.getByLabel('Budget maximum par billet').fill('1600'); await expect(page.locator('output')).toContainText(`1${NB}600${NB}$`);
    await page.getByRole('checkbox', { name: 'Drops' }).uncheck(); await expect(page.getByText('Revente · Dates flexibles · Notification')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Courriel' }).check(); await expect(page.getByText('Revente · Dates flexibles · Notification, Courriel')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer l’alerte' }).click();
    const e = await lireEtat(page); expect(e.monde.alertes.at(-1)).toMatchObject({ de: 'YUL', vers: 'CDG', prixMax: 1600, actif: true });
    await expect(page.getByText('En revente · ≤ 1 600 $'.replace(/ /g, NB).replace('En revente', 'En revente').replace(`1${NB}600`, `1${NB}600`))).toBeVisible();
  });
  test('erreurs annoncées : aucun type, aucun canal, destination inconnue', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX });
    await page.getByLabel('Destination').fill('Atlantide'); await page.getByRole('checkbox', { name: 'Drops' }).uncheck(); await page.getByRole('checkbox', { name: 'Revente' }).uncheck(); await page.getByRole('checkbox', { name: 'Notification' }).uncheck();
    await page.getByRole('button', { name: 'Enregistrer l’alerte' }).click();
    for (const t of ['Choisissez « Partout », une zone ou un aéroport connu.', 'Choisissez au moins un type d’offre.', 'Choisissez au moins un canal.']) await expect(page.getByRole('alert').filter({ hasText: t })).toBeVisible();
    expect((await lireEtat(page)).monde.alertes).toHaveLength(1);
  });
  test('sans Pass, les drops sont réservés aux membres', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX, preparer: sansPass });
    await expect(page.getByRole('checkbox', { name: 'Drops' })).toBeDisabled(); await expect(page.getByText('Les drops demandent le Pass NexG.')).toBeVisible();
    await page.getByRole('link', { name: 'Découvrir le Pass' }).click(); await expect.poll(() => chemin(page)).toBe('/pass');
  });
  test('dates non flexibles : date obligatoire', async ({ page }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX });
    await page.getByRole('switch', { name: /Dates flexibles/ }).click(); await expect(page.getByLabel('Date de départ')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer l’alerte' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Choisissez une date de départ.' })).toBeVisible();
    await page.getByLabel('Date de départ').fill('2027-02-21'); await page.getByRole('button', { name: 'Enregistrer l’alerte' }).click(); expect((await lireEtat(page)).monde.alertes).toHaveLength(2);
  });
  test('hors ligne : les alertes ne se modifient pas', async ({ page, context }) => {
    await ouvrir(page, '/alertes', { connecte: ALEX }); await context.setOffline(true);
    await expect(page.getByText('Hors ligne : les alertes ne peuvent pas être modifiées.')).toBeVisible(); await expect(page.getByRole('switch', { name: /Alerte YUL → Partout/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Enregistrer l’alerte' }).click({ force: true }); expect((await lireEtat(page)).monde.alertes).toHaveLength(1); await context.setOffline(false);
  });
});

test.describe('centre de notifications', () => {
  test('non lues, groupes par jour, lecture et lien profond', async ({ page }) => {
    await ouvrir(page, '/notifications', { connecte: ALEX });
    await expect(page.getByText('2 non lues')).toBeVisible(); for (const t of ['Aujourd’hui', 'Hier', 'Plus tôt']) await expect(page.getByRole('heading', { name: t })).toBeVisible();
    await expect(page.locator('[data-notification="n-1"]')).toContainText('Non lue.'); await page.screenshot({ path: '/tmp/nxc-notifs-1.png' });
    await page.locator('[data-notification="n-1"]').click(); await expect.poll(() => chemin(page)).toBe('/bagages');
    expect((await lireEtat(page)).monde.notifications.find((n) => n.id === 'n-1')!.lu).toBe(true);
    await page.goBack(); await expect(page.getByText('1 non lue', { exact: true })).toBeVisible();
  });
  test('tout marquer comme lu', async ({ page }) => {
    await ouvrir(page, '/notifications', { connecte: ALEX });
    await page.getByRole('button', { name: 'Tout marquer comme lu' }).click(); await expect(page.getByText('Tout est lu')).toBeVisible(); await expect(page.getByRole('button', { name: 'Tout marquer comme lu' })).toHaveAttribute('aria-disabled', 'true');
    expect((await lireEtat(page)).monde.notifications.filter((n) => n.compteId === ALEX && !n.lu)).toHaveLength(0);
  });
  test('filtres et filtre vide', async ({ page }) => {
    await ouvrir(page, '/notifications', { connecte: ALEX });
    await page.getByRole('button', { name: 'Échéances' }).click(); await expect(page.locator('[data-notification]')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Échéances' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Drops', exact: true }).click(); await expect(page.locator('[data-notification]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Ventes' }).click(); await expect(page.getByRole('heading', { name: 'Aucune notification de ce type' })).toBeVisible();
    await page.getByRole('button', { name: 'Voir toutes' }).click(); await expect(page.locator('[data-notification]')).toHaveCount(4);
  });
  test('vide : invitation à régler les notifications', async ({ page }) => {
    await ouvrir(page, '/notifications', { connecte: ALEX, preparer: (e) => { e.monde.notifications = []; } });
    await expect(page.getByRole('heading', { name: 'Rien de nouveau' })).toBeVisible(); await page.getByRole('link', { name: 'Régler mes notifications' }).click(); await expect.poll(() => chemin(page)).toBe('/notifications/preferences');
  });
  test('hors ligne : dernières notifications, lecture groupée désactivée', async ({ page, context }) => {
    await ouvrir(page, '/notifications', { connecte: ALEX }); await context.setOffline(true);
    await expect(page.getByText('Hors ligne : dernières notifications reçues')).toBeVisible(); await expect(page.getByRole('button', { name: 'Tout marquer comme lu' })).toHaveAttribute('aria-disabled', 'true'); await expect(page.locator('[data-notification]')).toHaveCount(4); await context.setOffline(false);
  });
  test('états chargement et erreur (?etat=)', async ({ page }) => {
    await ouvrir(page, '/notifications?etat=erreur', { connecte: ALEX }); await expect(page.getByRole('alert')).toContainText('Impossible de charger vos notifications');
    await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByText('Chargement des notifications…')).toBeAttached(); await expect(page.locator('[data-notification]')).toHaveCount(4);
  });
  test('la cloche de l’en-tête mène au centre, les préférences à leur écran', async ({ page }) => {
    await ouvrir(page, '/compte', { connecte: ALEX }); await page.getByRole('link', { name: /^Notifications, 2 non lues/ }).click(); await expect.poll(() => chemin(page)).toBe('/notifications');
    await page.getByRole('link', { name: 'Préférences de notifications' }).click(); await expect.poll(() => chemin(page)).toBe('/notifications/preferences');
  });
});

test.describe('préférences de notifications', () => {
  test('choisir le niveau, voir ce qui est reçu, mémoriser', async ({ page }) => {
    await ouvrir(page, '/notifications/preferences', { connecte: ALEX });
    await expect(page.getByRole('radio', { name: /L’essentiel/ })).toBeChecked(); await expect(page.locator('[data-type="drops"]')).toContainText('Non inclus'); await expect(page.locator('[data-type="echeances"]')).toContainText('Inclus');
    await expect(page.getByText('Vos alertes de prix et de drops sont suspendues')).toBeVisible();
    await page.getByRole('radio', { name: /^Tout/ }).check(); await expect(page.getByText('Préférence enregistrée')).toBeVisible(); await expect(page.locator('[data-type="drops"]')).toContainText('Inclus'); await expect(page.getByText('Vos alertes de prix et de drops sont suspendues')).toBeHidden();
    expect(alex(await lireEtat(page)).prefsNotif).toBe('tout');
    await page.getByRole('radio', { name: /^Rien/ }).check(); await expect(page.getByText(/Sans rappel, vous serez nommé voyageur/)).toBeVisible(); await expect(page.getByRole('link', { name: 'Régler les rappels d’échéance' })).toBeVisible();
    expect(alex(await lireEtat(page)).prefsNotif).toBe('rien');
  });
  test('canaux : courriel mémorisé, toujours envoyés listés, clavier', async ({ page }) => {
    await ouvrir(page, '/notifications/preferences', { connecte: ALEX });
    await expect(page.getByText('alex.tremblay@exemple.test')).toBeVisible(); const c = page.getByRole('switch').nth(1); await c.focus(); await page.keyboard.press('Space'); await expect(c).not.toBeChecked();
    expect((await lireEtat(page)).tranches.notifs).toMatchObject({ courriel: false });
    for (const t of ['Code de vérification', 'Reçus d’achat et de vente', 'Sécurité du compte', 'Changement ou annulation de votre vol']) await expect(page.getByText(t)).toBeVisible();
  });
  test('hors ligne et erreur : réglage précédent conservé', async ({ page, context }) => {
    await ouvrir(page, '/notifications/preferences', { connecte: ALEX }); await context.setOffline(true);
    await expect(page.getByText('Hors ligne : les préférences ne peuvent pas être modifiées.')).toBeVisible(); await expect(page.getByRole('radio', { name: /^Rien/ })).toBeDisabled(); await context.setOffline(false);
    await page.goto('/notifications/preferences?etat=erreur'); await page.getByText('Rien', { exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Votre choix n’a pas été enregistré.');
    expect(alex(await lireEtat(page)).prefsNotif).toBe('essentiel'); await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByText('Préférence enregistrée')).toBeVisible(); expect(alex(await lireEtat(page)).prefsNotif).toBe('rien');
  });
});

test.describe('aide', () => {
  test('accordéon accessible au clavier', async ({ page }) => {
    await ouvrir(page, '/aide', { connecte: ALEX });
    const q = page.locator('#q-q1'); await expect(q).toHaveAttribute('aria-expanded', 'false'); await q.focus(); await page.keyboard.press('Enter');
    await expect(q).toHaveAttribute('aria-expanded', 'true'); await expect(page.getByRole('region', { name: /Qu’est-ce qu’un droit de voyage/ })).toContainText('C’est le droit de voyager sur un vol.');
    await page.locator('#q-q3').click(); await expect(q).toHaveAttribute('aria-expanded', 'false'); await expect(page.getByRole('region', { name: /Combien coûte une revente/ })).toContainText(`12,5${NB}%`);
    await page.locator('#q-q3').click(); await expect(page.locator('[role="region"][id^="r-"]')).toHaveCount(0);
  });
  test('recherche sans accents, sans résultat, effacer', async ({ page }) => {
    await ouvrir(page, '/aide', { connecte: ALEX });
    await page.getByLabel('Rechercher dans l’aide').fill('echeance'); await expect(page.locator('[data-question]')).toHaveCount(2);
    await page.getByLabel('Rechercher dans l’aide').fill('xyzzy'); await expect(page.getByText('Aucun résultat pour « xyzzy »')).toBeVisible();
    await page.getByRole('button', { name: 'Effacer la recherche' }).click(); await expect(page.locator('[data-question]')).toHaveCount(6);
    await page.getByLabel('Rechercher dans l’aide').fill('commission'); await page.getByRole('button', { name: 'Vider le champ de recherche' }).click(); await expect(page.locator('[data-question]')).toHaveCount(6);
  });
  test('la question sur les notifications mène aux préférences', async ({ page }) => {
    await ouvrir(page, '/aide', { connecte: ALEX }); await page.locator('#q-q6').click(); await page.getByRole('link', { name: 'Ouvrir les préférences' }).click(); await expect.poll(() => chemin(page)).toBe('/notifications/preferences');
  });
  test('hors ligne : réponses lisibles, écrire à l’assistance désactivé', async ({ page, context }) => {
    await ouvrir(page, '/aide', { connecte: ALEX }); await context.setOffline(true);
    await expect(page.getByText('Hors ligne : écrire à l’assistance demande une connexion.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Écrire à l’assistance' })).toHaveAttribute('aria-disabled', 'true'); await expect(page.locator('[data-question]')).toHaveCount(6); await context.setOffline(false);
  });
  test('erreur (?etat=erreur) puis réessayer', async ({ page }) => {
    await ouvrir(page, '/aide?etat=erreur', { connecte: ALEX }); await expect(page.getByRole('alert')).toContainText('Impossible de charger l’aide'); await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.locator('[data-question]')).toHaveCount(6);
  });
});

test.describe('contacter l’assistance', () => {
  test('message vide : erreur annoncée, rien n’est enregistré', async ({ page }) => {
    await ouvrir(page, '/aide/contact', { connecte: ALEX });
    await expect(page.getByText('MODE DÉMO — aucun message n’est réellement envoyé')).toBeVisible(); await expect(page.getByText('La réponse sera envoyée à alex.tremblay@exemple.test.')).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer le message' }).click(); await expect(page.getByRole('alert')).toContainText('Écrivez votre message.'); await expect(page.locator('#contact-msg')).toBeFocused(); await expect(page.locator('#contact-msg')).toHaveAttribute('aria-invalid', 'true');
    expect(((await lireEtat(page)).tranches.aide as { demandes?: unknown[] } | undefined)?.demandes ?? []).toHaveLength(0);
  });
  test('envoi simulé : numéro de demande, notification, brouillon vidé', async ({ page }) => {
    await ouvrir(page, '/aide/contact', { connecte: ALEX, preparer: (e) => { alex(e).prefsNotif = 'tout'; } });
    await page.getByLabel('Paiement ou versement').check(); await page.getByLabel('Référence (facultatif)').fill('NXG-7Q2M'); await page.getByLabel('Votre message').fill('Mon versement du 12 oct. n’apparaît pas.');
    await page.screenshot({ path: '/tmp/nxc-contact-1.png' });
    await page.getByRole('button', { name: 'Envoyer le message' }).click(); await expect(page.getByRole('heading', { name: 'Message envoyé (démo)' })).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/Demande AS-[A-Z0-9]{4} \(fictive\)/)).toBeVisible();
    const e = await lireEtat(page); const a = e.tranches.aide as { demandes: { sujet: string; reference: string; message: string }[]; brouillon: { message: string } };
    expect(a.demandes).toHaveLength(1); expect(a.demandes[0]).toMatchObject({ sujet: 'paiement', reference: 'NXG-7Q2M' }); expect(a.brouillon.message).toBe(''); expect(e.monde.notifications[0].titre).toContain('assistance');
    await page.getByRole('button', { name: 'Écrire un autre message' }).click(); await expect(page.getByLabel('Votre message')).toHaveValue('');
    await page.getByLabel('Votre message').fill('autre'); await page.getByRole('button', { name: 'Envoyer le message' }).click(); await page.getByRole('link', { name: 'Retour à l’aide' }).click(); await expect.poll(() => chemin(page)).toBe('/aide');
  });
  test('brouillon conservé au rechargement', async ({ page }) => {
    await ouvrir(page, '/aide/contact', { connecte: ALEX }); await page.getByLabel('Votre message').fill('Brouillon à garder'); await page.getByLabel('Bagage').check(); await lireEtat(page);
    await page.reload(); await expect(page.getByLabel('Votre message')).toHaveValue('Brouillon à garder'); await expect(page.getByLabel('Bagage')).toBeChecked();
  });
  test('hors ligne : brouillon conservé, envoi bloqué', async ({ page, context }) => {
    await ouvrir(page, '/aide/contact', { connecte: ALEX }); await page.getByLabel('Votre message').fill('x'); await context.setOffline(true);
    await expect(page.getByText('Hors ligne : votre brouillon est conservé sur cet appareil.')).toBeVisible(); await page.getByRole('button', { name: 'Envoyer le message' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Message envoyé (démo)' })).toBeHidden(); await context.setOffline(false);
  });
  test('échec d’envoi (?etat=echec) : brouillon conservé, réessayer', async ({ page }) => {
    await ouvrir(page, '/aide/contact?etat=echec', { connecte: ALEX }); await page.getByLabel('Votre message').fill('Bonjour'); await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByRole('alert')).toContainText('Le message n’a pas pu être envoyé.', { timeout: 6000 }); await expect(page.getByLabel('Votre message')).toHaveValue('Bonjour');
    await page.getByRole('button', { name: 'Réessayer' }).click(); await expect(page.getByRole('heading', { name: 'Message envoyé (démo)' })).toBeVisible({ timeout: 6000 });
  });
});

test.describe('responsive et accessibilité', () => {
  const pages = ['/solde', '/compte', '/pass', '/alertes', '/notifications', '/notifications/preferences', '/aide', '/aide/contact'];
  for (const p of pages) {
    test(`${p} : aucun débordement horizontal à 320 px et à 390 px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 }); await ouvrir(page, p, { connecte: ALEX }); await expect(page.locator('main')).toBeVisible(); await page.waitForTimeout(300); expect(await sansDebordement(page)).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await sansDebordement(page)).toBe(true);
    });
  }
  for (const p of ['/solde', '/compte', '/alertes', '/notifications', '/aide']) {
    test(`${p} : les cibles tactiles font au moins 44 px`, async ({ page }) => {
      await ouvrir(page, p, { connecte: ALEX }); await page.waitForTimeout(300);
      const petits = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, a[href], [role="switch"], input[type="checkbox"], input[type="radio"]')].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !(e as HTMLInputElement).closest('label')?.matches('.cp-sw, .cp-choix, .radio, .cp-ligne') && e.closest('.nav') === null && e.closest('.marque') === null && !(e.textContent || '').startsWith('Aller au contenu'); }).map((e) => `${e.tagName} ${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
      expect(petits).toEqual([]);
    });
  }
  test('captures pour comparaison avec les planches', async ({ page }) => {
    for (const [n, r] of [['solde', '/solde'], ['alertes', '/alertes'], ['preferences', '/notifications/preferences'], ['aide', '/aide']] as const) { await ouvrir(page, r, { connecte: ALEX }); await page.waitForTimeout(400); await page.screenshot({ path: `/tmp/nxc-${n}.png` }); await page.evaluate(() => localStorage.clear()); }
  });
});
