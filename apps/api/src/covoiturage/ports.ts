import type {
  DemandeCovoit,
  DossierConducteur,
  NoteCovoit,
  Proposition,
  Reservation,
  ResultatPaiementReservation,
  ResultatReservation,
  RoleNote,
  StatutDemande,
  StatutReservation,
  StatutTrajet,
  StatutVersement,
  Trajet,
  TrajetRegulierPassager,
  TypeTrajet,
  Versement,
} from "./modeles";

/**
 * Ports du covoiturage : tout ce que le module lit, écrit ou appelle passe par ces classes
 * abstraites. `memoire.ts` en donne des versions en mémoire (tests, développement) ; les adaptateurs
 * PostgreSQL (tables décrites dans le README) et celui qui verse l'argent au conducteur (décaissement
 * MoMo de l'agrégateur) les remplacent à l'intégration. `CovoiturageModule` refuse de démarrer en
 * production tant qu'un port est en mémoire ou simulé.
 *
 * Les opérations « comparer et remplacer » (`modifier`, `transitionner`, `reserver`, `payer`) sont ce
 * qui garde les données cohérentes quand deux appels se croisent : en base, des `UPDATE … WHERE
 * statut = ANY(…)` et des transactions qui verrouillent la ligne du trajet.
 */

/** Marque d'un adaptateur qui perd ses données au redémarrage ou qui simule un service. */
export interface StockageCovoiturage {
  readonly durable: boolean;
}

/* ------------------------------------------------------------------ trajets */

export interface FiltreRecherche {
  type: TypeTrajet;
  /** Noms de ville déjà normalisés par l'appelant (`normaliser`). */
  departVille?: string;
  arriveeVille?: string;
  /** Ville d'un trajet en ville (normalisée). */
  ville?: string;
  /** Départs à partir de cet instant (inclus). */
  du: Date;
  /** Départs avant cet instant (exclu). */
  jusqua?: Date;
  limite: number;
}

export abstract class Trajets {
  abstract creer(trajet: Trajet): Promise<void>;
  abstract trouver(id: string): Promise<Trajet | null>;
  /** Applique `changement` si le trajet est encore dans l'un des statuts `de` ; `null` sinon. */
  abstract transitionner(
    id: string,
    de: readonly StatutTrajet[],
    changement: Partial<Omit<Trajet, "id">>,
  ): Promise<Trajet | null>;
  /** Trajets publiés dont le départ est dans la fenêtre, du plus proche au plus lointain. */
  abstract rechercher(filtre: FiltreRecherche): Promise<Trajet[]>;
  /** Trajets d'un conducteur, du plus proche au plus lointain. */
  abstract duConducteur(
    conducteurId: string,
    filtre?: { statuts?: readonly StatutTrajet[]; depuis?: Date },
  ): Promise<Trajet[]>;
  /** Trajets publiés dont l'arrivée prévue est passée. */
  abstract aTerminer(maintenant: Date, limite: number): Promise<Trajet[]>;
  /** Trajets réguliers dont l'occurrence suivante n'est pas encore publiée et dont le départ est passé. */
  abstract aRenouveler(maintenant: Date, limite: number): Promise<Trajet[]>;
  /** Pose le marqueur « occurrence suivante publiée » ; faux s'il l'était déjà (`UPDATE … WHERE suivant_cree_a IS NULL`). */
  abstract marquerSuivant(id: string, at: Date): Promise<boolean>;
  /** Mémorise que ces voyageurs ont vu ces trajets dans une recherche (compte chaque voyageur une fois). */
  abstract enregistrerVues(trajetIds: readonly string[], voyageurId: string): Promise<void>;
  abstract nombreVues(trajetId: string): Promise<number>;
  abstract nombreAnnules(conducteurId: string): Promise<number>;
}

/* ------------------------------------------------------------------ réservations */

export abstract class Reservations {
  /**
   * Retient les places si, avec celles déjà retenues ou payées (hors réservations expirées), le total
   * reste dans `capacite`, et si le passager n'a pas déjà une réservation en cours sur ce trajet
   * (index unique partiel `(trajet_id, passager_id) WHERE statut IN ('en_attente_paiement','payee')`).
   * Une seule transaction qui verrouille le trajet : deux réservations simultanées ne dépassent jamais
   * les places.
   */
  abstract reserver(
    reservation: Reservation,
    capacite: number,
    maintenant: Date,
  ): Promise<ResultatReservation>;
  abstract trouver(id: string): Promise<Reservation | null>;
  abstract transitionner(
    id: string,
    de: readonly StatutReservation[],
    changement: Partial<Omit<Reservation, "id">>,
  ): Promise<Reservation | null>;
  /**
   * Le paiement est reçu : `en_attente_paiement` ou `expiree` → `payee`. Une réservation dont la
   * retenue est passée reprend ses places seulement s'il en reste (`complet` sinon : le paiement doit
   * être remboursé). Rejouer un paiement déjà pris rend `dejaPayee`.
   */
  abstract payer(
    id: string,
    capacite: number,
    maintenant: Date,
    changement: Partial<Omit<Reservation, "id">>,
  ): Promise<ResultatPaiementReservation>;
  abstract duTrajet(trajetId: string): Promise<Reservation[]>;
  abstract duPassager(passagerId: string): Promise<Reservation[]>;
  abstract duConducteur(
    conducteurId: string,
    statuts?: readonly StatutReservation[],
  ): Promise<Reservation[]>;
  /** Places retenues ou payées d'un trajet (réservations en attente expirées exclues). */
  abstract placesPrises(trajetId: string, maintenant: Date): Promise<number>;
  /** Réservations en attente dont la retenue est écoulée. */
  abstract aExpirer(maintenant: Date, limite: number): Promise<Reservation[]>;
  /** Réservations payées dont la libération automatique est échue. */
  abstract aLiberer(maintenant: Date, limite: number): Promise<Reservation[]>;
}

/* ------------------------------------------------------------------ conducteurs */

export abstract class Dossiers {
  abstract trouver(conducteurId: string): Promise<DossierConducteur | null>;
  /** Crée ou remplace le dossier. */
  abstract enregistrer(dossier: DossierConducteur): Promise<void>;
  /** Dossiers qui ont au moins une pièce à vérifier, les plus anciens d'abord. */
  abstract aVerifier(limite: number): Promise<DossierConducteur[]>;
  abstract tous(limite: number): Promise<DossierConducteur[]>;
}

/* ------------------------------------------------------------------ versements */

export interface FiltreVersements {
  statut?: StatutVersement;
  depuis?: Date;
  limite: number;
}

export abstract class Versements {
  /** Faux si la réservation a déjà son versement (index unique `(reservation_id)`). */
  abstract creer(versement: Versement): Promise<boolean>;
  abstract deLaReservation(reservationId: string): Promise<Versement | null>;
  abstract transitionner(
    id: string,
    de: readonly StatutVersement[],
    changement: Partial<Omit<Versement, "id">>,
  ): Promise<Versement | null>;
  /** Versements `a_faire` dont le prochain essai est échu. */
  abstract aReprendre(maintenant: Date, limite: number): Promise<Versement[]>;
  abstract duConducteur(conducteurId: string, depuis: Date): Promise<Versement[]>;
  abstract lister(filtre: FiltreVersements): Promise<Versement[]>;
}

/** Envoie l'argent au conducteur (décaissement MoMo de l'agrégateur). Idempotent par `cle`. */
export interface DemandeVersement {
  /** `covoiturage:<réservation>` : l'agrégateur ne paie jamais deux fois la même clé. */
  cle: string;
  montant: number;
  telephone: string;
  reservationId: string;
}

export abstract class PasserelleVersements {
  /** Rend la référence de l'opérateur. Lève une erreur si le versement n'est pas parti. */
  abstract verser(demande: DemandeVersement): Promise<{ reference: string | null }>;
}

/* ------------------------------------------------------------------ demandes, notes, trajet régulier */

export abstract class Demandes {
  abstract creer(demande: DemandeCovoit): Promise<void>;
  abstract trouver(id: string): Promise<DemandeCovoit | null>;
  abstract transitionner(
    id: string,
    de: readonly StatutDemande[],
    changement: Partial<Omit<DemandeCovoit, "id">>,
  ): Promise<DemandeCovoit | null>;
  abstract duPassager(passagerId: string): Promise<DemandeCovoit[]>;
  /** Demandes ouvertes dont le jour est dans la fenêtre (AAAA-MM-JJ, bornes incluses). */
  abstract ouvertes(filtre: { du: string; au: string; limite: number }): Promise<DemandeCovoit[]>;
  /** Faux si ce conducteur a déjà proposé ce trajet pour cette demande. */
  abstract ajouterProposition(proposition: Proposition): Promise<boolean>;
  abstract propositionsDuConducteur(conducteurId: string): Promise<Proposition[]>;
  abstract propositionsDeLaDemande(demandeId: string): Promise<Proposition[]>;
  /** Demandes ouvertes dont le jour est passé. */
  abstract aExpirer(avantJour: string, limite: number): Promise<DemandeCovoit[]>;
}

export abstract class Notes {
  /** Faux si ce rôle a déjà noté cette réservation (index unique `(reservation_id, role_note)`). */
  abstract ajouter(note: NoteCovoit): Promise<boolean>;
  abstract deLaPersonne(noteId: string, roleNote: RoleNote): Promise<NoteCovoit[]>;
  abstract deLaReservation(reservationId: string): Promise<NoteCovoit[]>;
}

export abstract class TrajetsReguliersPassagers {
  abstract trouver(voyageurId: string): Promise<TrajetRegulierPassager | null>;
  abstract enregistrer(trajet: TrajetRegulierPassager): Promise<void>;
}

/* ------------------------------------------------------------------ ce que le module lit ailleurs */

export interface ConseilTrajet {
  prix: { min: number; max: number };
  dureeMinutes: number;
}

/**
 * Villes et trajets connus : nom d'une ville d'après son code ou son nom, fourchette de prix conseillée
 * et durée d'un trajet. À brancher sur le référentiel des lignes à l'intégration.
 */
export abstract class ReferentielCovoiturage {
  /** Nom d'affichage d'une ville (« DLA » ou « douala » → « Douala »), `null` si inconnue. */
  abstract ville(codeOuNom: string): Promise<string | null>;
  /** Conseil pour un trajet entre deux villes, `null` si le référentiel ne le connaît pas. */
  abstract conseil(departVille: string, arriveeVille: string): Promise<ConseilTrajet | null>;
}

export interface IdentitePersonne {
  nom: string;
  /** Numéro de téléphone du compte (international). */
  telephone: string | null;
}

/** Ce que le covoiturage sait des comptes (adaptateur : `AnnuaireComptesCovoiturage`). */
export abstract class AnnuaireCovoiturage {
  abstract identite(personneId: string): Promise<IdentitePersonne | null>;
}

export interface NotificationCovoiturage {
  personneId: string;
  texte: string;
  /** Idempotence : le même message n'est jamais envoyé deux fois. */
  cle: string;
  reference: { type: string; id: string };
}

/** Envoie un SMS à une personne (adaptateur : `NotifieurSmsCovoiturage`). Ne lève jamais. */
export abstract class NotifieurCovoiturage {
  abstract notifier(notification: NotificationCovoiturage): Promise<void>;
}

export type IssueRemboursement = "demande" | "sans_paiement" | "hors_agregateur";

export interface DemandeRemboursementCovoiturage {
  reservationId: string;
  /** Part du prix des places à rendre (FCFA). */
  prix: number;
  /** Frais d'AfriMove à rendre (FCFA). */
  frais: number;
  cause: "trajet_annule" | "annulation_passager" | "places_perdues";
  /** Idempotence : la même clé ne produit jamais deux remboursements. */
  cle: string;
}

/** Rembourse le passager sur son moyen de paiement (adaptateur : `RemboursementsViaPaiements`). */
export abstract class RemboursementsCovoiturage {
  abstract rembourser(demande: DemandeRemboursementCovoiturage): Promise<IssueRemboursement>;
}
