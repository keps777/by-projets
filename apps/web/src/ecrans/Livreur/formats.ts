/** Formats de la planche « Livreur » (docs/maquettes-v3/Livreur.dc.html) : montants, distances, décompte, règles. */

/** 4900 -> « 4 900 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant en milliers de FCFA dès 1 000 : `31000` -> `31 k`, `31500` -> `31,5 k`, `700` -> `700`. */
export function montantCourt(montant: number): string {
  if (Math.abs(montant) < 1000) return String(Math.trunc(montant));
  const milliers = Math.round(montant / 100) / 10;
  return `${String(milliers).replace(".", ",")} k`;
}

/** 4.9 -> « 4,9 » (virgule décimale). */
export function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/** 2 -> « 2 », 2.5 -> « 2,5 ». */
export function formaterPoids(kg: number): string {
  return String(kg).replace(".", ",");
}

/** 4100 m -> « 4,1 », 4000 m -> « 4 ». */
export function formaterKilometres(metres: number): string {
  return String(Math.round(metres / 100) / 10).replace(".", ",");
}

/** 24 -> « 0:24 », 90 -> « 1:30 ». */
export function formaterDecompte(secondes: number): string {
  const total = Math.max(0, Math.ceil(secondes));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Durée restante au moment où la mission apparaît, en ms. Le serveur donne l'instant d'expiration ; si l'horloge de
 * l'appareil n'est pas celle du serveur (écart de plus du délai, ou instant déjà dépassé), on repart du délai complet
 * plutôt que d'afficher un décompte absurde.
 */
export function dureeInitialeMs(expireA: string, delaiSecondes: number, debutMs: number): number {
  const delai = delaiSecondes * 1000;
  const ecart = Date.parse(expireA) - debutMs;
  return Number.isFinite(ecart) && ecart > 0 && ecart <= delai ? ecart : delai;
}

/** Millisecondes restantes quand `ecouleMs` se sont écoulées depuis le début (jamais négatif). */
export function restantMs(initialMs: number, ecouleMs: number): number {
  return Math.max(0, initialMs - Math.max(0, ecouleMs));
}

export interface MorceauRegle {
  /** Le numéro « 1. » d'une règle, écrit en clair dans la planche. */
  numero: boolean;
  texte: string;
}

/** « 1. Jamais… 2. Jamais… » -> numéros et phrases, pour écrire les numéros en clair comme la planche. */
export function decouperRegles(texte: string): MorceauRegle[] {
  return texte
    .split(/(\b\d\.)(?=\s)/)
    .filter((morceau) => morceau !== "")
    .map((morceau) => ({ numero: /^\d\.$/.test(morceau), texte: morceau }));
}

/** Une pièce qui expire (« expire 02/27 ») s'écrit en ambre, les autres (« valide 2028 », « n° 23 ») en vert. */
export function tonPiece(valeur: string): "vert" | "ambre" {
  return /^\s*expire/i.test(valeur) ? "ambre" : "vert";
}
