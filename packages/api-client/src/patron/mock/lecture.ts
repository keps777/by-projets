import { JOUR, heure } from "@afrimove/fixtures";

/**
 * Lecture des textes de `@afrimove/fixtures` : les scénarios reproduisent la planche telle qu'elle
 * s'affiche (« 2,61 M », « − 14 % », « 15 déc. 14:00 »). Le mock les convertit en valeurs du
 * contrat : entiers de FCFA, instants ISO Africa/Douala, pourcentages.
 */

export class TexteIllisible extends Error {
  constructor(
    readonly attendu: string,
    readonly texte: unknown,
  ) {
    super(`Fixture illisible (${attendu}) : ${JSON.stringify(texte)}`);
    this.name = "TexteIllisible";
  }
}

const nettoyer = (texte: string): string => texte.replace(/[  ]/g, " ").trim();
const estNegatif = (texte: string): boolean =>
  /^[−–-]/.test(texte) || /^\+?\s*[−–-]\s*\d/.test(texte);

/** « 1 204 » → 1204 ; « − 1 000 » → −1000 ; un nombre passe tel quel. */
export function entier(valeur: string | number): number {
  if (typeof valeur === "number") return valeur;
  const t = nettoyer(valeur);
  const m = /(\d[\d ]*)/.exec(t.replace(/^[+−–-]\s*/, ""));
  if (!m) throw new TexteIllisible("entier", valeur);
  const n = Number(m[1]!.replace(/ /g, ""));
  return estNegatif(t) ? -n : n;
}

/**
 * Montant affiché → entier de FCFA : « 2,61 M » → 2 610 000 ; « + 131 k » → 131 000 ;
 * « − 310 k » → −310 000 ; « 1 412 000 » → 1 412 000 ; « jusqu'à 12 M » → 12 000 000.
 */
export function montant(valeur: string | number): number {
  if (typeof valeur === "number") return valeur;
  const t = nettoyer(valeur);
  const m = /(\d[\d ]*(?:,\d+)?)\s*([Mk])?(?![a-zA-Z])/.exec(t.replace(/^[+−–-]\s*/, ""));
  if (!m) throw new TexteIllisible("montant", valeur);
  const base = Number(m[1]!.replace(/ /g, "").replace(",", "."));
  const facteur = m[2] === "M" ? 1_000_000 : m[2] === "k" ? 1_000 : 1;
  const n = Math.round(base * facteur);
  return estNegatif(t) ? -n : n;
}

/** « 86 % », « + 8 % », « − 14 % », « 0,7 % », « 99,8 % rapproché » → nombre (signé). */
export function pourcent(valeur: string | number): number {
  if (typeof valeur === "number") return valeur;
  const t = nettoyer(valeur);
  const m = /(\d+(?:,\d+)?)\s*%/.exec(t);
  if (!m) throw new TexteIllisible("pourcentage", valeur);
  const n = Number(m[1]!.replace(",", "."));
  return estNegatif(t) ? -n : n;
}

/** Premier entier suivi d'un mot : `nombreAvant("142 billets · 38 colis", "colis")` → 38. */
export function nombreAvant(texte: string, mot: string): number | null {
  const m = new RegExp(`(\\d[\\d  ]*)\\s*${mot}`).exec(nettoyer(texte));
  return m ? Number(m[1]!.replace(/ /g, "")) : null;
}

/** « 2 h 10 » → 130 ; « 40 min » → 40 ; « 25 min » → 25. */
export function minutes(texte: string): number | null {
  const t = nettoyer(texte);
  const hm = /(\d+)\s*h\s*(\d+)?/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const m = /(\d+)\s*min/.exec(t);
  return m ? Number(m[1]) : null;
}

const MOIS: Readonly<Record<string, number>> = {
  janv: 1,
  févr: 2,
  fevr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8,
  aout: 8,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
  dec: 12,
};
const p2 = (n: number): string => String(n).padStart(2, "0");

/**
 * « 15 déc. 14:00 », « 12 oct. 09:40 », « 5 janv. 2027 » → jour `AAAA-MM-JJ` (et heure éventuelle).
 * Sans année, on prend la dernière occurrence qui ne dépasse pas le jour des maquettes (5 janv. 2027).
 */
export function dateFrancaise(texte: string): { jour: string; heure: string | null } {
  const t = nettoyer(texte);
  const m = /(\d{1,2})\s+([a-zéûô]+)\.?(?:\s+(\d{4}))?(?:\s+(\d{2}:\d{2}))?/i.exec(t);
  const mois = m ? MOIS[m[2]!.toLowerCase().slice(0, 4)] : undefined;
  if (!m || !mois) throw new TexteIllisible("date française", texte);
  const annee = m[3] ? Number(m[3]) : mois === 1 ? 2027 : 2026;
  return { jour: `${annee}-${p2(mois)}-${p2(Number(m[1]))}`, heure: m[4] ?? null };
}

/** `dateFrancaise` en instant ISO (00:00 si la date n'a pas d'heure). */
export function instantFrancais(texte: string): string {
  const { jour, heure: hhmm } = dateFrancaise(texte);
  return heure(hhmm ?? "00:00", jour);
}

/** « hier » → hier à `hhmm` ; « 14:00 » → aujourd'hui à 14:00 (le jour des maquettes). */
export function quand(texte: string, parDefautHier = "18:00"): string {
  const t = nettoyer(texte);
  if (/^\d{2}:\d{2}$/.test(t)) return heure(t);
  if (t === "hier") return heure(parDefautHier, veille());
  throw new TexteIllisible("instant relatif", texte);
}

export function veille(): string {
  const ms = Date.parse(`${JOUR}T12:00:00Z`) - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Répartit un total entier proportionnellement à des poids (hauteurs de barres) : la somme des
 * parts est exactement `total`, le reste d'arrondi va aux plus grosses parts.
 */
export function repartir(total: number, poids: readonly number[]): number[] {
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) return poids.map(() => 0);
  const parts = poids.map((p) => Math.floor((total * p) / somme));
  let reste = total - parts.reduce((a, b) => a + b, 0);
  const ordre = poids
    .map((p, i) => [p, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([, i]) => i);
  for (let k = 0; reste > 0; k = (k + 1) % ordre.length, reste--) parts[ordre[k]!]! += 1;
  return parts;
}

/** « Akwa · Mme Essono » → ["Akwa", "Mme Essono"]. */
export function segments(texte: string): string[] {
  return nettoyer(texte)
    .split("·")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
