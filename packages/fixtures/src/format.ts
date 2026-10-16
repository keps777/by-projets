/**
 * Mise en forme des montants et des nombres telle que les maquettes l'affichent : espace simple
 * comme séparateur de milliers (« 7 500 »), vrai signe moins « − » (U+2212) suivi d'une espace
 * (« − 1 000 »), virgule décimale (« 4,9 »).
 */
export function nombre(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Nombre invalide : ${String(n)}`);
  const signe = n < 0 ? "− " : "";
  const [entier = "0", decimales] = Math.abs(n).toString().split(".");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return signe + groupe + (decimales ? `,${decimales}` : "");
}

/** Montant en FCFA sans l'unité : « 7 500 ». */
export function f(n: number): string {
  return nombre(n);
}

/** Montant avec l'unité des boutons : « 7 500 F ». */
export function francs(n: number): string {
  return `${nombre(n)} F`;
}

/** Montant précédé du signe + ou −, comme dans « + 12 300 » ou « − 7 200 ». */
export function signe(n: number): string {
  return n > 0 ? `+ ${nombre(n)}` : nombre(n);
}
