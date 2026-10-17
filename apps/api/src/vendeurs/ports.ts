import type {
  Agrement,
  ClasseDepart,
  CreditCommission,
  DebitCommission,
  EtatVente,
  LieuVente,
  OperateurMobile,
  Vendeur,
  Vente,
  Voisin,
} from "./modele";

/**
 * Ports du module des vendeurs ambulants. La logique ne parle qu'à ces classes abstraites ;
 * `memoire.ts` en donne des versions en mémoire (tests, développement) et `adaptateurs.ts` les
 * versions branchées sur la billetterie (AM-162), les paiements (AM-165) et les SMS (AM-166). Les
 * tables PostgreSQL attendues par les adaptateurs de stockage sont décrites dans le README ;
 * l'intégration (Prisma, `AppModule`) est faite par le coordinateur.
 */

/**
 * Un adaptateur en mémoire ou simulé met `durable = false` : le module refuse de démarrer en
 * production tant qu'un port en est encore là.
 */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ persistance */

export abstract class VendeursRepository {
  /** `false` si l'identifiant ou le numéro existe déjà. */
  abstract ajouter(vendeur: Vendeur): Promise<boolean>;
  abstract trouver(id: string): Promise<Vendeur | null>;
  abstract lister(filtre?: { ids?: readonly string[] }): Promise<Vendeur[]>;
  /** Remplace le vendeur si sa version est encore `versionAttendue` (comparaison et écriture atomiques). */
  abstract remplacer(vendeur: Vendeur, versionAttendue: number): Promise<boolean>;
}

export abstract class AgrementsRepository {
  /** Crée ou remplace l'agrément du couple (vendeur, compagnie). */
  abstract enregistrer(agrement: Agrement): Promise<void>;
  abstract trouver(vendeurId: string, compagnieId: string): Promise<Agrement | null>;
  /** Tous les agréments du vendeur, actifs ou retirés. */
  abstract deVendeur(vendeurId: string): Promise<Agrement[]>;
  abstract deCompagnie(compagnieId: string): Promise<Agrement[]>;
}

/** Numéros de vendeur « V-0412 » : un compteur sans trou ni doublon. */
export abstract class NumerosVendeurs {
  /** Prochain numéro, à partir de 1. Atomique. */
  abstract prochain(): Promise<number>;
}

export type ResultatAjoutVente =
  | { resultat: "ajoutee" }
  /** Le vendeur a déjà une vente en attente de règlement (une seule à la fois). */
  | { resultat: "vente_en_cours"; existante: Vente }
  /** Ce voisin a déjà un billet de ce vendeur sur ce départ (même nom, même téléphone). */
  | { resultat: "doublon"; existante: Vente }
  | { resultat: "billet_pris" };

export abstract class VentesRepository {
  /**
   * Ajoute la vente (version 1). Deux contraintes d'unicité tiennent les garanties : une seule vente
   * `en_attente` par vendeur, et une seule vente `en_attente`, `reglee` ou `terminee` par
   * (vendeur, départ, empreinte du voisin).
   */
  abstract ajouter(vente: Vente): Promise<ResultatAjoutVente>;
  abstract trouver(id: string): Promise<Vente | null>;
  /**
   * Applique `changement` si la vente est encore dans l'un des états `de` (comparer et remplacer :
   * deux passages simultanés ne terminent jamais la même vente deux fois). `null` si l'état a
   * changé ou si la vente n'existe pas.
   */
  abstract transitionner(
    id: string,
    de: readonly EtatVente[],
    changement: Partial<Omit<Vente, "id" | "version" | "vendeurId">>,
  ): Promise<Vente | null>;
  abstract duVendeur(
    vendeurId: string,
    filtre?: { etats?: readonly EtatVente[]; depuis?: string; avant?: string },
  ): Promise<Vente[]>;
  abstract parEtats(etats: readonly EtatVente[]): Promise<Vente[]>;
}

export type ResultatReservation = "reserve" | "existe" | "solde_insuffisant";

/**
 * Les commissions des vendeurs : des crédits (un billet vendu et payé à l'agence) et des débits
 * (le versement du lundi). Le solde est la somme des crédits moins celle des débits en attente ou
 * versés. Toute écriture est atomique : deux versements simultanés ne dépensent jamais deux fois le
 * même solde (`reserver`). Aucun montant de billet ne passe jamais ici : seulement des commissions.
 */
export abstract class CommissionsVendeurs {
  /** `false` si la clé existe déjà : une commission n'est comptée qu'une fois. */
  abstract crediter(credit: CreditCommission): Promise<boolean>;
  abstract solde(vendeurId: string): Promise<number>;
  /**
   * Réserve `montant` sur le solde (débit « en attente ») si le solde le permet. Idempotent par clé.
   */
  abstract reserver(demande: {
    cle: string;
    vendeurId: string;
    montant: number;
    at: string;
    operateur: OperateurMobile;
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation>;
  abstract confirmer(cle: string, reference: string): Promise<void>;
  /** Le versement a échoué : le débit disparaît et le solde revient. */
  abstract annuler(cle: string): Promise<void>;
  abstract debitsEnAttente(): Promise<DebitCommission[]>;
  abstract credits(vendeurId: string, depuis: string, avant?: string): Promise<CreditCommission[]>;
  abstract soldesPositifs(): Promise<{ vendeurId: string; solde: number }[]>;
}

/* ------------------------------------------------------------------ comptes */

/**
 * Le compte d'un vendeur. Le socle n'a pas d'opération de changement de rôles : le coordinateur
 * l'implémente (`personne.roles`, PIN provisoire envoyé par SMS pour un compte nouveau).
 */
export abstract class ComptesVendeurs {
  /**
   * Retrouve le compte de ce numéro ou en crée un, puis lui donne le rôle `vendeur`. `nouveau` dit
   * si le compte vient d'être créé (le PIN provisoire part alors par SMS).
   */
  abstract ouvrir(a: {
    nom: string;
    telephone: string;
  }): Promise<{ personneId: string; nom: string; nouveau: boolean }>;
}

/* ------------------------------------------------------------------ billetterie */

/** Un départ tel que le vendeur le voit. */
export interface DepartOffert {
  departId: string;
  compagnieId: string;
  compagnieNom: string;
  classe: ClasseDepart;
  heureDepart: string;
  /** Prix du billet, fixé par la ligne. */
  prix: number;
  placesLibres: number;
  origine: LieuVente;
  destination: LieuVente;
}

export interface BilletEmis {
  billetId: string;
  numero: string;
  siege: number | null;
  /** Code à 4 chiffres pour embarquer sans scanner. */
  code: string;
  emisLe: string;
}

/** Plus aucune place : la retenue ou l'émission n'a pas trouvé de siège libre. */
export class PlusDePlace extends Error {
  constructor(message = "Plus de place sur ce départ") {
    super(message);
    this.name = "PlusDePlace";
  }
}

/** Le départ ne vend plus (parti, annulé, fermé). */
export class DepartNonVendable extends Error {
  constructor(message = "Ce départ n'est plus ouvert à la vente") {
    super(message);
    this.name = "DepartNonVendable";
  }
}

/**
 * La billetterie vue par les vendeurs (AM-162) : lire les départs des compagnies qui les ont agréés,
 * retenir un siège pendant le règlement, puis émettre le billet nominatif au nom du voisin.
 */
export abstract class OffreBillets {
  /** Départs en vente de ces compagnies dans la fenêtre, avec leurs places libres, du plus tôt au plus tard. */
  abstract departs(filtre: {
    compagnieIds: readonly string[];
    de: string;
    avant: string;
    /** Code ou nom de ville (« DLA », « Douala »). */
    origine?: string;
    destination?: string;
  }): Promise<DepartOffert[]>;
  abstract depart(departId: string): Promise<DepartOffert | null>;
  /** Le nom d'une compagnie (pour l'agrément et les messages). */
  abstract compagnie(compagnieId: string): Promise<{ id: string; nom: string } | null>;
  /**
   * Retient le plus petit siège libre pour `par` jusqu'à `jusqua`. Lève `PlusDePlace` s'il n'y en
   * a plus, `DepartNonVendable` si le départ ne vend plus.
   */
  abstract retenir(a: {
    departId: string;
    par: string;
    jusqua: string;
  }): Promise<{ siege: number }>;
  /** Rend le siège retenu à la vente. Sans effet s'il l'est déjà. */
  abstract liberer(a: { departId: string; par: string; siege: number }): Promise<void>;
  /**
   * Émet le billet nominatif (canal « vendeur ») sur le siège retenu. **Idempotent par `billetId`** :
   * rappelé, il renvoie le billet déjà émis. Si le siège retenu a été perdu, un autre siège libre
   * est pris ; `PlusDePlace` s'il n'y en a plus (l'argent est alors à rendre).
   */
  abstract emettre(a: {
    billetId: string;
    departId: string;
    par: string;
    siege: number | null;
    voisin: Voisin;
    moyen: "mtn_momo" | "orange_money";
    reference: string | null;
    at: string;
  }): Promise<BilletEmis>;
}

/* ------------------------------------------------------------------ règlement de l'agence */

export interface DemandeReglement {
  /** Rejouer la même clé ne paie pas deux fois : c'est l'identifiant de la vente. */
  cle: string;
  compagnieId: string;
  vendeurId: string;
  /** Le prix du billet en entier : le vendeur ne retient rien, sa commission lui est versée à part. */
  montant: number;
  moyen: "mtn_momo" | "orange_money";
  /** Le compte mobile money du vendeur : la demande de confirmation part sur ce téléphone. */
  telephone: string;
}

export type EtatReglement =
  /** L'agence a reçu l'argent. */
  | { etat: "reussi"; reference: string | null }
  /** L'opérateur a refusé pour de bon (solde insuffisant, code faux, compte fermé). */
  | { etat: "refuse"; cause: string }
  /** La demande est partie, le vendeur n'a pas encore confirmé. */
  | { etat: "en_attente" }
  /** Aucune trace de cette demande (elle n'est jamais partie). */
  | { etat: "inconnu" };

/**
 * Le vendeur paie l'agence par mobile money : l'argent va du compte du vendeur **au compte de la
 * compagnie** chez l'agrégateur (AM-165). Il ne passe par aucun compte du vendeur ni d'AfriMove.
 */
export abstract class ReglementsAgence {
  /**
   * Lance la demande de paiement. **Idempotent par `cle`**. Une erreur de transport (réseau, délai)
   * veut dire « résultat inconnu » : la tâche de fond rejouera avec la même clé.
   */
  abstract regler(demande: DemandeReglement): Promise<EtatReglement>;
  abstract statut(cle: string, compagnieId: string): Promise<EtatReglement>;
}

/* ------------------------------------------------------------------ messages */

export interface DemandeSmsBillet {
  billetId: string;
  numero: string;
  siege: number | null;
  code: string;
  /** Le voisin : le billet est à son nom. */
  destinataire: string;
  depart: DepartOffert;
  vendeurId: string;
}

/** Les SMS du module : jamais bloquants (une panne est notée, pas propagée). */
export abstract class MessagesVendeurs {
  /** Le SMS du billet au voisin (code à 4 chiffres et lien). Idempotent par billet et par numéro. */
  abstract envoyerBillet(demande: DemandeSmsBillet): Promise<boolean>;
  /** Un message libre au vendeur ou à l'agence (agrément, retrait, versement). */
  abstract prevenir(telephone: string, message: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ versements */

export type { DemandeVersement } from "../relais/ports";
export { VersementRefuse, VersementsMobile } from "../relais/ports";

export interface OptionsVendeurs {
  /** Attente maximale de la confirmation de l'opérateur pendant la vente. */
  delaiReglementMs: number;
  /** Intervalle entre deux lectures de l'état du paiement. */
  sondageMs: number;
  /** Périodicité des tâches de fond ; 0 = pas de minuterie (tests). */
  tachesMs: number;
  /** Adresse (https, terminée par « / ») où le voisin ouvre son billet. */
  baseLienBillet: string;
}

export const OPTIONS_VENDEURS = Symbol("OPTIONS_VENDEURS");
