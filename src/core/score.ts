// AssureScore : un seul score pour toute la famille, de 500 à 900. Le niveau ouvre les piliers (voir credit.ts).
import { niveauDuScore, type Niveau } from './credit.ts';

export const SCORE_MIN = 400;
export const SCORE_MAX = 900;
export interface Signaux { ponctualite: number; anciennete: number; endettement: number; epargne: number; dossier: number }
export const POIDS: Record<keyof Signaux, number> = { ponctualite: 0.35, anciennete: 0.2, endettement: 0.2, epargne: 0.15, dossier: 0.1 };
export const NOM_SIGNAL: Record<keyof Signaux, string> = {
  ponctualite: "Paiements à l'heure", anciennete: 'Ancienneté salariale', endettement: "Taux d'endettement", epargne: 'Épargne régulière', dossier: 'Dossier vérifié'
};
/** Score « de départ » calculé à partir des cinq signaux (0 à 100 chacun) : 500 + 400 × (moyenne pondérée)^2,5. */
export function scoreDesSignaux(s: Signaux): number {
  const w = (Object.keys(POIDS) as (keyof Signaux)[]).reduce((t, k) => t + (Math.max(0, Math.min(100, s[k])) / 100) * POIDS[k], 0);
  return Math.round(500 + 400 * Math.pow(w, 2.5));
}
/** Points gagnés ou perdus par événement. */
export const POINTS = {
  paiementFacture: 4, mensualiteHeure: 2, loyerPaye: 6, versementCoffre: 5, mensualiteRetard: -25, impayeGrave: -60,
  garant: 12, adresse: 11, ordonnance: 0
} as const;
export const borner = (n: number) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
export const pointsPourNiveau = (score: number, cible: Niveau): number => Math.max(0, ({ START: 500, PLUS: 600, PRO: 700, ELITE: 800 } as const)[cible] - score);
export function prochainNiveau(score: number): Niveau | null {
  const n = niveauDuScore(score);
  return n === 'START' ? 'PLUS' : n === 'PLUS' ? 'PRO' : n === 'PRO' ? 'ELITE' : null;
}
export interface Conseil { id: string; titre: string; points: number; effort: string; pourquoi: string }
export const CONSEILS: Conseil[] = [
  { id: 'facture', titre: 'Réglez votre facture de santé avant son échéance', points: 20, effort: '2 MIN', pourquoi: "Un paiement à l'heure pèse 35 % du score. Votre part est déjà prête à payer." },
  { id: 'epargne', titre: 'Épargnez 3 mois de suite dans un coffre', points: 15, effort: 'AUTOMATIQUE', pourquoi: "Un versement auto le 28, même 5 000, compte autant qu'un gros virement." },
  { id: 'garant', titre: 'Ajoutez un garant ou un proche vérifié', points: 12, effort: '5 MIN', pourquoi: 'Un réseau vérifié rassure le prêteur et débloque des plafonds plus hauts.' },
  { id: 'adresse', titre: 'Vérifiez votre adresse avec une facture ENEO', points: 11, effort: '1 PHOTO', pourquoi: 'Dernière pièce manquante : votre dossier passe à 5 / 5.' }
];
/** Ce qu'il manque pour atteindre Elite, et si les conseils restants suffisent. */
export function trajectoire(score: number, conseilsFaits: string[]) {
  const restants = CONSEILS.filter((c) => !conseilsFaits.includes(c.id));
  const gain = restants.reduce((t, c) => t + c.points, 0);
  return { manque: Math.max(0, 800 - score), gainPossible: gain, atteignable: score + gain >= 800, restants };
}
/** Hauteur des barres de l'historique (6 mois), de 6 à 52 px. */
export const hauteurBarre = (valeur: number) => Math.round(((valeur - 500) / 400) * 46) + 6;
