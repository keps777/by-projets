// Portail de la clinique : statuts affichés, chiffres du mois, relevé exportable. Fonctions pures.
import { enDate, jourDe, type Jour } from './dates.ts';

export interface FacturePortail {
  numero: string; patient: string; acte: string; date: Jour; echeance: Jour;
  total: number; assureMe: number; partPatient: number;
  statut: 'brouillon' | 'a_regler' | 'payee' | 'etalee'; paiement?: { ts: number };
}
export type StatutPortail = 'a_valider' | 'a_regler' | 'en_retard' | 'payee';
export const LIBELLE_PORTAIL: Record<StatutPortail, string> = { a_valider: 'À valider', a_regler: 'Patient à régler', en_retard: 'En retard', payee: 'Payée' };

export function statutPortail(f: Pick<FacturePortail, 'statut' | 'echeance'>, aujourdhui: Jour): StatutPortail {
  if (f.statut === 'brouillon') return 'a_valider';
  if (f.statut === 'a_regler') return f.echeance < aujourdhui ? 'en_retard' : 'a_regler';
  return 'payee';
}
export interface StatsClinique { emises: number; versee: number; encaissee: number; aEncaisser: number; delaiMoyenJours: number | null }
/** `versee` : part AssureMe des factures validées ce mois-ci ; `delaiMoyenJours` : de l'émission au règlement par le patient. */
export function statsClinique(fs: FacturePortail[], now: number): StatsClinique {
  const mois = jourDe(new Date(now)).slice(0, 7), valides = fs.filter((f) => f.statut !== 'brouillon');
  const payees = valides.filter((f) => f.statut === 'payee' || f.statut === 'etalee');
  const delais = payees.filter((f) => f.paiement).map((f) => Math.max(0, Math.round((f.paiement!.ts - enDate(f.date).getTime()) / 86_400_000)));
  return {
    emises: valides.length,
    versee: valides.filter((f) => f.date.startsWith(mois)).reduce((s, f) => s + f.assureMe, 0),
    encaissee: payees.reduce((s, f) => s + f.partPatient, 0),
    aEncaisser: valides.filter((f) => f.statut === 'a_regler').reduce((s, f) => s + f.partPatient, 0),
    delaiMoyenJours: delais.length ? Math.round(delais.reduce((s, d) => s + d, 0) / delais.length) : null
  };
}
const champ = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** Relevé des paiements au format CSV (séparateur « ; » pour Excel en français). */
export function releveCsv(fs: FacturePortail[], aujourdhui: Jour): string {
  const lignes = [['Facture', 'Patient', 'Date', 'Acte', 'Total', 'Part AssureMe', 'Part patient', 'Statut'].map(champ).join(';')];
  for (const f of fs) lignes.push([f.numero, f.patient, f.date, f.acte, f.total, f.assureMe, f.partPatient, LIBELLE_PORTAIL[statutPortail(f, aujourdhui)]].map(champ).join(';'));
  return lignes.join('\r\n');
}
