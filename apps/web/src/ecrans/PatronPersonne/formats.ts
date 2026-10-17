/** Formats de la fiche d'une personne vue par le patron : « 1 204 », « − 1 000 », « 15 déc. 14:00 », « 0,7 % ». */

import type { patron as contrats } from "@afrimove/contrats";

/** Groupes de trois chiffres séparés par une espace : `1204` -> `1 204`, `95000` -> `95 000`. */
export function nombre(n: number): string {
  return String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Écart de caisse : `-1000` -> `− 1 000` (vrai signe moins, une espace), `0` -> `0`, `500` -> `+ 500`. */
export function ecart(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${nombre(fcfa)}`;
}

/** Taux d'annulation : `0.7` -> `0,7 %`, `12` -> `12 %`. */
export function taux(pourcent: number): string {
  return `${String(pourcent).replace(".", ",")} %`;
}

/** `2027-01-05T14:05:00.000+01:00` -> `14:05` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

function localeDe(langue: string): string {
  return langue === "en" ? "en-GB" : "fr-FR";
}

/** `2027-01-05` -> `5 janv. 2027` (le mois abrégé de la langue de l'écran). */
export function formaterJour(jour: string, langue: string): string {
  const [annee, mois, j] = jour.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(localeDe(langue), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(annee, mois - 1, j)));
}

/** `2026-12-15T14:00:00.000+01:00` -> `15 déc. 14:00` : le jour et l'heure de Douala, sans passer par l'appareil. */
export function quandJournal(iso: string, langue: string): string {
  const jour = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!jour) return iso;
  const date = new Intl.DateTimeFormat(localeDe(langue), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(jour[1]), Number(jour[2]) - 1, Number(jour[3]))));
  return `${date} ${heureDouala(iso)}`;
}

/** `Joseph M.` -> `Joseph` : le prénom, pour « que faire avec Joseph ? ». */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? "";
}

/** « Mme Essono » -> vrai : la planche écrit « Superviseure ». Le contrat ne porte pas le genre, on lit la civilité. */
export function estFeminin(nomSuperviseur: string): boolean {
  return /^(?:Mme|Mlle)\b/i.test(nomSuperviseur.trim());
}

/**
 * Seuil au-delà duquel le taux d'annulation n'est plus « normal ». La planche écrit « 0,7 % · normal » sans dire d'où
 * vient le verdict : le contrat ne le donne pas, c'est une règle d'affichage locale (point à confirmer avec le métier).
 */
export const SEUIL_ANNULATIONS_NORMAL_PCT = 3;

export function annulationsNormales(pourcent: number): boolean {
  return pourcent <= SEUIL_ANNULATIONS_NORMAL_PCT;
}

/** Les états où la personne travaille : « depuis 05:30 » a un sens. */
export function estAuTravail(etat: contrats.EtatPersonne): boolean {
  return etat === "en_service" || etat === "a_bord" || etat === "en_route";
}

/**
 * Sépare l'analyse de l'assistant en son début et sa dernière phrase : la planche met la conclusion en gras
 * (« Ce n'est pas le tiroir, c'est la monnaie rendue sur les derniers billets. »). Un texte d'une seule phrase reste
 * entier, en conclusion.
 */
export function separerConclusion(texte: string): { debut: string; conclusion: string } {
  const propre = texte.trim();
  const coupure = /^(.*[.!?])\s+([^.!?]+[.!?]?)$/s.exec(propre);
  if (!coupure) return { debut: "", conclusion: propre };
  return { debut: coupure[1]!, conclusion: coupure[2]! };
}

/** Hauteur, en pour-cent, d'une journée sans écart : une pastille grise, comme la planche (4 à 10 %). */
export const HAUTEUR_JOUR_SANS_ECART = 6;
/** Hauteur minimale d'un jour avec écart : toujours plus haut que la pastille grise. */
const HAUTEUR_MIN_ECART = 15;

type JourEcart = contrats.FichePersonne["ecarts"]["jours"][number];

export interface BarreEcart {
  /** Jour du mois (« 6 », « 15 ») : l'étiquette sous la barre. */
  jour: number;
  ecart: number;
  /** Hauteur en pour-cent de la zone du graphique. */
  hauteur: number;
  /** Ambre quand il y a un écart, gris sinon. */
  accent: boolean;
}

/**
 * Les dix barres : la plus grande valeur absolue fait 100 %, les autres sont proportionnelles ; un jour sans écart
 * garde une pastille grise.
 */
export function barresEcarts(jours: readonly JourEcart[]): BarreEcart[] {
  const max = Math.max(0, ...jours.map((j) => Math.abs(j.ecart)));
  return jours.map(({ jour, ecart: valeur }) => {
    const accent = valeur !== 0;
    return {
      jour: Number(jour.slice(8, 10)),
      ecart: valeur,
      accent,
      hauteur: accent
        ? Math.max(HAUTEUR_MIN_ECART, Math.round((Math.abs(valeur) / max) * 100))
        : HAUTEUR_JOUR_SANS_ECART,
    };
  });
}
