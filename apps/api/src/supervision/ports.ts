import type { EtatBillet } from "../caisse/regles";

/**
 * Ports de persistance et de lecture de la supervision. La logique (demandes, décisions, validation,
 * équipe, PIN) ne parle qu'à ces classes abstraites ; `memoire.ts` en fournit des versions en mémoire
 * pour les tests. Les versions PostgreSQL ne sont pas écrites (tables hors du périmètre : voir le
 * README du dossier).
 */

export type ModePaiement = "cash" | "momo" | "orange_money";
export type DecisionAnnulation = "rembourser" | "reporter" | "avoir" | "refuser";

/* ------------------------------------------------------------------ billets (lecture et décision) */

export interface BilletAnnulable {
  billetId: string;
  /** AGENCE-GARE-AAMMJJ-NNNN : jamais modifié, même après l'annulation. */
  numero: string;
  sequence: number;
  prix: number;
  classe: "classique" | "vip";
  etat: EtatBillet;
  gareId: string;
  compagnieId: string | null;
  depart: { departId: string; heureDepart: string; destination: string; siege: number };
  voyageur: { nom: string; pieceQuatreDerniers: string | null };
  vendu: {
    at: string;
    guichetRang: number;
    mode: ModePaiement;
    agentId: string;
    agentNom: string;
  };
  /** Le billet a déjà été scanné au quai. */
  scanne: boolean;
}

/** Les billets, tels que la supervision a besoin de les lire et de les annuler ou reporter. */
export abstract class RegistreBillets {
  abstract readonly durable: boolean;
  abstract trouver(billetId: string): Promise<BilletAnnulable | null>;
  /**
   * Annule ou reporte le billet (compare-et-échange sur son état : la machine d'états du domaine
   * interdit l'annulation après l'embarquement). Le billet garde son numéro. Répond le nouvel état et
   * si le siège est libéré, ou `null` si la transition est interdite depuis l'état actuel.
   */
  abstract appliquer(
    billetId: string,
    action: "annuler" | "reporter",
    meta: { at: string; parId: string; motif: string | null },
  ): Promise<{ etat: EtatBillet; siegeLibere: boolean } | null>;
}

/* ------------------------------------------------------------------ demandes d'annulation */

export interface DemandeAnnulationStockee {
  /** Identifiant créé sur l'appareil du guichetier. */
  demandeId: string;
  billetId: string;
  gareId: string;
  compagnieId: string | null;
  demandeurId: string;
  guichetRang: number;
  motif: string;
  demandeA: string;
  statut: "en_attente" | "decidee";
  decision: DecisionAnnulation | null;
  montant: number | null;
  decideeA: string | null;
  decideeParId: string | null;
  evenementDemandeId: string;
  evenementDecisionId: string | null;
}

export abstract class DemandesAnnulation {
  abstract readonly durable: boolean;
  /** `deja_en_attente` : le billet a déjà une demande en attente ; `identifiant_pris` : l'UUID existe. */
  abstract creer(
    demande: DemandeAnnulationStockee,
  ): Promise<"ok" | "deja_en_attente" | "identifiant_pris">;
  abstract trouver(demandeId: string): Promise<DemandeAnnulationStockee | null>;
  abstract enAttenteDuBillet(billetId: string): Promise<DemandeAnnulationStockee | null>;
  abstract enAttenteDeGare(gareId: string): Promise<DemandeAnnulationStockee[]>;
  /** Compare-et-échange : `false` si la demande n'est plus en attente. */
  abstract decider(
    demandeId: string,
    decision: {
      decision: DecisionAnnulation;
      montant: number;
      decideeA: string;
      decideeParId: string;
      evenementDecisionId: string;
    },
  ): Promise<boolean>;
  /** Annule une décision dont le billet n'a pas pu changer d'état. */
  abstract rouvrir(demandeId: string): Promise<void>;
}

/* ------------------------------------------------------------------ vue de la gare */

export interface DepartGareVue {
  departId: string;
  heureDepart: string;
  destination: string;
  quai: number;
  bus: string | null;
  vendus: number;
  capacite: number;
  fusionProposeeAvec: string | null;
}

export interface GareVue {
  id: string;
  nom: string;
  quais: number;
  synchro: { synchronises: number; total: number };
  /** Les guichets de la gare et leurs billets du jour. */
  guichets: { rang: number; billets: number }[];
  /** Les départs de l'après-midi. */
  departsApresMidi: DepartGareVue[];
}

/** Ce que la supervision lit chez les autres modules (départs, appareils, billets du jour). */
export abstract class SourceGare {
  abstract readonly durable: boolean;
  abstract gare(gareId: string): Promise<GareVue | null>;
  /** Billets de cadence encore sans nom aujourd'hui (AAMMJJ). */
  abstract cadenceSansNom(gareId: string, aammjj: string): Promise<number>;
  /** Annulations faites par un agent : aujourd'hui, sur 10 jours, et moyenne des guichets de la gare. */
  abstract annulationsAgent(
    agentId: string,
    gareId: string,
    maintenant: string,
  ): Promise<{ aujourdhui: number; dixJours: number; moyenneGuichets: number }>;
}

/* ------------------------------------------------------------------ équipe */

export type RoleEquipe = "guichetier" | "convoyeur" | "chauffeur" | "controleur" | "superviseur";
export const ROLES_EQUIPE: readonly RoleEquipe[] = [
  "guichetier",
  "convoyeur",
  "chauffeur",
  "controleur",
  "superviseur",
];

export interface MembreEquipe {
  personneId: string;
  role: RoleEquipe;
  gareId: string;
  compagnieId: string | null;
  guichetId: string | null;
  /** « guichet 2 », « LT 412 AB » : tel qu'affiché à côté du nom. */
  affectation: string | null;
  /** Dans la journée : en service (au guichet, au quai) ou à bord d'un bus. */
  situationDuJour: "en_service" | "a_bord" | "hors_service";
  /** « en route vers Yaoundé » : lu chez les départs. */
  situation: string | null;
  /** Billets vendus depuis l'arrivée dans l'équipe (90 jours). */
  billets: number;
  /** Date d'arrivée dans l'équipe (ISO). */
  depuis: string;
  actif: boolean;
}

/** L'annuaire de l'équipe d'une gare (comptes du socle + affectations). */
export abstract class EquipeGare {
  abstract readonly durable: boolean;
  abstract lister(gareId: string): Promise<MembreEquipe[]>;
  abstract trouver(personneId: string): Promise<MembreEquipe | null>;
  /** Change le guichet et/ou le rôle de la personne (`null` : inchangé). */
  abstract changerAffectation(
    personneId: string,
    changement: { guichetId: string | null; role: RoleEquipe | null },
  ): Promise<void>;
  /**
   * Désactive le compte : effet immédiat (le socle relit le compte à chaque requête, un jeton déjà
   * émis cesse de fonctionner).
   */
  abstract desactiver(personneId: string): Promise<void>;
}

/** L'état d'un PIN au-delà de ce que dit le compte du socle. */
export interface EtatPinStocke {
  /** Le PIN est provisoire jusqu'à cet instant : la personne doit le remplacer à sa connexion. */
  provisoireJusqua: Date | null;
}

/**
 * Le PIN d'une personne, côté écriture. Le PIN lui-même n'est jamais conservé : seul son haché
 * (argon2id avec le poivre du serveur, comme le reste du socle) est écrit, dans la colonne
 * `personne.pin_hache` que lit déjà la connexion et que lit la validation des superviseurs.
 */
export abstract class PinsEquipe {
  abstract readonly durable: boolean;
  abstract lire(personneId: string): Promise<EtatPinStocke>;
  /** Remplace le PIN par un PIN provisoire valable jusqu'à `jusqua`. */
  abstract definirProvisoire(personneId: string, pinHache: string, jusqua: Date): Promise<void>;
}
