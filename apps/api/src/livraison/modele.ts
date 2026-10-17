import type { MomoPartenaire } from "../relais/modele";

/**
 * Modèle de données de la livraison moto : ce que les ports de persistance gardent.
 * Les numéros MoMo sont ici en clair ; un adaptateur PostgreSQL les chiffre (voir README).
 */

export type Deplacement = "moto" | "velo" | "pied" | "tricycle";

export interface PiecesLivreur {
  permisRef: string | null;
  assuranceRef: string | null;
  /** Dernier jour de validité du permis, relevé par l'agent (AAAA-MM-JJ). */
  permisValideJusqua: string | null;
  /** Dernier jour de l'assurance de la moto (AAAA-MM-JJ). */
  assuranceExpireLe: string | null;
}

/** Un livreur actif : créé quand l'agent active la demande. */
export interface LivreurStocke {
  id: string;
  /** Pour la concurrence optimiste : chaque écriture exige la version lue. */
  version: number;
  /** « L-BAF-0087 » : le numéro du dossier devient le badge. */
  badge: string;
  /** 87 : le numéro de badge, aussi celui du gilet. */
  numero: number;
  personneId: string;
  /** Le nom affiché (« Éric T. »). */
  nom: string;
  ville: string;
  deplacement: Deplacement;
  /** « Bafoussam · Tamdja, Djeleng, centre » */
  zone: string;
  /** « Soirs 17 h – 21 h » */
  heures: string;
  /** « 10 kg · colis courants » */
  chargeMax: string;
  momo: MomoPartenaire;
  pieces: PiecesLivreur;
  /** Immatriculation de la moto (« OU 517 MT »), absente pour un vélo ou à pied. */
  moto: string | null;
  /** Il choisit d'être joignable ou non : une mission ne va qu'aux livreurs disponibles. */
  disponible: boolean;
  /** Faux : suspendu, il ne reçoit plus de mission. */
  actif: boolean;
  note: number;
  creeA: string;
}

export type EtatDemandeLivreur = "recue" | "activee" | "refusee";

export interface DemandeLivreur {
  /** « L-BAF-0087 » */
  dossier: string;
  version: number;
  personneId: string;
  /** 87 */
  numero: number;
  ville: string;
  deplacement: Deplacement;
  zone: string;
  heures: string;
  chargeMax: string;
  momo: MomoPartenaire;
  pieces: Pick<PiecesLivreur, "permisRef" | "assuranceRef">;
  deposeeA: string;
  /** Ce que l'agent a vérifié, avec l'heure. */
  verifications: {
    /** CNI et MoMo au même nom. */
    identiteA: string | null;
    /** Permis et assurance (inutile hors moto : renseigné au dépôt). */
    piecesA: string | null;
    permisValideJusqua: string | null;
    assuranceExpireLe: string | null;
    /** Formation de 10 minutes suivie. */
    formationA: string | null;
  };
  etat: EtatDemandeLivreur;
  decision: { a: string; par: string; motif: string | null } | null;
  livreurId: string | null;
}

export type EtatMission =
  /** Aucun livreur n'a la mission pour l'instant : elle va être proposée. */
  | "en_attente"
  /** Proposée à `livreurId`, qui a 30 secondes. */
  | "proposee"
  /** Acceptée : le livreur a le colis (le colis est « en livraison »). */
  | "acceptee"
  | "livree"
  /** Destinataire absent : le colis a été déposé au point relais de repli. */
  | "repli"
  /** Personne n'a pris la mission après plusieurs tours. */
  | "sans_livreur"
  /** Le colis a changé de mode ou d'état : la mission n'a plus lieu d'être. */
  | "annulee";

export const ETATS_MISSION_OUVERTS: readonly EtatMission[] = [
  "en_attente",
  "proposee",
  "acceptee",
  "sans_livreur",
];

export interface EssaiMission {
  livreurId: string;
  /** Il a refusé ou il n'a pas répondu en 30 secondes. */
  issue: "passee" | "expiree";
  at: string;
  tour: number;
}

export interface MissionLivraison {
  id: string;
  version: number;
  colisId: string;
  colisNumero: string;
  etat: EtatMission;
  /** Le livreur à qui la mission est proposée, puis celui qui l'a acceptée. */
  livreurId: string | null;
  proposeeA: string | null;
  /** Fin des 30 secondes. */
  expireA: string | null;
  essais: EssaiMission[];
  /** Numéro du tour de propositions (on recommence après avoir fait le tour des livreurs). */
  tour: number;
  /** Pas de nouvelle proposition avant cet instant. */
  prochaineA: string | null;
  creeA: string;
  accepteeA: string | null;
  livreeA: string | null;
  trajet: { depart: string; arrivee: string; destinataire: string };
  distanceM: number;
  dureeMinutes: number;
  /** Le prix de la livraison payé par le client. */
  prixLivraison: number;
  /** La part du livreur : 70 % du prix, arrondie à l'inférieur. */
  gain: number;
  /** Le destinataire est absent : le livreur attend, puis dépose au relais de repli. */
  absence: { debutA: string; jusqua: string; relaisId: string } | null;
  repliA: string | null;
}

export interface PartageSuivi {
  /** SHA-256 du jeton du lien : le jeton lui-même n'est jamais gardé. */
  jetonHache: string;
  colisId: string;
  creeA: string;
  expireA: string;
}

export interface InvitationLivreur {
  livreurId: string;
  at: string;
}
