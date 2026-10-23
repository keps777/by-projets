// Les piliers de l'écosystème : chacun s'ouvre à un niveau d'AssureScore, déduit des plafonds de crédit.
import { NIVEAUX, PLAFONDS, SEUILS_NIVEAU, niveauDuScore, type Niveau } from './credit.ts';

export type IdPilier = 'sante' | 'mobilite' | 'logement' | 'ecole' | 'coffres' | 'protection' | 'energie' | 'commerce' | 'diaspora';
export interface Pilier { id: IdPilier; nom: string; pitch: string; accent: string; icone: string; href: string; produit?: string }
export const PILIERS: Pilier[] = [
  { id: 'sante', nom: 'Santé', pitch: "Hôpital à 0 franc, pharmacie et analyses incluses.", accent: '#3DD598', icone: 'sante', href: '/sante', produit: 'sante' },
  { id: 'mobilite', nom: 'Mobilité', pitch: 'Voiture ou moto, crédit sur salaire, livrée chez vous.', accent: '#FF7A2F', icone: 'auto', href: '/auto', produit: 'auto' },
  { id: 'logement', nom: 'Logement', pitch: 'Avance de loyer, caution et loyer garanti au bailleur.', accent: '#7C93FF', icone: 'logement', href: '/logement', produit: 'logement' },
  { id: 'ecole', nom: 'École', pitch: "Frais payés à l'école, suivi des notes en direct.", accent: '#3050FF', icone: 'ecole', href: '/ecole', produit: 'ecole' },
  { id: 'coffres', nom: 'Coffres', pitch: 'Épargne bloquée par objectif, versée sur salaire.', accent: '#7C93FF', icone: 'coffre', href: '/coffres' },
  { id: 'protection', nom: 'Protection', pitch: 'Capital versé en 48 h, sans questionnaire médical.', accent: '#3DD598', icone: 'protection', href: '/protection' },
  { id: 'energie', nom: 'Énergie', pitch: 'Le kit solaire payé chaque mois, moins cher qu’ENEO.', accent: '#FF7A2F', icone: 'solaire', href: '/energie', produit: 'solaire' },
  { id: 'commerce', nom: 'Commerce', pitch: 'Encaissez, financez votre stock, payé le jour même.', accent: '#FF7A2F', icone: 'commerce', href: '/commerce', produit: 'commerce' },
  { id: 'diaspora', nom: 'Diaspora', pitch: 'Payez depuis l’étranger, directement chez le prestataire.', accent: '#3050FF', icone: 'diaspora', href: '/diaspora' }
];
/** Niveau minimal : Mobilité s'ouvre quand le plafond auto devient > 0, Logement quand l'avance de loyer devient possible ; les autres dès START. */
export function niveauRequis(id: IdPilier): Niveau {
  const premier = (ok: (n: Niveau) => boolean) => NIVEAUX.find(ok) ?? 'START';
  if (id === 'mobilite') return premier((n) => PLAFONDS[n].auto > 0);
  if (id === 'logement') return premier((n) => PLAFONDS[n].avanceLoyerMois > 0);
  return 'START';
}
export interface EtatPilier { verrouille: boolean; requis: Niveau; seuil: number; manque: number }
export function etatPilier(id: IdPilier, score: number): EtatPilier {
  const requis = niveauRequis(id), seuil = SEUILS_NIVEAU[requis];
  const verrouille = NIVEAUX.indexOf(niveauDuScore(score)) < NIVEAUX.indexOf(requis);
  return { verrouille, requis, seuil, manque: verrouille ? seuil - score : 0 };
}
export const NOM_NIVEAU: Record<Niveau, string> = { START: 'Start', PLUS: 'Plus', PRO: 'Pro', ELITE: 'Elite' };
