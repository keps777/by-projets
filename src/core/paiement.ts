// Paiements : recharge du solde, partenaires QR, contrôle du solde, référence et points de score.
import { POINTS, borner } from './score.ts';
import { ecartJours, type Jour } from './dates.ts';

// ------------------------------------------------------------------ recharge
export type SourceId = 'orange' | 'mtn' | 'visa';
export interface SourceRecharge { id: SourceId; ini: string; nom: string; chip: string; frais: number }
/** Le mobile money est gratuit ; la carte Visa coûte 1 % au membre (débité en plus du montant rechargé). */
export const SOURCES_RECHARGE: SourceRecharge[] = [
  { id: 'orange', ini: 'OM', nom: 'Orange Money', chip: '#FF7A2F', frais: 0 },
  { id: 'mtn', ini: 'MM', nom: 'MTN MoMo', chip: '#C79A12', frais: 0 },
  { id: 'visa', ini: 'VS', nom: 'Carte Visa', chip: '#3050FF', frais: 0.01 }
];
export const MONTANTS_RECHARGE = [10_000, 25_000, 50_000, 100_000];
export const RECHARGE_MIN = 1000;
export const RECHARGE_MAX = 1_000_000;
export const fraisRecharge = (montant: number, tauxFrais: number) => Math.round(montant * tauxFrais);
/** Message d'erreur (ou null si le montant est acceptable). */
export function erreurRecharge(montant: number | null): string | null {
  if (montant == null || montant <= 0) return 'Entrez un montant.';
  if (montant < RECHARGE_MIN) return `Minimum ${RECHARGE_MIN.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA.`;
  if (montant > RECHARGE_MAX) return 'Maximum 1 000 000 FCFA par recharge.';
  return null;
}

// ------------------------------------------------------------------ partenaires et codes QR
export interface Partenaire { code: string; nom: string; ini: string; lieu: string; categorie: string; sous: string; mode: 'facture' | 'libre' }
export const PARTENAIRES: Partenaire[] = [
  { code: 'CLP-0425', nom: 'Clinique Les Palmiers', ini: 'CL', lieu: 'accueil, caisse 2', categorie: 'sante', sous: 'Santé', mode: 'facture' },
  { code: 'PRP-0112', nom: 'Pharmacie du Rond-Point', ini: 'PH', lieu: 'caisse 1', categorie: 'sante', sous: 'Santé', mode: 'libre' },
  { code: 'MAH-0231', nom: 'Supermarché Mahima', ini: 'SM', lieu: 'caisse 4', categorie: 'courses', sous: 'Courses', mode: 'libre' }
];
/** QR de démonstration (ce que contiendrait le QR affiché à la caisse). */
export const QR_DEMO = 'assureme://pay?p=CLP-0425';
/** Extrait « CLP-0425 » d’un texte scanné, collé ou saisi (QR complet, code seul, minuscules, sans tiret). */
export function extraireCode(texte: string): string | null {
  const m = texte.toUpperCase().match(/([A-Z]{2,4})[-\s]?(\d{3,5})/);
  return m ? `${m[1]}-${m[2]}` : null;
}
export const trouverPartenaire = (texte: string): Partenaire | null => {
  const c = extraireCode(texte);
  return (c && PARTENAIRES.find((p) => p.code === c)) || null;
};

// ------------------------------------------------------------------ règlement
export type Controle = { ok: true } | { ok: false; manque: number };
/** Le solde ne peut jamais devenir négatif : sinon on dit combien il manque. */
export const controlerSolde = (solde: number, montant: number): Controle => (montant <= solde ? { ok: true } : { ok: false, manque: montant - solde });
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** « AM-7F2K9Q » : `hasard` renvoie un réel dans [0, 1[ (injectable pour les tests). */
export function referencePaiement(hasard: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(hasard() * ALPHABET.length)];
  return `AM-${s}`;
}
/** Une facture réglée à l'échéance ou avant rapporte des points ; en retard, elle n'en rapporte pas (et n'en retire pas : elle est payée). */
export const pointsFacture = (echeance: Jour, aujourdhui: Jour): number => (aujourdhui <= echeance ? POINTS.paiementFacture : 0);
export const scoreApres = (score: number, points: number) => borner(score + points);

// ------------------------------------------------------------------ étalement
export const MOIS_ETALEMENT = 3;
export const TAUX_ETALEMENT = 0.015;
/** Une mensualité à étaler avec les crédits existants ne doit pas dépasser 33 % du salaire net (règle commune). */
export function etalementAutorise(mensualitesExistantes: number, nouvelle: number, salaire: number): boolean {
  return salaire > 0 && (mensualitesExistantes + nouvelle) / salaire <= 0.33 + 1e-9;
}

// ------------------------------------------------------------------ report d'une mensualité
/** Un report par an et par prélèvement, sans frais. `dernier` : jour de paie du dernier report. */
export function reportPermis(dernier: Jour | undefined, ceJour: Jour): boolean {
  return !dernier || ecartJours(dernier, ceJour) >= 365;
}
