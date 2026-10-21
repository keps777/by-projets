/**
 * Formats d'affichage de l'aperçu d'un export (valeurs de la planche : « 31 404 », « 1,2 Mo », « 01/12 », « 5 000 »).
 */

import type { patron } from "@afrimove/contrats";

export type Cellule = patron.ApercuExport["tableau"]["lignes"][number][number];

/** Groupes de trois chiffres séparés par une espace : `31404` -> `31 404`. */
export function milliers(valeur: number): string {
  const groupes = String(Math.abs(Math.trunc(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return valeur < 0 ? `− ${groupes}` : groupes;
}

/** Une décimale au plus, virgule française, sans « ,0 » inutile : `1.2` -> `1,2`, `3` -> `3`. */
function decimale(valeur: number): string {
  return String(Math.round(valeur * 10) / 10).replace(".", ",");
}

/** Taille du fichier en unités décimales (comme le serveur) : `1_200_000` -> `1,2 Mo`, `48_000` -> `48 ko`. */
export function tailleFichier(octets: number): string {
  if (octets >= 1_000_000_000) return `${decimale(octets / 1_000_000_000)} Go`;
  if (octets >= 1_000_000) return `${decimale(octets / 1_000_000)} Mo`;
  if (octets >= 1_000) return `${Math.round(octets / 1_000)} ko`;
  return `${octets} o`;
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

/**
 * `2026-12-03T11:42:00.000+01:00` -> `3 déc. 11:42`. Les instants de l'API sont déjà à l'heure de Douala
 * (`+01:00`) : on lit le jour et l'heure tels qu'ils sont écrits, sans passer par le fuseau de l'appareil.
 */
export function instantCourt(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const mois = MOIS_ABREGES[Number(m[1]) - 1];
  return mois ? `${Number(m[2])} ${mois} ${m[3]}:${m[4]}` : iso;
}

export type AgeFichier =
  | { genre: "instant" }
  | { genre: "minutes"; minutes: number }
  | { genre: "heures"; heures: number }
  | { genre: "le"; date: string };

/**
 * Depuis quand le fichier est généré : « à l'instant » dans la minute (et si l'horloge de l'appareil retarde sur
 * le serveur), puis en minutes, en heures jusqu'à 24 h, puis la date.
 */
export function ageFichier(genereA: string, maintenant: Date): AgeFichier {
  const instant = new Date(genereA).getTime();
  if (Number.isNaN(instant)) return { genre: "le", date: genereA };
  const minutes = Math.floor((maintenant.getTime() - instant) / 60_000);
  if (minutes < 1) return { genre: "instant" };
  if (minutes < 60) return { genre: "minutes", minutes };
  if (minutes < 24 * 60) return { genre: "heures", heures: Math.floor(minutes / 60) };
  return { genre: "le", date: instantCourt(genereA) };
}

/** `2026-12-01` -> `01/12` : la planche écrit la date du journal sans l'année. */
export function dateCourte(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : iso;
}

/** Texte d'une cellule : vide -> « — », entier de FCFA -> « 5 000 », date ISO -> « 01/12 », texte tel quel. */
export function texteCellule(cellule: Cellule): string {
  if (cellule === null) return "—";
  if (typeof cellule === "number") return milliers(cellule);
  return dateCourte(cellule);
}

export type TonCellule = "vert" | "ambre" | "rouge" | "bleu";

/** Couleur du mode de paiement : espèces en vert, MoMo en ambre, annulé en rouge, canaux en ligne en bleu. */
export function tonDuMode(mode: string): TonCellule {
  switch (mode) {
    case "CASH":
      return "vert";
    case "MOMO":
      return "ambre";
    case "ANNULÉ":
      return "rouge";
    default:
      return "bleu";
  }
}

/** Une colonne est alignée à droite quand toutes ses cellules renseignées sont des montants (entiers de FCFA). */
export function colonneNumerique(lignes: readonly (readonly Cellule[])[], index: number): boolean {
  const cellules = lignes.map((l) => l[index]).filter((c) => c !== null && c !== undefined);
  return cellules.length > 0 && cellules.every((c) => typeof c === "number");
}

/** Nom d'un onglet sans son compteur : `Ventes · 31 404` -> `ventes`, `Par jour` -> `par jour`. */
export function nomOnglet(libelle: string): string {
  return (libelle.split(" · ")[0] ?? libelle).toLocaleLowerCase("fr-FR");
}

/** La phrase « ventes · par jour · par guichet · totaux » qui dit ce que contient le fichier, un onglet par vue. */
export function nomsDesOnglets(onglets: readonly { libelle: string }[]): string {
  return onglets.map((o) => nomOnglet(o.libelle)).join(" · ");
}

/** Nom de fichier sûr : `Journal des ventes · décembre` -> `journal-des-ventes-decembre`. */
export function nomDeFichier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Premier mot du libellé du mois, en minuscules : `Décembre 2026` -> `décembre` (la planche écrit le mois ainsi). */
export function nomDuMois(libelle: string): string {
  return (libelle.split(" ")[0] ?? libelle).toLocaleLowerCase("fr-FR");
}
