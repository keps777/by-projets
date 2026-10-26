import type { Page } from '@playwright/test';
import { chemin, expect, lireEtat, ouvrir, sansDebordement, test } from './aide';
import type { Etat } from '../src/domain/types';

const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187', PAUL = 'ACC-0233';
const ouvrirAlex = (page: Page, route: string, preparer?: (e: Etat) => void) => ouvrir(page, route, { connecte: ALEX, preparer });
/** 13 déc. 11:20 : il reste 6 h 45 avant l'échéance de finalisation (13 déc. 18:05) du droit AE 812. */
const PROCHE = '?maintenant=2026-12-13T11:20', PASSEE = '?maintenant=2026-12-13T19:00';
const brouillon = (versId: string) => (e: Etat) => { e.tranches.transferts = { brouillon: { droitId: 'd-812', versId }, sansCompte: [], invitations: [] }; };
const chercher = async (page: Page, q: string) => { await page.getByLabel('Identifiant NexG-TT ou courriel').fill(q); await page.getByRole('button', { name: 'Chercher' }).click(); };
const continuer = (page: Page, nom: string) => page.getByRole('button', { name: new RegExp(`^Continuer avec ${nom}`) });

test.describe('garde et droit', () => {
  for (const r of ['/transferer/d-812', '/transferer/d-812/sans-compte', '/transferer/d-812/confirmer', '/transferer/d-812/echeance', '/transferer/d-812/fait', '/transferer/d-812/erreur']) {
    test(`sans compte, ${r} renvoie vers l’ouverture`, async ({ page }) => { await ouvrir(page, r); await expect.poll(() => chemin(page)).toBe('/ouverture'); });
  }
  test('le droit d’un autre ou inconnu : « Droit introuvable »', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-8wc2'); await expect(page.getByRole('heading', { name: 'Droit introuvable' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Retour au portefeuille' })).toBeVisible();
    await page.goto('/transferer/d-nexiste-pas/confirmer'); await expect(page.getByRole('heading', { name: 'Droit introuvable' })).toBeVisible();
  });
  test('un droit en vente ne se transfère pas : la raison et la suite', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-hav'); await expect(page.getByRole('heading', { name: 'Ce droit est en vente' })).toBeVisible(); await expect(page.getByText(/Retirez d’abord l’annonce/)).toBeVisible(); await expect(page.getByRole('link', { name: 'Revenir au billet' })).toBeVisible();
  });
});

test.describe('1 · choisir le proche', () => {
  test('textes, mini-billet, proches enregistrés, bouton inactif tant que personne n’est choisi', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812');
    await expect(page.getByText('YUL → CDG')).toBeVisible(); await expect(page.getByText('Aérolys 812 · 18:05')).toBeVisible(); await expect(page.getByText('Statut', { exact: true })).toBeVisible(); await expect(page.getByText('Détenu', { exact: true })).toBeVisible();
    await expect(page.getByText('Étape 1 sur 3 · Choisir le proche')).toBeVisible(); await expect(page.getByRole('heading', { name: 'À qui le transférer ?' })).toBeVisible();
    await expect(page.getByText('Sans vente : votre proche reçoit ce droit sur son compte NexG-TT. Il doit déjà en avoir un.')).toBeVisible(); await expect(page.getByText('Recherche exacte. Nous ne montrons que le prénom et l’initiale du nom.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Proches enregistrés' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Camille T\./ })).not.toBeChecked(); await expect(page.getByRole('radio', { name: /Paul R\./ })).toBeVisible(); await expect(page.getByRole('link', { name: /Marc T\./ })).toContainText('Sans compte NexG-TT');
    const b = page.getByRole('button', { name: 'Continuer', exact: true }); await expect(b).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Choisissez un proche pour continuer.')).toBeVisible();
    await b.click({ force: true }); expect(chemin(page)).toBe('/transferer/d-812');
  });
  test('recherche exacte par identifiant : on ne montre que prénom et initiale, le proche est sélectionné', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await chercher(page, '@ines.moreau');
    await expect(page.getByRole('heading', { name: 'Résultat de la recherche' })).toBeVisible(); const r = page.getByRole('radio', { name: /Inès M\./ }); await expect(r).toBeChecked(); await expect(page.getByText('@ines.moreau')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Moreau'); await expect(page.locator('body')).not.toContainText('514 555');
    await expect(continuer(page, 'Inès M\\.')).toBeVisible();
  });
  test('recherche par courriel, sans « @ » devant l’identifiant, Entrée valide ; un proche déjà enregistré est sélectionné', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await page.getByLabel('Identifiant NexG-TT ou courriel').fill('camille.tremblay'); await page.keyboard.press('Enter');
    await expect(page.getByText('Camille T. est dans vos proches enregistrés')).toBeVisible(); await expect(page.getByRole('radio', { name: /Camille T\./ })).toBeChecked(); await expect(page.getByRole('heading', { name: 'Résultat de la recherche' })).toHaveCount(0);
    await chercher(page, 'ACC-0233'); await expect(page.getByRole('radio', { name: /Paul R\./ })).toBeChecked();
    await chercher(page, 'alex.tremblay@exemple.test'); await expect(page.getByRole('alert').filter({ hasText: 'Vous ne pouvez pas vous transférer ce droit à vous-même.' })).toBeVisible();
  });
  test('rien d’approché : un début d’identifiant ne trouve personne ; invitation proposée', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await chercher(page, '@camille.trem');
    await expect(page.getByText('Aucun compte trouvé pour « @camille.trem »')).toBeVisible(); await expect(page.getByText('Vérifiez l’identifiant, ou invitez ce proche à créer un compte NexG-TT.')).toBeVisible();
    await page.getByRole('link', { name: /Inviter ce proche/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/sans-compte'); await expect(page.getByRole('heading', { name: 'Ce proche n’a pas encore de compte' })).toBeVisible();
  });
  test('vous-même : erreur annoncée avec icône et texte, champ invalide', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await chercher(page, '@alex.tremblay');
    await expect(page.getByLabel('Identifiant NexG-TT ou courriel')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByRole('alert').filter({ hasText: 'vous-même' }).locator('svg')).toBeVisible(); await expect(page.getByRole('button', { name: /^Continuer avec/ })).toHaveCount(0);
  });
  test('choisir un proche enregistré et continuer : brouillon enregistré, écran de confirmation', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await page.getByRole('radio', { name: /Paul R\./ }).check(); await continuer(page, 'Paul R\\.').click();
    await expect.poll(() => chemin(page)).toBe('/transferer/d-812/confirmer'); expect((await lireEtat(page)).tranches.transferts).toMatchObject({ brouillon: { droitId: 'd-812', versId: PAUL } });
    await page.getByRole('link', { name: 'Modifier le proche' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812'); await expect(page.getByRole('radio', { name: /Paul R\./ })).toBeChecked();
  });
  test('clavier : flèches entre les proches, Entrée continue', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await page.getByRole('radio', { name: /Camille T\./ }).focus(); await page.keyboard.press('ArrowDown'); await expect(page.getByRole('radio', { name: /Paul R\./ })).toBeChecked();
    await continuer(page, 'Paul R\\.').focus(); await page.keyboard.press('Enter'); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/confirmer');
  });
  test('hors ligne : « Le transfert exige une connexion », rien n’est modifié, on ne peut pas continuer', async ({ page, context }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await expect(page.getByRole('radio', { name: /Camille T\./ })).toBeEnabled(); await context.setOffline(true);
    await expect(page.getByRole('alert').filter({ hasText: 'Vous êtes hors ligne' })).toContainText('Le transfert exige une connexion. Rien n’est modifié ; reprenez ici une fois reconnecté.');
    await expect(page.getByLabel('Identifiant NexG-TT ou courriel')).toBeDisabled(); await expect(page.getByRole('radio', { name: /Camille T\./ })).toBeDisabled(); await expect(page.getByText('Reconnectez-vous pour continuer.')).toBeVisible();
    await context.setOffline(false); await expect(page.getByLabel('Identifiant NexG-TT ou courriel')).toBeEnabled(); await expect(page.getByText('Vous êtes hors ligne')).toHaveCount(0);
  });
  test('états chargement et vide', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812?etat=chargement'); await expect(page.getByText('Chargement de vos proches…')).toBeVisible(); await expect(page.locator('[aria-busy="true"]')).toBeVisible(); await expect(page.getByText('Chargement en cours…')).toBeVisible();
    await page.goto('/transferer/d-812?etat=vide'); await expect(page.getByText('Aucun proche enregistré pour l’instant')).toBeVisible(); await expect(page.getByText('Cherchez un proche pour continuer.')).toBeVisible();
  });
  test('un compte sans proche enregistré voit l’état vide réel', async ({ page }) => {
    await ouvrir(page, '/transferer/d-r816', { connecte: 'ACC-0301', preparer: (e) => { const d = e.monde.droits.find((x) => x.id === 'd-r816')!; d.statut = 'detenu'; delete d.annonce; } });
    await expect(page.getByText('Aucun proche enregistré pour l’instant')).toBeVisible();
  });
  test('à 390 × 700 : bouton visible, aucun débordement à 320 px ; capture', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/transferer/d-812'); await expect(page.getByRole('heading', { name: 'À qui le transférer ?' })).toBeInViewport(); await expect(page.getByRole('button', { name: 'Continuer', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: '/tmp/nxt/e2e-t1.png' }); await page.setViewportSize({ width: 320, height: 640 }); await chercher(page, '@inconnu'); await expect(page.getByText(/Aucun compte trouvé/)).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('2 · proche sans compte', () => {
  test('inviter Marc T. : courriel invalide, puis invitation simulée ; le droit reste à Alex', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await page.getByRole('link', { name: /Marc T\./ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/sans-compte');
    await expect(page.getByRole('heading', { name: 'Marc T. n’a pas encore de compte' })).toBeVisible(); await expect(page.getByText('Sans compte NexG-TT', { exact: true })).toBeVisible();
    await expect(page.getByText('Un droit ne peut être transféré qu’à un compte NexG-TT.')).toBeVisible(); await expect(page.getByText('Rien n’est transféré : ce droit reste à vous, au statut Détenu.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inviter Marc T.' })).toBeVisible(); await expect(page.getByText('Échéance de finalisation : 13 déc. 18:05. Un proche doit aussi nommer le voyageur avant ce moment.')).toBeVisible(); await expect(page.getByText('[H]')).toBeVisible();
    await page.getByLabel('Courriel de Marc T.').fill('pas-un-courriel'); await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
    await expect(page.getByRole('alert')).toContainText('Saisissez une adresse courriel valide.'); await expect(page.getByLabel('Courriel de Marc T.')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Courriel de Marc T.').fill('marc@exemple.com'); await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
    await expect(page.getByText('Invitation envoyée (démo, aucun courriel réel)')).toBeVisible(); await expect(page.getByText('Revenez ici quand Marc T. aura créé son compte : vous pourrez alors lui transférer ce droit.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Envoyer l’invitation' })).toHaveCount(0);
    const e = await lireEtat(page); expect((e.tranches.transferts as { invitations: { courriel: string }[] }).invitations.map((i) => i.courriel)).toEqual(['marc@exemple.com']); expect(e.monde.droits.find((d) => d.id === 'd-812')).toMatchObject({ detenteurId: ALEX, statut: 'detenu' }); expect(e.monde.transferts).toEqual([]);
    await page.getByRole('link', { name: 'Revenir au billet' }).click(); await expect.poll(() => chemin(page)).toBe('/droit/d-812');
  });
  test('un courriel déjà inscrit est refusé avec la raison ; « Choisir un autre proche » revient au choix', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812'); await page.getByRole('link', { name: /Marc T\./ }).click(); await page.getByLabel('Courriel de Marc T.').fill('alex.tremblay@exemple.test'); await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Un compte existe déjà pour ce courriel'); await page.getByRole('link', { name: 'Choisir un autre proche' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812');
  });
  test('une invitation déjà envoyée est rappelée ; à 390 × 700 et 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/transferer/d-812'); await page.getByRole('link', { name: /Marc T\./ }).click(); await expect(page.getByRole('button', { name: 'Envoyer l’invitation' })).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('heading', { name: /n’a pas encore de compte/ })).toBeInViewport();
    await page.screenshot({ path: '/tmp/nxt/e2e-t2.png' }); await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
    await page.getByLabel('Courriel de Marc T.').fill('marc@exemple.com'); await page.keyboard.press('Enter'); await expect(page.getByText('Invitation envoyée')).toBeVisible(); await page.goto('/transferer/d-812'); await page.getByRole('link', { name: /Marc T\./ }).click(); await expect(page.getByText('Invitation envoyée')).toBeVisible();
  });
});

test.describe('3 · confirmer et transférer', () => {
  test('récapitulatif, double barrière : bouton inactif tant que la confirmation n’est pas cochée', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer', brouillon(CAMILLE));
    await expect(page.getByText('Étape 2 sur 3 · Confirmer')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Vérifiez avant de transférer' })).toBeVisible();
    await expect(page.getByLabel('De qui, à qui')).toContainText('Alex T.'); await expect(page.getByLabel('De qui, à qui')).toContainText('Vous, détenteur'); await expect(page.getByLabel('De qui, à qui')).toContainText('Camille T.'); await expect(page.getByLabel('De qui, à qui')).toContainText('@camille.tremblay');
    await expect(page.getByText('Camille T. devient détenteur de ce droit tout de suite.')).toBeVisible(); await expect(page.getByText('Votre statut passe à « Cédé ». Le droit reste dans votre historique.')).toBeVisible(); await expect(page.getByText(/Camille T\. nomme le voyageur avant le 13 déc\. 18:05\./)).toBeVisible(); await expect(page.getByText('Aucune vente : aucun paiement ne passe entre vous.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coût du transfert' })).toBeVisible(); await expect(page.getByText('Frais de transfert').first()).toBeVisible(); await expect(page.getByText('Hypothèse à valider')).toBeVisible(); await expect(page.locator('dd')).toHaveText([/^0\s\$$/, /^0\s\$$/]); await expect(page.getByText('Total à payer')).toBeVisible();
    await expect(page.getByText('Action définitive :', { exact: false })).toBeVisible(); await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toHaveCount(0);
    const b = page.getByRole('button', { name: 'Transférer à Camille T.' }); await expect(b).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Cochez la confirmation pour continuer.')).toBeVisible(); await b.click({ force: true }); expect(chemin(page)).toBe('/transferer/d-812/confirmer');
    await page.getByLabel(/^Je confirme transférer ce droit à Camille T\. \(@camille\.tremblay\)/).check(); await expect(b).not.toHaveAttribute('aria-disabled', 'true'); expect((await lireEtat(page)).monde.transferts).toEqual([]);
  });
  test('sans proche choisi, retour au choix', async ({ page }) => { await ouvrirAlex(page, '/transferer/d-812/confirmer'); await expect.poll(() => chemin(page)).toBe('/transferer/d-812'); });
  test('transférer : droit chez Camille, chaîne « transfert », Transfert enregistré, deux notifications, proche mémorisé', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer', brouillon(CAMILLE));
    await page.getByLabel(/^Je confirme transférer/).check(); await page.getByRole('button', { name: 'Transférer à Camille T.' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/fait');
    const e = await lireEtat(page); const d = e.monde.droits.find((x) => x.id === 'd-812')!;
    expect(d).toMatchObject({ detenteurId: CAMILLE, statut: 'detenu', origine: 'transfert' }); expect(d.chaine.at(-1)).toMatchObject({ type: 'transfert', de: ALEX, vers: CAMILLE });
    expect(e.monde.transferts).toHaveLength(1); expect(e.monde.transferts[0]).toMatchObject({ droitId: 'd-812', de: ALEX, vers: CAMILLE, statut: 'fait' });
    expect(e.monde.notifications.find((n) => n.compteId === ALEX && n.type === 'transfert')?.titre).toBe('Droit transféré à Camille T.');
    expect(e.monde.comptes.find((c) => c.id === CAMILLE)!.prefsNotif).toBe('essentiel'); expect(e.monde.notifications.find((n) => n.compteId === CAMILLE && n.type === 'transfert')?.sous).toBe('Alex T. vous a transféré YUL → CDG. Nommez le voyageur avant le 13 déc. 18:05.');
    await page.goto('/transferer/d-812'); await expect(page.getByRole('heading', { name: 'Droit introuvable' })).toBeVisible();
  });
  test('pas de double transfert : recharger l’écran « fait » ne refait rien ; revenir en arrière non plus', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer', brouillon(PAUL)); await page.getByLabel(/^Je confirme/).check(); await page.getByRole('button', { name: /^Transférer à/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/fait');
    await page.reload(); await expect(page.getByRole('heading', { name: 'Droit transféré à Paul R.' })).toBeVisible(); await page.goto('/transferer/d-812/confirmer'); await expect(page.getByRole('heading', { name: 'Droit introuvable' })).toBeVisible();
    expect((await lireEtat(page)).monde.transferts).toHaveLength(1);
  });
});

test.describe('4 · échéance proche et blocage', () => {
  test('moins de 72 h : le choix mène à /echeance ; compte à rebours, avertissement, deux cases', async ({ page }) => {
    await ouvrirAlex(page, `/transferer/d-812${PROCHE}`); await page.getByRole('radio', { name: /Camille T\./ }).check(); await continuer(page, 'Camille T\\.').click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/echeance');
    await expect(page.getByRole('heading', { name: 'Échéance de finalisation' })).toBeVisible(); await expect(page.getByText(/^Il reste 6 h 4\d · échéance 13 déc\. 18:05$/)).toBeVisible(); await expect(page.getByText('Après l’échéance, plus aucune transaction n’est possible sur ce billet.')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Échéance proche : Camille T. aura peu de temps' })).toBeVisible(); await expect(page.getByText('Seuil de l’avertissement : hypothèse à valider [H].')).toBeVisible();
    await expect(page.getByText(/Camille T\. dispose de 6 h 4\d pour nommer le voyageur, avant le 13 déc\. 18:05\./)).toBeVisible();
    const b = page.getByRole('button', { name: 'Transférer à Camille T.' }); await page.getByLabel(/^Je confirme transférer/).check(); await expect(b).toHaveAttribute('aria-disabled', 'true'); await expect(page.getByText('Cochez les deux confirmations pour continuer.')).toBeVisible();
    await page.getByLabel(/^Je comprends que Camille T\. n’aura que 6 h 4\d pour nommer le voyageur\.$/).check(); await expect(b).not.toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: '/tmp/nxt/e2e-t4.png', fullPage: true }); await b.click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/fait');
    const n = (await lireEtat(page)).monde.notifications.find((x) => x.compteId === CAMILLE && x.type === 'transfert')!; expect(n.sous).toMatch(/Échéance proche : il reste 6 h 4\d\.$/); expect((await lireEtat(page)).monde.transferts[0].note).toBe('Échéance proche');
  });
  test('/confirmer et /echeance se corrigent selon la phase', async ({ page }) => {
    await ouvrirAlex(page, `/transferer/d-812/confirmer${PROCHE}`, brouillon(CAMILLE)); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/echeance');
    await ouvrirAlex(page, '/transferer/d-812/echeance', brouillon(CAMILLE)); // second ouvrir : l'état est déjà écrit, la page est rechargée à l'heure démo
    await page.goto('/transferer/d-812/echeance?maintenant=2026-10-12T09:00'); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/confirmer');
  });
  test('l’échéance tombe pendant que l’écran est ouvert : transfert bloqué, avec la raison, rien n’est transféré', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/echeance?maintenant=2026-12-13T18:04:55', brouillon(CAMILLE)); await expect(page.getByRole('button', { name: /^Transférer à/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'L’échéance est passée' })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/Le 13 déc\. 18:05 est passé : plus aucune transaction n’est possible sur ce billet\./)).toBeVisible(); await expect(page.getByText('Rien n’a été transféré et Camille T. n’a reçu aucun message.')).toBeVisible(); await expect(page.getByRole('button', { name: /Transférer à/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Revenir au billet' })).toBeVisible(); expect((await lireEtat(page)).monde.transferts).toEqual([]);
  });
  test('chargé après l’échéance, le droit est déjà nommé par défaut : il ne se transfère plus', async ({ page }) => {
    await ouvrirAlex(page, `/transferer/d-812${PASSEE}`); await expect(page.getByRole('heading', { name: 'Le voyageur est déjà nommé' })).toBeVisible(); await expect(page.getByText(/Le billet est nominatif/)).toBeVisible(); await expect(page.getByRole('radio')).toHaveCount(0);
    await page.goto('/transferer/d-812/confirmer'); await expect(page.getByRole('heading', { name: 'Le voyageur est déjà nommé' })).toBeVisible(); expect((await lireEtat(page)).monde.transferts).toEqual([]);
  });
});

test.describe('5 · transfert effectué', () => {
  test('annonce, billet « Cédé », ce que reçoit le proche, chaîne de détention', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer', brouillon(CAMILLE)); await page.getByLabel(/^Je confirme/).check(); await page.getByRole('button', { name: /^Transférer à/ }).click();
    await expect(page.getByText('Transfert effectué', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Droit transféré à Camille T.' })).toBeVisible(); await expect(page.getByText('Ce droit est maintenant dans le portefeuille de Camille T. Pour vous, son statut est « Cédé ».')).toBeVisible();
    const billet = page.getByRole('article'); await expect(billet).toContainText('YUL'); await expect(billet).toContainText('CDG'); await expect(billet).toContainText('18:05'); await expect(billet).toContainText('Direct · 7 h 05'); await expect(billet).toContainText('07:10'); await expect(billet).toContainText('Cédé à Camille T.'); await expect(billet).toContainText('Registre NXG-7Q2M');
    await expect(page.getByRole('heading', { name: 'Ce que reçoit Camille T.' })).toBeVisible(); await expect(page.getByText('Aperçu de démo : aucun message réel n’est envoyé.')).toBeVisible(); await expect(page.getByText('Alex T. vous a transféré un droit de voyage')).toBeVisible(); await expect(page.getByText('Droit de voyage reçu')).toBeVisible();
    await expect(page.getByText('Alex T. vous a transféré YUL → CDG. Nommez le voyageur avant le 13 déc. 18:05.')).toBeVisible(); await expect(page.getByText('Si un message tarde, le droit est déjà dans le portefeuille de Camille T. : le transfert ne dépend pas de l’envoi.')).toBeVisible();
    const chaine = page.getByRole('heading', { name: 'Chaîne de détention' }).locator('xpath=ancestor::section[1]'); await expect(chaine).toContainText('Achat neuf'); await expect(chaine).toContainText('Alex T. · 1 000 $'); await expect(chaine).toContainText('Transfert (sans vente)'); await expect(chaine).toContainText('Alex T. → Camille T.'); await expect(chaine).toContainText('Échéance de finalisation'); await expect(chaine).toContainText('Camille T. nomme le voyageur ; ensuite, plus aucune transaction.'); await expect(chaine).toContainText('Départ YUL → CDG');
    await expect(page.getByText('MODE DÉMO — aucun paiement réel')).toHaveCount(0); await page.screenshot({ path: '/tmp/nxt/e2e-t5.png', fullPage: true });
    await page.getByRole('link', { name: 'Retour au portefeuille' }).click(); await expect.poll(() => chemin(page)).toBe('/portefeuille');
  });
  test('sans transfert fait, l’écran le dit ; 320 px sans débordement', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/fait'); await expect(page.getByRole('heading', { name: 'Aucun transfert à afficher' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 }); await page.goto('/transferer/d-812/confirmer'); await expect.poll(() => chemin(page)).toBe('/transferer/d-812'); expect(await sansDebordement(page)).toBe(true);
  });
  test('à 320 px, confirmer, échéance et fait ne débordent pas', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 }); await ouvrirAlex(page, `/transferer/d-812/echeance${PROCHE}`, brouillon(CAMILLE)); await expect(page.getByRole('heading', { name: 'Échéance de finalisation' })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
    await page.getByLabel(/^Je confirme/).check(); await page.getByLabel(/^Je comprends/).check(); await page.getByRole('button', { name: /^Transférer à/ }).click(); await expect(page.getByRole('heading', { name: /Droit transféré/ })).toBeVisible(); expect(await sansDebordement(page)).toBe(true);
  });
});

test.describe('6 · erreur', () => {
  test('échec technique simulé : rien ne change, référence d’incident, réessayer revient à la confirmation', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer?etat=echec', brouillon(CAMILLE)); await page.getByLabel(/^Je confirme/).check(); await page.getByRole('button', { name: /^Transférer à/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/erreur');
    await expect(page.getByText('Transfert non effectué')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Le transfert n’a pas abouti' })).toBeVisible(); await expect(page.getByText('Rien n’a changé : ce droit est toujours à vous et Camille T. n’a reçu aucun message.')).toBeVisible(); await expect(page.getByText('Réessayer ne peut pas transférer le droit deux fois.')).toBeVisible();
    await expect(page.getByText(/^Référence de l’incident : INC-[A-Z0-9]{4} \(démo\)$/)).toBeVisible(); await expect(page.getByRole('heading', { name: 'État du droit' })).toBeVisible(); await expect(page.getByText('Détenu', { exact: true })).toBeVisible(); await expect(page.getByText('Si l’échec persiste, contactez le support en indiquant la référence de l’incident.')).toBeVisible();
    const e = await lireEtat(page); expect(e.monde.droits.find((d) => d.id === 'd-812')!.detenteurId).toBe(ALEX); expect(e.monde.transferts).toEqual([]);
    await page.screenshot({ path: '/tmp/nxt/e2e-t6.png' }); await page.getByRole('link', { name: 'Réessayer le transfert' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/confirmer'); await expect(page.getByRole('button', { name: 'Transférer à Camille T.' })).toBeVisible();
  });
  test('hors ligne au moment de confirmer : erreur « Connexion perdue », droit intact', async ({ page, context }) => {
    await ouvrirAlex(page, '/transferer/d-812/erreur?cas=reseau', brouillon(CAMILLE)); await expect(page.getByRole('heading', { name: 'Connexion perdue' })).toBeVisible(); // écran d'erreur déjà chargé (mis en cache), comme le ferait la PWA hors ligne
    await page.getByRole('link', { name: 'Réessayer le transfert' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/confirmer'); await page.getByLabel(/^Je confirme/).check(); await context.setOffline(true);
    await expect(page.getByRole('alert').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible(); await page.getByRole('button', { name: /^Transférer à/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/erreur');
    await expect(page.getByRole('heading', { name: 'Connexion perdue' })).toBeVisible(); await expect(page.getByText(/Le transfert exige une connexion/).first()).toBeVisible(); await context.setOffline(false); expect((await lireEtat(page)).monde.transferts).toEqual([]);
  });
  test('destinataire dont le compte n’est plus actif : l’échec le dit, on choisit un autre proche', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/confirmer', (e) => { brouillon(CAMILLE)(e); e.monde.comptes.find((c) => c.id === CAMILLE)!.actif = false; });
    await page.getByLabel(/^Je confirme/).check(); await page.getByRole('button', { name: /^Transférer à/ }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812/erreur');
    await expect(page.getByRole('heading', { name: 'Ce proche ne peut pas recevoir le droit' })).toBeVisible(); await expect(page.getByText(/Le compte de Camille T\. n’est pas actif/)).toBeVisible(); await expect(page.getByText(/Référence de l’incident/)).toHaveCount(0);
    await page.getByRole('link', { name: 'Choisir un autre proche' }).click(); await expect.poll(() => chemin(page)).toBe('/transferer/d-812');
  });
  test('droit vendu entre-temps, échéance passée : textes et actions de la maquette (?cas=)', async ({ page }) => {
    await ouvrirAlex(page, '/transferer/d-812/erreur?cas=vendu', brouillon(CAMILLE)); await expect(page.getByRole('heading', { name: 'Ce droit n’est plus disponible' })).toBeVisible(); await expect(page.getByText('Ce droit vient d’être vendu ou cédé pendant que vous confirmiez. Il n’est plus à vous : rien n’a été envoyé à Camille T.')).toBeVisible(); await expect(page.getByText('Un droit ne peut être transféré que s’il est détenu, non nommé et avant l’échéance.')).toBeVisible(); await expect(page.getByRole('link', { name: 'Retour au portefeuille' })).toBeVisible();
    await page.goto('/transferer/d-812/erreur?cas=echeance'); await expect(page.getByRole('heading', { name: 'L’échéance est passée' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Revenir au billet' })).toBeVisible();
    await page.goto('/transferer/d-812/erreur'); await expect(page.getByRole('heading', { name: 'Le transfert n’a pas abouti' })).toBeVisible();
  });
  test('l’écran d’erreur est annoncé (role alert) avec icône et texte ; 390 × 700 : action visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 }); await ouvrirAlex(page, '/transferer/d-812/erreur?cas=technique', brouillon(CAMILLE));
    const a = page.getByRole('alert'); await expect(a.locator('svg').first()).toBeVisible(); await expect(a).toContainText('Transfert non effectué'); await expect(page.getByRole('link', { name: 'Réessayer le transfert' })).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 640 }); expect(await sansDebordement(page)).toBe(true);
  });
});
