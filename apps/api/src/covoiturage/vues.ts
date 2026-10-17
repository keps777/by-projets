import { hhmmDouala, versIsoDouala } from "../billetterie/temps";
import type { Reservation, Trajet, TypePiece, StatutDossier, DossierConducteur } from "./modeles";
import {
  LIBELLES_PIECES,
  TEXTES,
  arriveePrevue,
  decisionAnnulationPassager,
  devisReservation,
  initiales,
  jourSemaineCourt,
  nomPublic,
  prenomDe,
  statutDossier,
  piecesAFournir,
} from "./regles";
import type { ConfigCovoiturage } from "./config";

/**
 * Réponses de l'API. Celles des routes qui ont un contrat suivent les schémas `voyageur` de
 * `@afrimove/contrats` (comparés dans `contrats.test.ts`) ; les autres sont décrites dans le README.
 */

/* ------------------------------------------------------------------ formes du contrat */

export interface ConducteurVue {
  id: string;
  nom: string;
  initiales: string;
  verifie: boolean;
  note?: number;
  trajets?: number;
}

export function conducteurVue(
  id: string,
  nomComplet: string,
  verifie: boolean,
  reputation: { note: number | null; trajets: number },
): ConducteurVue {
  return {
    id,
    nom: nomPublic(nomComplet),
    initiales: initiales(nomComplet),
    verifie,
    ...(reputation.note !== null ? { note: reputation.note } : {}),
    trajets: reputation.trajets,
  };
}

export interface OffreCovoitVue {
  id: string;
  conducteur: ConducteurVue;
  vehicule: string;
  immatriculation?: string;
  clim: boolean;
  femmesBienvenues: boolean;
  grandBagage: boolean;
  placesLibres: number;
  prixParPlace: number;
  departA: string;
  lieuDepart: string;
  dureeMinutes?: number;
  arriveeEstimee?: string;
  lieuArrivee?: string;
  garantie?: string;
}

export function offreCovoitVue(
  t: Trajet,
  placesLibres: number,
  conducteur: ConducteurVue,
  nomComplet: string,
): OffreCovoitVue {
  return {
    id: t.id,
    conducteur,
    vehicule: t.vehicule,
    ...(t.immatriculation !== "" ? { immatriculation: t.immatriculation } : {}),
    clim: t.options.includes("clim"),
    femmesBienvenues: t.options.includes("femmes"),
    grandBagage: t.grandBagage,
    placesLibres,
    prixParPlace: t.prixParPlace,
    departA: versIsoDouala(t.departA),
    lieuDepart: t.departPoint,
    dureeMinutes: t.dureeMinutes,
    arriveeEstimee: versIsoDouala(arriveePrevue(t.departA, t.dureeMinutes)),
    lieuArrivee: t.arriveePoint,
    garantie: TEXTES.garantie(prenomDe(nomComplet)),
  };
}

export type StatutCommandeVue = "en_attente_paiement" | "payee" | "expiree" | "annulee";

export function statutCommande(r: Reservation, maintenant: Date): StatutCommandeVue {
  switch (r.statut) {
    case "en_attente_paiement":
      return r.expireA.getTime() <= maintenant.getTime() ? "expiree" : "en_attente_paiement";
    case "expiree":
      return "expiree";
    case "payee":
    case "terminee":
      return "payee";
    case "annulee":
      return "annulee";
  }
}

export interface CommandeVue {
  id: string;
  type: "covoiturage";
  libelle: string;
  lignes: { code: string; libelle: string; montant: number }[];
  total: number;
  statut: StatutCommandeVue;
  creeeA: string;
  expireA: string;
  billetIds: string[];
}

export function commandeVue(r: Reservation, maintenant: Date): CommandeVue {
  const devis = devisReservation(r.prixParPlace, r.places, r.fraisParPlace);
  return {
    id: r.id,
    type: "covoiturage",
    libelle: r.libelle,
    lignes: devis.lignes,
    total: devis.total,
    statut: statutCommande(r, maintenant),
    creeeA: versIsoDouala(r.creeA),
    expireA: versIsoDouala(r.expireA),
    billetIds: [],
  };
}

export interface TrajetPublieVue {
  id: string;
  departA: string;
  depart: string;
  arrivee: string;
  places: number;
  placesReservees: number;
  prixParPlace: number;
  reservations: { passager: string; places: number; montantPaye: number }[];
  visiblePar?: number;
}

export function trajetPublieVue(
  t: Trajet,
  reservations: { passager: string; places: number; montantPaye: number }[],
  visiblePar?: number,
): TrajetPublieVue {
  return {
    id: t.id,
    departA: versIsoDouala(t.departA),
    depart: t.departVille,
    arrivee: t.arriveeVille,
    places: t.places,
    placesReservees: reservations.reduce((s, r) => s + r.places, 0),
    prixParPlace: t.prixParPlace,
    reservations,
    ...(visiblePar !== undefined ? { visiblePar } : {}),
  };
}

/* ------------------------------------------------------------------ réservations du passager (hors contrat) */

export interface ReservationVue {
  id: string;
  commandeId: string;
  statut: Reservation["statut"];
  trajet: {
    id: string;
    depart: string;
    arrivee: string;
    lieuDepart: string;
    lieuArrivee: string;
    departA: string;
    arriveeEstimee: string;
  };
  conducteur: ConducteurVue;
  vehicule: string;
  immatriculation?: string;
  places: number;
  prixParPlace: number;
  fraisParPlace: number;
  total: number;
  /** Le passager peut confirmer son arrivée (trajet commencé, argent pas encore libéré). */
  peutConfirmerArrivee: boolean;
  /** Si personne ne confirme, l'argent part vers le conducteur à cette heure. */
  liberationAutomatiqueA: string | null;
  /** Ce qui se passerait si le passager annulait maintenant ; `null` si ce n'est plus possible. */
  annulation: { gratuite: boolean; retenue: number; remboursement: number } | null;
  /** Rendu au passager à l'annulation. */
  rembourse: number;
  retenue: number;
  /** Une note a déjà été donnée au conducteur. */
  note: boolean;
}

export function reservationVue(
  r: Reservation,
  t: Trajet,
  conducteur: ConducteurVue,
  a: { maintenant: Date; config: ConfigCovoiturage; note: boolean },
): ReservationVue {
  const devis = devisReservation(r.prixParPlace, r.places, r.fraisParPlace);
  const decision = decisionAnnulationPassager(r, a.maintenant, a.config);
  const payee = r.statut === "payee";
  return {
    id: r.id,
    commandeId: r.id,
    statut: r.statut,
    trajet: {
      id: t.id,
      depart: t.departVille,
      arrivee: t.arriveeVille,
      lieuDepart: t.departPoint,
      lieuArrivee: t.arriveePoint,
      departA: versIsoDouala(t.departA),
      arriveeEstimee: versIsoDouala(arriveePrevue(t.departA, t.dureeMinutes)),
    },
    conducteur,
    vehicule: t.vehicule,
    ...(t.immatriculation !== "" ? { immatriculation: t.immatriculation } : {}),
    places: r.places,
    prixParPlace: r.prixParPlace,
    fraisParPlace: r.fraisParPlace,
    total: devis.total,
    peutConfirmerArrivee: payee && r.departA.getTime() <= a.maintenant.getTime(),
    liberationAutomatiqueA: payee ? versIsoDouala(r.liberationAutoA) : null,
    annulation:
      payee && decision.autorise
        ? {
            gratuite: decision.gratuite,
            retenue: decision.retenue,
            remboursement: decision.remboursement,
          }
        : null,
    rembourse: r.remboursement?.prix ?? 0,
    retenue: r.retenue,
    note: a.note,
  };
}

/* ------------------------------------------------------------------ dossier du conducteur (hors contrat) */

export interface DossierVue {
  conducteurId: string;
  statut: StatutDossier;
  verifie: boolean;
  vehicule: DossierConducteur["vehicule"];
  pieces: {
    type: TypePiece;
    libelle: string;
    statut: "manquante" | "a_verifier" | "validee" | "refusee";
    deposeeA: string | null;
    expireLe: string | null;
    motifRefus: string | null;
  }[];
  /** Pièces à déposer, refaire ou renouveler. */
  aFournir: TypePiece[];
  /** Un numéro de versement a été enregistré (le numéro lui-même n'est jamais rendu). */
  numeroVersementEnregistre: boolean;
}

export function dossierVue(d: DossierConducteur, maintenant: Date): DossierVue {
  const statut = statutDossier(d, maintenant);
  return {
    conducteurId: d.conducteurId,
    statut,
    verifie: statut === "verifie",
    vehicule: d.vehicule,
    pieces: (["identite", "permis", "carte_grise", "voiture"] as const).map((type) => {
      const p = d.pieces[type];
      return {
        type,
        libelle: LIBELLES_PIECES[type],
        statut: p ? p.statut : ("manquante" as const),
        deposeeA: p ? versIsoDouala(p.deposeeA) : null,
        expireLe: p?.expireLe ?? null,
        motifRefus: p?.motifRefus ?? null,
      };
    }),
    aFournir: piecesAFournir(d, maintenant),
    numeroVersementEnregistre: d.numeroVersementChiffre !== null,
  };
}

/** Un dossier vide : le conducteur n'a encore rien déposé. */
export function dossierVideVue(conducteurId: string): DossierVue {
  return {
    conducteurId,
    statut: "incomplet",
    verifie: false,
    vehicule: null,
    pieces: (["identite", "permis", "carte_grise", "voiture"] as const).map((type) => ({
      type,
      libelle: LIBELLES_PIECES[type],
      statut: "manquante" as const,
      deposeeA: null,
      expireLe: null,
      motifRefus: null,
    })),
    aFournir: ["identite", "permis", "carte_grise", "voiture"],
    numeroVersementEnregistre: false,
  };
}

/** `HH:MM` du départ, pour les libellés. */
export const heureDepart = (t: Pick<Trajet, "departA">): string => hhmmDouala(t.departA);

/** « sam. » du départ, pour le libellé de l'option de trajet régulier. */
export const jourDepart = (t: Pick<Trajet, "departA">): string => jourSemaineCourt(t.departA);
