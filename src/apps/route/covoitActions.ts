// Transactions et lectures du covoiturage « application dans l'application » : profil conducteur, démonstration, recherche, réservations,
// annulation, avis, sécurité (partage, SOS), publication de trajets. S'appuie sur app.monde et les primitives de domain/actions.ts.
import { prixCourse, type Mode } from '../../core/course.ts';
import { departOffreMs, erreurOffre, gainConducteur, nomVehicule, placesReservees, placesRestantes, PLACES_MAX, PLACES_MIN } from '../../core/covoit.ts';
import { distanceKm, dureeMin } from '../../core/covoitPrix.ts';
import { genererDemo } from '../../core/covoitDemo.ts';
import { erreursProfil, nomVehiculeProfil, profilComplet, profilDepuisSaisie, statutVerification, type SaisieProfil, type Occupant } from '../../core/covoitProfil.ts';
import { codePriseEnCharge, nouvelleNote, remboursementCovoit, type RemboursementCovoit } from '../../core/covoitRegles.ts';
import type { AvisCovoit, InfoOffre, ProfilConducteur } from '../../core/covoitTypes.ts';
import { ajouterJours, enDate, jourDe } from '../../core/dates.ts';
import { app, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { consigner, notifier, personne } from '../../domain/actions.ts';
import type { OffreCovoit, Paiement } from '../../domain/types.ts';
import { brouillonVide, etat as etatReglement } from '../reglement/etat.ts';
import { libererReservation } from '../reglement/actions.ts';
import { etat, lire, type ModeCovoit, type OptionsCovoit } from './etat.ts';
import { initiales } from '../../core/covoit.ts';

const fr = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const offre = (id: string) => { const o = app.monde.covoits.find((x) => x.id === id); if (!o) throw new Error('offre_inconnue'); return o; };
const paiementOk = (id: string): Paiement | undefined => app.monde.paiements.find((p) => p.id === id && p.statut === 'ok');

// ------------------------------------------------------------------ profil conducteur
export const profilDe = (personneId: string | null | undefined): ProfilConducteur | undefined => (personneId ? lire().conducteurs[personneId] : undefined);
export const profilEstComplet = (personneId: string | null | undefined) => profilComplet(profilDe(personneId));
/** Enregistre (ou met à jour) le profil conducteur : « en vérification » d'abord, puis « vérifié » (simulé). Lève le premier message d'erreur. */
export function enregistrerProfil(personneId: string, s: SaisieProfil, now = maintenant()): ProfilConducteur {
  const err = erreursProfil(s, now), premiere = Object.values(err)[0]; if (premiere) throw new Error(premiere);
  const e = etat(), avant = e.conducteurs[personneId], neuf = profilDepuisSaisie(s, now);
  if (avant) Object.assign(neuf, { statut: avant.statut === 'verifie' && avant.identite.numero === neuf.identite.numero ? 'verifie' : 'en_verification', soumisLe: avant.statut === 'verifie' && avant.identite.numero === neuf.identite.numero ? avant.soumisLe : now, trajets: avant.trajets, nbAvis: avant.nbAvis, depuis: avant.depuis, fumeur: avant.fumeur, clim: avant.clim, femmes: avant.femmes, bio: avant.bio });
  e.conducteurs[personneId] = neuf; const p = personne(personneId); if (p) p.vehicule = neuf.vehicule.modele;
  consigner('covoit', `Profil conducteur enregistré · ${nomVehiculeProfil(neuf)} ${neuf.vehicule.plaque}`, personneId, personneId);
  notifier(personneId, 'Profil conducteur reçu', 'Nous vérifions tes documents, tu peux déjà publier un trajet.', '/covoit/conduire', 'covoit');
  return neuf;
}
export function choisirMode(mode: ModeCovoit, personneId: string) { etat().modesCovoit[personneId] = mode; }
export const modeCovoit = (personneId: string | null | undefined): ModeCovoit => (personneId ? lire().modesCovoit[personneId] : undefined) ?? 'voyageur';

// ------------------------------------------------------------------ démonstration
/** Rend l'onglet vivant : conducteurs, profils et départs des 7 prochains jours, créés s'ils manquent (idempotent) ; purge les anciens départs de démonstration sans réservation. */
export function amorcerCovoit(now = maintenant()): number {
  const d = genererDemo(jourDe(new Date(now)), now), e = etat();
  for (const p of d.conducteurs) if (!personne(p.id)) app.monde.personnes.push({ ...p });
  for (const [id, pr] of Object.entries(d.profils)) if (!e.conducteurs[id]) e.conducteurs[id] = pr;
  const perimes = new Set(app.monde.covoits.filter((o) => o.id.startsWith('cvd-') && o.reservations.length === 0 && departOffreMs(o) < now - 3_600_000).map((o) => o.id));
  if (perimes.size) { app.monde.covoits = app.monde.covoits.filter((o) => !perimes.has(o.id)); for (const id of perimes) delete e.optionsCovoit[id]; }
  const ids = new Set(app.monde.covoits.map((o) => o.id)); let n = 0;
  for (const o of d.offres) if (!ids.has(o.id)) { app.monde.covoits.push(o); n++; }
  return n;
}

// ------------------------------------------------------------------ lectures
export const optionsOffre = (id: string, conducteurId?: string): OptionsCovoit => { const o = lire().optionsCovoit[id]; if (o) return o; const pr = profilDe(conducteurId); return { femmes: !!pr?.femmes, bagages: true, arrets: false, fumeur: pr?.fumeur, clim: pr?.clim }; };
export function infoOffre(o: OffreCovoit, now = maintenant()): InfoOffre {
  const pr = profilDe(o.conducteurId), op = optionsOffre(o.id, o.conducteurId);
  return { note: personne(o.conducteurId)?.note ?? 0, verifie: !!pr && statutVerification(pr, now) === 'verifie', fumeur: op.fumeur ?? pr?.fumeur ?? false, femmes: op.femmes || !!pr?.femmes };
}
export const avisRecus = (id: string, role: AvisCovoit['role'] = 'conducteur') => lire().avisCovoit.filter((a) => a.pourId === id && a.role === role).sort((a, b) => b.ts - a.ts);
export const nbAvisDe = (id: string) => (profilDe(id)?.nbAvis ?? 0) + avisRecus(id).length + avisRecus(id, 'passager').length;
export const trajetsFaits = (id: string) => (profilDe(id)?.trajets ?? 0) + app.monde.covoits.filter((o) => o.conducteurId === id && o.statut === 'terminee').length;
export const aNote = (offreId: string, deId: string, pourId: string) => lire().avisCovoit.some((a) => a.offreId === offreId && a.deId === deId && a.pourId === pourId);
/** Villes (départ ou arrivée) connues du monde : lignes de bus et offres de covoiturage. */
export const villesDuMonde = (): string[] => [...new Set([...app.monde.lignes.flatMap((l) => [l.de, l.vers]), ...app.monde.covoits.filter((o) => !o.enVille).flatMap((o) => [o.de, o.vers])])].sort((a, b) => a.localeCompare(b, 'fr'));
export const offresEntreVilles = () => app.monde.covoits.filter((o) => !o.enVille);
export const offresEnVille = () => app.monde.covoits.filter((o) => o.enVille);
export const occupantsDe = (o: OffreCovoit): Occupant[] => o.reservations.filter((r) => paiementOk(r.paiementId)).map((r) => { const p = personne(r.voyageurId); return { nom: p ? `${p.prenom} ${p.nom}` : 'Passager', initiales: p ? initiales(p.prenom, p.nom) : '?', places: r.places }; });
export const dureeOffre = (o: OffreCovoit) => (o.enVille ? dureeMin(5, true) : dureeMin(distanceKm(o.de, o.vers)));

export type PhaseResa = 'a_venir' | 'en_route' | 'terminee' | 'passee';
export interface Resa { offre: OffreCovoit; voyageurId: string; places: number; paiement: Paiement; montant: number; code: string; phase: PhaseResa }
/** Mes réservations payées : en route, puis à venir (les plus proches d'abord), puis passées (les plus récentes d'abord). */
export function mesReservations(personneId: string | null | undefined, now = maintenant()): Resa[] {
  if (!personneId) return [];
  const l: Resa[] = [];
  for (const o of app.monde.covoits) for (const r of o.reservations) {
    if (r.voyageurId !== personneId) continue; const p = paiementOk(r.paiementId); if (!p) continue;
    const phase: PhaseResa = o.statut === 'en_route' ? 'en_route' : o.statut === 'terminee' ? 'terminee' : departOffreMs(o) < now - 6 * 3_600_000 ? 'passee' : 'a_venir';
    l.push({ offre: o, voyageurId: personneId, places: r.places, paiement: p, montant: p.montant, code: codePriseEnCharge(o.id, personneId), phase });
  }
  const rang = (r: Resa) => (r.phase === 'en_route' ? 0 : r.phase === 'a_venir' ? 1 : 2);
  return l.sort((a, b) => rang(a) - rang(b) || (rang(a) === 2 ? departOffreMs(b.offre) - departOffreMs(a.offre) : departOffreMs(a.offre) - departOffreMs(b.offre)));
}
export const resaActive = (r: Resa) => r.phase === 'a_venir' || r.phase === 'en_route';

/** Mes trajets de conducteur : à venir (ou en route) puis passés. */
export function mesTrajets(personneId: string | null | undefined) {
  const tous = personneId ? app.monde.covoits.filter((o) => o.conducteurId === personneId) : [], par = (a: OffreCovoit, b: OffreCovoit) => departOffreMs(a) - departOffreMs(b);
  return { aVenir: tous.filter((o) => o.statut === 'ouverte' || o.statut === 'en_route').sort(par), passes: tous.filter((o) => o.statut === 'terminee' || o.statut === 'annulee').sort((a, b) => par(b, a)) };
}
export interface GainsCovoit { mois: number; trajets: number; passagers: number; aVenir: number }
/** Gains nets (commission de 10 % déduite) versés ce mois-ci, et ceux attendus des réservations à venir. */
export function gainsDuMois(personneId: string, now = maintenant()): GainsCovoit {
  const mois = jourDe(new Date(now)).slice(0, 7), v = lire().versements.filter((x) => x.personneId === personneId && jourDe(new Date(x.ts)).slice(0, 7) === mois);
  const faits = v.map((x) => app.monde.covoits.find((o) => o.id === x.offreId)).filter((o): o is OffreCovoit => !!o);
  return { mois: v.reduce((s, x) => s + x.montant, 0), trajets: v.length, passagers: faits.reduce((s, o) => s + placesReservees(o), 0), aVenir: mesTrajets(personneId).aVenir.reduce((s, o) => s + gainConducteur(placesReservees(o), o.prix), 0) };
}

// ------------------------------------------------------------------ réserver / annuler
/** Prépare le tunnel de paiement avec le bon nombre de places et renvoie l'adresse de la page de paiement. */
export function preparerPaiement(offreId: string, places: number, personneId: string): string {
  const o = offre(offreId); if (o.statut !== 'ouverte') throw new Error('offre_fermee');
  const n = Math.max(1, Math.min(places, placesRestantes(o) || 1)); if (placesRestantes(o) < 1) throw new Error('complet');
  const e = etatReglement(), a = e.brouillon;
  if (a?.nature === 'covoit' && a.covoitId === offreId) { if (!a.paiementId) a.places = n; }
  else { if (a) libererReservation(a); e.brouillon = brouillonVide({ nature: 'covoit', covoitId: offreId, places: n, tel: personne(personneId)?.tel ?? '' }); }
  return `/paiement?covoit=${offreId}&places=${n}`;
}
/** Remboursement que donnerait l'annulation maintenant. */
export function remboursementAnnulation(r: Resa, now = maintenant()): RemboursementCovoit {
  return remboursementCovoit(r.montant, (departOffreMs(r.offre) - now) / 60_000, r.offre.statut === 'en_route');
}
/** Annule ma réservation (avant le départ) : places rendues, remboursement selon la règle, conducteur prévenu. */
export function annulerReservation(offreId: string, voyageurId: string, now = maintenant()): RemboursementCovoit {
  const o = offre(offreId); if (o.statut !== 'ouverte') throw new Error('trajet_demarre');
  const r = o.reservations.find((x) => x.voyageurId === voyageurId), p = r && paiementOk(r.paiementId); if (!r || !p) throw new Error('reservation_inconnue');
  const rb = remboursementCovoit(p.montant, (departOffreMs(o) - now) / 60_000, false);
  p.statut = 'rembourse'; o.reservations.splice(o.reservations.indexOf(r), 1);
  etat().annulationsCovoit.push({ offreId, voyageurId, paiementId: p.id, rembourse: rb.rembourse, frais: rb.frais, ts: now });
  const moi = personne(voyageurId);
  notifier(voyageurId, 'Réservation annulée', `${fr(rb.rembourse)} remboursés${rb.frais ? ` · ${fr(rb.frais)} de frais` : ''} · ${o.de} → ${o.vers} ${o.heure}`, '/covoit', 'covoit');
  notifier(o.conducteurId, 'Réservation annulée', `${moi?.prenom ?? 'Un voyageur'} a annulé ${r.places} place${r.places > 1 ? 's' : ''} · ${o.de} → ${o.vers} ${o.heure}`, '/covoit/conduire', 'covoit');
  consigner('covoit', `Réservation annulée · ${fr(rb.rembourse)} remboursés`, voyageurId, o.id);
  return rb;
}

// ------------------------------------------------------------------ problème, avis, sécurité
export function signalerCovoit(offreId: string, auteurId: string, motif: string, texte: string, now = maintenant()): string {
  offre(offreId); if (!motif.trim()) throw new Error('motif_requis');
  const id = `S-${100 + lire().signalementsCovoit.length + 1}`; etat().signalementsCovoit.push({ id, offreId, auteurId, motif, texte: texte.trim(), ts: now });
  notifier(auteurId, `Signalement ${id} reçu`, `${motif} · l’équipe AfriMove te répond sous 2 h`, '/covoit', 'covoit');
  for (const p of app.monde.personnes.filter((x) => x.role === 'patron')) notifier(p.id, `Covoiturage signalé ${id}`, `${motif} · ${personne(auteurId)?.prenom ?? ''}`, '/patron', 'covoit');
  consigner('covoit', `Signalement ${id} · ${motif}`, auteurId, offreId); return id;
}
export interface DemandeAvis { offreId: string; deId: string; pourId: string; note: number; tags?: string[]; texte?: string }
/** Note un conducteur (par un passager de ce trajet) ou un passager (par le conducteur), une seule fois, trajet terminé. Met à jour la note de la personne. */
export function noterTrajet(d: DemandeAvis, now = maintenant()): { note: number; nbAvis: number } {
  const o = offre(d.offreId); if (o.statut !== 'terminee') throw new Error('trajet_non_termine');
  if (!Number.isInteger(d.note) || d.note < 1 || d.note > 5) throw new Error('note_invalide');
  const deConducteur = d.deId === o.conducteurId, role: AvisCovoit['role'] = deConducteur ? 'passager' : 'conducteur';
  if (deConducteur ? !o.reservations.some((r) => r.voyageurId === d.pourId) : !(d.pourId === o.conducteurId && o.reservations.some((r) => r.voyageurId === d.deId))) throw new Error('avis_non_autorise');
  if (aNote(d.offreId, d.deId, d.pourId)) throw new Error('deja_note');
  const cible = personne(d.pourId); if (!cible) throw new Error('personne_inconnue');
  const r = nouvelleNote(cible.note, nbAvisDe(d.pourId), d.note); cible.note = r.note;
  etat().avisCovoit.push({ id: nouvelId('av'), offreId: d.offreId, deId: d.deId, pourId: d.pourId, role, note: d.note, tags: d.tags ?? [], texte: (d.texte ?? '').trim(), ts: now });
  notifier(d.pourId, 'Nouvel avis reçu', `${personne(d.deId)?.prenom ?? 'Quelqu’un'} t’a donné ${d.note} ★ pour ${o.de} → ${o.vers}`, deConducteur ? '/covoit' : '/covoit/conduire', 'covoit');
  return r;
}
export const partageActif = (offreId: string, personneId: string | null | undefined) => !!personneId && !!lire().partagesCovoit[`${offreId}:${personneId}`];
/** Partage de ma position en direct (simulé) avec mes proches. */
export function basculerPartage(offreId: string, personneId: string, now = maintenant()): boolean {
  const e = etat(), cle = `${offreId}:${personneId}`, o = offre(offreId);
  if (e.partagesCovoit[cle]) { delete e.partagesCovoit[cle]; return false; }
  e.partagesCovoit[cle] = now; e.alertesCovoit.push({ offreId, personneId, ts: now, type: 'partage' });
  const moi = personne(personneId); for (const id of moi?.prochesIds ?? []) notifier(id, 'Trajet partagé en direct', `${moi?.prenom} voyage ${o.de} → ${o.vers} : suis sa position`, undefined, 'covoit');
  consigner('covoit', 'Partage du trajet en direct', personneId, offreId); return true;
}
/** SOS (simulé) : alerte les proches et l'équipe AfriMove. Renvoie le nombre de personnes prévenues. */
export function declencherSOS(offreId: string, personneId: string, now = maintenant()): number {
  const o = offre(offreId), moi = personne(personneId), dest = new Set<string>([...(moi?.prochesIds ?? []), ...app.monde.personnes.filter((p) => p.role === 'patron').map((p) => p.id)]);
  etat().alertesCovoit.push({ offreId, personneId, ts: now, type: 'sos' });
  for (const id of dest) notifier(id, 'SOS covoiturage', `${moi?.prenom ?? 'Un voyageur'} demande de l’aide · ${o.de} → ${o.vers} ${o.heure}`, id.startsWith('p-') && personne(id)?.role === 'patron' ? '/patron' : undefined, 'sos');
  consigner('sos', `SOS covoiturage ${o.de} → ${o.vers}`, personneId, offreId); return dest.size;
}
/** Le conducteur confirme qu'un passager est monté en vérifiant son code de prise en charge. */
export function confirmerMontee(offreId: string, conducteurId: string, voyageurId: string, code: string): boolean {
  const o = offre(offreId); if (o.conducteurId !== conducteurId) throw new Error('pas_ton_trajet');
  if (code.trim() !== codePriseEnCharge(offreId, voyageurId)) return false;
  const e = etat(); if (!e.montesCovoit[offreId]) e.montesCovoit[offreId] = []; if (!e.montesCovoit[offreId].includes(voyageurId)) e.montesCovoit[offreId].push(voyageurId); return true;
}
export const estMonte = (offreId: string, voyageurId: string) => !!lire().montesCovoit[offreId]?.includes(voyageurId);
/** Commande (simulée) d'une moto ou d'un taxi jusqu'au point de rencontre. */
export function commanderMotoRencontre(offreId: string, personneId: string, mode: Mode, now = maintenant()) {
  const o = offre(offreId), prix = prixCourse(mode, 3);
  etat().motosCovoit[`${offreId}:${personneId}`] = { mode, prix, point: o.depart, ts: now };
  consigner('course', `Course ${mode} vers le point de rencontre ${o.depart} · ${fr(prix)}`, personneId, offreId); return prix;
}
export const motoRencontre = (offreId: string, personneId: string | null | undefined) => (personneId ? lire().motosCovoit[`${offreId}:${personneId}`] : undefined);

// ------------------------------------------------------------------ publier
export interface SaisiePublication { enVille: boolean; de: string; vers: string; point: string; jour: string; heure: string; places: number; prix: number; recurrent: boolean }
export const PRIX_VILLE = { min: 200, max: 3000 };
const estSemaine = (jour: string) => { const d = enDate(jour).getDay(); return d >= 1 && d <= 5; };
/** Jours d'une publication : le jour choisi, ou (récurrent) les 5 prochains jours de semaine (lundi au vendredi) à partir de lui. */
export function joursDePublication(jour: string, recurrent: boolean): string[] {
  if (!recurrent) return [jour];
  const l: string[] = []; for (let i = 0; l.length < 5 && i < 14; i++) { const j = ajouterJours(jour, i); if (estSemaine(j)) l.push(j); } return l;
}
/** Publie un trajet (ou une série lundi-vendredi) avec le véhicule du profil. Exige un profil complet. Les jours déjà passés d'une série sont sautés. */
export function publierTrajets(s: SaisiePublication, conducteurId: string, options: OptionsCovoit, now = maintenant()): OffreCovoit[] {
  const profil = profilDe(conducteurId); if (!profilComplet(profil)) throw new Error('Complète d’abord ton profil conducteur.');
  if (s.places < PLACES_MIN || s.places > Math.min(PLACES_MAX, profil.vehicule.places)) throw new Error(`Ton véhicule propose ${profil.vehicule.places} place${profil.vehicule.places > 1 ? 's' : ''} au maximum.`);
  if (s.enVille && (s.prix < PRIX_VILLE.min || s.prix > PRIX_VILLE.max)) throw new Error(`Le prix en ville va de ${PRIX_VILLE.min} à ${PRIX_VILLE.max.toLocaleString('fr-FR')} F.`);
  const veh = nomVehiculeProfil(profil), jours = joursDePublication(s.jour, s.recurrent), creees: OffreCovoit[] = []; let premiereErreur: string | null = null;
  const serie = s.recurrent ? nouvelId('serie') : '';
  for (const jour of jours) {
    const err = erreurOffre({ de: s.de, vers: s.vers, jour, heure: s.heure, places: s.places, prix: s.enVille ? 2000 : s.prix, vehicule: veh }, now);
    if (err) { premiereErreur ??= err; continue; }
    const o: OffreCovoit = { id: nouvelId('cv'), conducteurId, de: s.de.trim(), vers: s.vers.trim(), jour, heure: s.heure, places: s.places, prix: s.prix, vehicule: veh, enVille: s.enVille, depart: s.point.trim() || s.de.trim(), reservations: [], statut: 'ouverte' };
    app.monde.covoits.push(o); creees.push(app.monde.covoits[app.monde.covoits.length - 1]);
    const e = etat(); e.optionsCovoit[o.id] = { ...options }; if (serie) e.seriesCovoit[o.id] = serie;
    consigner('covoit', `Trajet publié ${o.de} → ${o.vers} ${o.jour} ${o.heure} · ${o.places} pl. à ${fr(o.prix)}`, conducteurId, o.id);
  }
  if (!creees.length) throw new Error(premiereErreur ?? 'Publication impossible.');
  return creees;
}
export { nomVehicule };
