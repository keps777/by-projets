/** Formats d'affichage de la convention (valeurs de la planche : « 1 400 », « 12 oct. 2026 », « 12 oct. 09:40 », « + 131 k »). */

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

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** Groupes de trois chiffres séparés par une espace : `1400` -> `1 400`. */
export function milliers(valeur: number): string {
  const groupes = String(Math.abs(Math.trunc(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return valeur < 0 ? `− ${groupes}` : groupes;
}

/**
 * `2026-10-12T11:05:00.000+01:00` -> `12 oct. 2026`. Les instants de l'API sont déjà à l'heure de Douala (`+01:00`) :
 * on lit le jour tel qu'il est écrit, sans passer par le fuseau de l'appareil.
 */
export function jourAvecAnnee(iso: string): string {
  const m = INSTANT.exec(iso);
  const mois = m ? MOIS_ABREGES[Number(m[2]) - 1] : undefined;
  return m && mois ? `${Number(m[3])} ${mois} ${m[1]}` : iso;
}

/** `2026-10-12T09:40:00.000+01:00` -> `12 oct. 09:40`. */
export function jourEtHeure(iso: string): string {
  const m = INSTANT.exec(iso);
  const mois = m ? MOIS_ABREGES[Number(m[2]) - 1] : undefined;
  return m && mois ? `${Number(m[3])} ${mois} ${m[4]}:${m[5]}` : iso;
}

/**
 * Montant du bilan en milliers de francs : `131000` -> `+ 131 k`, `131500` -> `+ 131,5 k`, `-8000` -> `− 8 k`.
 * Sous mille francs le montant reste entier (`+ 800`) ; zéro s'écrit `0`.
 */
export function netCompact(montant: number): string {
  if (montant === 0) return "0";
  const signe = montant > 0 ? "+" : "−";
  const absolu = Math.abs(montant);
  if (absolu < 1000) return `${signe} ${absolu}`;
  const k = Math.round(absolu / 100) / 10;
  const texte = Number.isInteger(k) ? milliers(k) : String(k).replace(".", ",");
  return `${signe} ${texte} k`;
}
