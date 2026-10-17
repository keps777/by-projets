/** Formats d'affichage de la clôture (valeurs de la planche : « 28 414 000 », « 5 janv. 2027 · 09:12 », « xlsx · 1,2 Mo »). */

import type { patron } from "@afrimove/contrats";

type Fichier = patron.ClotureMois["envoi"]["fichiers"][number];

/** Groupes de trois chiffres séparés par une espace : `28414000` -> `28 414 000`. */
export function milliers(valeur: number): string {
  const groupes = String(Math.abs(Math.trunc(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return valeur < 0 ? `− ${groupes}` : groupes;
}

const MOIS_ABREGES = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * `2027-01-05T09:12:00.000+01:00` -> `5 janv. 2027 · 09:12`. Les instants de l'API sont déjà à l'heure de Douala
 * (`+01:00`) : on lit le jour et l'heure tels qu'ils sont écrits, sans passer par le fuseau de l'appareil.
 */
export function instantAvecAnnee(iso: string): string {
  const m = INSTANT.exec(iso);
  const mois = m ? MOIS_ABREGES[Number(m[2]) - 1] : undefined;
  return m && mois ? `${Number(m[3])} ${mois} ${m[1]} · ${m[4]}:${m[5]}` : iso;
}

/** `2027-01-05T09:13:00.000+01:00` -> `09:13`. */
export function heureDe(iso: string): string {
  const m = INSTANT.exec(iso);
  return m ? `${m[4]}:${m[5]}` : iso;
}

/** `Décembre 2026` -> `Décembre` (la planche n'écrit pas l'année). */
export function nomDuMois(libelle: string): string {
  return libelle.split(" ")[0] ?? libelle;
}

/** `Décembre` -> `décembre` : la planche écrit « FCFA encaissés · décembre » en minuscules. */
export function enMinuscules(nom: string): string {
  return nom.toLocaleLowerCase("fr-FR");
}

/** `2026-12` -> `janvier` : un mois clôturé n'accepte plus que des écritures du mois suivant. */
export function moisSuivant(mois: string): string {
  const m = /^\d{4}-(\d{2})$/.exec(mois);
  return m ? (MOIS_LONGS[Number(m[1]) % 12] ?? "") : "";
}

/** `1200000` -> `1,2 Mo` ; `84000` -> `84 ko` ; `812` -> `812 o` (unités décimales, comme la planche). */
export function tailleLisible(octets: number): string {
  if (octets >= 1_000_000) {
    return `${String(Math.round(octets / 100_000) / 10).replace(".", ",")} Mo`;
  }
  if (octets >= 1_000) return `${Math.round(octets / 1_000)} ko`;
  return `${octets} o`;
}

/** `xlsx · 1,2 Mo`, `csv · 31 ko`, `pdf · 2 p.` : le format, puis le poids ou le nombre de pages. */
export function formatFichier(fichier: Pick<Fichier, "format" | "tailleOctets" | "pages">): string {
  const detail =
    fichier.tailleOctets !== null
      ? tailleLisible(fichier.tailleOctets)
      : fichier.pages !== null
        ? `${fichier.pages} p.`
        : "";
  return detail ? `${fichier.format} · ${detail}` : fichier.format;
}

/**
 * Le modèle d'AfriMove est sans abonnement : une facture se compose de 75 F par billet et de 150 F par colis. Si un
 * libellé commence encore par « abonnement + », on le retire (note du ticket AM-113).
 */
export function sansAbonnement(description: string): string {
  return description.replace(/^abonnement\s*\+\s*/i, "");
}
