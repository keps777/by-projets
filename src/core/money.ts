// Argent : formats et conversions. Le franc CFA (XAF) n'a pas de centime ; l'euro est à parité fixe (655,957).
export const EUR_FCFA = 655.957;

/** « 1 240 000 » : espaces ordinaires (les espaces insécables gênent la copie et la recherche). */
export function fcfa(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
}
/** « 86 500 FCFA » */
export const fcfaUnite = (n: number) => `${fcfa(n)} FCFA`;
/** « + 12 500 » / « − 7 100 » avec le vrai signe moins. */
export const fcfaSigne = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fcfa(Math.abs(n))}`;
/** « 25 k », « 1,2 M » pour les puces de montants. */
export function court(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1000) return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return String(n);
}
export const versEuro = (f: number) => f / EUR_FCFA;
export const versFcfa = (e: number) => e * EUR_FCFA;
/** « 54,12 » */
export const euro = (e: number) => e.toFixed(2).replace('.', ',');
export const arrondiA = (n: number, pas: number) => Math.round(n / pas) * pas;
/** Lit un montant saisi (« 24 500 », « 24500 FCFA ») ; null si illisible ou négatif. */
export function lireMontant(texte: string): number | null {
  const chiffres = texte.replace(/[^\d]/g, '');
  if (!chiffres) return null;
  const n = Number(chiffres);
  return Number.isFinite(n) ? n : null;
}
