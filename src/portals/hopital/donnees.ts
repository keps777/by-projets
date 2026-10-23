// Lecture des factures de la clinique dans la tranche « sante » partagée avec l'app du membre.
import { statutPortail, type StatutPortail } from '../../core/sante-portail.ts';
import { CLINIQUE, aujourdhui, sante, type FactureSante } from '../../screens/sante/etat.ts';

export const facturesClinique = (): FactureSante[] =>
  sante().factures.filter((f) => f.etablissementId === CLINIQUE.id).slice().sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
export const statutDe = (f: FactureSante): StatutPortail => statutPortail(f, aujourdhui());
export const TON: Record<StatutPortail, { fg: string; bg: string }> = {
  payee: { fg: '#0b5a3a', bg: '#e2f6ec' }, a_regler: { fg: '#2a3142', bg: '#eff1f6' }, en_retard: { fg: '#8a3c05', bg: '#fff1e6' }, a_valider: { fg: '#3050ff', bg: '#ebeeff' }
};
