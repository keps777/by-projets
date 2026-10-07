// Rubriques, projets et points de rapport de départ (docs/04-mes-projets.md ; le projet 24 a été retiré).
import type { RubriqueCle } from './modeles.ts';

/** Heure du rapport du soir proposée par défaut (modifiable dans Réglages › Notifications). */
export const HEURE_RAPPORT_DEFAUT = '23:45';

export interface ProjetDefaut { numero: number; nom: string }
export interface RubriqueDefaut { cle: RubriqueCle; nom: string; couleur: string; projets: ProjetDefaut[] }

export const RUBRIQUES_DEFAUT: RubriqueDefaut[] = [
  { cle: 'dieu', nom: 'Ma relation avec Dieu', couleur: '#9D8CFF', projets: [
    { numero: 1, nom: 'La lecture de la Bible' }, { numero: 2, nom: 'RDQD' }, { numero: 3, nom: 'La prière seule' },
    { numero: 4, nom: 'LLC · littérature chrétienne' }, { numero: 5, nom: 'PWO · prière avec d’autres' }, { numero: 6, nom: 'Le jeûne' },
    { numero: 7, nom: 'Le don à Dieu' }, { numero: 8, nom: 'Le don à l’homme' }] },
  { cle: 'service', nom: 'Mon service à Dieu', couleur: '#34D1B6', projets: [
    { numero: 9, nom: 'L’évangélisation' }, { numero: 10, nom: 'Le gagnement des âmes' }, { numero: 11, nom: 'La formation des disciples' }, { numero: 15, nom: 'Dons aux frères' }] },
  { cle: 'travail', nom: 'Mon travail et mes études', couleur: '#5EA6FF', projets: [
    { numero: 12, nom: 'L’excellence professionnelle' }, { numero: 13, nom: 'Mon projet d’entrepreneuriat' }, { numero: 14, nom: 'L’excellence académique' }] },
  { cle: 'vie', nom: 'Ma vie personnelle', couleur: '#FF8F66', projets: [
    { numero: 16, nom: 'La gestion de mes finances' }, { numero: 17, nom: 'Ma garde-robe' }, { numero: 18, nom: 'L’entretien de mon logement' },
    { numero: 19, nom: 'La forme physique' }, { numero: 20, nom: 'L’achat d’une maison' }, { numero: 21, nom: 'La préparation pour le mariage' },
    { numero: 22, nom: 'Le mariage' }, { numero: 23, nom: 'La relation avec ma famille' }] },
  { cle: 'transversal', nom: 'Transversal', couleur: '#F5B843', projets: [{ numero: 25, nom: 'Le suivi de tous les projets' }] }
];

/** Points de rapport proposés au départ : code, nom, numéro du projet lié (spec §9). Tout est modifiable dans les Réglages. */
export const POINTS_DEFAUT: { code: string; nom: string; projet: number }[] = [
  { code: 'DDEWG', nom: 'RDQD · rencontre dynamique quotidienne avec Dieu', projet: 2 },
  { code: 'PA', nom: 'Prière seule', projet: 3 },
  { code: 'BR', nom: 'Lecture de la Bible', projet: 1 },
  { code: 'CL', nom: 'Littérature chrétienne', projet: 4 },
  { code: 'PWO', nom: 'Prière avec d’autres', projet: 5 },
  { code: 'JEÛNE', nom: 'Le jeûne', projet: 6 },
  { code: 'DON-DIEU', nom: 'Don à Dieu', projet: 7 },
  { code: 'DON-HOMME', nom: 'Don à l’homme', projet: 8 },
  { code: 'EVANG', nom: 'Évangélisation', projet: 9 },
  { code: 'ÂMES', nom: 'Gagnement des âmes', projet: 10 },
  { code: 'DISCIPLES', nom: 'Formation des disciples', projet: 11 },
  { code: 'FRÈRES', nom: 'Dons aux frères', projet: 15 }
];

/** Presets d'export proposés au départ (indices dans POINTS_DEFAUT). */
export const PRESETS_DEFAUT = [
  { nom: 'Groupe de prière · 5', points: ['DDEWG', 'PA', 'BR', 'CL', 'PWO'] },
  { nom: 'Mentor · 12', points: POINTS_DEFAUT.map((p) => p.code) },
  { nom: 'Service · 3', points: ['EVANG', 'ÂMES', 'DISCIPLES'] }
];
