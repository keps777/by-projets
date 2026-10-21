/** Fuseau des heures de l'application : les trajets partent de Douala. */
const FUSEAU = "Africa/Douala";

/** 4000 devient « 4 000 » (espace simple, comme la planche). */
export function formaterMontant(valeur: number): string {
  return String(Math.round(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 4,9 devient « 4,9 » : une décimale, virgule française. */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/**
 * Le moment du départ tel que la planche l'écrit : « sam. · 08:30 ». Les heures de l'API portent déjà le décalage
 * de Douala, l'heure se lit donc dans le texte ; le jour de la semaine est celui de Douala.
 */
export function momentDepart(iso: string, langue: string): string {
  const instant = new Date(iso);
  const heure = /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
  if (Number.isNaN(instant.getTime())) return heure;
  const jour = new Intl.DateTimeFormat(langue === "en" ? "en-GB" : "fr-FR", {
    weekday: "short",
    timeZone: FUSEAU,
  }).format(instant);
  return `${jour} · ${heure}`;
}

/** Lit un prix saisi (« 4 000 », « 4000 ») : un entier strictement positif, sinon `null`. */
export function lirePrix(texte: string): number | null {
  const chiffres = texte.replace(/\D/g, "");
  if (chiffres === "") return null;
  const valeur = Number(chiffres);
  return valeur > 0 ? valeur : null;
}

/** La saisie du prix remise en forme à chaque frappe : seuls les chiffres restent, groupés par trois. */
export function saisirPrix(texte: string): string {
  const chiffres = texte.replace(/\D/g, "").slice(0, 7);
  return chiffres === "" ? "" : formaterMontant(Number(chiffres));
}

export interface BornesPrix {
  min: number;
  max: number;
}

/** Ramène un prix dans la fourchette conseillée : du partage de frais, pas de bénéfice. */
export function dansLesBornes(prix: number, { min, max }: BornesPrix): number {
  return Math.min(Math.max(prix, min), max);
}

/** Le prix est-il dans la fourchette conseillée (bornes comprises) ? */
export function prixAutorise(prix: number | null, { min, max }: BornesPrix): prix is number {
  return prix !== null && prix >= min && prix <= max;
}

/** Le code d'une option qui répète le trajet chaque semaine (« regulier » côté serveur). */
export function estOptionRegulier(code: string): boolean {
  return /regulier/.test(code);
}
