import type { colis as contrats } from "@afrimove/contrats";

/** 300 -> « 300 », 25000 -> « 25 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 350 -> « 350 m », 1200 -> « 1,2 km », 2000 -> « 2 km » (virgule décimale). */
export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = (Math.round(metres / 100) / 10).toFixed(1).replace(".", ",");
  return `${km.replace(/,0$/, "")} km`;
}

/** 4.9 -> « 4,9 », 5 -> « 5,0 » : la note a toujours une décimale. */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

const NOMBRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];

/** 3 -> « trois » (la phrase de la carte écrit les petits nombres en lettres), 12 -> « 12 ». */
export function enLettres(n: number): string {
  return NOMBRES[n] ?? String(n);
}

/** « Marché A » -> « marché A » : le repère se lit au milieu d'une phrase. */
export function minusculeInitiale(texte: string): string {
  return texte.charAt(0).toLowerCase() + texte.slice(1);
}

/**
 * Nom court du bouton « Choisir Mama Fotso · prévenir Maman » : la planche écrit « Mama Fotso » pour « Boutique Mama
 * Fotso ». Seul le mot « Boutique » en tête est retiré ; les autres noms (« Pharmacie du Marché ») restent entiers.
 */
export function nomCourt(nom: string): string {
  const court = nom.replace(/^Boutique\s+/i, "").trim();
  return court === "" ? nom : court;
}

/** État d'un relais : ouvert, ferme bientôt (à telle heure), ou fermé. */
export type EtatRelais =
  | { type: "ouvert" }
  | { type: "ferme-bientot"; heure: string }
  | { type: "ferme" };

/** « 2027-01-05T19:00:00+01:00 » -> « 19 h », « …T19:30… » -> « 19 h 30 » (les heures du contrat sont à l'heure de Douala). */
export function heureEnFrancais(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  const heures = String(Number(m[1]));
  return m[2] === "00" ? `${heures} h` : `${heures} h ${m[2]}`;
}

export function etatDe(point: contrats.PointRelais): EtatRelais {
  if (!point.ouvert) return { type: "ferme" };
  if (point.fermeLe !== null) {
    return { type: "ferme-bientot", heure: heureEnFrancais(point.fermeLe) };
  }
  return { type: "ouvert" };
}

/** Repère d'un type donné sur la carte (le premier), s'il y en a un. */
export function repereDe(
  reperes: contrats.RelaisProches["reperes"],
  type: contrats.RelaisProches["reperes"][number]["type"],
) {
  return reperes.find((r) => r.type === type);
}
