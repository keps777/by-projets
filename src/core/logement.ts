// Logement : avance de loyer payée au bailleur, remboursée avec le loyer courant.
import { mensualite, type Niveau } from './credit.ts';
export const LOYER_MAX: Record<Niveau, number> = { START: 0, PLUS: 100_000, PRO: 150_000, ELITE: 300_000 };
export const avance = (loyer: number, mois: number) => loyer * mois;
export const remboursementAvance = (loyer: number, mois: number, dureeRemboursement: number, taux: number) => Math.round(mensualite(avance(loyer, mois), taux, dureeRemboursement));
/** Ce qui est prélevé chaque mois pendant le remboursement (loyer + remboursement). */
export const prelevementLogement = (loyer: number, remb: number) => loyer + remb;
export interface PiecesBail { bail: boolean; cniBailleur: boolean; photos: boolean; compteBailleur: boolean }
export const piecesCompletes = (p: PiecesBail) => Object.values(p).filter(Boolean).length;
export const dossierComplet = (p: PiecesBail) => piecesCompletes(p) === 4;
export const compteBailleurValide = (type: 'orange' | 'mtn' | 'banque', saisie: string) => {
  const d = saisie.replace(/\D/g, '');
  return type === 'banque' ? d.length >= 10 : /^[62]\d{8}$/.test(d.slice(-9)) && d.length >= 9;
};
