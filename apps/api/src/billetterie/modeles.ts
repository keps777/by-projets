import type {
  ActionBillet,
  ActionDepart,
  ClasseBillet,
  EtatBillet,
  EtatDepart,
  Fcfa,
} from "./regles";

/**
 * Ce que la billetterie lit et écrit. Ces formes sont celles des tables décrites dans le README
 * (`ligne`, `arret`, `bus`, `depart`, `billet`, `commande`…), avec des dates ISO de Douala.
 */

export interface Compagnie {
  id: string;
  /** Code agence de 3 lettres : « ALP ». */
  code: string;
  nom: string;
}

export interface Gare {
  id: string;
  compagnieId: string;
  /** Code de la ville, utilisé dans les recherches et les numéros : « DLA », « YDE ». */
  code: string;
  /** Nom de la gare : « Akwa », « Mvan ». */
  nom: string;
  /** Nom de la ville : « Douala ». */
  ville: string;
}

export interface Guichet {
  id: string;
  gareId: string;
  /** Rang 1 à 3 : détermine la plage de numéros. */
  rang: number;
}

export interface Arret {
  id: string;
  nom: string;
  /** Position dans la ligne (0 = origine). */
  ordre: number;
  kmDepuisOrigine: number;
  montee: boolean;
}

export interface TarifsLigne {
  classique: Fcfa;
  vip: Fcfa;
  bagage: Fcfa;
}

export interface Ligne {
  id: string;
  compagnieId: string;
  /** Origine + destination sans tiret : « DLAYDE ». */
  code: string;
  origineGareId: string;
  destinationGareId: string;
  tarifs: TarifsLigne;
  /** Durée du trajet (colonne à ajouter à `ligne`). */
  dureeMinutes: number;
  arrets: Arret[];
}

export interface Bus {
  id: string;
  compagnieId: string;
  immatriculation: string;
  capacite: number;
  /** Places de soute (colonne à ajouter à `bus`). */
  capaciteSoute: number;
  classe: ClasseBillet;
}

export interface PersonneRef {
  id: string;
  nom: string;
}

export interface EntreeHistorique<E extends string, A extends string> {
  action: A;
  de: E;
  vers: E;
  at: string;
  par?: string;
  motif?: string;
}

export interface Depart {
  id: string;
  /** AGENCE-LIGNE-AAMMJJ-HHMM */
  numero: string;
  ligneId: string;
  busId: string | null;
  classe: ClasseBillet;
  heureDepart: string;
  etat: EtatDepart;
  historique: EntreeHistorique<EtatDepart, ActionDepart>[];
  fusionneDansId: string | null;
  /** Numéro du quai (colonne à ajouter à `depart`). */
  quai: number | null;
  chauffeur: PersonneRef | null;
  convoyeur: PersonneRef | null;
}

/** Un départ avec tout ce qu'il faut pour l'afficher. */
export interface DepartComplet {
  depart: Depart;
  ligne: Ligne;
  compagnie: Compagnie;
  origine: Gare;
  destination: Gare;
  bus: Bus | null;
}

export type CanalVente = "guichet" | "convoyeur" | "en_ligne" | "vendeur";

/** L'identité d'un voyageur : stockée chiffrée (AES-256-GCM), jamais en clair en base. */
export interface Passager {
  nom: string | null;
  telephone: string | null;
  pieceQuatreDerniers: string | null;
}

export interface Billet {
  id: string;
  /** AGENCE-GARE-AAMMJJ-NNNN. Jamais modifié, même après annulation. */
  numero: string;
  sequence: number;
  compagnieId: string;
  gareId: string;
  departId: string;
  siege: number | null;
  classe: ClasseBillet;
  /** Tarif de la classe. */
  prix: Fcfa;
  /** Supplément bagage payé avec le billet (0 sans bagage). */
  bagage: Fcfa;
  canal: CanalVente;
  guichetId: string | null;
  /** Le voyageur connecté qui a acheté le billet en ligne. */
  acheteurId: string | null;
  commandeId: string | null;
  /** JSON {nom, telephone, pieceQuatreDerniers} chiffré. */
  passagerChiffre: string;
  /** Index aveugle du téléphone du passager. */
  passagerTelephoneIndex: string | null;
  codeBillet: string;
  /** Contenu du QR code signé, posé à l'émission. */
  qr: string;
  creeA: string;
  etat: EtatBillet;
  historique: EntreeHistorique<EtatBillet, ActionBillet>[];
  /** Identifiant de l'événement qui a créé le billet (vente au guichet). */
  evenementId: string | null;
  appareilId: string | null;
  auteurId: string | null;
  paiement: { mode: "cash" | "momo" | "orange_money"; reference: string | null } | null;
  /** Billet de cadence : le nom et la pièce se complètent au quai. */
  aCompleterAuQuai: boolean;
  smsEnvoye: boolean;
  /** Le voyageur a prévenu qu'il est en retard. */
  retardPrevenu: boolean;
  embarqueA: string | null;
  /** Billet d'origine quand celui-ci est issu d'un report. */
  reporteDe: string | null;
}

export type StatutCommande = "en_attente_paiement" | "payee" | "expiree" | "annulee";
export type TypeCommande = "billet" | "groupe" | "proche" | "covoiturage";

export interface LigneDevisStockee {
  code: string;
  libelle: string;
  montant: Fcfa;
  montantBarre?: Fcfa;
  offertAvec?: string;
}

export interface Commande {
  id: string;
  voyageurId: string;
  departId: string;
  type: TypeCommande;
  libelle: string;
  lignes: LigneDevisStockee[];
  total: Fcfa;
  conversion: { devise: string; montantMineur: number; approximatif: boolean } | null;
  statut: StatutCommande;
  creeeA: string;
  expireA: string;
  sieges: number[];
  /** Un passager par siège, JSON chiffré. */
  passagersChiffre: string;
  billetIds: string[];
  codePromo: string | null;
  /** Moyen de paiement qui a soldé la commande (posé par les paiements). */
  moyenPaiement: string | null;
}

export type ResultatScan =
  | "monte"
  | "deja_scanne"
  | "introuvable"
  | "autre_depart"
  | "annule"
  | "sans_nom";

export interface ScanStocke {
  /** Événement du scan : une ligne par événement, jamais deux. */
  evenementId: string;
  /** Le départ du quai où le scan a eu lieu. */
  departId: string;
  billetId: string | null;
  numero: string | null;
  resultat: ResultatScan;
  at: string;
  siege: number | null;
  classe: ClasseBillet | null;
  bagagesSoute: number;
  /** Premier scan du billet, pour « déjà scanné à 08:12 ». */
  premierScanA: string | null;
  appareilId: string;
  auteurId: string;
}

/** Une réponse déjà donnée à un événement : rejouée telle quelle (statut « deja_recu »). */
export interface EvenementTraite {
  id: string;
  type: string;
  recuA: string;
  /** Réponse JSON chiffrée (elle contient l'identité du passager). */
  reponseChiffree: string;
}

export interface PlanStocke {
  /** siège → billet */
  occupes: Record<number, string>;
  /** siège → blocage en cours */
  bloques: Record<number, { par: string; commandeId: string | null; jusqua: string }>;
  /** Compteur qui monte à chaque changement du plan. */
  version: number;
}
