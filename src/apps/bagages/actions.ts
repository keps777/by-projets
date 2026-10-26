// Transactions de la soute partagée : acheter des bagages (même vol), les faire confirmer par la compagnie, demander un bagage.
// Règles : on ne vend qu'un droit de bagage inutilisé à un passager du MÊME vol (même numéro, même date) ; prix plafonné au prix du comptoir ; commission de revente (hypothèse)
// prélevée sur le vendeur ; on vend un droit, jamais le transport du bagage d'autrui. Tout est « sous réserve d'accord de la compagnie » (hypothèse). Paiement simulé.
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { arrondi, fmt } from '../../core/argent.ts';
import { commission, peutEchanger, refAleatoire } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { droitDe, departDuVol, ecrire, volDe, type MoyenPaiement } from '../../domain/marche.ts';
import type { BagageDroit, DemandeBagage } from '../../domain/types.ts';
import { KG_BAGAGE, MAX_AJOUT, MIN_AJOUT, dejaAjoutes, offresSoute, plafondBagage, somme } from './soute.ts';

export type CodeErreurBagage = 'compte' | 'droit' | 'vol' | 'echeance' | 'quantite' | 'limite' | 'offres' | 'solde' | 'prix' | 'introuvable';
export class ErreurBagage extends Error { constructor(public code: CodeErreurBagage, message: string) { super(message); } }

/** Un bagage acheté : la ligne du vendeur (droit passé à « vendu ») et la nouvelle ligne de l'acheteur (« acheté », puis « transféré » quand la compagnie confirme). */
export interface LigneTransfert { vendeurId: string; vendeurBagageId: string; bagageId: string; prix: number; commission: number }
export interface TransfertBagage { id: string; ref: string; droitId: string; volId: string; acheteurId: string; quand: number; lignes: LigneTransfert[]; total: number; moyen: MoyenPaiement; confirme: boolean }
export interface TrancheBagages { transferts: TransfertBagage[] }
/** À appeler depuis une action ou l'initialisation d'un écran (jamais depuis un `$derived`). */
export const trancheBagages = (): TrancheBagages => tranche<TrancheBagages>('bagages', () => ({ transferts: [] }));
/** Lecture seule des transferts (sans créer la tranche : sûr dans un `$derived`). */
export const transfertsDe = (compteId: string): TransfertBagage[] => ((app.tranches.bagages as TrancheBagages | undefined)?.transferts ?? []).filter((t) => t.acheteurId === compteId);
export const transfertPar = (id: string | null | undefined, compteId: string): TransfertBagage | undefined => { const l = transfertsDe(compteId); return (id ? l.find((t) => t.id === id) : undefined) ?? l[l.length - 1]; };

const libelleVol = (volId: string): string => volDe(volId)?.numero ?? 'vol';

/** Achète `quantite` bagages (de 1 à 3) pour la réservation `droitId` : les offres les moins chères du même vol, hors les siennes. Crédite chaque vendeur net de la commission (grand livre), transfère le droit de bagage, prévient les deux parties. */
export function acheterBagages(acheteurId: string, droitId: string, quantite: number, moyen: MoyenPaiement = 'carte'): TransfertBagage {
  const acheteur = compteDe(acheteurId); if (!acheteur || !acheteur.actif) throw new ErreurBagage('compte', 'Connectez-vous pour acheter.');
  const droit = droitDe(droitId); if (!droit || droit.detenteurId !== acheteurId || !['detenu', 'en_vente', 'nomme'].includes(droit.statut)) throw new ErreurBagage('droit', 'Cette réservation n’est pas dans votre portefeuille.');
  const v = volDe(droit.volId); if (!v) throw new ErreurBagage('vol', 'Ce vol n’existe plus.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurBagage('echeance', 'L’échéance de nommage est passée : plus aucun bagage ne peut être ajouté.');
  if (!Number.isInteger(quantite) || quantite < MIN_AJOUT || quantite > MAX_AJOUT) throw new ErreurBagage('quantite', `Ajoutez de ${MIN_AJOUT} à ${MAX_AJOUT} bagages.`);
  if (dejaAjoutes(acheteurId, v.id) + quantite > MAX_AJOUT) throw new ErreurBagage('limite', `Une réservation compte au plus ${MAX_AJOUT} bagages ajoutés.`);
  const offres = offresSoute(v.id, acheteurId);
  if (offres.length < quantite) throw new ErreurBagage('offres', offres.length ? `Seulement ${offres.length} bagage${offres.length > 1 ? 's' : ''} disponible${offres.length > 1 ? 's' : ''} sur ce vol.` : 'Aucun bagage disponible sur ce vol pour l’instant.');
  const choisies = offres.slice(0, quantite), total = somme(choisies);
  if (moyen === 'solde' && acheteur.solde < total) throw new ErreurBagage('solde', 'Solde NexG insuffisant.');

  const quand = maintenant(), lignes: LigneTransfert[] = [];
  for (const o of choisies) {
    const vendeur = compteDe(o.detenteurId), comm = commission(o.prix, !!vendeur?.pass.actif), bagage: BagageDroit = { id: nouvelId('b'), volId: v.id, detenteurId: acheteurId, kg: o.kg, prix: o.prix, statut: 'achete', de: o.detenteurId };
    o.statut = 'vendu'; app.monde.bagages.push(bagage);
    if (vendeur) {
      ecrire(vendeur.id, 'bagage', `Bagage vendu · ${v.numero}`, o.prix, { sous: `Vol ${v.numero} · ${o.kg} kg · à un passager du même vol` });
      ecrire(vendeur.id, 'commission', `Commission de revente de bagage${vendeur.pass.actif ? ' · membre Pass' : ''}`, -comm, { sous: `Taux hypothèse ${vendeur.pass.actif ? '10' : '12,5'} %`, hypothese: true });
      notifier(vendeur.id, { type: 'bagage', titre: `Bagage vendu : ${v.numero}`, sous: `Vous recevez ${fmt(arrondi(o.prix - comm))} sur votre solde NexG, après commission. Sous réserve d’accord de la compagnie.`, essentielle: true, lien: '/solde' });
    }
    lignes.push({ vendeurId: o.detenteurId, vendeurBagageId: o.id, bagageId: bagage.id, prix: o.prix, commission: comm });
  }
  if (moyen === 'solde') ecrire(acheteurId, 'bagage', `${quantite} bagage${quantite > 1 ? 's' : ''} · ${v.numero}`, -total, { sous: `Vol ${v.numero} · soute partagée`, droitId: droit.id });
  const t = trancheBagages();
  let n = t.transferts.length * 17 + Math.floor(quand / 1000), ref = refAleatoire(n); while (t.transferts.some((x) => x.ref === ref)) ref = refAleatoire(++n);
  const transfert: TransfertBagage = { id: nouvelId('tb'), ref, droitId: droit.id, volId: v.id, acheteurId, quand, lignes, total, moyen, confirme: false };
  t.transferts.push(transfert);
  notifier(acheteurId, { type: 'bagage', titre: `${quantite} bagage${quantite > 1 ? 's' : ''} ajouté${quantite > 1 ? 's' : ''} à votre réservation`, sous: `Vol ${v.numero} · ${fmt(total)} · en attente de confirmation de la compagnie.`, essentielle: true, lien: '/bagages/transfere' });
  return transfert;
}

/** Simule la confirmation de la compagnie : les bagages achetés passent à « transféré ». */
export function confirmerTransfert(transfertId: string, compteId: string): TransfertBagage {
  const t = trancheBagages().transferts.find((x) => x.id === transfertId && x.acheteurId === compteId); if (!t) throw new ErreurBagage('introuvable', 'Transfert introuvable.');
  if (t.confirme) return t;
  for (const l of t.lignes) { const b = app.monde.bagages.find((x) => x.id === l.bagageId); if (b) b.statut = 'transfere'; }
  t.confirme = true;
  notifier(compteId, { type: 'bagage', titre: 'Bagages confirmés par la compagnie', sous: `Vol ${libelleVol(t.volId)} · ${t.lignes.length} bagage${t.lignes.length > 1 ? 's' : ''} en soute de plus (démo).`, essentielle: false, lien: '/bagages' });
  return t;
}
/** Revient à « en attente de la compagnie » (démonstration). */
export function remettreEnAttente(transfertId: string, compteId: string): TransfertBagage {
  const t = trancheBagages().transferts.find((x) => x.id === transfertId && x.acheteurId === compteId); if (!t) throw new ErreurBagage('introuvable', 'Transfert introuvable.');
  for (const l of t.lignes) { const b = app.monde.bagages.find((x) => x.id === l.bagageId); if (b) b.statut = 'achete'; }
  t.confirme = false; return t;
}

/** Publie une demande de bagage (« aucune offre à mon prix ») : un prix maximum, plafonné au prix du comptoir, pour un vol dont on a un droit. */
export function demanderBagage(compteId: string, droitId: string, prixMax: number, kg: number = KG_BAGAGE): DemandeBagage {
  const droit = droitDe(droitId); if (!droit || droit.detenteurId !== compteId) throw new ErreurBagage('droit', 'Cette réservation n’est pas dans votre portefeuille.');
  const v = volDe(droit.volId); if (!v) throw new ErreurBagage('vol', 'Ce vol n’existe plus.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurBagage('echeance', 'L’échéance de nommage est passée.');
  if (!(prixMax > 0)) throw new ErreurBagage('prix', 'Indiquez un prix maximum.');
  if (prixMax > plafondBagage(v)) throw new ErreurBagage('prix', `Le prix maximum ne peut pas dépasser le prix compagnie (${fmt(plafondBagage(v))}).`);
  if (!(kg > 0) || kg > KG_BAGAGE) throw new ErreurBagage('quantite', `Un bagage pèse ${KG_BAGAGE} kg au plus.`);
  const d: DemandeBagage = { id: nouvelId('db'), compteId, volId: v.id, kg, prixMax: arrondi(prixMax), creeLe: maintenant(), statut: 'ouverte' };
  app.monde.demandesBagage.push(d);
  for (const o of app.monde.bagages) if (o.volId === v.id && o.statut === 'en_vente' && o.detenteurId !== compteId && o.prix <= d.prixMax) notifier(o.detenteurId, { type: 'bagage', titre: `Un passager du vol ${v.numero} cherche un bagage`, sous: `Prix maximum ${fmt(d.prixMax)} : votre offre à ${fmt(o.prix)} correspond.`, essentielle: false, lien: '/bagages' });
  return d;
}
export function annulerDemande(compteId: string, demandeId: string): DemandeBagage {
  const d = app.monde.demandesBagage.find((x) => x.id === demandeId && x.compteId === compteId); if (!d) throw new ErreurBagage('introuvable', 'Demande introuvable.');
  if (d.statut === 'ouverte') d.statut = 'annulee'; return d;
}
