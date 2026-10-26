import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412', SOPHIE = 'ACC-0301', CAMILLE = 'ACC-0187';
const CAPTURES = process.env.NX_CAPTURES ?? '/tmp';
const NB = ' ';
const ordre = (e: Etat, id: string) => e.monde.ordres.find((o) => o.id === id)!;
const droit = (e: Etat, id: string) => e.monde.droits.find((d) => d.id === id)!;
const compte = (e: Etat, id: string) => e.monde.comptes.find((c) => c.id === id)!;
const bouton = (page: Page, nom: RegExp | string) => page.getByRole('button', { name: nom });
/** Le titre de l'écran (cadre `Ecran` sans onglet : texte du bandeau haut). */
const titre = (page: Page, nom: string) => page.locator('.t-ecran-c').filter({ hasText: nom });
const lien = (page: Page, nom: RegExp | string) => page.getByRole('link', { name: nom });
/** Une intention d'achat d'une autre voyageuse (Camille) sur HAV, compatible avec le billet en vente d'Alex (d-hav, 620 $, plafond 650 $). */
const intentionHAV = (e: Etat) => { e.monde.intentions.push({ id: 'INT-9HAV', compteId: CAMILLE, de: 'YUL', vers: 'HAV', volId: 'v-no156', budget: 600, fondsReserves: 600, creeLe: Date.parse('2026-10-11T09:00'), statut: 'publiee', propositions: [] }); };
/** Le départ est dans moins de deux jours : plus d'ordre possible. */
const departProche = (e: Etat) => { const v = e.monde.vols.find((x) => x.id === 'v-ae816')!; v.jour = '2026-10-13'; v.heureDepart = '20:00'; };

test.describe('garde d’accès', () => {
  for (const r of ['/cours/v-ae816', '/ordre/v-ae816', '/liquidite/d-812', '/revendre/d-812', '/marche-intentions', '/marche-intentions/proposer/INT-9HAV', '/marche-intentions/issue/INT-9HAV']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
});

test.describe('cours du vol', () => {
  test('meilleure offre, repères, carnet cumulé et décompte viennent du monde simulé', async ({ page }) => {
    await ouvrir(page, '/cours/v-ae816', { connecte: ALEX });
    await expect(titre(page, 'Cours du vol')).toBeVisible();
    await expect(page.getByTestId('meilleure-offre')).toHaveText(`1${NB}500${NB}$`);
    await expect(page.getByText('Aérolys 816')).toBeVisible(); await expect(page.getByText(/ven\.\s18/).first()).toBeVisible();
    await expect(page.getByText('Offre 26,8 % sous le neuf')).toBeVisible(); await expect(page.getByText('Règle provisoire')).toBeVisible();
    const offres = page.getByRole('list', { name: 'Offres de vente' }).getByRole('listitem');
    await expect(offres).toHaveCount(4); await expect(offres.nth(3)).toContainText('Meilleure'); await expect(offres.nth(3)).toContainText(`1${NB}500${NB}$`); await expect(offres.nth(3)).toContainText('×1');
    const demandes = page.getByRole('list', { name: 'Demandes d’achat' }).getByRole('listitem');
    await expect(demandes).toHaveCount(2); await expect(demandes.first()).toContainText(`1${NB}450${NB}$`); await expect(demandes.first()).toContainText('Meilleure');
    await expect(page.getByText(/Écart\s+50\s\$\s·\s3,3\s%/)).toBeVisible();
    await expect(page.getByText(/J-67/)).toBeVisible(); await expect(page.getByText(/les échanges s’arrêtent le 17\sdéc\.\sà 18:05/)).toBeVisible();
    await expect(page.getByText(/Aucune offre ne peut dépasser le plafond de 2\s050\s\$/)).toBeVisible(); await expect(page.getByText('Aucune transaction sur ce vol')).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/marche-cours.png`, fullPage: true });
  });
  test('un autre vol affiche ses propres données (transactions issues des chaînes)', async ({ page }) => {
    await ouvrir(page, '/cours/v-ae410', { connecte: ALEX });
    await expect(page.getByText('Aérolys 410')).toBeVisible(); await expect(page.getByTestId('meilleure-offre')).toHaveText('—'); await expect(page.getByText(/Aucune annonce de revente/)).toBeVisible();
    await expect(page.getByText('Aucune offre de vente en ce moment.')).toBeVisible();
    const lignes = page.getByRole('table').getByRole('row'); await expect(lignes).toHaveCount(3);
    await expect(lignes.nth(1)).toContainText(`1${NB}850${NB}$`); await expect(lignes.nth(1)).toContainText(`+50${NB}$`); await expect(lignes.nth(2)).toContainText(`1${NB}800${NB}$`);
    await expect(lien(page, /Acheter/)).toContainText(`1${NB}790${NB}$`);
  });
  test('les périodes changent le graphique, le tableau alternatif donne les valeurs', async ({ page }) => {
    await ouvrir(page, '/cours/v-ae816', { connecte: ALEX });
    const g = page.getByRole('img', { name: /Meilleure offre sur 7 jours/ }); await expect(g).toBeVisible(); await expect(bouton(page, '1S')).toHaveAttribute('aria-pressed', 'true');
    for (const [p, txt] of [['1M', /sur 1 mois/], ['3M', /sur 3 mois/], ['Tout', /depuis le/]] as const) { await bouton(page, p).click(); await expect(bouton(page, p)).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('img', { name: txt })).toBeVisible(); }
    await page.getByText('Voir les valeurs en tableau').click();
    const tab = page.locator('details.alt table'); await expect(tab.getByRole('columnheader', { name: 'Meilleure offre' })).toBeVisible(); await expect(tab.getByRole('row').last()).toContainText(`2${NB}050${NB}$`);
  });
  test('l’alerte se bascule au clavier et se garde', async ({ page }) => {
    await ouvrir(page, '/cours/v-ae816', { connecte: ALEX });
    const cloche = bouton(page, 'Alerte de prix sur ce vol'); await expect(cloche).toHaveAttribute('aria-pressed', 'false'); await cloche.focus(); await page.keyboard.press('Enter');
    await expect(cloche).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByText('Alerte activée : vous serez prévenu si la meilleure offre change.')).toBeVisible();
    await expect.poll(async () => JSON.stringify((await lireEtat(page)).tranches.marche)).toContain(`${ALEX}:v-ae816`);
    await page.reload(); await expect(bouton(page, 'Alerte de prix sur ce vol')).toHaveAttribute('aria-pressed', 'true');
  });
  test('Placer un ordre, Acheter et les intentions mènent aux bons écrans', async ({ page }) => {
    await ouvrir(page, '/cours/v-ae816', { connecte: ALEX });
    await lien(page, 'Placer un ordre').click(); await expect.poll(() => chemin(page)).toBe('/ordre/v-ae816'); await page.goBack();
    await expect(lien(page, /Acheter/)).toContainText(`1${NB}500${NB}$`); await lien(page, /Acheter/).click(); await expect.poll(() => chemin(page)).toBe('/paiement/revente:d-r816'); await page.goBack();
    await lien(page, /Voir les intentions d’achat avec fonds réservés/).click(); await expect.poll(() => chemin(page)).toBe('/marche-intentions');
  });
  test('vol inconnu : écran explicatif', async ({ page }) => { await ouvrir(page, '/cours/v-zzz', { connecte: ALEX }); await expect(page.getByRole('alert')).toContainText('Vol introuvable'); });
  test('première vue à 390 × 700 : prix et actions visibles ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/cours/v-ae816', { connecte: ALEX });
    await expect(page.getByTestId('meilleure-offre')).toBeInViewport({ ratio: 1 }); await expect(page.getByText(/mis à jour à/)).toBeInViewport(); await expect(lien(page, 'Placer un ordre')).toBeInViewport({ ratio: 1 }); await expect(lien(page, /Acheter/)).toBeInViewport({ ratio: 1 });
    const prix = await page.getByTestId('meilleure-offre').boundingBox(), pied = await lien(page, 'Placer un ordre').boundingBox(); expect(prix!.y + prix!.height).toBeLessThan(pied!.y);
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('ordre à cours limité', () => {
  test('seuil par défaut, boutons ±10 $, curseur, écart signé, zone et probabilité', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX });
    await expect(titre(page, 'Ordre à cours limité')).toBeVisible(); await expect(page.getByText('YUL → CDG')).toBeVisible();
    const seuil = page.getByTestId('seuil'); await expect(seuil).toHaveText(`1${NB}450${NB}$`);
    await expect(page.getByText(/−50\s\$\s\(−3,3\s%\)\ssous la meilleure offre/)).toBeVisible();
    await bouton(page, 'Monter le seuil de 10 $').click(); await expect(seuil).toHaveText(`1${NB}460${NB}$`); await bouton(page, 'Baisser le seuil de 10 $').click(); await bouton(page, 'Baisser le seuil de 10 $').click(); await expect(seuil).toHaveText(`1${NB}440${NB}$`);
    const range = page.getByLabel(/Ajuster le seuil/); await expect(range).toHaveAttribute('min', '1000'); await expect(range).toHaveAttribute('max', '2050'); await expect(range).toHaveAttribute('step', '10');
    await range.focus(); await page.keyboard.press('ArrowRight'); await expect(seuil).toHaveText(`1${NB}450${NB}$`);
    await expect(page.getByText('Meilleure offre de vente actuelle')).toBeVisible(); await expect(page.getByText(/D’autres demandes sont mieux placées \(1\s450\s\$\)/)).toBeVisible(); await bouton(page, 'Monter le seuil de 10 $').click(); await expect(page.getByText(/Votre seuil devient la meilleure demande du carnet, devant 1\s450\s\$/)).toBeVisible(); await bouton(page, 'Baisser le seuil de 10 $').click();
    await bouton(page, /Jusqu’à J-2/).click(); await expect(page.getByText(/Jusqu’à J-2 · 16\sdéc\.\sà 18:05/)).toBeVisible();
    await expect(page.getByText('Carte de test').first()).toBeVisible(); await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toBeVisible();
    await expect(page.getByRole('img', { name: /Probabilité d’exécution estimée : \d+ %/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/marche-ordre.png`, fullPage: true });
  });
  test('le seuil ne dépasse jamais le plafond', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX });
    const seuil = page.getByTestId('seuil'), range = page.getByLabel(/Ajuster le seuil/); await range.focus(); await page.keyboard.press('End');
    await expect(seuil).toHaveText(`2${NB}050${NB}$`); await expect(bouton(page, 'Monter le seuil de 10 $')).toHaveAttribute('aria-disabled', 'true'); await bouton(page, 'Monter le seuil de 10 $').click({ force: true }); await expect(seuil).toHaveText(`2${NB}050${NB}$`);
    await expect(page.getByText(/l’achat serait exécuté tout de suite/)).toBeVisible();
    await range.focus(); await page.keyboard.press('Home'); await expect(seuil).toHaveText(`1${NB}000${NB}$`); await expect(bouton(page, 'Baisser le seuil de 10 $')).toHaveAttribute('aria-disabled', 'true');
  });
  test('placer l’ordre : confirmation, ordre actif listé puis annulé', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: SOPHIE });
    await bouton(page, 'Monter le seuil de 10 $').click(); await bouton(page, /Placer l’ordre à/).click();
    await expect(page.getByTestId('confirmation-ordre')).toContainText(`Ordre placé à 1${NB}460${NB}$`);
    let e = await lireEtat(page); const o = e.monde.ordres.find((x) => x.compteId === SOPHIE)!; expect(o).toMatchObject({ volId: 'v-ae816', limite: 1460, validite: 'semaine', statut: 'actif' });
    await bouton(page, 'Placer un autre ordre').click(); await expect(page.getByText('Mes ordres actifs sur ce vol')).toBeVisible();
    await bouton(page, new RegExp(`Annuler l’ordre à 1\\s460`)).click(); await expect(page.getByText('Ordre à 1 460 $ annulé.', { exact: false })).toBeAttached();
    await expect.poll(async () => ordre(await lireEtat(page), o.id).statut).toBe('annule');
  });
  test('un seuil au niveau d’une revente achète tout de suite via acheter()', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: CAMILLE });
    await page.getByLabel(/Ajuster le seuil/).fill('1500'); await expect(page.getByTestId('seuil')).toHaveText(`1${NB}500${NB}$`);
    await bouton(page, /Placer l’ordre à/).click(); await expect(page.getByTestId('confirmation-ordre')).toContainText('Ordre exécuté');
    const e = await lireEtat(page); expect(droit(e, 'd-r816')).toMatchObject({ detenteurId: CAMILLE, prixPaye: 1500, statut: 'detenu' }); expect(compte(e, SOPHIE).solde).toBe(1500 - 187.5);
    await lien(page, 'Voir mon droit').click(); await expect.poll(() => chemin(page)).toBe('/confirmation/d-r816');
  });
  test('l’ordre existant d’Alex est listé et annulable ; une annonce à son seuil l’exécute au chargement', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX, preparer: (e) => { droit(e, 'd-r816').annonce!.prix = 1440; } });
    await page.waitForTimeout(300); let e = await lireEtat(page); expect(ordre(e, 'o-1').statut).toBe('execute'); expect(droit(e, 'd-r816')).toMatchObject({ detenteurId: ALEX, prixPaye: 1440 });
    await expect(page.getByText('Mes ordres actifs sur ce vol')).toHaveCount(0);
  });
  test('hors ligne : le bouton est désactivé ; trop près du départ : écran explicatif', async ({ page, context }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX }); await context.setOffline(true); await expect(bouton(page, /Placer l’ordre à/)).toBeDisabled(); await context.setOffline(false);
  });
  test('à moins de deux jours du départ, aucun ordre', async ({ page }) => {
    await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX, preparer: departProche }); await expect(page.getByRole('alert')).toContainText('Ordre impossible'); await expect(lien(page, 'Voir le cours du vol')).toBeVisible();
  });
  test('première vue à 390 × 700 : seuil et action visibles ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/ordre/v-ae816', { connecte: ALEX });
    await expect(page.getByTestId('seuil')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /Placer l’ordre à/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('vendre ou attendre', () => {
  test('annonce par défaut : estimation, délai, net après commission Pass, comparaison', async ({ page }) => {
    await ouvrir(page, '/liquidite/d-812', { connecte: ALEX });
    await expect(titre(page, 'Options de vente')).toBeVisible(); await expect(page.getByText(/lun\.\s14\sdéc\.\s2026 · Aérolys · vol 812/)).toBeVisible();
    await expect(page.getByTestId('estimation')).toHaveText(`≈ 1${NB}640${NB}$`); await expect(page.getByTestId('net')).toHaveText(`1${NB}476${NB}$`); await expect(page.getByText(/ente estimée sous 4 jours/).first()).toBeVisible();
    await expect(page.getByText(/commission\s−164\s\$\s\(10\s%\s·\sPass/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Rachat instantané/ })).toContainText(`1${NB}280${NB}$`); await expect(page.getByRole('button', { name: /Annonce au marché/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Alex T\. est membre Pass/)).toBeVisible(); await expect(page.getByText(/Échéance le 13\sdéc\.\sà 18:05/)).toBeVisible();
    await expect(page.getByRole('img', { name: /Courbe indicative/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/marche-liquidite.png`, fullPage: true });
  });
  test('le curseur de patience change de mode au clavier', async ({ page }) => {
    await ouvrir(page, '/liquidite/d-812', { connecte: ALEX });
    const c = page.getByLabel('Curseur de patience'); await c.focus(); await page.keyboard.press('Home');
    await expect(page.getByTestId('estimation')).toHaveText(`1${NB}280${NB}$`); await expect(page.getByText('Montant fixe de l’offre de rachat')).toBeVisible(); await expect(page.getByRole('button', { name: /Accepter le rachat/ })).not.toHaveClass(/sec/);
    await page.keyboard.press('End'); await expect(page.getByText(/Attendre\s*:/).first()).toBeVisible(); await expect(page.getByText(/J-7 · 7\sdéc\./)).toBeVisible();
    expect(await c.getAttribute('aria-valuetext')).toContain('Attendre jusqu’au');
  });
  test('accepter le rachat : confirmation avant, versement net sur le solde, droit racheté', async ({ page }) => {
    await ouvrir(page, '/liquidite/d-812', { connecte: ALEX });
    await page.getByRole('button', { name: /Rachat instantané/ }).click(); await bouton(page, /Accepter le rachat/).click();
    await expect(page.getByRole('dialog', { name: 'Accepter le rachat ?' })).toContainText('définitive'); await bouton(page, 'Confirmer le rachat').click();
    await expect(page.getByTestId('rachat-fait')).toContainText(`+1${NB}280${NB}$`);
    const e = await lireEtat(page); expect(droit(e, 'd-812')).toMatchObject({ statut: 'rachete', detenteurId: 'nexgtt' }); expect(droit(e, 'd-812').chaine.at(-1)).toMatchObject({ type: 'rachat', prix: 1280 });
    expect(compte(e, ALEX).solde).toBe(1152 + 1280); expect(e.monde.ecritures.at(-1)).toMatchObject({ type: 'rachat', montant: 1280, droitId: 'd-812' });
    await lien(page, 'Retour au portefeuille').click(); await expect.poll(() => chemin(page)).toBe('/portefeuille');
  });
  test('garder son droit depuis la confirmation ne change rien', async ({ page }) => {
    await ouvrir(page, '/liquidite/d-812', { connecte: ALEX }); await bouton(page, /Accepter le rachat/).click(); await bouton(page, 'Garder mon droit').click();
    await expect(page.getByRole('dialog')).toHaveCount(0); expect(droit(await lireEtat(page), 'd-812').statut).toBe('detenu');
  });
  test('Mettre en vente mène à Revendre avec le prix estimé', async ({ page }) => {
    await ouvrir(page, '/liquidite/d-812', { connecte: ALEX }); await lien(page, 'Mettre en vente').click(); await expect.poll(() => chemin(page)).toBe('/revendre/d-812'); await expect(page.getByTestId('prix')).toHaveText(`1${NB}640${NB}$`);
  });
  for (const [titre, url, compteId, attendu, preparer] of [
    ['voyageur nommé', '/liquidite/d-8wc2', CAMILLE, 'Voyageur déjà nommé', undefined], ['droit gelé', '/liquidite/d-gele', 'ACC-0402', 'Droit gelé', undefined],
    ['échéance passée', '/liquidite/d-812', ALEX, 'Échéance passée', (e: Etat) => { const v = e.monde.vols.find((x) => x.id === 'v-ae812')!; v.jour = '2026-10-12'; v.heureDepart = '20:00'; }], ['droit d’un autre', '/liquidite/d-812', CAMILLE, 'Ce droit n’est pas à vous', undefined]
  ] as const) test(`écran explicatif : ${titre}`, async ({ page }) => { await ouvrir(page, url, { connecte: compteId, preparer }); await expect(page.getByRole('alert')).toContainText(attendu); await expect(lien(page, 'Voir mon portefeuille')).toBeVisible(); });
  test('première vue à 390 × 700 ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/liquidite/d-812', { connecte: ALEX });
    await expect(page.getByRole('heading', { name: 'Vendre maintenant ou attendre ?' })).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /Accepter le rachat/)).toBeInViewport({ ratio: 1 }); await expect(lien(page, 'Mettre en vente')).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('revendre', () => {
  test('prix suggéré, ce que vous recevez (commission Pass), écart signé avec le prix payé', async ({ page }) => {
    await ouvrir(page, '/revendre/d-812', { connecte: ALEX });
    await expect(titre(page, 'Revendre')).toBeVisible(); await expect(page.getByText('Aérolys 812 · 18:05')).toBeVisible();
    await expect(page.getByTestId('prix')).toHaveText(`1${NB}640${NB}$`); await expect(page.getByText(/360\s\$\ssous le prix équivalent neuf \(2\s000\s\$\)/)).toBeVisible(); await expect(page.getByText('Appliquée')).toBeVisible();
    await expect(page.getByText('Suggestion · estimation')).toBeVisible(); await expect(page.getByText('vente estimée sous 4 jours')).toBeVisible();
    await expect(page.getByTestId('commission')).toHaveText(`−164${NB}$`); await expect(page.getByTestId('net')).toHaveText(`1${NB}476${NB}$`); await expect(page.getByTestId('diff')).toHaveText(`+476${NB}$`);
    await expect(page.getByText(/Retrait automatique de l’annonce à J-1 \(13\sdéc\.\sà 18:05\)/)).toBeVisible(); await expect(page.getByText('Membre Pass · vous')).toBeVisible(); await expect(page.getByTestId('rang')).toHaveText('Seule annonce sur ce vol');
    await expect(bouton(page, /Mettre en vente à/)).toContainText(`1${NB}640${NB}$`);
    await page.screenshot({ path: `${CAPTURES}/marche-revendre.png`, fullPage: true });
  });
  test('le curseur, le champ, et le plafond : jamais au-dessus de 2 000 $, ni 0', async ({ page }) => {
    await ouvrir(page, '/revendre/d-812', { connecte: ALEX });
    const prix = page.getByTestId('prix'), champ = page.locator('#prix-champ'), curseur = page.getByLabel('Prix de vente, curseur');
    await expect(curseur).toHaveAttribute('max', '2000'); await curseur.focus(); await page.keyboard.press('End'); await expect(prix).toHaveText(`2${NB}000${NB}$`); await expect(page.getByText('Au plafond : égal au prix équivalent neuf')).toBeVisible();
    await champ.fill('3000'); await champ.blur(); await expect(prix).toHaveText(`2${NB}000${NB}$`); await expect(page.getByRole('alert').filter({ hasText: 'plafond' })).toContainText(/dépasser le plafond/);
    await champ.fill('0'); await champ.blur(); await expect(page.getByRole('alert').filter({ hasText: 'supérieur à 0' })).toBeVisible(); await expect(bouton(page, /Mettre en vente à/)).toBeDisabled();
    await champ.fill('1234'); await champ.blur(); await expect(prix).toHaveText(`1${NB}230${NB}$`); await expect(bouton(page, /Mettre en vente à/)).toBeEnabled();
    await bouton(page, 'Appliquer').click(); await expect(prix).toHaveText(`1${NB}640${NB}$`);
  });
  test('mettre en vente : annonce enregistrée au prix choisi, retrait prévu à J-1', async ({ page }) => {
    await ouvrir(page, '/revendre/d-812', { connecte: ALEX });
    await page.locator('#prix-champ').fill('1500'); await page.locator('#prix-champ').blur(); await expect(page.getByTestId('rang')).toHaveText('Seule annonce sur ce vol');
    await bouton(page, 'Mettre en vente à').or(bouton(page, /Mettre en vente à/)).click();
    await expect(page.getByTestId('vente-faite')).toContainText(`En vente à 1${NB}500${NB}$`); await expect(page.getByTestId('vente-faite')).toContainText(/1\s350\s\$/);
    const e = await lireEtat(page); expect(droit(e, 'd-812')).toMatchObject({ statut: 'en_vente', annonce: { prix: 1500 } });
    await lien(page, 'Voir le cours du vol').click(); await expect.poll(() => chemin(page)).toBe('/cours/v-ae812'); await expect(page.getByTestId('meilleure-offre')).toHaveText(`1${NB}500${NB}$`);
  });
  test('annonces concurrentes et rang : droit en vente, modifier puis retirer', async ({ page }) => {
    await ouvrir(page, '/revendre/d-hav', { connecte: ALEX, preparer: (e) => { e.monde.droits.push({ ...structuredClone(droit(e, 'd-r150')), id: 'd-x1', ref: 'NXG-X1X1', volId: 'v-no156', annonce: { prix: 580, depuis: 1 } }, { ...structuredClone(droit(e, 'd-r150')), id: 'd-x2', ref: 'NXG-X2X2', volId: 'v-no156', annonce: { prix: 640, depuis: 1 } }); } });
    await expect(page.getByText(/Votre droit est en vente à/)).toContainText(`620${NB}$`); await expect(page.getByTestId('prix')).toHaveText(`620${NB}$`); await expect(page.getByTestId('rang')).toHaveText('2e moins chère sur 3');
    await expect(page.getByRole('list').filter({ hasText: 'Votre annonce' }).getByRole('listitem')).toHaveCount(3); await expect(page.getByLabel('Prix de vente, curseur')).toHaveAttribute('max', '650');
    await page.getByLabel('Prix de vente, curseur').focus(); await page.keyboard.press('End'); await expect(page.getByTestId('prix')).toHaveText(`650${NB}$`);
    await bouton(page, /Mettre à jour l’annonce à/).click(); await expect(page.getByTestId('vente-faite')).toContainText('Annonce mise à jour'); expect(droit(await lireEtat(page), 'd-hav').annonce!.prix).toBe(650);
  });
  test('retirer l’annonce', async ({ page }) => {
    await ouvrir(page, '/revendre/d-hav', { connecte: ALEX }); await bouton(page, 'Retirer l’annonce').click(); await expect(page.getByTestId('vente-faite')).toContainText('Annonce retirée');
    const e = await lireEtat(page); expect(droit(e, 'd-hav').statut).toBe('detenu'); expect(droit(e, 'd-hav').annonce).toBeUndefined();
  });
  for (const [titre, url, compteId, attendu] of [['voyageur nommé', '/revendre/d-8wc2', CAMILLE, 'Voyageur déjà nommé'], ['gelé', '/revendre/d-gele', 'ACC-0402', 'Droit gelé'], ['droit d’un autre', '/revendre/d-812', CAMILLE, 'Ce droit n’est pas à vous']] as const)
    test(`écran explicatif : ${titre}`, async ({ page }) => { await ouvrir(page, url, { connecte: compteId }); await expect(page.getByRole('alert')).toContainText(attendu); });
  test('première vue à 390 × 700 : prix, plafond et action ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/revendre/d-812', { connecte: ALEX });
    await expect(page.getByTestId('prix')).toBeInViewport({ ratio: 1 }); await expect(page.getByText(/Plafond 2\s000\s\$/)).toBeInViewport(); await expect(bouton(page, /Mettre en vente à/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
  test('hors ligne : message clair', async ({ page, context }) => {
    await ouvrir(page, '/revendre/d-812', { connecte: ALEX }); await context.setOffline(true); await bouton(page, /Mettre en vente à/).click(); await expect(page.getByRole('alert').filter({ hasText: 'hors ligne' })).toBeVisible(); await context.setOffline(false);
    expect(droit(await lireEtat(page), 'd-812').statut).toBe('detenu');
  });
});

test.describe('intentions d’achat côté vendeur', () => {
  test('sans demande : état vide avec invitation', async ({ page }) => {
    await ouvrir(page, '/marche-intentions', { connecte: ALEX }); await expect(titre(page, 'Intentions d’achat')).toBeVisible(); await expect(page.getByText('Aucune intention d’achat pour l’instant')).toBeVisible(); await expect(lien(page, 'Dire mon prix')).toBeVisible();
    await expect(lien(page, 'Publier ma propre intention d’achat')).toBeVisible();
  });
  test('tableau de la demande : résumé, filtres, tri, marque de compatibilité', async ({ page }) => {
    await ouvrir(page, '/marche-intentions', { connecte: ALEX, preparer: intentionHAV });
    await expect(page.getByTestId('total')).toHaveText('1'); await expect(page.getByText(/de fonds réservés au total/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Mes vols' })).toHaveAttribute('aria-pressed', 'true');
    const rang = lien(page, /Acheteur C\., La Havane, prix maximum 600/); await expect(rang).toBeVisible(); await expect(rang).toContainText(`600${NB}$`); await expect(rang).toContainText('Fonds réservés'); await expect(rang).toContainText(/expire dans 30 j/);
    await expect(rang).toContainText(/Compatible avec votre billet YUL → HAV 30\sjanv\.\s\(en vente à 620\s\$\)/); await expect(rang).toContainText(/YUL → HAV · 27\sjanv\.\s–\s1\sfévr\.\s2027/);
    await page.getByRole('button', { name: 'Europe' }).click(); await expect(page.getByText('Aucune intention pour ce filtre')).toBeVisible(); await page.getByRole('button', { name: 'Caraïbes' }).click(); await expect(rang).toBeVisible();
    await page.getByRole('button', { name: 'Prix max' }).click(); await expect(page.getByRole('button', { name: 'Prix max' })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${CAPTURES}/marche-demandes.png`, fullPage: true });
    await rang.click(); await expect.poll(() => chemin(page)).toBe('/marche-intentions/proposer/INT-9HAV');
  });
  test('Sophie voit l’intention d’Alex sur Paris compatible avec son billet en vente', async ({ page }) => {
    await ouvrir(page, '/marche-intentions', { connecte: SOPHIE }); await expect(page.getByTestId('total')).toHaveText('1'); await expect(lien(page, /Acheteur A\., Paris/)).toContainText(/Compatible avec votre billet YUL → CDG 18\sdéc\./);
  });
  test('vente immédiate au prix maximum de l’acheteur : accord, versement net, billet cédé', async ({ page }) => {
    await ouvrir(page, '/marche-intentions/proposer/INT-9HAV', { connecte: ALEX, preparer: intentionHAV });
    await expect(titre(page, 'Proposer mon billet')).toBeVisible(); await expect(page.getByText('Ce que cherche l’acheteur C.')).toBeVisible(); await expect(page.getByTestId('prix-max')).toHaveText(`600${NB}$`);
    await expect(page.getByText(/accepte automatiquement ≤ 600/)).toBeVisible(); await expect(page.getByText('Dans la fenêtre')).toBeVisible(); await expect(page.getByTestId('net')).toHaveText(`540${NB}$`); await expect(page.getByTestId('chances')).toHaveText('Certaine');
    await expect(page.getByText(/Écart par rapport au prix payé \(480\s\$\)/)).toBeVisible(); await expect(page.getByText(`+60${NB}$`)).toBeVisible();
    await page.screenshot({ path: `${CAPTURES}/marche-proposer.png`, fullPage: true });
    await bouton(page, /Vendre maintenant à/).click(); await expect.poll(() => chemin(page)).toBe('/marche-intentions/issue/INT-9HAV');
    await expect(titre(page, 'Accord conclu')).toBeVisible(); await expect(page.getByText(/Vendu ·/)).toContainText(`600${NB}$`); await expect(page.getByTestId('verse')).toHaveText(`+540${NB}$`); await expect(page.getByText('Référence de l’accord')).toBeVisible();
    const e = await lireEtat(page); expect(droit(e, 'd-hav')).toMatchObject({ detenteurId: CAMILLE, statut: 'detenu', prixPaye: 600 }); expect(e.monde.intentions.find((i) => i.id === 'INT-9HAV')!.statut).toBe('accord'); expect(compte(e, ALEX).solde).toBe(1152 + 540);
    await page.screenshot({ path: `${CAPTURES}/marche-issue-vendu.png`, fullPage: true });
    await lien(page, 'Voir mon solde').click(); await expect.poll(() => chemin(page)).toBe('/solde');
  });
  test('proposition au-dessus du prix maximum : envoyée, décompte de 48 h, retrait possible', async ({ page }) => {
    await ouvrir(page, '/marche-intentions/proposer/INT-9HAV', { connecte: ALEX, preparer: intentionHAV });
    const c = page.getByLabel('Ou un autre prix'); await expect(c).toHaveAttribute('min', '600'); await expect(c).toHaveAttribute('max', '650'); await c.focus(); await page.keyboard.press('End');
    await expect(page.getByTestId('prix-choisi')).toHaveText(`650${NB}$`); await expect(page.getByTestId('chances')).toHaveText('Bonnes'); await expect(page.getByTestId('net')).toHaveText(`585${NB}$`);
    await bouton(page, /Envoyer ma proposition à/).click(); await expect.poll(() => chemin(page)).toBe('/marche-intentions/issue/INT-9HAV');
    await expect(titre(page, 'Proposition envoyée')).toBeVisible(); await expect(page.getByText(/Proposition à\s650\s\$\senvoyée à l’acheteur C\./)).toBeVisible();
    await expect(page.getByTestId('compte-a-rebours')).toHaveText(/^(47|48) h \d\d min \d\d s$/); await expect(page.getByText(/Net reçu si elle est acceptée/).locator('..')).toContainText(`585${NB}$`);
    let e = await lireEtat(page); expect(droit(e, 'd-hav').statut).toBe('en_vente'); expect(e.monde.intentions.find((i) => i.id === 'INT-9HAV')!.propositions).toHaveLength(1);
    await page.screenshot({ path: `${CAPTURES}/marche-issue-envoyee.png`, fullPage: true });
    await bouton(page, 'Retirer ma proposition').click(); await expect.poll(() => chemin(page)).toBe('/marche-intentions');
    e = await lireEtat(page); expect(e.monde.intentions.find((i) => i.id === 'INT-9HAV')!.propositions).toHaveLength(0); expect(droit(e, 'd-hav').statut).toBe('en_vente');
  });
  test('un acheteur sans « au-dessus du prix max » : seule l’offre à son prix', async ({ page }) => {
    await ouvrir(page, '/marche-intentions/proposer/INT-9HAV', { connecte: ALEX, preparer: (e) => { intentionHAV(e); e.tranches.intentions = { details: { 'INT-9HAV': { de: 'YUL', vers: 'HAV', aller: 'simple', du: '2027-01-27', au: '2027-01-31', flexible: true, voyageurs: 1, budget: 600, validite: '30', auto: false, auDessus: false, anonyme: true, expire: Date.parse('2026-12-01T00:00'), source: 'carte' } }, accords: {}, contres: [], fins: {} }; } });
    await expect(page.getByText('L’acheteur ne reçoit que les propositions à son prix maximum ou en dessous.')).toBeVisible(); await expect(page.getByLabel('Ou un autre prix')).toHaveCount(0); await expect(page.getByTestId('chances')).toHaveText('Bonnes');
    await expect(page.getByText('à valider par l’acheteur')).toBeVisible(); await expect(bouton(page, /Envoyer ma proposition à/)).toBeVisible();
  });
  test('sans billet compatible en vente : écran explicatif', async ({ page }) => {
    await ouvrir(page, '/marche-intentions/proposer/INT-9HAV', { connecte: CAMILLE, preparer: intentionHAV }); await expect(page.getByRole('alert')).toContainText('Intention indisponible');
    await ouvrir(page, '/marche-intentions/issue/INT-ZZZZ', { connecte: ALEX }); await expect(page.getByRole('alert')).toBeVisible();
  });
  test('première vue à 390 × 700 de « Proposer mon billet » ; 320 px sans débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrir(page, '/marche-intentions/proposer/INT-9HAV', { connecte: ALEX, preparer: intentionHAV });
    await expect(page.getByTestId('prix-max')).toBeInViewport({ ratio: 1 }); await expect(bouton(page, /Vendre maintenant à/)).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
  test('tableau à 320 px sans débordement', async ({ page }) => { await page.setViewportSize({ width: 320, height: 640 }); await ouvrir(page, '/marche-intentions', { connecte: SOPHIE }); await expect(page.getByTestId('total')).toBeVisible(); expect(await sansDebordement(page)).toBe(true); });
});
