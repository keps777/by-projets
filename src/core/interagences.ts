// Colis entre compagnies : convention (partage du prix client), répartition de l'argent, solde net, échéance de règlement mensuel.
import type { Ligne } from '../domain/types.ts';
import { ajouterMois, jourDe, type Jour } from './dates.ts';

export type StatutConvention = 'demandee' | 'brouillon' | 'signee' | 'active';
export interface Signature { /** Traits tracés au doigt (points arrondis, 0–100). */ traits: [number, number][][]; mode: 'doigt' | 'visage' | 'accord'; par: string; ts: number }
export interface Convention {
  partenaireId: string; /** Part du prix client qui reste à Bêta (30 à 70 %). */ partBetaPct: number; statut: StatutConvention; duree: number; renouvellement: Jour;
  signee?: Signature; envoyeeLe?: number; activeLe?: number;
}
/** Un colis confié à un partenaire : la part est figée à la date de l'envoi. */
export interface ColisPartenaire { colisId: string; partenaireId: string; confieLe: number; partBetaPct: number; prix: number; regleLe?: number }
export const PART_MIN = 30, PART_MAX = 70, PAS_PART = 5, JOUR_REGLEMENT = 5, DUREE_MOIS = 12;
export const borner = (partBeta: number) => Math.max(PART_MIN, Math.min(PART_MAX, Math.round(partBeta / PAS_PART) * PAS_PART));

/** Répartition du prix payé par le client : la part du partenaire est arrondie au franc, le reste va à Bêta. */
export function repartition(prix: number, partBetaPct: number) {
  const partenaire = Math.round((prix * (100 - partBetaPct)) / 100);
  return { beta: prix - partenaire, partenaire };
}
const villeDe = (lieu: string) => lieu.split('·')[0].trim();
/** Villes d'un trajet de colis (« Yaoundé · Mvan » → Yaoundé). */
export const villesDuColis = (depart: string, arrivee: string): [string, string] => [villeDe(depart), villeDe(arrivee)];
/** Le partenaire a-t-il une ligne entre ces deux villes (dans un sens ou dans l'autre) ? */
export const couvre = (lignes: Pick<Ligne, 'compagnieId' | 'de' | 'vers' | 'actif'>[], partenaireId: string, a: string, b: string) =>
  lignes.some((l) => l.compagnieId === partenaireId && l.actif && ((l.de === a && l.vers === b) || (l.de === b && l.vers === a)));
/** « Yaoundé ↔ Douala » pour chaque paire de villes desservie par le partenaire. */
export function lignesCouvertes(lignes: Pick<Ligne, 'compagnieId' | 'de' | 'vers' | 'actif'>[], partenaireId: string): string[] {
  const paires = new Set<string>();
  for (const l of lignes) if (l.compagnieId === partenaireId && l.actif) paires.add([l.de, l.vers].sort((x, y) => x.localeCompare(y, 'fr')).join(' ↔ '));
  return [...paires];
}
/** Montant que Bêta doit encore verser à un partenaire (tous mois confondus). */
export const aRegler = (liens: ColisPartenaire[], partenaireId: string) => liens.filter((l) => l.partenaireId === partenaireId && !l.regleLe).reduce((s, l) => s + repartition(l.prix, l.partBetaPct).partenaire, 0);
export interface BilanMois { colis: number; chiffre: number; aPayer: number; aRecevoir: number; net: number; echeance: Jour }
/** Bilan d'un mois civil (`jourDuMois` : un jour quelconque du mois) : ce que Bêta doit aux partenaires pour ses colis confiés. Règlement le 5 du mois suivant. */
export function bilanMois(liens: ColisPartenaire[], jourDuMois: Jour, partenaireId?: string): BilanMois {
  const mois = jourDuMois.slice(0, 7), mesLiens = liens.filter((l) => (!partenaireId || l.partenaireId === partenaireId) && jourDe(new Date(l.confieLe)).slice(0, 7) === mois);
  const aPayer = mesLiens.filter((l) => !l.regleLe).reduce((s, l) => s + repartition(l.prix, l.partBetaPct).partenaire, 0);
  return { colis: mesLiens.length, chiffre: mesLiens.reduce((s, l) => s + l.prix, 0), aPayer, aRecevoir: 0, net: -aPayer, echeance: ajouterMois(`${mois}-01`, 1, JOUR_REGLEMENT) };
}
/** Conditions écrites de la convention (affichées avant signature). */
export const CONDITIONS = [
  ['Responsabilité colis', 'celui qui a le colis'], ['Assurance', 'AfriMove · 50 000 F max'], ['Règlement', `le ${JOUR_REGLEMENT} du mois suivant · MoMo Business`], ['Durée', `${DUREE_MOIS} mois · tacite reconduction`]
] as const;
export const libelleStatut: Record<StatutConvention, { texte: string; ton: 'wa' | 'ok' | 'inf' | 'ac' }> = {
  demandee: { texte: 'demandée', ton: 'inf' }, brouillon: { texte: 'brouillon', ton: 'wa' }, signee: { texte: 'signée par toi', ton: 'ac' }, active: { texte: 'active', ton: 'ok' }
};
