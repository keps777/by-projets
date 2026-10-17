/** Formats de « Entre compagnies » (valeurs de la planche : « 19 500 », « + 12 300 », « − 7 200 », « 08:15 »). */

/**
 * Ville de départ du billet voyageur en correspondance (« Yaoundé → Bamenda en un seul billet »). Le contrat
 * `correspondanceVoyageurs` ne porte que les minutes : ce départ ne peut pas se déduire du colis (Douala → Bamenda).
 * À remplacer par le champ du contrat quand AM-135 le fournira.
 */
export const DEPART_VOYAGEUR_EN_ATTENTE_DU_CONTRAT = "Yaoundé";

/** Groupes de trois chiffres séparés par une espace : `19500` -> `19 500`. */
export function montant(fcfa: number): string {
  return String(Math.abs(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant signé : `12300` -> `+ 12 300`, `-7200` -> `− 7 200` (vrai signe moins, une espace), `0` -> `0`. */
export function montantSigne(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${montant(fcfa)}`;
}

/** `2027-01-11T08:00:00.000+01:00` -> `08:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Jour de la semaine (0 dimanche … 6 samedi) du jour de Douala écrit dans l'ISO, sans passer par le fuseau du navigateur. */
export function jourSemaine(iso: string): number {
  const jour = /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1];
  if (!jour) return 1;
  return new Date(`${jour}T12:00:00Z`).getUTCDay();
}

export type TonTroncon = "ambre" | "bleu";

/** Premier tronçon en ambre, le suivant en bleu, puis en alternance. */
export function tonTroncon(rang: number): TonTroncon {
  return rang % 2 === 1 ? "ambre" : "bleu";
}

export type TonMontant = "vert" | "rouge" | "neutre";

/** Vert quand on nous doit de l'argent, rouge quand nous en devons. */
export function tonMontant(fcfa: number): TonMontant {
  if (fcfa === 0) return "neutre";
  return fcfa > 0 ? "vert" : "rouge";
}
