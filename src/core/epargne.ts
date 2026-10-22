// Coffres : épargne bloquée par objectif, versée le jour de paie, à 3,5 % par an.
import { ajouterMois, type Jour } from './dates.ts';
export const TAUX_COFFRE = 0.035;
export const moisPourAtteindre = (cible: number, dejaEpargne: number, versementMensuel: number) =>
  versementMensuel <= 0 ? Infinity : Math.max(0, Math.ceil((cible - dejaEpargne) / versementMensuel));
/** Mois d'atteinte de l'objectif, à partir du mois suivant `depuis`. */
export const dateObjectif = (depuis: Jour, mois: number): Jour => ajouterMois(depuis.slice(0, 7) + '-01', mois);
/** Intérêts estimés sur toute la durée (versements progressifs : moitié du capital en moyenne). */
export const gainInterets = (cible: number, mois: number) => Math.round((cible * TAUX_COFFRE * (mois / 12)) / 2);
/** Intérêts d'un mois sur le solde. */
export const interetMensuel = (solde: number) => Math.round((solde * TAUX_COFFRE) / 12);
export const pctCoffre = (epargne: number, objectif: number) => (objectif > 0 ? Math.min(100, Math.round((epargne / objectif) * 100)) : 0);
export const partParMembre = (versement: number, membres: number) => Math.round(versement / Math.max(1, membres));
export interface ModeleCoffre { genre: string; nom: string; accent: string; glow: string; icone: string }
export const GENRES_COFFRE = ['Rentrée', 'Voiture', 'Maison', 'Mariage', 'Libre'] as const;
export const ACCENTS_COFFRE: Record<string, { accent: string; glow: string }> = {
  Rentrée: { accent: '#3050FF', glow: 'rgba(48,80,255,0.65)' }, Voiture: { accent: '#FF7A2F', glow: 'rgba(255,122,47,0.55)' },
  Maison: { accent: '#7C93FF', glow: 'rgba(124,147,255,0.5)' }, Mariage: { accent: '#3DD598', glow: 'rgba(61,213,152,0.5)' }, Libre: { accent: '#7C93FF', glow: 'rgba(124,147,255,0.5)' },
  Urgences: { accent: '#3DD598', glow: 'rgba(61,213,152,0.5)' }
};
