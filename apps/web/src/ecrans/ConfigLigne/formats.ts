/** Formats de l'écran « modifier une ligne » : montants de la planche (« 3 500 »), heures de départ (« 09:15 »), jours. */

/** Montant FCFA tel que la planche l'écrit : `3500` -> `3 500` (une espace entre les milliers). */
export function formaterMontant(fcfa: number): string {
  return String(Math.abs(Math.trunc(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant saisi : « 5 000 » -> 5000 ; une saisie sans chiffre est « vide » (`null`), jamais 0. */
export function lireMontant(saisie: string): number | null {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 9);
  return chiffres === "" ? null : Number(chiffres);
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function estHeureValide(heure: string): boolean {
  return HEURE.test(heure);
}

/**
 * Heure saisie -> `HH:MM`, ou `null` si ce n'en est pas une. Accepte « 9:15 », « 09h15 », « 915 », « 0915 » : le
 * patron tape comme il parle, la ligne enregistre toujours `HH:MM`.
 */
export function normaliserHeure(saisie: string): string | null {
  const texte = saisie.trim();
  const trouve = /^(\d{1,2})\s*[:hH.]\s*(\d{2})$/.exec(texte) ?? /^(\d{1,2})(\d{2})$/.exec(texte);
  if (!trouve) return null;
  const heure = `${trouve[1]!.padStart(2, "0")}:${trouve[2]!}`;
  return estHeureValide(heure) ? heure : null;
}

/**
 * Jour du prochain lundi (`AAAA-MM-JJ`) à partir d'un instant ISO de Douala : « Publier dès lundi ». Un lundi, c'est
 * le lundi suivant : ce qui est publié aujourd'hui ne change rien aux départs du jour.
 */
export function prochainLundi(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  const attente = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + attente);
  return date.toISOString().slice(0, 10);
}
