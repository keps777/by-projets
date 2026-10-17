import type {
  ColisStocke,
  DepartColis,
  GareRef,
  GuichetRef,
  PhotoColis,
  ReclamationStockee,
  RelaisRef,
} from "./modele";
import type { EtatColis } from "./regles";

/**
 * Ports du module colis : tout ce qui sort du processus (base de données, SMS, paiement, assureur,
 * stockage de photos, annuaires des autres modules). La logique ne parle qu'à ces classes
 * abstraites ; `memoire.ts` en donne des versions en mémoire (tests, développement).
 * `postgres.ts` en donne les versions PostgreSQL (tables décrites dans le README) ; les deux passent
 * la même suite de contrat (`testing/contrat-ports.ts`).
 */

/**
 * Un adaptateur en mémoire ou simulé met `durable = false` : `ColisModule` refuse de démarrer en
 * production tant qu'un port en est encore là. Un adaptateur réel n'a pas besoin de le déclarer.
 */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ persistance */

export interface FiltreColis {
  expediteurId?: string;
  destinataireTelephone?: string;
  compagnieId?: string;
  departId?: string;
  etats?: readonly EtatColis[];
  /** Colis disponibles depuis ce moment ou avant (garde de 7 jours écoulée). */
  disponibleAvant?: string;
  /** Colis payés dont l'assurance n'a pas pu être souscrite. */
  assuranceEnAttente?: boolean;
  /** Colis payés dont le code n'est jamais parti vers le destinataire. */
  codeNonEnvoye?: boolean;
}

export type ResultatAjoutColis = "ajoute" | "id_existe" | "numero_pris";

export abstract class ColisRepository {
  /** Ajoute le colis (version 1). Le numéro et l'identifiant sont uniques. */
  abstract ajouter(colis: ColisStocke): Promise<ResultatAjoutColis>;
  abstract trouver(id: string): Promise<ColisStocke | null>;
  abstract trouverParNumero(numero: string): Promise<ColisStocke | null>;
  /**
   * Remplace le colis si sa version est encore `versionAttendue` (comparaison et écriture atomiques :
   * `UPDATE … WHERE version = $n`). Renvoie `false` si quelqu'un l'a modifié entre-temps.
   */
  abstract remplacer(colis: ColisStocke, versionAttendue: number): Promise<boolean>;
  abstract lister(filtre: FiltreColis): Promise<ColisStocke[]>;
  /** Plus grand numéro de séquence pris par un colis de cette gare ce jour-là, dans la plage. */
  abstract plusGrandeSequence(
    gareId: string,
    jour: string,
    plage: { debut: number; fin: number },
  ): Promise<number | null>;
}

export abstract class PhotosColis {
  /** Enregistre ou complète la photo (même `ref` : garde la première date de prise de vue). */
  abstract enregistrer(photo: PhotoColis): Promise<PhotoColis>;
  abstract trouver(ref: string): Promise<PhotoColis | null>;
  abstract parColis(colisId: string): Promise<PhotoColis[]>;
  /** Photos non encore supprimées dont la date d'expiration est atteinte. */
  abstract expirees(maintenant: string): Promise<PhotoColis[]>;
  abstract marquerSupprimee(ref: string, a: string): Promise<void>;
}

/** Le fichier lui-même (stockage objet). Supprimer une photo absente n'est pas une erreur. */
export abstract class FichiersPhotos {
  abstract supprimer(ref: string): Promise<void>;
}

export abstract class ReclamationsRepository {
  /** `false` si la référence existe déjà. */
  abstract ajouter(reclamation: ReclamationStockee): Promise<boolean>;
  abstract trouver(reference: string): Promise<ReclamationStockee | null>;
  /** Remplace la réclamation si son statut est encore `statutAttendu` (atomique). */
  abstract remplacer(
    reclamation: ReclamationStockee,
    statutAttendu: ReclamationStockee["statut"],
  ): Promise<boolean>;
  abstract parColis(colisId: string): Promise<ReclamationStockee[]>;
  abstract lister(filtre: {
    compagnieId?: string | null;
    statut?: ReclamationStockee["statut"];
  }): Promise<ReclamationStockee[]>;
}

/** Numérotation côté serveur des colis de l'app (plage 4001–9999, compteur du jour, sans trou). */
export abstract class NumerotationColis {
  /**
   * Prochain numéro de la plage « en ligne » pour cette gare, le jour (Douala) de `at`. Atomique, et
   * idempotent par `reference` (l'identifiant du colis) : réessayer après une erreur donne le même
   * numéro, jamais un second. Lève `RangeError` quand la plage est épuisée.
   */
  abstract prochainEnLigne(demande: {
    gareId: string;
    compagnieId: string | null;
    /** Instant de la création : le jour du numéro est celui de Douala. */
    at: string;
    reference: string;
  }): Promise<number>;
}

/* ------------------------------------------------------------------ services externes */

export interface AnalysePhoto {
  /** « petit carton ». */
  taille: string;
  poidsKg: number;
}

/** Lit la photo du colis pour en estimer la taille et le poids (service d'analyse d'image). */
export abstract class AnalysePhotoColis {
  abstract estimer(photoRef: string): Promise<AnalysePhoto>;
}

export interface DemandePaiementColis {
  /** Identifiant fourni par nous : rejouer la même demande ne débite pas deux fois. */
  cleIdempotence: string;
  moyen: string;
  /** Numéro MoMo ou Orange Money à débiter. */
  numero: string | null;
  montant: number;
  libelle: string;
  payeurId: string;
}

export class PaiementRefuse extends Error {
  constructor(message = "Paiement refusé") {
    super(message);
    this.name = "PaiementRefuse";
  }
}

/** Encaissement mobile money ou carte (AM-165). Lève `PaiementRefuse` si l'opérateur refuse. */
export abstract class PaiementsColis {
  abstract encaisser(
    demande: DemandePaiementColis,
  ): Promise<{ reference: string; etat: "paye" | "en_attente" }>;
}

/** L'assureur partenaire : souscription à la création, déclaration d'un sinistre à l'indemnisation. */
export abstract class AssureurPartenaire {
  abstract readonly nom: string;
  abstract souscrire(demande: {
    colisId: string;
    numeroColis: string;
    valeurAssuree: number;
    prime: number;
    contenu: string;
  }): Promise<{ police: string }>;
  abstract declarerSinistre(declaration: {
    police: string;
    numeroColis: string;
    montant: number;
    motif: string;
  }): Promise<{ dossier: string }>;
}

export type EvenementNotification =
  | "depose"
  | "charge"
  | "en_route"
  | "decharge"
  | "disponible"
  | "en_relais"
  | "en_livraison"
  | "livre"
  | "remis"
  | "non_retire"
  | "retourne"
  | "perdu"
  | "litige";

/**
 * Messages aux clients. Le code de retrait ne part que par `envoyerCodeDestinataire`, au destinataire
 * seul : les autres messages ne le portent jamais.
 */
export abstract class NotificationsColis {
  /** Envoie le code au destinataire. Renvoie le canal réellement utilisé, ou lève une erreur. */
  abstract envoyerCodeDestinataire(message: {
    telephone: string;
    destinataireNom: string;
    expediteurNom: string;
    numeroColis: string;
    code: string;
    canal: "sms" | "whatsapp";
  }): Promise<"sms" | "whatsapp">;
  abstract notifierExpediteur(message: {
    telephone: string;
    numeroColis: string;
    evenement: EvenementNotification;
  }): Promise<void>;
  abstract notifierDestinataire(message: {
    telephone: string;
    numeroColis: string;
    evenement: "disponible" | "en_relais" | "non_retire";
    lieu: string;
  }): Promise<void>;
}

export interface MessageSuivi {
  colisId: string;
  etat: EtatColis;
  jalon: "depose" | "charge" | "en_route" | "disponible" | "remis";
  a: string;
}

/** Diffusion en direct du suivi (`/colis/:id/direct`). La passerelle WebSocket s'y abonne. */
export abstract class DiffusionSuivi {
  abstract publier(message: MessageSuivi): void;
  /** Renvoie la fonction de désabonnement. */
  abstract souscrire(colisId: string, ecouteur: (message: MessageSuivi) => void): () => void;
}

/* ------------------------------------------------------------------ annuaires des autres modules */

/**
 * Ce que le module colis lit des autres modules : départs et soutes (billetterie, AM-162), guichets
 * et gares (administration), points relais (AM-148). Le coordinateur branche les adaptateurs réels.
 */
export abstract class ReferentielColis {
  /** Départs à venir qui acceptent des colis, du plus proche au plus lointain. */
  abstract departsOuverts(critere: {
    gareOrigineId: string | null;
    compagnieId: string | null;
    villeDestination: string | null;
    apres: string;
  }): Promise<DepartColis[]>;
  abstract depart(id: string): Promise<DepartColis | null>;
  abstract gare(id: string): Promise<GareRef | null>;
  /** Le guichet demandé, ou celui de la personne connectée si `guichetId` est absent. */
  abstract guichet(critere: {
    guichetId: string | null;
    utilisateurId: string;
    gareId: string | null;
  }): Promise<GuichetRef | null>;
  abstract relais(id: string): Promise<RelaisRef | null>;
  /** Le colis « autre ville » (via une autre compagnie) est-il proposé à cette compagnie ? (AM-135) */
  abstract interAgencesDisponible(compagnieId: string): Promise<boolean>;
}
