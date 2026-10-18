/**
 * Ce que le bord (convoyeur, chauffeur, contrôleur) lit et écrit. Les instants sont des chaînes ISO en
 * heure de Douala (`+01:00`), comme partout dans l'API ; les formes sont celles des tables décrites dans
 * le README (`vente_en_route`, `passage_route`, `controle_*`, et les colonnes ajoutées à `depart_incident`
 * et `depart_depense`).
 */

export type ModePaiementBord = "cash" | "momo" | "orange_money";

/** Position GPS relevée sur l'appareil au moment du geste. */
export interface PositionBord {
  latitude: number;
  longitude: number;
  precisionM: number;
}

/** Le détail d'un billet vendu en route : l'arrêt de montée et de descente, le GPS du bus. */
export interface VenteRoute {
  billetId: string;
  departId: string;
  convoyeurId: string;
  arretMontee: string;
  arretDescente: string;
  position: PositionBord | null;
  venduA: string;
}

export type GenrePassage = "scan" | "arrivee";
export type ResultatPassage = "monte" | "deja_a_bord";

/** Un scan à un arrêt ou l'arrivée du bus à un arrêt. L'identifiant est celui de l'événement. */
export interface PassageRoute {
  id: string;
  genre: GenrePassage;
  departId: string;
  auteurId: string;
  arret: string;
  billetId: string | null;
  resultat: ResultatPassage | null;
  position: PositionBord | null;
  at: string;
}

export type CategorieDepense = "carburant" | "peage" | "autre";

export interface DepenseBord {
  id: string;
  departId: string;
  categorie: CategorieDepense;
  libelle: string;
  montant: number;
  justificatifRef: string | null;
  auteurId: string | null;
  saisieA: string;
}

export type NatureIncident = "panne" | "accident" | "route_coupee" | "autre";

export interface IncidentBord {
  id: string;
  departId: string;
  nature: NatureIncident;
  description: string;
  note: string | null;
  position: PositionBord | null;
  auteurId: string | null;
  signaleA: string;
}

/** Le retard annoncé d'un départ (ligne de `depart_observation`). */
export interface RetardDepart {
  departId: string;
  minutes: number | null;
}

export type ConstatSiege = "scanne" | "sans_billet" | "libre";

export interface ControleStocke {
  id: string;
  departId: string;
  controleurId: string;
  lieu: string;
  ouvertA: string;
  clotureA: string | null;
  /** Comptes figés à la clôture (null tant que le contrôle est ouvert). */
  liste: number | null;
  tetes: number | null;
  ecart: number | null;
  envoyeAuPatron: boolean;
}

export interface SiegeConstate {
  controleId: string;
  siege: number;
  constat: ConstatSiege;
  at: string;
}

export interface SignalementConvoyeur {
  evenementId: string;
  controleId: string;
  departId: string;
  convoyeurId: string;
  siege: number;
  montantDeclare: number;
  note: string | null;
  at: string;
  patronPrevenu: boolean;
}

export interface RegularisationControle {
  billetId: string;
  controleId: string;
  siege: number;
  prix: number;
  at: string;
}
