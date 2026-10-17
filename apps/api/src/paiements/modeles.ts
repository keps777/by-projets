/**
 * Vocabulaire des paiements (AM-165) : moyens, statuts, un paiement, un remboursement.
 * Aucune dépendance Nest ici : ces types servent aux ports, aux règles et aux tests.
 */

/** Moyens passés par l'agrégateur. */
export const MOYENS_EN_LIGNE = ["mtn_momo", "orange_money", "carte"] as const;
export type MoyenEnLigne = (typeof MOYENS_EN_LIGNE)[number];

/** Moyens d'un encaissement hors agrégateur (mode dégradé, à la gare). */
export const MOYENS_AGENCE = ["especes_agence", "momo_marchand"] as const;
export type MoyenAgence = (typeof MOYENS_AGENCE)[number];

export type MoyenPaiement = MoyenEnLigne | MoyenAgence;

export type OperateurMobile = "mtn" | "orange";

/**
 * Cycle de vie du paiement (les quatre valeurs du contrat `StatutPaiement`) :
 * `en_attente` → `reussi` | `echoue` | `expire`. Un paiement `echoue` ou `expire` peut encore passer à
 * `reussi` : l'opérateur confirme parfois après le délai (paiement tardif), et l'argent a bien bougé.
 */
export type StatutPaiement = "en_attente" | "reussi" | "echoue" | "expire";

/** Qui paie et pour quoi. */
export type OriginePaiement =
  /** Le voyageur connecté règle sa commande. */
  | "voyageur"
  /** Un proche règle la commande du voyageur par le lien reçu. */
  | "proche"
  /** Push MoMo demandé au guichet pour une vente (pas de commande en ligne). */
  | "guichet"
  /** Encaissement à la gare d'une commande réservée, en mode dégradé. */
  | "agence";

/**
 * Ce qui est arrivé à la commande une fois l'argent reçu :
 *  - `a_faire` : l'argent est reçu, les billets ne sont pas encore émis (reprise par le balayage) ;
 *  - `faite` : billets émis ;
 *  - `sieges_perdus`, `commande_annulee`, `doublon` : pas de billet, le paiement est remboursé ;
 *  - `sans_objet` : encaissement sans commande (guichet).
 */
export type ConfirmationCommande =
  | "sans_objet"
  | "a_faire"
  | "faite"
  | "sieges_perdus"
  | "commande_annulee"
  | "doublon";

export type Beneficiaire = "compagnie" | "afrimove";

/**
 * Une ligne de reversement : le prix du billet part vers la compagnie, les frais vers AfriMove.
 * L'agrégateur répartit lui-même l'encaissement entre les comptes : AfriMove ne détient jamais le
 * prix du billet.
 */
export interface LigneReversement {
  beneficiaire: Beneficiaire;
  /** Compte (sous-compte marchand) du bénéficiaire chez l'agrégateur. */
  compteId: string;
  montant: number;
}

export interface Paiement {
  id: string;
  /** Clé d'idempotence fournie par l'appelant (guichet : identifiant de l'événement de vente). */
  cle: string | null;
  origine: OriginePaiement;
  commandeId: string | null;
  /** Voyageur connecté qui paie ou dont la commande est réglée ; `null` pour un guichet. */
  voyageurId: string | null;
  compagnieId: string;
  moyen: MoyenPaiement;
  operateur: OperateurMobile | null;
  /** Montant encaissé en FCFA entiers. */
  montant: number;
  /** Carte étrangère : montant demandé dans la devise du payeur (unité mineure). */
  devise: { code: string; montantMineur: number } | null;
  repartition: LigneReversement[];
  statut: StatutPaiement;
  confirmation: ConfirmationCommande;
  /** Numéro qui reçoit la demande de confirmation (chiffré) et sa version pour l'écran. */
  telephoneChiffre: string | null;
  telephoneMasque: string | null;
  fournisseur: string | null;
  /** Identifiant de la transaction chez l'agrégateur. */
  idFournisseur: string | null;
  /** Référence de l'opérateur (MTN, Orange) : sert au rapprochement comptable. */
  referenceOperateur: string | null;
  urlAuthentification: string | null;
  /** Code court de la dernière cause d'échec ou d'anomalie, jamais de texte du fournisseur. */
  cause: string | null;
  billetIds: string[];
  creeA: Date;
  /** Passé cet instant, un paiement sans nouvelle devient `expire`. */
  expireA: Date;
  termineA: Date | null;
}

export type CauseRemboursement =
  | "billet_annule"
  | "depart_annule"
  | "sieges_perdus"
  | "commande_annulee"
  | "doublon_paiement"
  | "demande_afrimove";

export type StatutRemboursement = "demande" | "reussi" | "echoue";

export interface LigneRemboursement {
  beneficiaire: Beneficiaire;
  montant: number;
}

/** Un remboursement vers le moyen d'origine, pris sur les parts du bénéficiaire concerné. */
export interface Remboursement {
  id: string;
  paiementId: string;
  /** Idempotence : la même clé ne produit jamais deux remboursements. */
  cle: string;
  cause: CauseRemboursement;
  billetId: string | null;
  lignes: LigneRemboursement[];
  montant: number;
  statut: StatutRemboursement;
  idFournisseur: string | null;
  referenceOperateur: string | null;
  tentatives: number;
  prochainEssaiA: Date | null;
  derniereErreur: string | null;
  creeA: Date;
  termineA: Date | null;
}

/** Lien envoyé à un proche : seul l'empreinte (SHA-256) du jeton est conservée. */
export interface LienPaiement {
  id: string;
  commandeId: string;
  empreinte: string;
  creePar: string;
  creeA: Date;
  expireA: Date;
  envoyeA: string | null;
  revoqueA: Date | null;
}

export type RaisonModeDegrade = "reglage" | "agregateur_absent" | "agregateur_indisponible";

export interface ReglageMode {
  degrade: boolean;
  motif: string | null;
  parId: string | null;
  at: Date | null;
}

export const sommeMontants = (lignes: ReadonlyArray<{ montant: number }>): number =>
  lignes.reduce((total, l) => total + l.montant, 0);
