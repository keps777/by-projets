import { hhmmDouala, jourDouala, MS_PAR_MINUTE, enMs, type Instant } from "../billetterie/temps";
import type { ConfigCovoiturage } from "./config";
import {
  TYPES_PIECES,
  type DemandeCovoit,
  type DossierConducteur,
  type MomentJournee,
  type NoteCovoit,
  type StatutDossier,
  type Trajet,
  type TypePiece,
} from "./modeles";

/**
 * Règles pures du covoiturage : devis, arrivée prévue et libération de l'argent, annulation par le
 * passager, vérification du conducteur, correspondance d'une demande avec un trajet, noms publics et
 * textes. Sans Nest ni état : tout est testé tel quel.
 */

/** 250 F par place, gardés par AfriMove (`TARIFS.covoitParPlace` du domaine, comparé dans `parite.test.ts`). */
export const FRAIS_PAR_PLACE = 250;

/** Codes des lignes de la commande. Le code des frais est celui que `paiements` envoie à AfriMove. */
export const CODE_LIGNE_PLACES = "places";
export const CODE_LIGNE_FRAIS = "frais_voyageur";

/* ------------------------------------------------------------------ textes */

export const LIBELLES_PIECES: Readonly<Record<TypePiece, string>> = {
  identite: "pièce d'identité",
  permis: "permis",
  carte_grise: "carte grise",
  voiture: "voiture",
};

const SMS_MAX_MOTIF = 80;

/** Le motif d'un refus part par SMS : pas d'adresse, une ligne, 80 caractères. */
export function motifPourSms(motif: string): string {
  return motif
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SMS_MAX_MOTIF)
    .trim();
}

export const fcfaTexte = (montant: number): string =>
  `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;

/** Textes que le serveur écrit lui-même, tous en français. Ceux des SMS sont à valider (README). */
export const TEXTES = {
  /** Reprise de la planche « Covoit » : « Payé dans l'app · remboursé si Samuel annule ». */
  garantie: (prenom: string) => `Payé dans l'app · remboursé si ${prenom} annule`,
  /** Reprise de la note de bas de page de la planche « Covoit ». */
  noteRecherche:
    "Conducteurs vérifiés (pièce, permis, voiture). Argent libéré au conducteur à l'arrivée.",
  libelleLignePlaces: (places: number) => `${places} place(s)`,
  libelleLigneFrais: "Frais AfriMove",
  /** Reprise de la planche « Covoit en ville ». */
  explicationTrajetRegulier: (rappelA: string) =>
    `Chaque jour ouvré, l'app te propose à ${rappelA} les voitures qui partent.`,
  explicationHabitue: (prenom: string, fois: number) => `${prenom} t'a déjà pris ${fois} fois.`,
  options: {
    clim: "Clim",
    bagage_moyen: "Bagage moyen",
    femmes: "Femmes seulement",
    regulier: (jour: string) => `Trajet régulier · chaque ${jour}`,
  },
  sms: {
    reservation: (passager: string, places: number, trajet: string, quand: string) =>
      `AfriMove covoiturage : ${passager} a réservé ${places} place(s) pour ${trajet}, ${quand}.`,
    trajetAnnule: (conducteur: string, trajet: string, quand: string) =>
      `AfriMove covoiturage : ${conducteur} a annulé le trajet ${trajet}, ${quand}. Tu es remboursé.`,
    proposition: (conducteur: string, trajet: string, quand: string, prix: number) =>
      `AfriMove covoiturage : ${conducteur} te propose le trajet ${trajet}, ${quand}, à ${fcfaTexte(prix)} la place. Ouvre l'app pour réserver.`,
    versement: (montant: number, trajet: string) =>
      `AfriMove covoiturage : ${fcfaTexte(montant)} envoyés sur ton MoMo pour le trajet ${trajet}.`,
    dossierVerifie: "AfriMove : ton dossier conducteur est vérifié. Tu peux publier des trajets.",
    pieceRefusee: (piece: string, motif: string) =>
      `AfriMove : ta ${piece} n'est pas acceptée${motif === "" ? "" : ` (${motif})`}. Dépose-la de nouveau dans l'app.`,
  },
} as const;

/* ------------------------------------------------------------------ noms */

/** « Samuel Ekambi » → « Samuel E. » : le nom que voient les autres voyageurs. */
export function nomPublic(nomComplet: string): string {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  const prenom = mots[0] ?? "";
  const dernier = mots.length > 1 ? mots[mots.length - 1] : undefined;
  if (prenom === "") return "Voyageur";
  return dernier ? `${prenom} ${[...dernier][0]!.toUpperCase()}.` : prenom;
}

export const prenomDe = (nomComplet: string): string =>
  nomComplet.trim().split(/\s+/)[0] || "Voyageur";

/** « Samuel Ekambi » → « SE » ; un seul mot → ses deux premières lettres. */
export function initiales(nomComplet: string): string {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return [...mots[0]!].slice(0, 2).join("").toUpperCase();
  return `${[...mots[0]!][0]}${[...mots[mots.length - 1]!][0]}`.toUpperCase();
}

/** Compare deux noms de ville ou de lieu sans tenir compte des accents, des majuscules ni des espaces en trop. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ devis */

export interface LigneDevisCovoit {
  code: string;
  libelle: string;
  montant: number;
}

/** Prix des places + 250 F de frais par place, sur deux lignes : les paiements les envoient à deux comptes. */
export function devisReservation(
  prixParPlace: number,
  places: number,
  fraisParPlace = FRAIS_PAR_PLACE,
): { lignes: LigneDevisCovoit[]; total: number } {
  if (!Number.isInteger(prixParPlace) || prixParPlace < 0) throw new RangeError("Prix invalide");
  if (!Number.isInteger(places) || places < 1) throw new RangeError("Nombre de places invalide");
  const lignes: LigneDevisCovoit[] = [
    {
      code: CODE_LIGNE_PLACES,
      libelle: TEXTES.libelleLignePlaces(places),
      montant: prixParPlace * places,
    },
    {
      code: CODE_LIGNE_FRAIS,
      libelle: TEXTES.libelleLigneFrais,
      montant: fraisParPlace * places,
    },
  ];
  return { lignes, total: lignes.reduce((s, l) => s + l.montant, 0) };
}

/* ------------------------------------------------------------------ temps */

export const ajouterMs = (instant: Instant, ms: number): Date => new Date(enMs(instant) + ms);
export const ajouterMin = (instant: Instant, minutes: number): Date =>
  ajouterMs(instant, minutes * MS_PAR_MINUTE);

export const arriveePrevue = (departA: Instant, dureeMinutes: number): Date =>
  ajouterMin(departA, dureeMinutes);

/**
 * Moment où l'argent part vers le conducteur sans que le passager ait confirmé : « 2 h après
 * l'heure prévue » d'arrivée.
 */
export const liberationAuto = (
  departA: Instant,
  dureeMinutes: number,
  config: Pick<ConfigCovoiturage, "liberationApresArriveeMin">,
): Date => ajouterMin(arriveePrevue(departA, dureeMinutes), config.liberationApresArriveeMin);

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."] as const;

const jourDeSemaine = (jour: string): number => new Date(`${jour}T12:00:00.000Z`).getUTCDay();

export const jourSemaineLong = (instant: Instant): string =>
  JOURS[jourDeSemaine(jourDouala(instant))]!;
/** « sam. » : comme sur la planche du conducteur. */
export const jourSemaineCourt = (instant: Instant): string =>
  JOURS_COURTS[jourDeSemaine(jourDouala(instant))]!;

/** « sam. 09/01 à 08:30 » pour un SMS. */
export function quandTexte(instant: Instant): string {
  const [, mois, jour] = jourDouala(instant).split("-");
  return `${jourSemaineCourt(instant)} ${jour}/${mois} à ${hhmmDouala(instant)}`;
}

export function momentDe(instant: Instant): MomentJournee {
  const heure = Number(hhmmDouala(instant).slice(0, 2));
  return heure < 12 ? "matin" : heure < 18 ? "apres_midi" : "soir";
}

/** « dimanche matin » : ce que le conducteur lit sur la demande du passager. */
export function quandDemande(demande: Pick<DemandeCovoit, "jour" | "moment">): string {
  const jour = JOURS[jourDeSemaine(demande.jour)]!;
  const moment =
    demande.moment === "matin"
      ? " matin"
      : demande.moment === "apres_midi"
        ? " après-midi"
        : demande.moment === "soir"
          ? " soir"
          : "";
  return `${jour}${moment}`;
}

/* ------------------------------------------------------------------ prix */

export interface ConseilPrix {
  min: number;
  max: number;
}

/**
 * Partage de frais, pas de bénéfice : un prix au-dessus de la fourchette conseillée est refusé. Quand le
 * référentiel ne connaît pas le trajet, un plafond général s'applique.
 */
export function prixAutorise(
  prix: number,
  conseil: ConseilPrix | null,
  config: Pick<ConfigCovoiturage, "prixMaxInconnuFcfa">,
): { ok: boolean; max: number } {
  const max = conseil ? conseil.max : config.prixMaxInconnuFcfa;
  return { ok: Number.isInteger(prix) && prix >= 100 && prix <= max, max };
}

/* ------------------------------------------------------------------ annulation par le passager */

export interface DecisionAnnulation {
  /** Faux une fois le trajet commencé : le passager confirme son arrivée, il n'annule plus. */
  autorise: boolean;
  gratuite: boolean;
  /** Part du prix qui reste au conducteur (FCFA). */
  retenue: number;
  /** Part du prix rendue au passager (FCFA). Les frais d'AfriMove ne sont pas rendus. */
  remboursement: number;
}

export function decisionAnnulationPassager(
  r: { departA: Instant; prixParPlace: number; places: number },
  maintenant: Instant,
  config: Pick<ConfigCovoiturage, "annulationGratuiteAvantMin" | "retenueTardivePct">,
): DecisionAnnulation {
  const prix = r.prixParPlace * r.places;
  const avantMs = enMs(r.departA) - enMs(maintenant);
  if (avantMs <= 0) return { autorise: false, gratuite: false, retenue: 0, remboursement: 0 };
  const gratuite = avantMs >= config.annulationGratuiteAvantMin * MS_PAR_MINUTE;
  const retenue = gratuite ? 0 : Math.floor((prix * config.retenueTardivePct) / 100);
  return { autorise: true, gratuite, retenue, remboursement: prix - retenue };
}

/* ------------------------------------------------------------------ vérification du conducteur */

/** Statut du dossier à `maintenant` (une pièce validée mais périmée le rend `expire`). */
export function statutDossier(dossier: DossierConducteur, maintenant: Instant): StatutDossier {
  const pieces = TYPES_PIECES.map((t) => dossier.pieces[t]);
  if (pieces.some((p) => p?.statut === "refusee")) return "refuse";
  if (dossier.vehicule === null || pieces.some((p) => p === undefined)) return "incomplet";
  const aujourdhui = jourDouala(maintenant);
  if (
    pieces.some((p) => p?.statut === "validee" && p.expireLe !== null && p.expireLe < aujourdhui)
  ) {
    return "expire";
  }
  if (pieces.some((p) => p?.statut === "a_verifier")) return "en_verification";
  return "verifie";
}

export const estVerifie = (dossier: DossierConducteur | null, maintenant: Instant): boolean =>
  dossier !== null && statutDossier(dossier, maintenant) === "verifie";

/** Pièces encore à déposer, refusées ou périmées : de quoi dire au conducteur ce qu'il lui reste à faire. */
export function piecesAFournir(dossier: DossierConducteur, maintenant: Instant): TypePiece[] {
  const aujourdhui = jourDouala(maintenant);
  return TYPES_PIECES.filter((t) => {
    const p = dossier.pieces[t];
    return (
      p === undefined ||
      p.statut === "refusee" ||
      (p.expireLe !== null && p.statut === "validee" && p.expireLe < aujourdhui)
    );
  });
}

/** `AAAA-MM-JJ` est une date calendaire réelle. */
export function jourCalendaireValide(jour: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  const d = new Date(`${jour}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(jour);
}

/* ------------------------------------------------------------------ véhicule et immatriculation */

/** « Toyota Corolla grise » : le véhicule tel que le voit le passager. */
export const descriptionVehicule = (v: {
  marque: string;
  modele: string;
  couleur: string;
}): string =>
  [v.marque, v.modele, v.couleur]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");

/** `LT 882 CE` : espaces et tirets uniformisés, majuscules. */
export const normaliserImmatriculation = (brut: string): string =>
  brut
    .trim()
    .replace(/[\s-]+/g, " ")
    .toUpperCase();

/* ------------------------------------------------------------------ demandes et trajets */

/** Le trajet peut répondre à la demande : mêmes villes, même jour, créneau compatible, assez de places. */
export function trajetRepondALaDemande(
  trajet: Pick<Trajet, "statut" | "type" | "departVille" | "arriveeVille" | "departA">,
  placesLibres: number,
  demande: Pick<DemandeCovoit, "departVille" | "arriveeVille" | "jour" | "moment" | "places">,
): boolean {
  return (
    trajet.statut === "publie" &&
    trajet.type === "entre_villes" &&
    normaliser(trajet.departVille) === normaliser(demande.departVille) &&
    normaliser(trajet.arriveeVille) === normaliser(demande.arriveeVille) &&
    jourDouala(trajet.departA) === demande.jour &&
    (demande.moment === null || momentDe(trajet.departA) === demande.moment) &&
    placesLibres >= demande.places
  );
}

/** Deux trajets du même conducteur se chevauchent (départ à arrivée prévue). */
export function seChevauchent(
  a: Pick<Trajet, "departA" | "dureeMinutes">,
  b: Pick<Trajet, "departA" | "dureeMinutes">,
): boolean {
  const debutA = enMs(a.departA);
  const finA = enMs(arriveePrevue(a.departA, a.dureeMinutes));
  const debutB = enMs(b.departA);
  const finB = enMs(arriveePrevue(b.departA, b.dureeMinutes));
  return debutA < finB && debutB < finA;
}

/* ------------------------------------------------------------------ notes */

/** Moyenne arrondie à une décimale ; `null` tant qu'il n'y a aucune note. */
export function moyenneNotes(notes: ReadonlyArray<Pick<NoteCovoit, "valeur">>): number | null {
  if (notes.length === 0) return null;
  const somme = notes.reduce((s, n) => s + n.valeur, 0);
  return Math.round((somme / notes.length) * 10) / 10;
}

/* ------------------------------------------------------------------ valeurs par défaut du référentiel */

/**
 * Quand le référentiel ne connaît pas un trajet : durée prudente (l'argent part plus tard plutôt que
 * trop tôt) et, en ville, une fourchette de prix. Valeurs à confirmer (README).
 */
export const DUREE_INTERURBAIN_DEFAUT_MIN = 360;
export const DUREE_VILLE_DEFAUT_MIN = 45;
export const CONSEIL_VILLE_DEFAUT: ConseilPrix = { min: 300, max: 1000 };

/** Attente avant le prochain essai d'un versement : 1 min, 2 min, 4 min… (plafonné à 6 h). */
export function attenteVersementMs(essaisFaits: number, premiereMs: number): number {
  return Math.min(premiereMs * 2 ** Math.max(0, essaisFaits - 1), 6 * 3_600_000);
}

/** Jour (AAAA-MM-JJ) décalé de `jours` jours. */
export function ajouterJours(jour: string, jours: number): string {
  const d = new Date(`${jour}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Heure de rappel du trajet régulier : 20 minutes avant le départ habituel (« 07:00 » → « 06:40 »). */
export function rappelAvant(departA: string, minutes = 20): string {
  const [h, m] = departA.split(":").map(Number) as [number, number];
  const total = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
