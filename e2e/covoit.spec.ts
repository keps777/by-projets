// Covoiturage : l'onglet « application dans l'application » (Voyageur | Conducteur), de la recherche au paiement, de la publication aux avis.
// MAINTENANT = mardi 3 novembre 2026, 07 h. Les offres de démonstration sont générées au démarrage (7 jours) ; le seed a 5 offres Yaoundé → Douala demain (v1 à v5).
import type { Locator, Page } from '@playwright/test';
import { codePriseEnCharge } from '../src/core/covoitRegles';
import type { Etat } from '../src/domain/types';
import { encoder } from '../src/data/codec';
import { aller, CLE, entrerEn, expect, lireEtat, lireMonde, MAINTENANT, ouvrir, personneDe, tailleStockage, test } from './aide';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = (nom: string) => ({ name: `${nom}.png`, mimeType: 'image/png', buffer: PNG });
const carte = (page: Page, nom: RegExp) => page.getByRole('article', { name: nom });
const dialogue = (page: Page, nom: string | RegExp) => page.getByRole('dialog', { name: nom });
/** Le panneau du mode en cours (région nommée « Passager » ou « Conducteur »), et le passage de l'un à l'autre par le bouton flottant. */
const modeEnCours = (page: Page, nom: 'Passager' | 'Conducteur') => page.getByRole('region', { name: nom, exact: true });
const passerEn = async (page: Page, nom: 'Passager' | 'Conducteur') => { await page.locator('.fab').click({ force: true }); await page.getByRole('menuitemradio', { name: new RegExp(nom) }).click(); };
const fermer = (d: Locator) => d.getByRole('button', { name: 'Fermer', exact: true }).click();
async function choisirJour(page: Page, nom: RegExp) { await page.getByRole('button', { name: /^Quand/ }).click(); await dialogue(page, 'Quand pars-tu ?').getByRole('option', { name: nom }).click(); }
/** Débordement horizontal du contenu de la page (`.bd`) et des fenêtres ouvertes (`.feuille`) : le dock partagé à six entrées dépasse seul à 320 px, il n'est pas de ce périmètre. */
const debord = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.bd, .feuille, .corps')].map((n) => n.scrollWidth - n.clientWidth).filter((d) => d > 1));
let relais = 0;
/** Change de personne pour les voyageuses sans accès direct (Marie…) : l'état courant est repris tel quel avec une autre session, puis la page est rechargée sur `chemin`. */
async function devenir(page: Page, personneId: string, chemin: string) {
  const e = await lireEtat(page), p = personneDe(personneId); Object.assign(e.session, { personneId: p.id, role: p.role, derniereActivite: Date.parse(MAINTENANT), vuTuto: true });
  await page.addInitScript(({ cle, valeur, drapeau }) => { try { if (!sessionStorage.getItem(drapeau)) { localStorage.setItem(cle, valeur); sessionStorage.setItem(drapeau, '1'); } } catch { /* stockage indisponible */ } }, { cle: CLE, valeur: encoder(e as never), drapeau: `am.relais.${++relais}` });
  await page.goto(`${chemin}?maintenant=${MAINTENANT}`);
}
/** Profil conducteur complet déjà enregistré pour Aïcha (pour les tests qui ne portent pas sur le formulaire). */
const profilAicha = (e: Etat) => { (e.tranches as Record<string, unknown>).route = { conducteurs: { 'p-aicha': { identite: { numero: '112233445', recto: '', verso: '' }, permis: { numero: 'CE123456', validite: '2029-01-01' }, vehicule: { marque: 'Toyota', modele: 'Yaris', couleur: 'Blanc', plaque: 'CE 100 AA', places: 3, carrosserie: 'citadine', photos: [] }, statut: 'verifie', soumisLe: 0, telVerifie: true, trajets: 12, depuis: '2025-01', nbAvis: 0, fumeur: false, clim: true, femmes: false } } }; };

test('l’onglet est vivant dès l’ouverture : 7 jours d’offres, plusieurs axes, stockage maîtrisé', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-aicha' });
  await expect(page.getByRole('heading', { name: 'Covoiturage' })).toBeVisible();
  await expect(modeEnCours(page, 'Passager')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /trajets?/ })).toContainText(/\d+ trajets?/);
  const m = await lireMonde(page), inter = m.covoits.filter((o) => !o.enVille), jours = new Set(inter.map((o) => o.jour));
  expect(inter.length).toBeGreaterThanOrEqual(15); expect(jours.size).toBe(7);
  const axes = new Set(inter.map((o) => `${o.de}>${o.vers}`)); for (const a of ['Yaoundé>Douala', 'Yaoundé>Bafoussam', 'Douala>Kribi', 'Douala>Bafoussam']) expect(axes.has(a), a).toBe(true);
  expect(m.covoits.some((o) => o.enVille && ['Bastos', 'Essos', 'Biyem-Assi'].includes(o.de))).toBe(true); expect(m.covoits.some((o) => o.enVille && ['Akwa', 'Bonapriso', 'Makepe'].includes(o.de))).toBe(true);
  expect(new Set(m.covoits.map((o) => o.conducteurId)).size).toBeGreaterThanOrEqual(10); expect(new Set(m.covoits.map((o) => o.id)).size).toBe(m.covoits.length);
  expect(await tailleStockage(page)).toBeLessThan(400_000);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Covoiturage' })).toBeVisible();
  expect((await lireMonde(page)).covoits).toHaveLength(m.covoits.length); // pas de doublon au redémarrage
});

test('recherche : villes, date, filtres rapides, inversion, état vide engageant', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-aicha' });
  await expect(page.getByRole('button', { name: /^Départ/ })).toContainText('Yaoundé'); await expect(page.getByRole('button', { name: /^Arrivée/ })).toContainText('Douala');
  await choisirJour(page, /^Demain/);
  await expect(carte(page, /Moussa K\..*05:00/)).toBeVisible(); await expect(carte(page, /Boris T\..*17:00/)).toBeVisible();
  // filtres rapides
  await page.getByRole('button', { name: 'Tôt', exact: true }).click();
  await expect(carte(page, /Moussa K\..*05:00/)).toBeVisible(); await expect(carte(page, /Boris T\./)).toHaveCount(0);
  await page.getByRole('button', { name: 'Tôt', exact: true }).click();
  await page.getByRole('button', { name: 'Entre femmes' }).click(); await expect(carte(page, /Moussa K\./)).toHaveCount(0); await page.getByRole('button', { name: 'Entre femmes' }).click();
  await page.getByLabel('Trier par').selectOption('prix');
  const prix = await page.locator('article .ttl.t20').allInnerTexts(); const n = prix.map((t) => Number(t.replace(/\D/g, ''))); expect(n).toEqual([...n].sort((a, b) => a - b));
  // sélecteur d'arrivée en fenêtre, puis inversion
  await page.getByRole('button', { name: /^Arrivée/ }).click(); await dialogue(page, 'Ville d’arrivée').getByRole('option', { name: /Bafoussam/ }).click();
  await expect(page.getByRole('button', { name: /^Arrivée/ })).toContainText('Bafoussam');
  await page.getByRole('button', { name: 'Inverser départ et arrivée' }).click(); await expect(page.getByRole('button', { name: /^Départ/ })).toContainText('Bafoussam');
  // aucun trajet : état vide + invitation à publier
  await page.getByRole('button', { name: /^Départ/ }).click(); await dialogue(page, 'Ville de départ').getByRole('option', { name: /Kribi/ }).click();
  await choisirJour(page, /^Tous les jours/);
  await expect(page.getByText('Aucun trajet : publie le tien !')).toBeVisible(); await expect(page.getByRole('button', { name: 'Je conduis' }).first()).toBeVisible();
  // dans la ville : bascule animée, quartiers
  await page.getByRole('tab', { name: 'Dans la ville' }).click(); await expect(page.getByRole('tab', { name: 'Dans la ville' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Départ/ })).toContainText('Partout'); await expect(carte(page, /vers (Essos|Mokolo|Omnisports)/).first()).toBeVisible();
});

test('réserver 2 places → paiement → billet de covoiturage → partage, appel, annulation avec règle de remboursement', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-aicha' });
  await choisirJour(page, /^Demain/);
  await carte(page, /Jean-Paul N\..*10:00/).getByRole('button', { name: /Voir et réserver/ }).click();
  const fiche = dialogue(page, 'Jean-Paul Nana'); await expect(fiche).toBeVisible();
  for (const t of ['Itinéraire', 'Véhicule', 'Règles du trajet', 'Points de rencontre', 'Avis des voyageurs']) await expect(fiche.getByText(t, { exact: true })).toBeVisible();
  await expect(fiche.getByText('profil vérifié')).toBeVisible(); await expect(fiche.getByText('téléphone vérifié')).toBeVisible(); await expect(fiche.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+237670000117');
  await expect(fiche.getByText('La plaque complète s’affiche après ta réservation.')).toBeVisible();
  await fiche.getByRole('button', { name: 'Une place de plus' }).click();
  await fiche.getByRole('button', { name: 'Réserver · 10 000 F' }).click();
  await expect(page).toHaveURL(/\/paiement\?covoit=v3&places=2/);
  await page.getByRole('button', { name: /^Payer 10 000 F/ }).click(); await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/covoit$/);
  // la réservation est en tête : billet, statut, code, places
  await expect(page.getByRole('group', { name: /Billet de covoiturage Yaoundé vers Douala/ })).toBeVisible(); await expect(page.getByText('Confirmé', { exact: true })).toBeVisible();
  const code = (await page.locator('.code').innerText()).trim(); expect(code).toBe(codePriseEnCharge('v3', 'p-aicha'));
  await expect(page.getByText('à donner au conducteur en montant')).toBeVisible();
  const m = await lireMonde(page); expect(m.covoits.find((o) => o.id === 'v3')!.reservations).toMatchObject([{ voyageurId: 'p-aicha', places: 2 }]);
  // suivre : appeler le conducteur, partager en direct, SOS
  await page.getByRole('button', { name: 'Suivre mon voyage' }).click(); const suivi = dialogue(page, 'Suivre mon voyage'); await expect(suivi).toBeVisible();
  await expect(suivi.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+237670000117'); await expect(suivi.getByText('Départ prévu')).toBeVisible();
  await suivi.getByRole('button', { name: 'Partager mon trajet en direct' }).click(); await expect(suivi.getByRole('button', { name: /Partage en direct actif/ })).toBeVisible();
  await suivi.getByRole('button', { name: 'SOS' }).click(); await expect(suivi.getByRole('alertdialog')).toBeVisible(); await suivi.getByRole('button', { name: 'Envoyer l’alerte' }).click();
  expect((await lireEtat(page)).monde.evenements.some((e) => e.type === 'sos')).toBe(true); await fermer(suivi);
  // partager par WhatsApp
  await page.getByRole('button', { name: 'Partager', exact: true }).click(); await expect(dialogue(page, 'Partager mon covoiturage').getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/); await fermer(dialogue(page, 'Partager mon covoiturage'));
  // moto-taxi vers le point de rencontre
  await page.getByRole('button', { name: 'Moto-taxi vers le point de rencontre' }).click(); await dialogue(page, /Moto-taxi/).getByRole('button', { name: /^Commander/ }).click(); await expect(dialogue(page, /Moto-taxi/).getByText('Moto commandé')).toBeVisible(); await fermer(dialogue(page, /Moto-taxi/));
  // problème
  await page.getByRole('button', { name: 'Problème' }).click(); const pb = dialogue(page, 'Signaler un problème'); await pb.getByRole('radio', { name: 'Le conducteur est en retard' }).click(); await pb.getByRole('button', { name: 'Envoyer le signalement' }).click();
  expect((await lireEtat(page)).tranches.route).toMatchObject({ signalementsCovoit: [{ offreId: 'v3', auteurId: 'p-aicha', motif: 'Le conducteur est en retard' }] });
  // annuler : la règle de remboursement est expliquée ; plus de 24 h avant = intégral
  await page.getByRole('button', { name: 'Annuler', exact: true }).click(); const an = dialogue(page, 'Annuler ma réservation');
  await expect(an.getByText('Plus de 24 h avant le départ : remboursement intégral').first()).toBeVisible(); await expect(an.locator('.big')).toHaveText('10 000 F');
  await an.getByRole('button', { name: 'Annuler et être remboursé' }).click();
  const apres = await lireEtat(page); expect(apres.monde.covoits.find((o) => o.id === 'v3')!.reservations).toHaveLength(0);
  expect(apres.monde.paiements.filter((p) => p.pour.ids[0] === 'v3' && p.payeurId === 'p-aicha').map((p) => p.statut)).toEqual(['rembourse']);
  await expect(page.getByText('Ton billet de covoiturage')).toBeVisible();
});

test('premier passage en conducteur : profil obligatoire, publier en 3 étapes avec aide au prix, trajet complet avec avis', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-maman' });
  await passerEn(page, 'Conducteur');
  const profil = dialogue(page, 'Mon profil conducteur'); await expect(profil).toBeVisible(); await expect(profil.getByText('Obligatoire pour publier un trajet')).toBeVisible();
  // validation : rien n'avance sans les champs obligatoires
  await profil.getByRole('button', { name: 'Continuer' }).click(); await expect(profil.getByText(/Numéro de carte d’identité : 8 à 12 chiffres/)).toBeVisible(); await expect(profil.getByText('Ajoute la photo du recto de ta carte.')).toBeVisible();
  await profil.getByLabel('Numéro de carte d’identité').fill('112233445'); await profil.getByLabel('Photographier le recto').setInputFiles(photo('recto')); await profil.getByLabel('Photographier le verso').setInputFiles(photo('verso'));
  await expect(profil.getByRole('img', { name: /Aperçu : recto/ })).toBeVisible(); await profil.getByRole('button', { name: 'Continuer' }).click();
  await profil.getByLabel('Numéro de permis de conduire').fill('CE-123456'); await profil.getByLabel('Date de validité').fill('2020-01-01'); await profil.getByRole('button', { name: 'Continuer' }).click(); await expect(profil.getByText('Ton permis n’est plus valide.')).toBeVisible();
  await profil.getByLabel('Date de validité').fill('2029-05-01'); await profil.getByRole('button', { name: 'Continuer' }).click();
  await profil.getByLabel('Marque').fill('Toyota'); await profil.getByLabel('Modèle').fill('Yaris'); await profil.getByLabel('Plaque d’immatriculation').fill('12'); await profil.getByRole('button', { name: 'Continuer' }).click();
  await expect(profil.getByText('Plaque au format LT 123 AB.')).toBeVisible(); await expect(profil.getByText('Choisis la couleur.')).toBeVisible();
  await profil.getByLabel('Plaque d’immatriculation').fill('ce 100 aa'); await profil.getByRole('button', { name: 'Blanc' }).click(); await profil.getByRole('radio', { name: /Citadine/ }).click(); await profil.getByRole('button', { name: 'Continuer' }).click();
  await profil.getByRole('button', { name: 'Enregistrer mon profil' }).click(); await expect(profil.getByText('Ajoute au moins une photo du véhicule.')).toBeVisible();
  await profil.getByLabel('Ajouter une photo du véhicule').setInputFiles(photo('vehicule')); await expect(profil.getByRole('img', { name: 'Photo du véhicule 1' })).toBeVisible();
  await profil.getByRole('button', { name: 'Enregistrer mon profil' }).click(); await expect(profil).toHaveCount(0);
  // on reste en mode Conducteur : badge de vérification, véhicule 3D, trajet vide
  await expect(modeEnCours(page, 'Conducteur')).toBeVisible(); await expect(page.getByText('profil en vérification')).toBeVisible();
  await expect(page.getByRole('figure', { name: /Toyota Yaris, plaque CE 100 AA : 0 place occupée sur 3/ })).toBeVisible(); await expect(page.getByText('Publie ton premier trajet')).toBeVisible();
  const p = ((await lireEtat(page)).tranches.route as { conducteurs: Record<string, { vehicule: { plaque: string; carrosserie: string; photos: string[] }; statut: string }> }).conducteurs['p-maman'];
  expect(p).toMatchObject({ statut: 'en_verification', vehicule: { plaque: 'CE 100 AA', carrosserie: 'citadine' } }); expect(p.vehicule.photos).toHaveLength(1);
  // publier : 3 étapes
  await page.getByRole('button', { name: 'Ajouter un trajet' }).click(); const pub = dialogue(page, 'Ajouter un trajet'); await expect(pub).toBeVisible(); await expect(pub.getByText('Étape 1 sur 3 · Trajet')).toBeVisible();
  await pub.getByLabel('Point de départ (quartier)').fill('Mvan'); await pub.getByRole('button', { name: 'Continuer' }).click();
  await expect(pub.getByText('Étape 2 sur 3 · Quand')).toBeVisible(); await pub.getByLabel('Heure de départ').fill('09:30'); await pub.getByRole('button', { name: 'Moins de places' }).click(); await pub.getByRole('button', { name: 'Continuer' }).click();
  await expect(pub.getByText('Conseillé : 3 500 F – 5 000 F')).toBeVisible(); await expect(pub.getByText('Commission AfriMove (10 %)')).toBeVisible(); await expect(pub.getByText('4 050 F').first()).toBeVisible();
  await pub.getByRole('button', { name: 'Augmenter le prix' }).click(); await pub.getByRole('button', { name: 'Augmenter le prix' }).click(); await pub.getByRole('button', { name: 'Augmenter le prix' }).click(); await expect(pub.getByText(/Prix élevé/)).toBeVisible();
  await pub.getByRole('button', { name: 'Baisser le prix' }).click(); await pub.getByRole('button', { name: 'Baisser le prix' }).click(); await pub.getByRole('button', { name: 'Baisser le prix' }).click(); await expect(pub.getByText(/Bon prix : dans la fourchette/)).toBeVisible();
  await pub.getByRole('button', { name: 'Publier le trajet' }).click(); await expect(pub.getByText('Trajet publié', { exact: true })).toBeVisible(); await pub.getByRole('button', { name: 'Voir mes trajets' }).click();
  const o = (await lireMonde(page)).covoits.find((x) => x.conducteurId === 'p-maman')!; expect(o).toMatchObject({ jour: '2026-11-04', heure: '09:30', places: 2, prix: 4500, de: 'Yaoundé', vers: 'Douala', vehicule: 'Toyota Yaris', depart: 'Mvan', statut: 'ouverte', enVille: false });
  await expect(page.getByRole('group', { name: 'Mes trajets' }).or(page.getByLabel('Mon trajet')).first()).toBeVisible(); await expect(page.getByText('Net après la commission d’AfriMove (10 %)')).toBeVisible();

  // Aïcha réserve ce trajet et paie
  await entrerEn(page, 'p-aicha'); await aller(page, '/covoit'); await expect(modeEnCours(page, 'Passager')).toBeVisible();
  await carte(page, /Marie N\..*09:30/).getByRole('button', { name: /Voir et réserver/ }).click(); await dialogue(page, 'Marie Ndiba').getByRole('button', { name: 'Réserver · 4 500 F' }).click();
  await expect(page).toHaveURL(new RegExp(`/paiement\\?covoit=${o.id}&places=1`)); await page.getByRole('button', { name: /^Payer 4 500 F/ }).click(); await page.getByRole('button', { name: /Simuler la validation MTN/ }).click();
  await expect(page).toHaveURL(/\/covoit$/); const codeAicha = (await page.locator('.code').innerText()).trim();

  // Marie voit son véhicule 3D avec 1 place occupée, vérifie le code, démarre, termine et reçoit son gain
  await devenir(page, 'p-maman', '/covoit/conduire');
  await expect(page.getByRole('figure', { name: /1 place occupée sur 2/ })).toBeVisible(); await expect(page.getByText(/1 \/ 2 places? réservée/)).toBeVisible();
  await page.getByRole('button', { name: 'Suivre mon voyage' }).click(); const gestion = dialogue(page, 'Suivre mon voyage');
  await gestion.getByLabel('Code de prise en charge de Aïcha').fill('0000'); await gestion.getByRole('button', { name: 'Vérifier' }).click(); await expect(gestion.getByText('Ce code ne correspond pas.')).toBeVisible();
  await gestion.getByLabel('Code de prise en charge de Aïcha').fill(codeAicha); await gestion.getByRole('button', { name: 'Vérifier' }).click(); await expect(gestion.getByText('monté · code validé')).toBeVisible();
  await gestion.getByRole('button', { name: 'Démarrer le trajet' }).click(); await expect(gestion.getByText('En route', { exact: true })).toBeVisible(); await gestion.getByRole('button', { name: 'Terminer le trajet' }).click();
  await expect(gestion.getByText('4 050 F versés sur MoMo')).toBeVisible();
  await gestion.getByRole('button', { name: 'Noter Aïcha' }).click(); const avisP = dialogue(page, 'Comment était Aïcha ?'); await avisP.getByRole('radio', { name: '5 étoiles' }).click(); await avisP.getByRole('button', { name: 'Taguer' }).or(avisP.getByRole('button', { name: 'Ponctuel' })).first().click(); await avisP.getByRole('button', { name: 'Envoyer mon avis' }).click();
  await expect(gestion.getByText('avis donné')).toBeVisible(); await fermer(gestion);
  await expect(page.getByLabel('Gains du mois')).toContainText('4 050 F');

  // Aïcha note la conductrice : sa note passe à 4
  await entrerEn(page, 'p-aicha'); await aller(page, '/covoit'); await expect(page.getByText('Terminé', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Comment s’est passé ton trajet/ }).click(); const avis = dialogue(page, 'Comment était Marie ?'); await avis.getByRole('button', { name: 'Envoyer mon avis' }).click(); await expect(avis.getByText('Choisis une note de 1 à 5 étoiles.')).toBeVisible();
  await avis.getByRole('radio', { name: '4 étoiles' }).click(); await avis.getByRole('button', { name: 'Conduite sûre' }).click(); await avis.getByRole('button', { name: 'Envoyer mon avis' }).click(); await expect(avis).toHaveCount(0);
  const fin = await lireEtat(page); expect(fin.monde.personnes.find((x) => x.id === 'p-maman')!.note).toBe(4); expect(fin.monde.personnes.find((x) => x.id === 'p-aicha')!.note).toBe(5);
  expect((fin.tranches.route as { avisCovoit: unknown[]; versements: unknown[] })).toMatchObject({ avisCovoit: [{ role: 'passager', note: 5 }, { role: 'conducteur', note: 4, tags: ['Conduite sûre'] }], versements: [{ personneId: 'p-maman', montant: 4050 }] });
  await expect(page.getByRole('button', { name: /Comment s’est passé ton trajet/ })).toHaveCount(0);
});

test('un conducteur partenaire (Moussa) publie ; la voyageuse réserve ; il termine et reçoit son gain net de 10 %', async ({ page }) => {
  await ouvrir(page, '/covoit/conduire', { connecte: 'p-moussa' });
  await expect(page.locator('.fab')).toHaveCount(0); // un partenaire n'a que le panneau Conducteur, donc pas de bouton de changement de mode
  await expect(page.getByRole('figure', { name: /Toyota Corolla, plaque CE 482 KM/ })).toBeVisible(); await expect(page.getByText('profil vérifié')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un trajet' }).click(); const pub = dialogue(page, 'Ajouter un trajet');
  await pub.getByLabel('Point de départ (quartier)').fill('Mvolyé'); await pub.getByRole('button', { name: 'Continuer' }).click();
  await pub.getByLabel('Heure de départ').fill('11:45'); await pub.getByRole('button', { name: 'Continuer' }).click(); await pub.getByRole('button', { name: 'Publier le trajet' }).click(); await pub.getByRole('button', { name: 'Voir mes trajets' }).click();
  const offre = (await lireMonde(page)).covoits.find((o) => o.conducteurId === 'p-moussa' && o.heure === '11:45' && o.jour === '2026-11-04')!; expect(offre).toMatchObject({ places: 3, prix: 4500, depart: 'Mvolyé', statut: 'ouverte' });
  await entrerEn(page, 'p-aicha'); await aller(page, '/covoit'); await choisirJour(page, /^Demain/);
  await carte(page, /Moussa K\..*11:45/).getByRole('button', { name: /Voir et réserver/ }).click(); await dialogue(page, 'Moussa Kaba').getByRole('button', { name: 'Réserver · 4 500 F' }).click();
  await page.getByRole('button', { name: /^Payer 4 500 F/ }).click(); await page.getByRole('button', { name: /Simuler la validation MTN/ }).click(); await expect(page).toHaveURL(/\/covoit$/);
  const m = await lireMonde(page); expect(m.paiements.find((p) => p.id === m.covoits.find((o) => o.id === offre.id)!.reservations[0].paiementId)).toMatchObject({ statut: 'ok', montant: 4500, payeurId: 'p-aicha', pour: { type: 'covoit' } });
  expect(m.notifications.some((n) => n.destId === 'p-moussa' && n.titre === 'Nouvelle réservation')).toBe(true); expect(m.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Covoiturage confirmé')).toBe(true);
  await entrerEn(page, 'p-moussa'); await aller(page, '/covoit/conduire'); await page.getByRole('button', { name: /mer\. 4 nov\. · 11:45/ }).click(); await page.getByRole('button', { name: 'Suivre mon voyage' }).click(); const g = dialogue(page, 'Suivre mon voyage');
  await expect(g.getByText('Aïcha Ndiba')).toBeVisible(); await g.getByRole('button', { name: 'Démarrer le trajet' }).click(); await g.getByRole('button', { name: 'Terminer le trajet' }).click(); await expect(g.getByText(/4 050 F versés sur MoMo/)).toBeVisible();
  const e = await lireEtat(page); expect(e.monde.covoits.find((x) => x.id === offre.id)!.statut).toBe('terminee');
  expect((e.tranches.route as { versements: { offreId: string; personneId: string; montant: number }[] }).versements).toContainEqual(expect.objectContaining({ offreId: offre.id, personneId: 'p-moussa', montant: 4050 }));
});

test('bouton flottant Passager | Conducteur : choix, balayage, mémorisé, plus de sélecteur en haut', async ({ page }) => {
  await ouvrir(page, '/covoit', { connecte: 'p-aicha', preparer: profilAicha });
  await expect(page.getByRole('tablist', { name: 'Mode du covoiturage' })).toHaveCount(0); // plus de sélecteur en en-tête
  const fab = page.locator('.fab');
  await expect(modeEnCours(page, 'Passager')).toContainText('Réserver un covoiturage'); await expect(fab).toContainText('Je conduis');
  // le bouton ouvre le choix, le mode courant est coché
  await fab.click({ force: true }); await expect(page.getByRole('menu', { name: 'Mon rôle en covoiturage' })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /Passager/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  await passerEn(page, 'Conducteur'); await expect(modeEnCours(page, 'Conducteur')).toContainText('Publie ton premier trajet'); await expect(fab).toContainText('Je voyage');
  await passerEn(page, 'Passager'); await expect(modeEnCours(page, 'Passager')).toBeVisible(); await expect(fab).toContainText('Je conduis');
  // balayage horizontal sur la page (vers la gauche : Conducteur, vers la droite : Passager)
  const balayer = async (de: number, vers: number, y: number) => { await page.mouse.move(de, y); await page.mouse.down(); await page.mouse.move((de + vers) / 2, y + 4, { steps: 4 }); await page.mouse.move(vers, y + 6, { steps: 4 }); await page.mouse.up(); };
  await balayer(330, 90, 420); await expect(modeEnCours(page, 'Conducteur')).toBeVisible(); await balayer(70, 330, 640); await expect(modeEnCours(page, 'Passager')).toBeVisible();
  // un défilement vertical n'est pas un balayage
  await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(204, 300, { steps: 6 }); await page.mouse.up(); await expect(modeEnCours(page, 'Passager')).toBeVisible();
  // mémorisation : après rechargement, Aïcha repart en Conducteur
  await passerEn(page, 'Conducteur'); await page.reload(); await expect(modeEnCours(page, 'Conducteur')).toBeVisible();
  expect(((await lireEtat(page)).tranches.route as { modesCovoit: Record<string, string> }).modesCovoit).toEqual({ 'p-aicha': 'conducteur' });
  // liens profonds : « Je conduis » et « En ville »
  await aller(page, '/covoit/conduire'); await expect(modeEnCours(page, 'Conducteur')).toBeVisible();
  await aller(page, '/covoit/ville'); await expect(page.getByRole('tab', { name: 'Dans la ville' })).toHaveAttribute('aria-selected', 'true');
});

test('/moi/conducteur : même profil, une fois enregistré retour sur Covoiturage en mode Conducteur', async ({ page }) => {
  await ouvrir(page, '/moi', { connecte: 'p-aicha' });
  await page.getByRole('link', { name: /Mon profil conducteur/ }).click(); await expect(page).toHaveURL(/\/moi\/conducteur$/);
  await page.getByLabel('Numéro de carte d’identité').fill('223344556'); await page.getByLabel('Photographier le recto').setInputFiles(photo('r')); await page.getByLabel('Photographier le verso').setInputFiles(photo('v')); await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Numéro de permis de conduire').fill('LT-998877'); await page.getByLabel('Date de validité').fill('2030-02-01'); await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Marque').fill('Kia'); await page.getByLabel('Modèle').fill('Sportage'); await page.getByLabel('Plaque d’immatriculation').fill('LT 555 BB'); await page.getByRole('button', { name: 'Gris' }).click(); await page.getByRole('radio', { name: /SUV/ }).click();
  await page.getByRole('button', { name: 'Plus de places passagers' }).click(); await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Ajouter une photo du véhicule').setInputFiles(photo('veh')); await page.getByRole('button', { name: 'Enregistrer mon profil' }).click();
  await expect(page).toHaveURL(/\/covoit$/); await expect(modeEnCours(page, 'Conducteur')).toBeVisible(); await expect(page.getByRole('figure', { name: /Kia Sportage, plaque LT 555 BB : 0 place occupée sur 4/ })).toBeVisible();
  // on peut ensuite tout modifier
  await aller(page, '/moi/conducteur'); await expect(page.getByLabel('Numéro de carte d’identité')).toHaveValue('223344556'); await expect(page.getByRole('img', { name: /Aperçu : recto/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click(); await expect(page.getByLabel('Numéro de permis de conduire')).toHaveValue('LT-998877'); await page.getByRole('button', { name: 'Continuer' }).click(); await expect(page.getByLabel('Plaque d’immatriculation')).toHaveValue('LT 555 BB');
});

test('à 320 px, aucun débordement : voyageur avec réservation, conducteur avec trajet, fenêtres ouvertes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await ouvrir(page, '/covoit', { connecte: 'p-aicha', preparer: (e) => { profilAicha(e); const o = e.monde.covoits.find((x) => x.id === 'v2')!; e.monde.paiements.push({ id: 'pay-cv', ts: 0, montant: o.prix, moyen: 'momo', statut: 'ok', ref: 'M', canal: 'app', payeurId: 'p-aicha', pour: { type: 'covoit', ids: ['v2'] } }); o.reservations.push({ voyageurId: 'p-aicha', places: 1, paiementId: 'pay-cv' }); } });
  await expect(page.locator('.holo')).toBeVisible(); expect(await debord(page), 'débordement (px)').toEqual([]);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(dialogue(page, 'Annuler ma réservation')).toBeVisible(); expect(await debord(page), 'débordement (px)').toEqual([]); await fermer(dialogue(page, 'Annuler ma réservation'));
  await passerEn(page, 'Conducteur'); await expect(page.locator('.cv-v3d')).toBeVisible(); expect(await debord(page), 'débordement (px)').toEqual([]);
  await page.getByRole('button', { name: 'Ajouter un trajet' }).click(); await expect(dialogue(page, 'Ajouter un trajet')).toBeVisible(); expect(await debord(page), 'débordement (px)').toEqual([]);
});

test('menu déroulant et liste « Mes covoiturages » : choisir la réservation affichée en haut', async ({ page }) => {
  const reserver = (e: Etat, id: string) => { const o = e.monde.covoits.find((x) => x.id === id)!; e.monde.paiements.push({ id: `pay-${id}`, ts: 0, montant: o.prix, moyen: 'momo', statut: 'ok', ref: 'M', canal: 'app', payeurId: 'p-aicha', pour: { type: 'covoit', ids: [id] } }); o.reservations.push({ voyageurId: 'p-aicha', places: 1, paiementId: `pay-${id}` }); };
  await ouvrir(page, '/covoit', { connecte: 'p-aicha', preparer: (e) => { reserver(e, 'v3'); reserver(e, 'v2'); } });
  const billet = page.getByRole('group', { name: /Billet de covoiturage/ }), menu = page.getByRole('button', { name: /^Mon covoiturage/ });
  await expect(billet).toContainText('07:30'); await expect(menu).toHaveAttribute('aria-expanded', 'false'); // le plus proche d'abord
  await menu.click(); await expect(menu).toHaveAttribute('aria-expanded', 'true'); const liste = page.getByRole('listbox', { name: 'Mon covoiturage' }); await expect(liste.getByRole('option')).toHaveCount(2);
  await liste.getByRole('option', { name: /10:00/ }).click(); await expect(menu).toHaveAttribute('aria-expanded', 'false'); await expect(billet).toContainText('10:00'); await expect(billet).toContainText('Jean-Paul'.slice(0, 4));
  // clavier : flèches puis Entrée, Échap referme
  await menu.focus(); await page.keyboard.press('ArrowDown'); await expect(menu).toHaveAttribute('aria-expanded', 'true'); await page.keyboard.press('Escape'); await expect(menu).toHaveAttribute('aria-expanded', 'false');
  // la liste du bas sélectionne aussi
  await page.getByRole('button', { name: /^Yaoundé → Douala mer\. 4 nov\. · 07:30/ }).click(); await expect(billet).toContainText('07:30'); await expect(page.getByRole('button', { name: /07:30 · 4 500 F/ })).toHaveAttribute('aria-current', 'true');
});
