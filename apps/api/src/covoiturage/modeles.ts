/**
 * Vocabulaire du covoiturage (AM-054) : trajets, réservations, dossier de vérification du
 * conducteur, versements, demandes de passagers, notes. Aucune dépendance Nest ici : ces types
 * servent aux ports, aux règles et aux tests.
 */

/* ------------------------------------------------------------------ trajets */

/** Entre deux villes, ou dans la même ville (les écrans « Entre villes » et « En ville »). */
export type TypeTrajet = "entre_villes" | "ville";

export type StatutTrajet = "publie" | "annule" | "termine";

/** Codes des options du formulaire de publication (écran « Conducteur »). */
export const CODES_OPTIONS = ["clim", "bagage_moyen", "femmes", "regulier"] as const;
export type CodeOption = (typeof CODES_OPTIONS)[number];

export interface Trajet {
  id: string;
  conducteurId: string;
  type: TypeTrajet;
  departVille: string;
  departPoint: string;
  arriveeVille: string;
  arriveePoint: string;
  departA: Date;
  /** Durée estimée du trajet, d'après le référentiel. L'arrivée prévue en découle. */
  dureeMinutes: number;
  /** Places offertes en tout (hors celle du conducteur). */
  places: number;
  /** Prix d'une place, sans les frais d'AfriMove. */
  prixParPlace: number;
  options: CodeOption[];
  /** Copie du véhicule au moment de la publication : « Toyota Corolla grise ». */
  vehicule: string;
  immatriculation: string;
  grandBagage: boolean;
  /** Se répète chaque semaine : le balayage publie l'occurrence suivante. */
  regulier: boolean;
  /** Rempli quand l'occurrence suivante d'un trajet régulier a été publiée. */
  suivantCreeA: Date | null;
  statut: StatutTrajet;
  creeA: Date;
  annuleA: Date | null;
}

/* ------------------------------------------------------------------ réservations */

/**
 *  - `en_attente_paiement` : places retenues 15 minutes, la commande attend le paiement ;
 *  - `expiree` : le délai est passé (un paiement tardif peut encore la reprendre s'il reste des places) ;
 *  - `payee` : l'argent est chez l'agrégateur, le conducteur n'est pas encore payé ;
 *  - `terminee` : arrivée confirmée (ou délai passé), le conducteur est payé ;
 *  - `annulee` : annulée avant le paiement, par le passager ou par le conducteur ; si elle était
 *    payée, `remboursement` dit ce qui est rendu.
 */
export type StatutReservation =
  | "en_attente_paiement"
  | "expiree"
  | "payee"
  | "terminee"
  | "annulee";

export type AnnulePar = "passager" | "conducteur" | "systeme";

export interface Reservation {
  /** Identifiant de la réservation = identifiant de la commande que paie le voyageur. */
  id: string;
  trajetId: string;
  conducteurId: string;
  passagerId: string;
  places: number;
  prixParPlace: number;
  fraisParPlace: number;
  /** « Covoiturage Samuel · Douala → Kribi · 08:30 » : aucune donnée personnelle sensible. */
  libelle: string;
  statut: StatutReservation;
  creeA: Date;
  /** Fin de la retenue des places. */
  expireA: Date;
  payeeA: Date | null;
  moyenPaiement: string | null;
  /** Départ du trajet, recopié pour décider d'une annulation sans relire le trajet. */
  departA: Date;
  /** Heure à laquelle l'argent part vers le conducteur si personne ne confirme (arrivée prévue + délai). */
  liberationAutoA: Date;
  /** Quand l'argent a été libéré, et pourquoi. */
  libereeA: Date | null;
  motifLiberation: MotifVersement | null;
  annuleeA: Date | null;
  annulePar: AnnulePar | null;
  /** Ce qui a été rendu au passager à l'annulation (FCFA). */
  remboursement: { prix: number; frais: number } | null;
  /** Ce qui est resté au conducteur quand le passager a annulé trop tard (FCFA). */
  retenue: number;
}

export type ResultatReservation =
  | { ok: true }
  | { ok: false; raison: "complet" | "deja_reservee"; existante?: Reservation };

export type ResultatPaiementReservation =
  | { ok: true; reservation: Reservation; dejaPayee: boolean }
  | { ok: false; raison: "inconnue" | "annulee" | "complet" };

/* ------------------------------------------------------------------ vérification du conducteur */

export const TYPES_PIECES = ["identite", "permis", "carte_grise", "voiture"] as const;
export type TypePiece = (typeof TYPES_PIECES)[number];

export type StatutPiece = "a_verifier" | "validee" | "refusee";

export interface PieceConducteur {
  type: TypePiece;
  statut: StatutPiece;
  /** Fichier déposé (photo ou scan) : identifiant opaque du service de dépôt. */
  fichierId: string;
  /** Numéro de la pièce, chiffré au repos (`ChiffrementService`). Absent pour la voiture. */
  numeroChiffre: string | null;
  /** Fin de validité (AAAA-MM-JJ) : obligatoire pour le permis. */
  expireLe: string | null;
  deposeeA: Date;
  verifieePar: string | null;
  verifieeA: Date | null;
  /** Raison d'un refus, donnée par la personne d'AfriMove qui vérifie. */
  motifRefus: string | null;
}

export interface VehiculeConducteur {
  marque: string;
  modele: string;
  couleur: string;
  immatriculation: string;
  /** Places passagers (hors conducteur). */
  places: number;
  grandBagage: boolean;
}

export interface DossierConducteur {
  conducteurId: string;
  vehicule: VehiculeConducteur | null;
  pieces: Partial<Record<TypePiece, PieceConducteur>>;
  /** Numéro MoMo qui reçoit le paiement, chiffré ; à défaut, celui du compte. */
  numeroVersementChiffre: string | null;
  creeA: Date;
  modifieA: Date;
}

/**
 *  - `incomplet` : il manque une pièce ou le véhicule ;
 *  - `en_verification` : tout est déposé, AfriMove n'a pas fini de vérifier ;
 *  - `refuse` : une pièce est refusée, le conducteur doit la redéposer ;
 *  - `expire` : une pièce validée est périmée (permis) ;
 *  - `verifie` : toutes les pièces sont validées et en cours de validité.
 */
export type StatutDossier = "incomplet" | "en_verification" | "refuse" | "expire" | "verifie";

/* ------------------------------------------------------------------ versements au conducteur */

export type MotifVersement = "confirmation_passager" | "delai_depasse" | "annulation_tardive";

export type StatutVersement = "a_faire" | "fait" | "echoue";

/** Paiement du conducteur à l'arrivée. Un seul par réservation (idempotence). */
export interface Versement {
  id: string;
  reservationId: string;
  conducteurId: string;
  montant: number;
  motif: MotifVersement;
  statut: StatutVersement;
  /** Référence de l'opérateur, pour le rapprochement. */
  reference: string | null;
  tentatives: number;
  prochainEssaiA: Date | null;
  derniereErreur: string | null;
  creeA: Date;
  faitA: Date | null;
}

/* ------------------------------------------------------------------ demandes de passagers */

export type MomentJournee = "matin" | "apres_midi" | "soir";

export type StatutDemande = "ouverte" | "annulee" | "satisfaite" | "expiree";

/** Un passager cherche une voiture : les conducteurs concernés lui proposent un trajet. */
export interface DemandeCovoit {
  id: string;
  passagerId: string;
  departVille: string;
  arriveeVille: string;
  /** Jour souhaité (AAAA-MM-JJ, jour de Douala). */
  jour: string;
  moment: MomentJournee | null;
  places: number;
  statut: StatutDemande;
  creeA: Date;
}

export interface Proposition {
  demandeId: string;
  conducteurId: string;
  trajetId: string;
  envoyeeA: Date;
}

/* ------------------------------------------------------------------ notes */

export type RoleNote = "conducteur" | "passager";

/** Une note de 1 à 5 donnée après le trajet, par le passager au conducteur ou l'inverse. */
export interface NoteCovoit {
  id: string;
  reservationId: string;
  /** Qui est noté, et dans quel rôle. */
  noteId: string;
  roleNote: RoleNote;
  auteurId: string;
  valeur: number;
  commentaire: string | null;
  creeA: Date;
}

/* ------------------------------------------------------------------ trajet régulier en ville (passager) */

export interface TrajetRegulierPassager {
  voyageurId: string;
  ville: string;
  departPoint: string;
  arriveePoint: string;
  /** Heure de départ habituelle, « HH:MM ». */
  departA: string;
  actif: boolean;
  modifieA: Date;
}
