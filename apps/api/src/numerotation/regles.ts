import { createHash } from "node:crypto";
import { plageConvoyeur, plageGuichet, type GenreNumero, type Plage } from "../sync/regles";

/**
 * Règles de numérotation côté serveur (AM-161).
 *
 * Les plages des guichets et des convoyeurs et le genre d'un numéro viennent de `../sync` (recopiés
 * du domaine, `sync/parite.test.ts` les compare aux sources). Ce qui est propre à AM-161 est ici, et
 * `parite.test.ts` (de ce dossier) le compare à `@afrimove/domain`.
 */

export type { GenreNumero, Plage };
export { plageConvoyeur, plageGuichet };

export const GENRES_NUMERO: readonly GenreNumero[] = ["billet", "colis"];

/** Ventes en ligne et colis de l'app, numérotés par le serveur (`PLAGE_EN_LIGNE` du domaine). */
export const PLAGE_EN_LIGNE: Plage = { debut: 4001, fin: 9999 };

/** Dernier numéro que le serveur peut attribuer à un appareil : la suite est réservée au serveur. */
export const FIN_PLAGES_APPAREILS = PLAGE_EN_LIGNE.debut - 1;

/** Identifiant de « l'appareil » qui représente le serveur dans le registre (ventes en ligne). */
export const APPAREIL_SERVEUR = "serveur-en-ligne";

export function plageValide(plage: Plage): boolean {
  return (
    Number.isInteger(plage.debut) &&
    Number.isInteger(plage.fin) &&
    plage.debut >= 1 &&
    plage.fin <= 9999 &&
    plage.debut <= plage.fin
  );
}

export function plagesSeChevauchent(a: Plage, b: Plage): boolean {
  return a.debut <= b.fin && b.debut <= a.fin;
}

export const dansLaPlage = (numero: number, plage: Plage): boolean =>
  numero >= plage.debut && numero <= plage.fin;

export interface AnalyseNumeros {
  /** Numéros manquants entre le début de la plage et le plus grand numéro reçu dans la plage. */
  trous: number[];
  /** Numéros reçus en dehors de la plage. */
  horsPlage: number[];
  /** Plus petit et plus grand numéro reçus dans la plage ; `null` si aucun. */
  premier: number | null;
  dernier: number | null;
  /** Nombre de numéros distincts reçus dans la plage. */
  emis: number;
}

/**
 * Les numéros reçus couvrent-ils la plage sans trou ? Même règle que `analyserSequences` du
 * domaine (un billet annulé garde son numéro, il doit donc figurer dans la liste) ; le registre ne
 * garde qu'une fois chaque numéro, il n'y a donc pas de doublons à compter ici.
 */
export function analyserNumeros(numeros: Iterable<number>, plage: Plage): AnalyseNumeros {
  const vus = new Set(numeros);
  const dedans = [...vus].filter((n) => dansLaPlage(n, plage)).sort((a, b) => a - b);
  const horsPlage = [...vus].filter((n) => !dansLaPlage(n, plage)).sort((a, b) => a - b);
  const dernier = dedans.length > 0 ? dedans[dedans.length - 1]! : null;
  const trous: number[] = [];
  if (dernier !== null) {
    for (let n = plage.debut; n <= dernier; n++) if (!vus.has(n)) trous.push(n);
  }
  return {
    trous,
    horsPlage,
    premier: dedans.length > 0 ? dedans[0]! : null,
    dernier,
    emis: dedans.length,
  };
}

/** Plage du plan de numérotation pour un guichet (rang) ou un convoyeur (rang sur `nbConvoyeurs`). */
export function plageDuPlan(
  genre: "guichet" | "convoyeur",
  rang: number,
  nbConvoyeurs: number | null,
): Plage {
  if (genre === "guichet") return plageGuichet(rang);
  if (nbConvoyeurs === null) throw new RangeError("Nombre de convoyeurs requis pour un convoyeur");
  return plageConvoyeur(rang, nbConvoyeurs);
}

/** AAMMJJ valide (mois 01–12, jour 01–31). */
export function jourValide(jour: string): boolean {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(jour);
  if (!m) return false;
  const mois = Number(m[2]);
  const j = Number(m[3]);
  return mois >= 1 && mois <= 12 && j >= 1 && j <= 31;
}

/** UUID déterministe : recalculer la même alerte la retrouve au lieu d'en écrire une seconde. */
export function uuidDeterministe(graine: string): string {
  const h = createHash("sha256").update(graine).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Clé de portée de l'unicité des numéros. Le numéro imprimé est `AGENCE-GARE-AAMMJJ-NNNN` : deux
 * appareils d'une même gare ne doivent jamais émettre le même NNNN le même jour. Un appareil sans
 * attribution (fiche déclarée à la main) n'est comparé qu'à lui-même.
 */
export function porteeDe(p: {
  appareilId: string;
  gareId: string | null;
  compagnieId: string | null;
}): string {
  return p.gareId !== null || p.compagnieId !== null
    ? `gare:${p.compagnieId ?? "-"}:${p.gareId ?? "-"}`
    : `appareil:${p.appareilId}`;
}
