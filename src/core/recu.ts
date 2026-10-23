// Reçu de paiement : structure et version texte partageable (WhatsApp, SMS…). Le détail médical reste masqué par défaut.
import { fcfa } from './money.ts';
import { jourCourt, heure, jourDe } from './dates.ts';

export interface LigneRecu { nom: string; sous?: string; montant: number }
export type ModeReglement = 'comptant' | 'etale' | 'libre' | 'envoi';
export interface Recu {
  ref: string; ts: number; partenaire: string; ini: string; lieu: string; categorie: string; beneficiaire?: string;
  lignes: LigneRecu[]; total: number; priseEnCharge: number; paye: number;
  mode: ModeReglement; mois?: number; mensualite?: number;
  soldeApres: number; points: number; scoreApres: number; plafondRestant?: number; plafondTotal?: number;
  note: number; factureId?: string;
}
export const dateRecu = (ts: number) => `${jourCourt(jourDe(new Date(ts))).toUpperCase()} ${new Date(ts).getFullYear()} · ${heure(ts)}`;
/** Texte court à partager : montants et référence, sans le détail des soins. */
export function texteRecu(r: Recu, avecDetail = false): string {
  const l = [`Reçu AssureMe ${r.ref}`, `${r.partenaire} · ${dateRecu(r.ts)}`];
  if (avecDetail) r.lignes.forEach((x) => l.push(`- ${x.nom} : ${fcfa(x.montant)}`));
  l.push(`Total : ${fcfa(r.total)} FCFA`);
  if (r.priseEnCharge > 0) l.push(`Pris en charge par AssureMe : ${fcfa(r.priseEnCharge)} FCFA`);
  l.push(r.mode === 'etale' ? `Payé par vous : ${fcfa(r.paye)} FCFA en ${r.mois} fois (${fcfa(r.mensualite ?? 0)} par mois)` : `Payé par vous : ${fcfa(r.paye)} FCFA`);
  return l.join('\n');
}
