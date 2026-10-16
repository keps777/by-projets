import {
  BUS_LT095,
  BUS_LT118,
  BUS_LT148,
  BUS_LT207,
  BUS_LT261,
  BUS_LT330,
  BUS_LT412,
} from "../monde";

/**
 * Les chiffres de la semaine du 29 décembre au 4 janvier que se partagent les planches Analyses,
 * AnalysesLigne, AnalysesBus, AssistantReponse et Patron. Les valeurs sont celles des planches ;
 * ce que chacune montre en plus (départs de la ligne, trajets du bus) reste dans son scénario.
 */
export const SEMAINE = {
  libelle: "Semaine du 29 déc. au 4 janv.",
  gares: 3,
} as const;

/** Les 7 jours de la semaine : barres de hauteur 62, 58, 55, 60, 88, 100 et 70 (px), vendredi et samedi en ambre. */
export const RECETTE_PAR_JOUR = {
  initiales: ["L", "M", "M", "J", "V", "S", "D"],
  hauteursPx: [62, 58, 55, 60, 88, 100, 70],
  misesEnAvant: ["V", "S"],
} as const;

export interface LigneAnalysee {
  nom: string;
  remplissage: number;
  recette: string;
}

/** Les lignes de la liste « Par ligne · remplissage » (largeur de barre = remplissage en %). */
export const LIGNES_ANALYSEES: readonly LigneAnalysee[] = [
  { nom: "Douala → Yaoundé", remplissage: 91, recette: "14,2 M" },
  { nom: "Douala → Bafoussam", remplissage: 78, recette: "8,1 M" },
  { nom: "Yaoundé → Bafoussam", remplissage: 61, recette: "4,0 M" },
  { nom: "Douala → Bamenda", remplissage: 83, recette: "3,6 M" },
  { nom: "Yaoundé → Douala", remplissage: 88, recette: "12,9 M" },
  { nom: "Bafoussam → Douala", remplissage: 74, recette: "6,2 M" },
];

export interface BusAnalyse {
  immatriculation: string;
  chauffeur: string;
  trajets: number;
  net: string;
  incident: string;
}

/** Les 7 bus nommés de « Par bus · net » (la flotte en compte 14). */
export const BUS_ANALYSES: readonly BusAnalyse[] = [
  {
    immatriculation: BUS_LT412.immatriculation,
    chauffeur: "Mbarga",
    trajets: 9,
    net: "+ 2,8 M",
    incident: "0 incident",
  },
  {
    immatriculation: BUS_LT118.immatriculation,
    chauffeur: "Fotso",
    trajets: 8,
    net: "+ 2,1 M",
    incident: "carburant + 12 %",
  },
  {
    immatriculation: BUS_LT207.immatriculation,
    chauffeur: "Nana",
    trajets: 5,
    net: "+ 0,6 M",
    incident: "2 pannes",
  },
  {
    immatriculation: BUS_LT330.immatriculation,
    chauffeur: "Essomba",
    trajets: 8,
    net: "+ 1,9 M",
    incident: "0 incident",
  },
  {
    immatriculation: BUS_LT095.immatriculation,
    chauffeur: "Tchinda",
    trajets: 7,
    net: "+ 1,7 M",
    incident: "pneus à changer",
  },
  {
    immatriculation: BUS_LT261.immatriculation,
    chauffeur: "Abena",
    trajets: 6,
    net: "+ 1,2 M",
    incident: "1 retard > 30 min",
  },
  {
    immatriculation: BUS_LT148.immatriculation,
    chauffeur: "Mballa",
    trajets: 4,
    net: "+ 0,4 M",
    incident: "visite technique",
  },
];
