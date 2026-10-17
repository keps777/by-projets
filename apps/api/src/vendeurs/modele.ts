import type { OperateurMobile } from "../relais/regles";

/**
 * Modèle de données des vendeurs ambulants : ce que les ports de persistance gardent.
 * Les noms et téléphones sont ici en clair ; un adaptateur PostgreSQL les chiffre
 * (`ChiffrementService`, voir README).
 */

export type { OperateurMobile };

export type ClasseDepart = "classique" | "vip";

/** Le compte mobile money du vendeur : il paie l'agence avec, et reçoit sa commission dessus. */
export interface MomoVendeur {
  /** +237… */
  telephone: string;
  operateur: OperateurMobile;
}

/**
 * Un vendeur ambulant agréé. L'identifiant est celui de son compte (`personne.id`) : le jeton du
 * vendeur désigne donc directement sa fiche.
 */
export interface Vendeur {
  /** `personne.id` du compte au rôle `vendeur`. */
  id: string;
  /** Concurrence optimiste : chaque écriture exige la version lue. */
  version: number;
  /** « V-0412 » : le numéro est donné au premier agrément et ne change plus. */
  numero: string;
  nom: string;
  /** Le téléphone du compte (+237…) : les SMS d'agrément et de versement y partent. */
  telephone: string;
  quartier: string;
  /** Ville où il vend : l'origine des départs proposés par défaut. */
  ville: string;
  momo: MomoVendeur;
  /** Faux : suspendu par AfriMove, il ne vend plus nulle part. */
  actif: boolean;
  creeA: string;
}

/**
 * L'agrément d'un vendeur par une agence (une compagnie). Un vendeur peut être agréé par plusieurs
 * compagnies (« agréé par Alpha et Bêta ») et ne vend que leurs billets.
 */
export interface Agrement {
  vendeurId: string;
  compagnieId: string;
  compagnieNom: string;
  etat: "actif" | "retire";
  /** Commission par billet classique (100 F par défaut). */
  commissionClassique: number;
  /** Commission par billet VIP (150 F par défaut). */
  commissionVip: number;
  accordeLe: string;
  /** Qui, dans l'agence, a donné l'agrément. */
  accordePar: string;
  retireLe: string | null;
}

/**
 * Une vente à un voisin. Le billet est émis seulement quand l'agence a reçu l'argent : tant que le
 * vendeur n'a pas payé (MoMo), il n'y a ni billet ni commission, et le siège n'est que retenu.
 *
 *   en_attente ──► reglee ──► terminee      (billet émis, SMS au voisin, commission créditée)
 *       │
 *       ├──► refusee   (l'opérateur a refusé : le vendeur rend l'argent au voisin)
 *       └──► expiree   (aucune réponse avant la fin de la retenue du siège)
 *   refusee | expiree ──► a_rembourser   (l'argent est arrivé après coup : AfriMove rembourse)
 */
export type EtatVente =
  | "en_attente"
  | "reglee"
  | "terminee"
  | "refusee"
  | "expiree"
  | "a_rembourser";

export interface LieuVente {
  /** Code de ville de la gare : « DLA ». */
  code: string;
  ville: string;
}

export interface Voisin {
  nom: string;
  /** +237… */
  telephone: string;
}

export interface Vente {
  id: string;
  version: number;
  vendeurId: string;
  compagnieId: string;
  departId: string;
  /** Identifiant du billet, fixé dès la vente : émettre le billet deux fois ne crée rien de plus. */
  billetId: string;
  billetNumero: string | null;
  /** Siège retenu pendant le règlement. */
  siege: number | null;
  voisin: Voisin;
  /** Index aveugle du téléphone du voisin : « mes clients ». */
  voisinIndex: string;
  /** Index aveugle du nom et du téléphone : un même voisin n'a pas deux billets sur un départ. */
  empreinte: string;
  origine: LieuVente;
  destination: LieuVente;
  classe: ClasseDepart;
  departA: string;
  /** Prix du billet, payé en entier à l'agence. */
  prix: number;
  commission: number;
  /** Moyen avec lequel le vendeur règle l'agence. */
  moyen: "mtn_momo" | "orange_money";
  etat: EtatVente;
  creeA: string;
  /** Fin de la retenue du siège : passé ce délai sans règlement, la vente expire. */
  expireA: string;
  /** Référence de la transaction de l'opérateur, une fois l'agence payée. */
  reference: string | null;
  /** Heure à laquelle l'agence a été payée. */
  regleeA: string | null;
  /** Pourquoi la vente n'a pas abouti : « solde_insuffisant », « plus_de_place »… */
  cause: string | null;
  termineeA: string | null;
  majA: string;
}

export interface CreditCommission {
  /** Clé d'idempotence : « commission:<venteId> ». */
  cle: string;
  vendeurId: string;
  compagnieId: string;
  montant: number;
  venteId: string;
  at: string;
}

export interface DebitCommission {
  /** Clé d'idempotence : « commissions:<vendeurId>:<AAMMJJ du lundi> ». */
  cle: string;
  vendeurId: string;
  montant: number;
  at: string;
  etat: "en_attente" | "verse";
  operateur: OperateurMobile;
  telephone: string;
  libelle: string;
  /** Référence de la transaction de l'opérateur, une fois versé. */
  reference: string | null;
}
