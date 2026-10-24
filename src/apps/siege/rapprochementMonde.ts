// Rapprochement MoMo / OM sur le monde simulé : relevé opérateur (reconstitué + transactions externes), écarts, décisions.
import { rapprocher, releveDepuis, type BilletR, type Ecart, type PaiementR, type Rapprochement, type TxOperateur } from '../../core/rapprochement.ts';
import { app, maintenant } from '../../data/store.svelte.ts';
import { consigner, departParId, notifier, personne, placesLibres, siegesIndisponibles } from '../../domain/actions.ts';
import type { Billet, MoyenPaiement, Paiement } from '../../domain/types.ts';
import { etatSiege, lireSiege } from './etat.ts';

const versPaiementR = (p: Paiement): PaiementR => ({ id: p.id, ref: p.ref, ts: p.ts, montant: p.montant, moyen: p.moyen, statut: p.statut, payeurId: p.payeurId, expireLe: p.expireLe, pour: p.pour });
function versBilletR(b: Billet, now: number): BilletR {
  const p = app.monde.paiements.find((x) => x.id === b.paiementId);
  return { id: b.id, code: b.code, paiementId: b.paiementId, prix: b.prix, statut: b.statut, creeLe: b.creeLe, acheteurId: b.acheteurId, expire: b.statut === 'expire' || (b.statut === 'attente_paiement' && (p?.expireLe ?? 0) <= now) };
}
/** Relevé complet : transactions externes (relevé de l'opérateur) + celles que les paiements d'AfriMove laissent attendre, sans doublon. */
export function releveComplet(): TxOperateur[] {
  const externes = lireSiege().releveExterne, deja = new Set(externes.map((t) => t.paiementRef).filter(Boolean));
  const derives = releveDepuis(app.monde.paiements.map(versPaiementR), (id) => personne(id)?.tel ?? '').filter((t) => !deja.has(t.paiementRef));
  return [...derives, ...externes];
}
export function etatRapprochement(now = maintenant()): Rapprochement {
  const traitees = new Set(Object.keys(lireSiege().decisions));
  return rapprocher(releveComplet(), app.monde.paiements.map(versPaiementR), app.monde.billets.map((b) => versBilletR(b, now)), now, traitees);
}
export type ErreurRapprochement = 'inconnue' | 'candidat_invalide' | 'depart_ferme' | 'siege_pris' | 'complet' | 'doublon';
const MESSAGES: Record<ErreurRapprochement, string> = {
  inconnue: 'Cette transaction est déjà traitée ou n’existe pas.', candidat_invalide: 'Ce billet ne peut pas être associé à cette transaction.',
  depart_ferme: 'Le départ est déjà parti ou annulé : rembourse plutôt le client.', siege_pris: 'Le siège du billet a été pris entre-temps : rembourse plutôt le client.',
  complet: 'Le départ est complet : rembourse plutôt le client.', doublon: 'Un doublon ne s’associe pas : il se rembourse.'
};
export const messageRapprochement = (code: string) => MESSAGES[code as ErreurRapprochement] ?? code;
const trouver = (txRef: string): Ecart => { const e = etatRapprochement().ecarts.find((x) => x.tx.ref === txRef); if (!e) throw new Error('inconnue'); return e; };

/** Associe une transaction à un billet resté sans paiement valide : le billet redevient valide et le paiement est réglé. */
export function associerTransaction(txRef: string, billetId: string, acteurId?: string): Billet {
  const ecart = trouver(txRef);
  if (ecart.motif === 'doublon') throw new Error('doublon');
  if (!ecart.candidats.includes(billetId)) throw new Error('candidat_invalide');
  const b = app.monde.billets.find((x) => x.id === billetId)!, d = departParId(b.departId);
  if (!d || d.statut === 'annule' || d.statut === 'parti' || d.statut === 'arrive') throw new Error('depart_ferme');
  if (b.siege && siegesIndisponibles(d).has(b.siege)) throw new Error('siege_pris');
  if (placesLibres(d) <= 0) throw new Error('complet');
  const tx = ecart.tx, ancien = app.monde.paiements.find((x) => x.id === b.paiementId);
  let p = ecart.paiementId ? app.monde.paiements.find((x) => x.id === ecart.paiementId) : undefined;
  if (!p) {
    const moyen: MoyenPaiement = tx.operateur === 'MTN' ? 'momo' : 'om';
    p = { id: `pay-${tx.ref.toLowerCase()}`, ts: tx.ts, montant: tx.montant, moyen, statut: 'ok', ref: `${moyen.toUpperCase()}-${tx.ref}`, canal: 'guichet', payeurId: b.acheteurId, pour: { type: 'billet', ids: [b.id] } };
    app.monde.paiements.push(p);
    const ext = etatSiege().releveExterne.find((x) => x.ref === tx.ref); if (ext) ext.paiementRef = p.ref;
  }
  if (ancien && ancien.id !== p.id && ancien.statut === 'attente') { ancien.statut = 'refuse'; ancien.motif = `Remplacé par ${p.ref}`; }
  p.statut = 'ok'; p.pour = { type: 'billet', ids: [...new Set([...p.pour.ids, b.id])] };
  b.paiementId = p.id; b.statut = 'valide';
  etatSiege().decisions[tx.ref] = { type: 'associe', ts: maintenant(), par: acteurId, billetId: b.id, paiementId: p.id };
  notifier(b.acheteurId, 'Billet confirmé', `${b.passager.nom} · paiement retrouvé (${p.ref})`, '/pass', 'billet');
  consigner('rapprochement', `Transaction ${tx.ref} associée au billet ${b.code}`, acteurId, b.id);
  return b;
}
/** Rembourse la transaction : l'opérateur renvoie l'argent (simulé) ; le paiement AfriMove éventuel passe à « remboursé ». */
export function rembourserTransaction(txRef: string, acteurId?: string): void {
  const ecart = trouver(txRef), p = ecart.paiementId ? app.monde.paiements.find((x) => x.id === ecart.paiementId) : undefined;
  if (p && p.statut !== 'rembourse') p.statut = 'rembourse';
  etatSiege().decisions[txRef] = { type: 'rembourse', ts: maintenant(), par: acteurId, paiementId: p?.id };
  if (p) notifier(p.payeurId, 'Remboursement envoyé', `${ecart.tx.montant.toLocaleString('fr-FR')} F renvoyés sur ${ecart.tx.numero}`, undefined, 'remboursement');
  consigner('rapprochement', `Transaction ${txRef} remboursée · ${ecart.tx.montant} F`, acteurId, p?.id);
}
