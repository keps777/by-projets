import type { ColisStocke } from "../colis/modele";
import type { EtatColis } from "../colis/regles";
import { ColisRepository } from "../colis/ports";
import type {
  BrouillonRelais,
  DemandeRelais,
  OperateurMobile,
  PointRelaisStocke,
  ReceptionRelais,
} from "./modele";
import type { Point } from "./regles";

/**
 * Ports du module des points relais. La logique ne parle qu'à ces classes abstraites ; `memoire.ts`
 * en donne des versions en mémoire (tests, développement). Les tables PostgreSQL attendues par les
 * adaptateurs réels sont décrites dans le README ; l'intégration (Prisma, `AppModule`) est faite par
 * le coordinateur.
 *
 * Plusieurs ports servent aussi au module `livraison` (portefeuille, versements, rôles, lieux) : ils
 * sont ici parce que `LivraisonModule` importe `RelaisModule`.
 */

/**
 * Un adaptateur en mémoire ou simulé met `durable = false` : le module refuse de démarrer en
 * production tant qu'un port en est encore là.
 */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ persistance : points relais */

export abstract class RelaisRepository {
  /** `false` si l'identifiant ou le code existe déjà. */
  abstract ajouter(relais: PointRelaisStocke): Promise<boolean>;
  abstract trouver(id: string): Promise<PointRelaisStocke | null>;
  abstract parPersonne(personneId: string): Promise<PointRelaisStocke | null>;
  abstract lister(filtre?: { ville?: string; actif?: boolean }): Promise<PointRelaisStocke[]>;
  /** Remplace le relais si sa version est encore `versionAttendue` (comparaison et écriture atomiques). */
  abstract remplacer(relais: PointRelaisStocke, versionAttendue: number): Promise<boolean>;
}

export type ResultatAjoutDemande = "ajoutee" | "dossier_pris" | "demande_en_cours";

export abstract class DemandesRelaisRepository {
  /**
   * Ajoute la demande (version 1). Refuse une seconde demande ouverte (`recue` ou `visite_planifiee`)
   * pour la même personne, et un dossier déjà pris : les deux sont des contraintes d'unicité.
   */
  abstract ajouter(demande: DemandeRelais): Promise<ResultatAjoutDemande>;
  abstract trouver(dossier: string): Promise<DemandeRelais | null>;
  /** La demande la plus récente de la personne, quel que soit son état. */
  abstract derniereDe(personneId: string): Promise<DemandeRelais | null>;
  abstract remplacer(demande: DemandeRelais, versionAttendue: number): Promise<boolean>;
}

export abstract class BrouillonsRelais {
  abstract lire(personneId: string): Promise<BrouillonRelais | null>;
  abstract enregistrer(brouillon: BrouillonRelais): Promise<void>;
  abstract supprimer(personneId: string): Promise<void>;
}

/** Numéros de dossier : un compteur par préfixe (« R-BAF », « L-BAF »), sans trou ni doublon. */
export abstract class CompteursDossiers {
  /** Prochain numéro du préfixe, à partir de 1. Atomique. */
  abstract prochain(prefixe: string): Promise<number>;
}

export abstract class ReceptionsRelais {
  /** `false` si le colis a déjà une réception. */
  abstract ajouter(reception: ReceptionRelais): Promise<boolean>;
  abstract trouver(colisId: string): Promise<ReceptionRelais | null>;
  abstract lister(relaisId: string): Promise<ReceptionRelais[]>;
  /** Note le rappel envoyé ; `false` s'il l'était déjà (deux tâches ne le font pas deux fois). */
  abstract marquerRappel(colisId: string, a: string): Promise<boolean>;
  abstract ouvrirRemise(colisId: string, a: string | null): Promise<void>;
}

/**
 * Les colis d'un relais, lus dans le module colis. Cette version (`ColisDuRelaisParColis`) filtre en
 * mémoire les colis des états demandés ; un adaptateur PostgreSQL peut faire `WHERE relais_id = $1`.
 */
export abstract class ColisDuRelais {
  abstract parEtats(etats: readonly EtatColis[], relaisId?: string): Promise<ColisStocke[]>;
}

export class ColisDuRelaisParColis extends ColisDuRelais {
  constructor(private readonly colis: ColisRepository) {
    super();
  }

  async parEtats(etats: readonly EtatColis[], relaisId?: string): Promise<ColisStocke[]> {
    const colis = await this.colis.lister({ etats });
    return colis.filter(
      (c) => c.relaisId !== null && (relaisId === undefined || c.relaisId === relaisId),
    );
  }
}

/* ------------------------------------------------------------------ lieux */

/**
 * Coordonnées des gares et des adresses de livraison (carte, distances, relais proches). Aucune
 * source n'existe encore dans les tables : `LieuxInconnus` ne connaît rien (les distances sont alors
 * inconnues et le module refuse la production), le coordinateur branche un géocodeur et les
 * coordonnées des gares.
 */
export abstract class Lieux {
  abstract pointDeLaGare(gareId: string): Promise<Point | null>;
  abstract pointDeLAdresse(adresse: string, ville: string): Promise<Point | null>;
}

/* ------------------------------------------------------------------ portefeuille et versements */

export type TypePartenaire = "relais" | "livreur";

export interface Credit {
  /** Clé d'idempotence : « remise:<colisId> », « mission:<missionId> ». */
  cle: string;
  type: TypePartenaire;
  partenaireId: string;
  montant: number;
  motif: "remise" | "reprise" | "livraison";
  /** Le colis ou la mission qui a rapporté ce gain. */
  reference: string;
  at: string;
}

export interface Debit {
  /** Clé d'idempotence : « versement:relais:<id>:270105 », « retrait:<uuid> ». */
  cle: string;
  type: TypePartenaire;
  partenaireId: string;
  montant: number;
  motif: "versement" | "retrait";
  at: string;
  etat: "en_attente" | "verse";
  /** Où l'argent part : de quoi rejouer le versement si l'opérateur n'a pas répondu. */
  operateur: OperateurMobile;
  telephone: string;
  libelle: string;
  /** Référence de la transaction de l'opérateur, une fois versé. */
  reference: string | null;
}

export type ResultatReservation = "reserve" | "existe" | "solde_insuffisant";

/**
 * Les gains des relais et des livreurs : des crédits (une remise, une livraison) et des débits
 * (versement du lundi ou du soir, retrait demandé). Le solde est la somme des crédits moins celle
 * des débits en attente ou versés. Toute écriture est atomique : deux retraits simultanés ne
 * dépensent jamais deux fois le même solde (`reserver`).
 */
export abstract class Portefeuille {
  /** `false` si la clé existe déjà : un gain n'est compté qu'une fois. */
  abstract crediter(credit: Credit): Promise<boolean>;
  abstract solde(type: TypePartenaire, partenaireId: string): Promise<number>;
  /**
   * Réserve `montant` sur le solde (débit « en attente ») si le solde est au moins
   * `max(montant, soldeMinimum)`. Idempotent par clé.
   */
  abstract reserver(demande: {
    cle: string;
    type: TypePartenaire;
    partenaireId: string;
    montant: number;
    motif: Debit["motif"];
    at: string;
    soldeMinimum: number;
    operateur: OperateurMobile;
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation>;
  abstract confirmer(cle: string, reference: string): Promise<void>;
  /** Le versement a échoué : le débit disparaît et le solde revient. */
  abstract annuler(cle: string): Promise<void>;
  abstract debitsEnAttente(): Promise<Debit[]>;
  abstract credits(
    type: TypePartenaire,
    partenaireId: string,
    depuis: string,
    avant?: string,
  ): Promise<Credit[]>;
  /** Les crédits de tous les partenaires d'un type entre deux instants. */
  abstract creditsPeriode(type: TypePartenaire, depuis: string, avant: string): Promise<Credit[]>;
  abstract soldesPositifs(type: TypePartenaire): Promise<{ partenaireId: string; solde: number }[]>;
}

export interface DemandeVersement {
  /** Rejouer la même clé ne paie pas deux fois. */
  cle: string;
  operateur: OperateurMobile;
  telephone: string;
  montant: number;
  libelle: string;
}

/** L'opérateur a refusé le versement pour de bon (numéro inconnu, compte fermé). */
export class VersementRefuse extends Error {
  constructor(message = "Versement refusé par l'opérateur") {
    super(message);
    this.name = "VersementRefuse";
  }
}

/** Envoi d'argent vers un compte mobile money (MoMo, Orange Money), branché sur AM-165. */
export abstract class VersementsMobile {
  /**
   * Idempotent par `cle`. Lève `VersementRefuse` si l'opérateur refuse pour de bon ; toute autre erreur
   * (réseau, délai dépassé) veut dire « résultat inconnu » : le versement reste en attente et la tâche
   * de fond le rejoue avec la même clé.
   */
  abstract verser(demande: DemandeVersement): Promise<{ reference: string }>;
}

/* ------------------------------------------------------------------ comptes */

/**
 * Donne à un compte voyageur le rôle de relais ou de livreur quand sa demande est acceptée. Le
 * socle n'a pas d'opération de changement de rôles : le coordinateur l'implémente (`personne.roles`).
 */
export abstract class AttributionRoles {
  abstract ajouterRole(personneId: string, role: "relais" | "livreur"): Promise<void>;
}
