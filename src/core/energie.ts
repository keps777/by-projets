// Énergie solaire : on paie l'énergie, pas le kit. Mensualité sur salaire, kit à soi à la fin.
import { mensualite } from './credit.ts';
export interface Kit { id: 'lampes' | 'maison' | 'business'; nom: string; court: string; prix: number; puissance: string; autonomie: string; garantie: string }
export const KITS: Kit[] = [
  { id: 'lampes', nom: 'Lampes + tél.', court: 'Lampes', prix: 45_000, puissance: '20 W', autonomie: '12 h', garantie: '2 ans' },
  { id: 'maison', nom: 'Maison', court: 'Maison', prix: 350_000, puissance: '400 W', autonomie: '24 h', garantie: '3 ans' },
  { id: 'business', nom: 'Business', court: 'Business', prix: 1_200_000, puissance: '1,5 kW', autonomie: '48 h', garantie: '5 ans' }
];
export const mensualiteKit = (prix: number, duree: number, taux = 0.015) => Math.round(mensualite(prix, taux, duree));
/** Écart avec la facture ENEO : négatif = on économise. */
export const ecartEneo = (mensualiteKitFcfa: number, facture: number) => mensualiteKitFcfa - facture;
