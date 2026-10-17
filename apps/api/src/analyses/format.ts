/**
 * Mise en forme des textes que l'API formule elle-même (`lecture`, `constat`, `explication`,
 * `avisAssistant`), comme les maquettes : espace simple pour les milliers (« 7 500 »), vrai signe
 * moins « − » suivi d'une espace (« − 4 500 »), virgule décimale.
 */
export function nombre(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Nombre invalide : ${String(n)}`);
  const signe = n < 0 ? "− " : "";
  const [entier = "0", decimales] = Math.abs(n).toString().split(".");
  return signe + entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (decimales ? `,${decimales}` : "");
}

/** `4 500 F`. */
export const francs = (n: number): string => `${nombre(n)} F`;

/** `3 pannes`, `1 panne` : accord du nom avec le nombre. */
export function accorder(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${nombre(n)} ${Math.abs(n) > 1 ? pluriel : singulier}`;
}

/** `de Mvan`, `d'Akwa` : élision devant une voyelle ou un h muet. */
export function de(nom: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüœ]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/** Arrondi à l'entier le plus proche, `-0` ramené à `0`. */
export function arrondi(n: number): number {
  const r = Math.round(n);
  return r === 0 ? 0 : r;
}

/** Pourcentage à une décimale, jamais `-0`. */
export function pct1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}
