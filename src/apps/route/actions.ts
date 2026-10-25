// Transactions de l'application « route » (suivi du bus, retard, réseau, course, arrêts, covoiturage) : elles s'appuient sur app.monde et sur les primitives de domain/actions.ts.
import { meilleureAlternative } from '../../core/alternative.ts';
import { arretPasse, parcours, prixArret, type Arret } from '../../core/arrets.ts';
import { attenteMin, ETAPES, MODES, prixCourse, trajetMin, type Mode, type MoyenCourse } from '../../core/course.ts';
import { commissionCourse } from '../../core/courseCommission.ts';
import { estimerArrivee, flotte } from '../../core/courseFlotte.ts';
import { kmVersGare, lieuLibre, trouverLieu } from '../../core/lieux.ts';
import { departOffreMs, erreurOffre, gainConducteur, nomVehicule, placesReservees, placesRestantes, type SaisieOffre } from '../../core/covoit.ts';
import { jourDe } from '../../core/dates.ts';
import { gesteRetard } from '../../core/retard.ts';
import { minutesDepuisMinuit } from '../../core/suivi.ts';
import { app, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { annulerBillet, billetParId, billetsDe, consigner, departParId, gare, ligneDe, notifier, personne, placesLibres, reserver } from '../../domain/actions.ts';
import type { Billet, Depart, OffreCovoit, Paiement } from '../../domain/types.ts';
import { cagnotteDe, etat, lire, type ChoixRetard, type CommissionDue, type CourseVoyage, type OptionsCovoit } from './etat.ts';

const fr = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const hhmmDe = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

// ------------------------------------------------------------------ suivi du bus
/** Le prochain billet à suivre : valide ou déjà scanné, départ non annulé ; en priorité un bus pas encore arrivé (le plus proche), sinon celui arrivé depuis moins de 3 h. */
export function billetASuivre(personneId: string, now = maintenant()): Billet | undefined {
  const tel = personne(personneId)?.tel, vivants = billetsDe(personneId).filter((b) => (b.statut === 'valide' || b.statut === 'scanne') && departParId(b.departId) && departParId(b.departId)!.statut !== 'annule');
  const duDepart = (b: Billet) => new Date(`${departParId(b.departId)!.jour}T${departParId(b.departId)!.heure}:00`).getTime();
  const parProche = (a: Billet, b: Billet) => duDepart(a) - duDepart(b) || Number(b.passager.tel === tel) - Number(a.passager.tel === tel);
  const encore = vivants.filter((b) => departParId(b.departId)!.statut !== 'arrive').sort(parProche)[0];
  if (encore) return encore;
  return vivants.filter((b) => { const d = departParId(b.departId)!; return now - (duDepart(b) + ligneDe(d).dureeMin * 60_000) < 3 * 3_600_000; }).sort((a, b) => parProche(b, a))[0];
}
/** Arrêts d'un départ (horaires compris, retard compris). */
export function arretsDuDepart(d: Depart): Arret[] {
  const l = ligneDe(d);
  return parcours({ de: l.de, vers: l.vers, gareDe: gare(l.gareDe)?.nom ?? l.gareDe, gareVers: gare(l.gareVers)?.nom ?? l.gareVers, heure: d.heure, dureeMin: l.dureeMin, retardMin: d.retardMin });
}
export const minutesDuDepart = (d: Depart, nowMs = maintenant()) => minutesDepuisMinuit(nowMs, d.jour);

// ------------------------------------------------------------------ retard
/** Le meilleur départ de remplacement sur la même ligne (même jour que le bus retardé). */
export function alternativeAuRetard(d: Depart, now = maintenant()): Depart | undefined {
  const l = ligneDe(d), cibles = app.monde.departs.filter((x) => x.id !== d.id && x.jour === d.jour && x.statut !== 'annule' && x.statut !== 'arrive' && x.statut !== 'parti' && x.retardMin === 0 && ligneDe(x).de === l.de && ligneDe(x).vers === l.vers);
  const choix = meilleureAlternative(new Date(`${d.jour}T${d.heure}:00`).getTime() + d.retardMin * 60_000, l.compagnieId, cibles.map((x) => ({ id: x.id, departMs: new Date(`${x.jour}T${x.heure}:00`).getTime() + x.retardMin * 60_000, places: placesLibres(x), compagnieId: ligneDe(x).compagnieId })), now);
  return choix ? departParId(choix.id) : undefined;
}
export function crediterCagnotte(personneId: string, montant: number) { const e = etat(); e.cagnotte[personneId] = (e.cagnotte[personneId] ?? 0) + montant; }
/** Débite la cagnotte (jamais sous zéro) ; renvoie le montant réellement débité. */
export function debiterCagnotte(personneId: string, montant: number): number { const e = etat(), pris = Math.max(0, Math.min(montant, e.cagnotte[personneId] ?? 0)); e.cagnotte[personneId] = (e.cagnotte[personneId] ?? 0) - pris; return pris; }
export interface ResultatRetard { choix: ChoixRetard; geste: number; rembourse: number; redirection: string }
/** Enregistre le choix du voyageur face à un retard. « Changer » et « rembourser » annulent le billet sans frais (annulation par la compagnie) ; le geste commercial (≥ 30 min) est crédité une seule fois par billet. */
export function choisirRetard(billetId: string, choix: ChoixRetard): ResultatRetard {
  const b = billetParId(billetId); if (!b) throw new Error('billet_inconnu');
  const d = departParId(b.departId)!; if (d.retardMin <= 0) throw new Error('pas_de_retard');
  let rembourse = 0;
  if (choix !== 'attendre') {
    if (b.statut !== 'valide') throw new Error('billet_non_remboursable');
    const r = annulerBillet(b.id, true); if (!r.possible) throw new Error('billet_non_remboursable'); rembourse = r.rembourse;
  }
  const e = etat(), montant = gesteRetard(d.retardMin), avant = e.gestes[b.id];
  const credit = montant > 0 && (!avant || avant.montant === 0) ? montant : 0;
  if (credit > 0) { crediterCagnotte(b.acheteurId, credit); notifier(b.acheteurId, 'Geste commercial', `${fr(credit)} crédités sur ta cagnotte pour le retard de ${d.retardMin} min`, '/moi/fidelite', 'geste'); }
  e.gestes[b.id] = { billetId: b.id, departId: d.id, montant: Math.max(avant?.montant ?? 0, credit), choix, ts: maintenant() };
  consigner('retard', `Retard ${d.heure} : ${choix}${credit ? ` · geste ${credit} F` : ''}`, b.acheteurId, b.id);
  return { choix, geste: credit, rembourse, redirection: choix === 'attendre' ? `/pass?billet=${b.id}` : choix === 'changer' ? '/' : `/pass/annule?billet=${b.id}` };
}

// ------------------------------------------------------------------ monter en route
export interface ResultatMontee { billet: Billet; paiement: Paiement; arret: Arret; prix: number }
/** Un arrêt est-il encore atteignable ? (le bus n'est pas déjà passé, le départ n'est ni annulé ni arrivé). */
export function arretDisponible(d: Depart, a: Arret, nowMs = maintenant()): boolean {
  if (d.statut === 'annule' || d.statut === 'arrive' || a.type === 'arrivee') return false;
  return !arretPasse(a, minutesDuDepart(d, nowMs));
}
/** Réserve un billet sans siège pour monter à un arrêt intermédiaire (prix prorata), à régler sur /paiement. */
export function monterEnRoute(departId: string, arretId: string, personneId: string): ResultatMontee {
  const d = departParId(departId), p = personne(personneId); if (!d || !p) throw new Error('depart_inconnu');
  const arret = arretsDuDepart(d).find((a) => a.id === arretId); if (!arret) throw new Error('arret_inconnu');
  if (!arretDisponible(d, arret)) throw new Error('arret_passe');
  const prix = prixArret(d.prix, arret), { billets, paiement } = reserver({ departId, sieges: [null], passagers: [{ nom: `${p.prenom} ${p.nom}`, tel: p.tel }], acheteurId: personneId, canal: 'app', moyen: 'momo', prixUnitaire: prix });
  etat().montees[billets[0].id] = { billetId: billets[0].id, departId, arretId: arret.id, arret: arret.nom, heure: arret.heure, prix, ts: maintenant() };
  if (d.chauffeurId) notifier(d.chauffeurId, 'Montée en route', `${p.prenom} monte à ${arret.nom} (${arret.heure})`, '/chauffeur/arret', 'arret');
  consigner('arret', `Montée en route à ${arret.nom} · ${fr(prix)}`, personneId, billets[0].id);
  return { billet: billets[0], paiement, arret, prix };
}

// ------------------------------------------------------------------ course moto / taxi
export const courseActive = (personneId: string | null | undefined): CourseVoyage | undefined => (personneId ? lire().courses.find((c) => c.personneId === personneId && c.statut === 'en_cours') : undefined);
/** Distance (km) d'un lieu à la gare de départ (6 km si le lieu ou la gare est inconnu). */
export const kmQuartier = (lieu: string, gareId?: string) => (gareId ? kmVersGare(lieu, gareId) : kmVersGare(lieu, 'mvan'));
export interface DemandeCourse { personneId: string; departId: string; mode: Mode; /** Nom du lieu de prise en charge (liste de `core/lieux.ts` ou saisie libre). */ quartier: string; moyen: MoyenCourse }
/** Estimation d'arrivée d'un véhicule au lieu de prise en charge, d'après la flotte simulée de la ville de la gare de départ. */
export function estimationPourLieu(mode: Mode, nomLieu: string, ville: string, instant = maintenant()) {
  const lieu = trouverLieu(nomLieu, ville) ?? lieuLibre(nomLieu || 'Ma position', ville);
  return estimerArrivee(mode, lieu, flotte(ville, mode, instant));
}
/** Commande une course vers la gare de départ du billet. La commission AfriMove (10 %) est toujours due : retenue sur le paiement (MoMo, Orange Money, cagnotte) ou, en espèces, enregistrée comme due par le conducteur. */
export function commanderCourse(r: DemandeCourse): CourseVoyage {
  const d = departParId(r.departId); if (!d || d.statut === 'annule' || d.statut === 'arrive' || d.statut === 'parti') throw new Error('depart_ferme');
  if (!MODES.includes(r.mode)) throw new Error('mode_inconnu');
  if (!r.quartier.trim()) throw new Error('lieu_inconnu');
  if (courseActive(r.personneId)) throw new Error('course_en_cours');
  const l = ligneDe(d), ville = gare(l.gareDe)?.ville ?? l.de, km = kmVersGare(trouverLieu(r.quartier, ville) ?? lieuLibre(r.quartier, ville), l.gareDe), prix = prixCourse(r.mode, km), e = etat();
  if (r.moyen === 'cagnotte') { if ((e.cagnotte[r.personneId] ?? 0) < prix) throw new Error('solde_insuffisant'); e.cagnotte[r.personneId] -= prix; }
  const est = estimationPourLieu(r.mode, r.quartier, ville), commission = commissionCourse(prix), id = nouvelId('cs'), now = maintenant();
  const c: CourseVoyage = { id, personneId: r.personneId, mode: r.mode, quartier: r.quartier.trim(), km, gare: `${l.de} · ${gare(l.gareDe)?.nom ?? ''}`, departId: d.id, prix, moyen: r.moyen, etape: 0, statut: 'en_cours', creeLe: now, majLe: now,
    attente: est.arriveeMin ?? attenteMin(r.mode), conducteur: est.plusProche?.nom, commission, commissionMode: r.moyen === 'especes' ? 'due' : 'retenue' };
  e.courses.unshift(c);
  if (r.moyen === 'especes') e.commissionsDues.unshift({ id: nouvelId('cd'), courseId: id, conducteur: c.conducteur ?? 'Conducteur', montant: commission, prixCourse: prix, ts: now, majLe: now, statut: 'due' });
  consigner('course', `Course ${r.mode} ${c.quartier} → gare · ${fr(prix)} · commission ${fr(commission)} ${r.moyen === 'especes' ? 'due par le conducteur' : 'retenue'}`, r.personneId, id);
  return e.courses[0];
}
/** Commissions AfriMove dues (pas encore prélevées) par les conducteurs pour des courses payées en espèces. */
export const commissionsDues = (statut: CommissionDue['statut'] = 'due'): CommissionDue[] => lire().commissionsDues.filter((x) => x.statut === statut);
export const commissionDeCourse = (courseId: string): CommissionDue | undefined => lire().commissionsDues.find((x) => x.courseId === courseId);
const majCommission = (courseId: string, statut: CommissionDue['statut']) => { const x = etat().commissionsDues.find((y) => y.courseId === courseId); if (x && x.statut === 'due') { x.statut = statut; x.majLe = maintenant(); } };
const cours = (id: string) => { const c = etat().courses.find((x) => x.id === id); if (!c) throw new Error('course_inconnue'); return c; };
export function avancerCourse(id: string): CourseVoyage {
  const c = cours(id); if (c.statut !== 'en_cours') return c;
  if (c.etape < 3) c.etape = (c.etape + 1) as CourseVoyage['etape']; c.majLe = maintenant();
  if (c.etape === 3) { c.statut = 'terminee'; majCommission(c.id, 'prelevee'); notifier(c.personneId, 'Course terminée', `Tu es à la gare · ${fr(c.prix)}${c.moyen === 'especes' ? ' à régler en espèces' : ''}`, '/pass', 'course'); }
  return c;
}
/** Annulation gratuite tant que le véhicule n'est pas arrivé ; rend le montant payé avec la cagnotte. */
export function annulerCourse(id: string): CourseVoyage {
  const c = cours(id); if (c.statut !== 'en_cours') return c; if (c.etape > 0) throw new Error('course_commencee');
  c.statut = 'annulee'; c.majLe = maintenant(); majCommission(c.id, 'annulee'); if (c.moyen === 'cagnotte') crediterCagnotte(c.personneId, c.prix);
  consigner('course', 'Course annulée', c.personneId, c.id); return c;
}
export const infoEtape = (c: CourseVoyage) => ETAPES[c.etape];
export const delaiCourse = (c: CourseVoyage) => (c.etape === 0 ? (c.attente ?? attenteMin(c.mode)) : c.etape === 1 ? trajetMin(c.mode, c.km) : 0);

// ------------------------------------------------------------------ covoiturage
export const offresInterurbain = (jour?: string) => app.monde.covoits.filter((o) => !o.enVille && o.statut === 'ouverte' && (!jour || o.jour === jour)).sort((a, b) => departOffreMs(a) - departOffreMs(b));
export const offresVilleProches = (now = maintenant()) => app.monde.covoits.filter((o) => o.enVille && o.statut === 'ouverte' && departOffreMs(o) >= now - 120_000).sort((a, b) => departOffreMs(a) - departOffreMs(b));
export const offresDe = (personneId: string) => app.monde.covoits.filter((o) => o.conducteurId === personneId).sort((a, b) => departOffreMs(b) - departOffreMs(a));
export const optionsDe = (offreId: string): OptionsCovoit => lire().optionsCovoit[offreId] ?? { femmes: false, bagages: true, arrets: false };
const offre = (id: string) => { const o = app.monde.covoits.find((x) => x.id === id); if (!o) throw new Error('offre_inconnue'); return o; };
const proprietaire = (o: OffreCovoit, id: string) => { if (o.conducteurId !== id) throw new Error('pas_ton_trajet'); return o; };

export function publierOffre(s: SaisieOffre & { pointDepart?: string }, conducteurId: string, options: OptionsCovoit): OffreCovoit {
  const err = erreurOffre(s, maintenant()); if (err) throw new Error(err);
  const o: OffreCovoit = { id: nouvelId('cv'), conducteurId, de: s.de.trim(), vers: s.vers.trim(), jour: s.jour, heure: s.heure, places: s.places, prix: s.prix, vehicule: s.vehicule.trim(), enVille: false, depart: (s.pointDepart ?? '').trim() || s.de.trim(), reservations: [], statut: 'ouverte' };
  app.monde.covoits.push(o); etat().optionsCovoit[o.id] = { ...options }; consigner('covoit', `Trajet publié ${o.de} → ${o.vers} ${o.jour} ${o.heure} · ${o.places} pl. à ${fr(o.prix)}`, conducteurId, o.id);
  return app.monde.covoits[app.monde.covoits.length - 1];
}
/** Démonstration : un voyageur réserve des places (paiement MoMo simulé, accepté). */
export function simulerReservation(offreId: string, voyageurId: string, places = 1): OffreCovoit {
  const o = offre(offreId); if (o.statut !== 'ouverte') throw new Error('offre_fermee'); if (places > placesRestantes(o)) throw new Error('complet');
  const pay: Paiement = { id: nouvelId('pay'), ts: maintenant(), montant: places * o.prix, moyen: 'momo', statut: 'ok', ref: `MOMO-${Math.floor(maintenant() / 1000) % 100000}`, canal: 'app', payeurId: voyageurId, pour: { type: 'covoit', ids: [o.id] } };
  app.monde.paiements.push(pay); o.reservations.push({ voyageurId, places, paiementId: pay.id });
  notifier(o.conducteurId, 'Nouvelle réservation', `${personne(voyageurId)?.prenom ?? 'Un voyageur'} · ${places} place${places > 1 ? 's' : ''} · ${o.de} → ${o.vers} ${o.heure}`, '/covoit/conduire', 'covoit');
  consigner('covoit', `Réservation covoiturage ${places} pl.`, voyageurId, o.id); return o;
}
function rembourserReservation(o: OffreCovoit, voyageurId: string, motif: string) {
  const r = o.reservations.find((x) => x.voyageurId === voyageurId); if (!r) return;
  const p = app.monde.paiements.find((x) => x.id === r.paiementId); if (p && p.statut === 'ok') p.statut = 'rembourse';
  o.reservations.splice(o.reservations.indexOf(r), 1); notifier(voyageurId, 'Covoiturage', `${motif} · ${fr(r.places * o.prix)} remboursés`, '/covoit', 'covoit');
}
/** Le conducteur refuse une réservation (sans frais) tant que le trajet n'a pas démarré. */
export function refuserReservation(offreId: string, conducteurId: string, voyageurId: string) {
  const o = proprietaire(offre(offreId), conducteurId); if (o.statut !== 'ouverte') throw new Error('offre_fermee'); rembourserReservation(o, voyageurId, 'Le conducteur a refusé ta réservation');
}
export function annulerOffre(offreId: string, conducteurId: string) {
  const o = proprietaire(offre(offreId), conducteurId); if (o.statut !== 'ouverte') throw new Error('offre_fermee');
  for (const v of o.reservations.map((r) => r.voyageurId)) rembourserReservation(o, v, 'Trajet annulé par le conducteur'); o.statut = 'annulee'; consigner('covoit', 'Trajet annulé', conducteurId, o.id);
}
export function demarrerTrajet(offreId: string, conducteurId: string) {
  const o = proprietaire(offre(offreId), conducteurId); if (o.statut !== 'ouverte') throw new Error('offre_fermee'); o.statut = 'en_route';
  for (const r of o.reservations) notifier(r.voyageurId, 'Ton conducteur est parti', `${o.de} → ${o.vers} · ${nomVehicule(o.vehicule)}`, '/covoit', 'covoit'); consigner('covoit', 'Trajet démarré', conducteurId, o.id);
}
/** Termine le trajet : le gain (moins 10 % de commission) est versé au conducteur. */
export function terminerTrajet(offreId: string, conducteurId: string): number {
  const o = proprietaire(offre(offreId), conducteurId); if (o.statut !== 'en_route') throw new Error('offre_non_demarree');
  o.statut = 'terminee'; const montant = gainConducteur(placesReservees(o), o.prix);
  etat().versements.push({ offreId: o.id, personneId: conducteurId, montant, ts: maintenant() });
  notifier(conducteurId, 'Trajet terminé', montant > 0 ? `${fr(montant)} versés sur MoMo` : 'Aucune réservation sur ce trajet', '/covoit/conduire', 'covoit');
  for (const r of o.reservations) notifier(r.voyageurId, 'Arrivé !', `${o.de} → ${o.vers}`, '/covoit', 'covoit'); consigner('covoit', `Trajet terminé · ${fr(montant)} versés`, conducteurId, o.id); return montant;
}
export const versementDe = (offreId: string) => lire().versements.find((v) => v.offreId === offreId);

/** Trois départs de covoiturage en ville autour de « maintenant » (démo), créés seulement s'il n'en reste plus d'à venir. */
export function amorcerVille(now = maintenant()): number {
  if (offresVilleProches(now).length > 0) return 0;
  app.monde.covoits = app.monde.covoits.filter((o) => !(o.enVille && o.reservations.length === 0 && departOffreMs(o) < now - 30 * 60_000));
  const defs: [string, number, number, number][] = [['p-aminata', 4, 2, 400], ['p-sandrine', 9, 1, 500], ['p-boris', 15, 3, 350]];
  for (const [conducteurId, dans, places, prix] of defs) {
    const t = new Date(now + dans * 60_000), heure = hhmmDe(t.getTime()), jour = jourDe(t), id = `cv-ville-${jour}-${heure.replace(':', '')}-${conducteurId.slice(2)}`;
    if (app.monde.covoits.some((o) => o.id === id)) continue;
    app.monde.covoits.push({ id, conducteurId, de: 'Bastos', vers: 'Mvan', jour, heure, places, prix, vehicule: personne(conducteurId)?.vehicule ?? 'Voiture', enVille: true, depart: 'Bastos', reservations: [], statut: 'ouverte' });
  }
  return defs.length;
}
export { cagnotteDe };

/** Retire le retard annoncé (démonstration) et prévient les voyageurs. */
export function leverRetard(departId: string, acteurId?: string) {
  const d = departParId(departId); if (!d || d.retardMin === 0) return; d.retardMin = 0;
  for (const b of app.monde.billets.filter((x) => x.departId === departId && x.statut === 'valide')) notifier(b.acheteurId, 'Ton bus repart à l’heure', `Départ ${d.heure} maintenu`, '/direct', 'retard');
  consigner('retard', `Retard levé sur le départ ${d.heure}`, acteurId, d.id);
}
