// Conducteur de covoiturage : mes trajets, passagers, démarrer / terminer, gains.
import { jourDe } from '../../core/dates.ts';
import { app } from '../../data/store.svelte.ts';
import { consigner, notifier, personne } from '../../domain/actions.ts';
import type { OffreCovoit, Paiement } from '../../domain/types.ts';
import { aujourdhui, fcfaF, maintenant, nouvelId } from './commun.ts';
import { lireTerrain, terrain } from './etat.ts';

export const mesTrajets = (conducteurId: string): OffreCovoit[] => app.monde.covoits.filter((o) => o.conducteurId === conducteurId).sort((a, b) => `${a.jour} ${a.heure}`.localeCompare(`${b.jour} ${b.heure}`));
/** Trajet affiché : celui choisi, sinon le trajet en cours, sinon le prochain à venir, sinon le dernier. */
export function trajetCourant(conducteurId: string): OffreCovoit | undefined {
  const l = mesTrajets(conducteurId), id = lireTerrain().covoit.offreId, choisi = l.find((o) => o.id === id);
  return choisi ?? l.find((o) => o.statut === 'en_route') ?? l.find((o) => o.statut === 'ouverte') ?? l.at(-1);
}
export const choisirTrajet = (id: string) => { terrain().covoit.offreId = id; };
export const placesReservees = (o: OffreCovoit) => o.reservations.reduce((s, r) => s + r.places, 0);
export const placesLibresCovoit = (o: OffreCovoit) => Math.max(0, o.places - placesReservees(o));
export const gainPotentiel = (o: OffreCovoit) => o.places * o.prix;
export const paiementDe = (r: OffreCovoit['reservations'][number]): Paiement | undefined => app.monde.paiements.find((p) => p.id === r.paiementId);
export interface Gains { mois: number; passagersMois: number; aVenir: number; verse: number; trajetsMois: number }
/** Gains : trajets terminés ce mois-ci (places × prix), réservations à venir, montant déjà versé. */
export function gainsConducteur(conducteurId: string, now = maintenant()): Gains {
  const moisCourant = jourDe(new Date(now)).slice(0, 7), mine = mesTrajets(conducteurId), verses = lireTerrain().covoit.verses;
  const faits = mine.filter((o) => o.statut === 'terminee' && o.jour.slice(0, 7) === moisCourant);
  return {
    mois: faits.reduce((s, o) => s + placesReservees(o) * o.prix, 0), passagersMois: faits.reduce((s, o) => s + placesReservees(o), 0), trajetsMois: faits.length,
    aVenir: mine.filter((o) => o.statut === 'ouverte' || o.statut === 'en_route').reduce((s, o) => s + placesReservees(o) * o.prix, 0), verse: mine.reduce((s, o) => s + (verses[o.id]?.montant ?? 0), 0)
  };
}
export function demarrerCovoit(offreId: string, conducteurId: string) {
  const o = app.monde.covoits.find((x) => x.id === offreId && x.conducteurId === conducteurId); if (!o) throw new Error('offre_inconnue'); if (o.statut !== 'ouverte') throw new Error('deja_demarre');
  o.statut = 'en_route';
  for (const r of o.reservations) notifier(r.voyageurId, 'Ton conducteur est parti', `${personne(conducteurId)?.prenom} · ${o.de} → ${o.vers} · suis le trajet en direct`, '/direct', 'covoit');
  consigner('covoit', `Trajet ${o.de} → ${o.vers} ${o.heure} démarré · ${placesReservees(o)} passager(s)`, conducteurId, o.id);
}
/** Terminer le trajet : le gain est versé en MoMo à l'arrivée (simulé) et noté dans la tranche. */
export function terminerCovoit(offreId: string, conducteurId: string): number {
  const o = app.monde.covoits.find((x) => x.id === offreId && x.conducteurId === conducteurId); if (!o) throw new Error('offre_inconnue'); if (o.statut !== 'en_route') throw new Error('pas_en_route');
  o.statut = 'terminee'; const montant = placesReservees(o) * o.prix; terrain().covoit.verses[o.id] = { montant, ts: maintenant() };
  for (const r of o.reservations) notifier(r.voyageurId, 'Trajet terminé', `${o.de} → ${o.vers} · merci d’avoir voyagé avec ${personne(conducteurId)?.prenom}`, '/covoit', 'covoit');
  consigner('covoit', `Trajet ${o.de} → ${o.vers} terminé · ${montant} F versés en MoMo`, conducteurId, o.id); return montant;
}
/** Le conducteur refuse (ou annule) une réservation : le voyageur est remboursé et prévenu, la place est libérée. */
export function refuserReservation(offreId: string, index: number, conducteurId: string) {
  const o = app.monde.covoits.find((x) => x.id === offreId && x.conducteurId === conducteurId); if (!o) throw new Error('offre_inconnue'); if (o.statut !== 'ouverte') throw new Error('trop_tard');
  const r = o.reservations[index]; if (!r) throw new Error('reservation_inconnue');
  const p = paiementDe(r); if (p && p.statut === 'ok') p.statut = 'rembourse';
  o.reservations.splice(index, 1);
  notifier(r.voyageurId, 'Réservation refusée', `${o.de} → ${o.vers} ${o.heure} · ${fcfaF(p?.montant ?? r.places * o.prix)} remboursés`, '/covoit', 'remboursement');
  consigner('covoit', `Réservation refusée par le conducteur · ${o.de} → ${o.vers}`, conducteurId, o.id);
}
/** Démonstration : Aïcha réserve une place sur ce trajet (paiement MoMo accepté) — pour voir arriver un passager. */
export function simulerReservation(offreId: string, voyageurId = 'p-aicha') {
  const o = app.monde.covoits.find((x) => x.id === offreId); if (!o) throw new Error('offre_inconnue'); if (placesLibresCovoit(o) <= 0) throw new Error('complet');
  const now = maintenant(), p: Paiement = { id: nouvelId('pay'), ts: now, montant: o.prix, moyen: 'momo', statut: 'ok', ref: `MOMO-${Math.floor(now / 1000) % 100000}`, canal: 'app', payeurId: voyageurId, pour: { type: 'covoit', ids: [o.id] } };
  app.monde.paiements.push(p); o.reservations.push({ voyageurId, places: 1, paiementId: p.id });
  notifier(o.conducteurId, 'Nouvelle réservation', `${personne(voyageurId)?.prenom} · ${o.de} → ${o.vers} ${o.heure} · ${fcfaF(o.prix)} payés`, '/conducteur', 'covoit'); return p;
}
export const libelleJour = (jour: string) => (jour === aujourdhui() ? 'Aujourd’hui' : jour);
