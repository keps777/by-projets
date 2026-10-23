// POPULATION SIMULÉE : chiffres d'échelle (milliers de membres) tirés de la maquette Pilotage, pour que les graphiques aient du sens.
// Ce ne sont pas des données réelles ; le vrai compte local s'y ajoute (voir core/pilotage.ts → calculer).
import type { BasePopulation } from '../../core/pilotage.ts';

const M = 1_000_000;
export const BASE: BasePopulation = {
  periodes: [
    // Mois courant : 2,84 Md d'encours, 18 420 membres, 312 partenaires, 1,8 % de retards (maquette).
    { encours: { ecole: 1120 * M, auto: 860 * M, logement: 410 * M, commerce: 170 * M, solaire: 120 * M, sante: 160 * M }, membres: 18_420, credits: 11_960, retards: 215,
      partenaires: { employeurs: 186, ecoles: 63, hopitaux: 41, concessions: 9, commerces: 8, autres: 5 } },
    // Mois précédent : 2,71 Md, 17 980 membres, 305 partenaires, 1,9 %.
    { encours: { ecole: 1070 * M, auto: 825 * M, logement: 392 * M, commerce: 162 * M, solaire: 112 * M, sante: 149 * M }, membres: 17_980, credits: 11_610, retards: 221,
      partenaires: { employeurs: 183, ecoles: 62, hopitaux: 40, concessions: 8, commerces: 7, autres: 5 } },
    // Deux mois avant : 2,52 Md, 17 210 membres, 296 partenaires, 2,1 %.
    { encours: { ecole: 1000 * M, auto: 770 * M, logement: 366 * M, commerce: 150 * M, solaire: 104 * M, sante: 130 * M }, membres: 17_210, credits: 11_080, retards: 233,
      partenaires: { employeurs: 179, ecoles: 60, hopitaux: 39, concessions: 7, commerces: 7, autres: 4 } }
  ],
  // Emprunteurs par part de salaire : < 10 %, 10-20 %, 20-25 %, 25-33 %, > 33 % (alertes : salaire en baisse après l'octroi).
  partSalaire: [3610, 3480, 2390, 2240, 240],
  niveaux: { START: 4120, PLUS: 6840, PRO: 5360, ELITE: 2100 },
  sante: { factures: 3840, volume: 412 * M, assureMe: 296 * M, enRetard: 96 },
  coffres: { nb: 9840, epargne: 642 * M, mensuel: 118 * M },
  activite: {
    employeurs: { operations: 11_840, volume: 385 * M }, ecoles: { operations: 4210, volume: 478 * M }, hopitaux: { operations: 3840, volume: 412 * M },
    concessions: { operations: 34, volume: 204 * M }, commerces: { operations: 18_300, volume: 142 * M }, autres: { operations: 120, volume: 38 * M }
  },
  // Huit mois, du plus ancien au mois courant.
  paie: [
    { salaires: 3950 * M, credits: 128 * M, coffres: 84 * M, pass: 41 * M }, { salaires: 4050 * M, credits: 139 * M, coffres: 90 * M, pass: 43 * M },
    { salaires: 4180 * M, credits: 150 * M, coffres: 96 * M, pass: 45 * M }, { salaires: 4270 * M, credits: 171 * M, coffres: 103 * M, pass: 47 * M },
    { salaires: 4400 * M, credits: 188 * M, coffres: 108 * M, pass: 50 * M }, { salaires: 4510 * M, credits: 201 * M, coffres: 112 * M, pass: 52 * M },
    { salaires: 4570 * M, credits: 207 * M, coffres: 115 * M, pass: 53 * M }, { salaires: 4620 * M, credits: 213 * M, coffres: 118 * M, pass: 54 * M }
  ],
  // Millions de FCFA décaissés, janvier à décembre : la rentrée concentre le besoin en août et septembre (maquette).
  tresorerie: [120, 110, 130, 140, 150, 170, 260, 620, 980, 310, 180, 210]
};
