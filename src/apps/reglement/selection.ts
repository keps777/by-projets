// Sélecteur « Ton bus » : les billets en cours et à venir (les miens et ceux achetés pour des proches), et le billet choisi, mémorisé dans la tranche `reglement`.
import { app } from '../../data/store.svelte.ts';
import { jourSemaineCourt } from '../../core/dates.ts';
import { choisirBillet, trierItems, type ItemBillet, type StatutSelection } from '../../core/selectionBillet.ts';
import { billetParId, billetsDe, departEnMs, departParId, ligneDe, personne } from '../../domain/actions.ts';
import type { Billet } from '../../domain/types.ts';
import { etat, type EtatReglement } from './etat.ts';

/** Un billet valide (ou déjà scanné) dont le départ n'est ni arrivé ni annulé. */
export const estEnCours = (b: Billet) => { if (b.statut !== 'valide' && b.statut !== 'scanne') return false; const d = departParId(b.departId); return !!d && d.statut !== 'arrive' && d.statut !== 'annule'; };
/** Billets en cours et à venir de la personne, les départs les plus proches d'abord. */
export function billetsEnCours(personneId: string): Billet[] {
  return trierItems(billetsDe(personneId).filter(estEnCours).map((b) => ({ b, departMs: departEnMs(departParId(b.departId)!) }))).map((x) => x.b);
}
const statutDe = (b: Billet): StatutSelection => {
  const d = departParId(b.departId); if (b.statut === 'annule' || b.statut === 'rembourse' || d?.statut === 'annule') return 'annule';
  if (!d || d.statut === 'arrive') return 'passe'; if (b.statut === 'scanne') return d.statut === 'parti' ? 'en_route' : 'a_bord';
  return d.statut === 'parti' ? 'en_route' : d.statut === 'embarquement' ? 'embarquement' : 'a_venir';
};
/** Entrée du sélecteur pour un billet : qui voyage, qui a payé, trajet, heure, statut. */
export function itemDe(b: Billet, moiId: string): ItemBillet {
  const d = departParId(b.departId)!, l = ligneDe(d), moi = personne(moiId), pourMoi = b.passager.tel === moi?.tel || b.passager.nom === `${moi?.prenom} ${moi?.nom}`;
  const acheteur = personne(b.acheteurId), payePar = b.acheteurId === moiId ? (pourMoi ? undefined : 'toi') : acheteur?.prenom;
  return { id: b.id, passager: b.passager.nom.split(' ')[0], pourMoi, payePar, trajet: `${l.de} → ${l.vers}`, jour: jourSemaineCourt(d.jour), heure: d.heure, departMs: departEnMs(d), statut: statutDe(b), siege: b.siege };
}
export const itemsDe = (billets: Billet[], moiId: string) => billets.map((b) => itemDe(b, moiId));

/** Dernier billet choisi dans le sélecteur (lecture seule : ne crée pas la tranche, utilisable dans un `$derived`). */
export const billetMemorise = (): string | null => (app.tranches.reglement as Partial<EtatReglement> | undefined)?.billetChoisi ?? null;
/** Mémorise le billet choisi (à appeler depuis un gestionnaire ou un `$effect`, jamais depuis un `$derived`). */
export function memoriserBillet(id: string) { const e = etat(); if (e.billetChoisi !== id) e.billetChoisi = id; }
/** Le billet à montrer : celui du lien (`?billet=`), sinon le dernier choix s'il est encore en cours, sinon le prochain départ. */
export function billetChoisi(personneId: string, demande?: string | null): Billet | undefined {
  const enCours = billetsEnCours(personneId), id = choisirBillet({ enCours: enCours.map((b) => b.id), demande: demande && billetsDe(personneId).some((b) => b.id === demande) ? demande : null, memorise: billetMemorise() });
  return id ? billetParId(id) : undefined;
}
