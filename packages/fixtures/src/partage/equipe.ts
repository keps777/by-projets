import {
  B_NGO,
  C_EBOLO,
  D_TCHINDA,
  JOSEPH_M,
  L_FOUDA,
  MARIE_T,
  PAULINE_N,
  S_ATANGANA,
  T_KAMGA,
} from "../monde";

/**
 * L'équipe d'Alpha Voyages : 23 personnes, 9 guichetiers (la liste que Config et ConfigEquipeListe
 * affichent à l'identique), 3 superviseurs, 7 convoyeurs, 4 chauffeurs.
 */
export const EFFECTIFS = [
  { nombre: 9, role: "guichetiers" },
  { nombre: 3, role: "superviseurs" },
  { nombre: 7, role: "convoyeurs" },
  { nombre: 4, role: "chauffeurs" },
] as const;

export const TOTAL_EQUIPE = 23;

export interface LigneGuichetier {
  /** Personne du monde commun. */
  _personneId: string;
  initiales: string;
  nom: string;
  lieu: string;
  detail: string;
  action: string;
}

export const GUICHETIERS: readonly LigneGuichetier[] = [
  {
    _personneId: JOSEPH_M.id,
    initiales: "JM",
    nom: "Joseph M.",
    lieu: "Akwa · guichet 2",
    detail: "PIN à renouveler · 3 écarts",
    action: "modifier",
  },
  {
    _personneId: MARIE_T.id,
    initiales: "MT",
    nom: "Marie T.",
    lieu: "Akwa · guichet 1",
    detail: "1 204 billets · 0 écart",
    action: "modifier",
  },
  {
    _personneId: PAULINE_N.id,
    initiales: "PN",
    nom: "Pauline N.",
    lieu: "Akwa · guichet 3",
    detail: "bloquée · 3 PIN faux",
    action: "modifier",
  },
  {
    _personneId: D_TCHINDA.id,
    initiales: "DT",
    nom: "D. Tchinda",
    lieu: "Mvan · guichet 1",
    detail: "612 billets · 0 écart",
    action: "modifier",
  },
  {
    _personneId: S_ATANGANA.id,
    initiales: "SA",
    nom: "S. Atangana",
    lieu: "Mvan · guichet 2",
    detail: "388 billets · 1 écart",
    action: "modifier",
  },
  {
    _personneId: T_KAMGA.id,
    initiales: "TK",
    nom: "T. Kamga",
    lieu: "Bafoussam · guichet 1",
    detail: "hors ligne 40 min",
    action: "modifier",
  },
  {
    _personneId: B_NGO.id,
    initiales: "BN",
    nom: "B. Ngo",
    lieu: "Akwa · nuit",
    detail: "210 billets · 0 écart",
    action: "modifier",
  },
  {
    _personneId: C_EBOLO.id,
    initiales: "CE",
    nom: "C. Ebolo",
    lieu: "Mvan · nuit",
    detail: "96 billets · 0 écart",
    action: "modifier",
  },
  {
    _personneId: L_FOUDA.id,
    initiales: "LF",
    nom: "L. Fouda",
    lieu: "remplaçant",
    detail: "3 jours ce mois",
    action: "modifier",
  },
];
