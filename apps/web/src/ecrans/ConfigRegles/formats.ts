/** Formats de l'écran « règles de l'agence » : montant de la planche (« 1 000 »), numéro de compte MoMo. */

/** Montant FCFA tel que la planche l'écrit : `1000` -> `1 000` (une espace entre les milliers). */
export function formaterMontant(fcfa: number): string {
  return String(Math.abs(Math.trunc(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant saisi : « 1 000 » -> 1000 ; une saisie sans chiffre est « vide » (`null`), jamais 0. */
export function lireMontant(saisie: string): number | null {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 9);
  return chiffres === "" ? null : Number(chiffres);
}

/**
 * Numéro saisi pour un compte marchand -> numéro envoyé à l'API (`+` et 9 à 15 chiffres), ou `null` si ce n'en est
 * pas un. Les espaces, points et tirets sont ignorés ; neuf chiffres sont un numéro camerounais (« 6 77 12 34 56 »),
 * l'indicatif +237 est ajouté. Un numéro masqué (« 6 77 •• •• 02 ») n'est pas un numéro.
 */
export function normaliserNumero(saisie: string): string | null {
  const texte = saisie.replace(/[\s.\-()]/g, "");
  if (!/^\+?\d+$/.test(texte)) return null;
  const numero = /^\d{9}$/.test(texte) ? `+237${texte}` : texte;
  return /^\+?\d{9,15}$/.test(numero) ? numero : null;
}
