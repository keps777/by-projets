// Calculs purs de la diaspora (testés dans diaspora.test.ts).
import { etapes, totalEuro, MOYENS, type EtapePaiement, type MoyenPaiement } from '../../core/diaspora.ts';
import { instantsEtapes } from '../../core/services.ts';
import type { Facture, PaiementDiaspora } from './etat.ts';

export const totalSelection = (factures: Facture[], ids: string[]) => factures.filter((f) => !f.payee && ids.includes(f.id)).reduce((s, f) => s + f.montant, 0);

/** Message d'erreur si le paiement est impossible, sinon null. */
export function verifierPaiement(nbFactures: number, totalFcfa: number, plafond: number): string | null {
  if (nbFactures === 0) return 'Choisissez au moins une facture.';
  if (totalFcfa <= 0) return 'Le montant à payer doit être positif.';
  if (totalFcfa > plafond) return `Le plafond de votre niveau est de ${plafond.toLocaleString('fr-FR')} FCFA par paiement.`;
  return null;
}
export function verifierFacture(prestataire: string, montant: number | null): string | null {
  if (prestataire.trim().length < 2) return 'Indiquez à qui la facture est due.';
  if (montant === null || montant <= 0) return 'Entrez un montant en FCFA.';
  if (montant > 50_000_000) return 'Montant trop élevé.';
  return null;
}
export const libellePartenaire = (p: Pick<PaiementDiaspora, 'lignes'>) => (p.lignes.length > 1 ? `${p.lignes.length} prestataires` : p.lignes[0]?.prestataire ?? 'le prestataire');

export interface EtapeVue extends EtapePaiement { atteinte: boolean }
/** Les 4 étapes avec l'état de chacune à l'instant `now`. */
export function etapesVue(p: PaiementDiaspora, now: number): EtapeVue[] {
  const t = instantsEtapes(p.debut, p.delaiSigne);
  return etapes(libellePartenaire(p), MOYENS[p.moyen].nom, p.depuis, p.debut, p.delaiSigne).map((e, i) => ({ ...e, atteinte: now >= t[i] }));
}
export const eurosDe = (p: Pick<PaiementDiaspora, 'montantFcfa'>) => totalEuro(p.montantFcfa);
export const totalEnvoye = (avantEuro: number, paiements: PaiementDiaspora[], annee: number) =>
  avantEuro + paiements.filter((p) => new Date(p.debut).getFullYear() === annee).reduce((s, p) => s + eurosDe(p), 0);
export const moyenCourt = (m: MoyenPaiement) => MOYENS[m].court;

/** Lignes du reçu à imprimer (PDF). */
export function lignesRecu(p: PaiementDiaspora, signe: boolean): string[] {
  const h = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const euros = eurosDe(p).toFixed(2).replace('.', ',');
  return [
    `Paiement pour ${p.procheNom} (${p.procheVille}) depuis ${p.depuis}`, `Date : ${h(p.debut)}`, `Moyen : ${MOYENS[p.moyen].nom}`,
    `Total : ${euros} € = ${p.montantFcfa.toLocaleString('fr-FR')} FCFA · taux fixe 655,957 · frais 0 €`, '',
    ...p.lignes.flatMap((l) => [`Reçu n° ${l.recu}`, `  ${l.prestataire} : ${l.detail}`, `  ${l.montant.toLocaleString('fr-FR')} FCFA · ${signe ? `signé par ${l.signataire}` : 'signature en attente'}`, ''])
  ];
}
