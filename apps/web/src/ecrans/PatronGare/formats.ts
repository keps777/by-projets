/** Formats d'affichage d'une gare vue par le patron (valeurs de la maquette : « 1,41 M », « 612 000 », « − 1 000 », « 14:02 »). */

/** `2027-01-05T14:02:00.000+01:00` -> `14:02` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `1412000` -> `1 412 000`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant exact d'un guichet ou de la gare : `694500` -> `694 500`. */
export function montant(fcfa: number): string {
  return `${fcfa < 0 ? "− " : ""}${groupes(fcfa)}`;
}

/**
 * Caisse de la gare comme la planche l'écrit dans sa tuile : `1412000` -> `1,41 M`, `612500` -> `612,5 k`,
 * `950` -> `950`. Deux décimales au plus en millions, une en milliers, sans zéro inutile.
 */
export function caisseCourte(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "";
  if (absolu >= 1_000_000) return `${signe}${decimale(Math.round(absolu / 10_000) / 100)} M`;
  if (absolu >= 1000) return `${signe}${decimale(Math.round(absolu / 100) / 10)} k`;
  return `${signe}${absolu}`;
}

/** Écart de caisse : `-1000` -> `− 1 000` (vrai signe moins, une espace), `0` -> `0`, `500` -> `+ 500`. */
export function ecart(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${groupes(fcfa)}`;
}

/** Taux entier ou décimal : `86` -> `86`, `86,5` -> `86,5`. */
export function taux(pourcent: number): string {
  return decimale(pourcent);
}

/** Les noms qui commencent par une voyelle s'élident : « Gare d’Akwa », mais « Gare de Mvan ». */
export function commenceParVoyelle(nom: string): boolean {
  return /^[aeiouyàâäéèêëîïôöûü]/i.test(nom.trim());
}

/** « 3e en 10 jours » -> `[{ texte: "3" }, { exposant: "e" }, { texte: " en 10 jours" }]` : la planche écrit les rangs en exposant. */
export type MorceauJournal = { texte: string } | { exposant: string };

export function morceauxJournal(texte: string): MorceauJournal[] {
  const morceaux = texte.split(/(\d+)(er|e)(?=\s|$)/);
  const sortie: MorceauJournal[] = [];
  for (let i = 0; i < morceaux.length; i += 3) {
    const avant = (morceaux[i] ?? "") + (morceaux[i + 1] ?? "");
    if (avant !== "") sortie.push({ texte: avant });
    const exposant = morceaux[i + 2];
    if (exposant !== undefined) sortie.push({ exposant });
  }
  return sortie;
}
