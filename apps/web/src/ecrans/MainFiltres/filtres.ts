/**
 * Logique pure du filtre des départs (planche MainFiltres) : état du filtre, passage vers les paramètres de
 * l'API, compteur du bouton « Voir les N départs » et mémoire de l'appareil, par trajet.
 */
import type { voyageur as c } from "@afrimove/contrats";
import { ecrire, lire } from "@/coquille/stockage";

export type ClasseFiltre = "toutes" | "vip" | "classique";

/** Le trajet de l'accueil (Douala → Yaoundé) : l'accueil ne passe pas d'autre trajet à cet écran. */
export const TRAJET_FILTRE = {
  depart: { code: "DLA", nom: "Douala" },
  arrivee: { code: "YDE", nom: "Yaoundé" },
} as const;

/** Codes des options « Aussi » renvoyés par `useOptionsFiltres` (définis par le serveur). */
export const AUSSI = {
  covoiturage: "covoiturage",
  matin: "matin-seulement",
  coteACote: "places-cote-a-cote",
  prixMax: "5-000-f",
} as const;

/** Plafond de l'option « ≤ 5 000 F » (FCFA), le même que celui du serveur. */
export const PRIX_MAX_RAPIDE = 5000;

/**
 * Le filtre tel que le voyageur le règle. Les compagnies sont mémorisées par exclusion (`decochees`) : une
 * compagnie nouvelle sur le trajet est cochée d'office. L'étoile « préférée » n'en fait pas partie, elle est
 * enregistrée à part (`useDefinirPreferee`).
 */
export interface Filtre {
  classe: ClasseFiltre;
  /** Identifiants des compagnies décochées. */
  decochees: readonly string[];
  /** Codes des options « Aussi » activées. */
  aussi: readonly string[];
}

/** Aucun filtre : toutes les classes, toutes les compagnies, aucune option « Aussi ». */
export const FILTRE_VIDE: Filtre = { classe: "toutes", decochees: [], aussi: [] };

export type CompagnieFiltre = c.OptionsFiltres["compagnies"][number];

/** Le filtre que le serveur a mémorisé pour ce trajet, relu dans les options. */
export function filtreDepuisOptions(options: c.OptionsFiltres): Filtre {
  return {
    classe: options.classeActive,
    decochees: options.compagnies.filter((x) => !x.coche).map((x) => x.id),
    aussi: options.aussi.filter((x) => x.actif).map((x) => x.code),
  };
}

export function estCochee(filtre: Filtre, id: string): boolean {
  return !filtre.decochees.includes(id);
}

export function compagniesCochees(
  compagnies: readonly CompagnieFiltre[],
  filtre: Filtre,
): CompagnieFiltre[] {
  return compagnies.filter((x) => estCochee(filtre, x.id));
}

/** Coche ou décoche une compagnie. La dernière compagnie cochée ne se décoche pas : un filtre vide n'a pas de sens. */
export function basculerCompagnie(
  filtre: Filtre,
  compagnies: readonly CompagnieFiltre[],
  id: string,
): Filtre {
  if (!estCochee(filtre, id)) {
    return { ...filtre, decochees: filtre.decochees.filter((x) => x !== id) };
  }
  if (compagniesCochees(compagnies, filtre).length <= 1) return filtre;
  return { ...filtre, decochees: [...filtre.decochees, id] };
}

/** Coche « Toutes les compagnies ». */
export function toutesLesCompagnies(filtre: Filtre): Filtre {
  return { ...filtre, decochees: [] };
}

export function basculerAussi(filtre: Filtre, code: string): Filtre {
  return {
    ...filtre,
    aussi: filtre.aussi.includes(code)
      ? filtre.aussi.filter((x) => x !== code)
      : [...filtre.aussi, code],
  };
}

/** Paramètres de l'API (`filtres` de `useRechercheDeparts` et de `useEnregistrerFiltres`). */
export function versFiltresDeparts(
  filtre: Filtre,
  compagnies: readonly CompagnieFiltre[],
): c.FiltresDeparts {
  const cochees = compagniesCochees(compagnies, filtre);
  // Le serveur lit « aucune compagnie » comme « toutes » : on n'envoie la liste que si le choix est partiel.
  const partiel = cochees.length > 0 && cochees.length < compagnies.length;
  return {
    classe: filtre.classe,
    ...(partiel ? { compagnies: cochees.map((x) => x.id) } : {}),
    inclureCovoit: filtre.aussi.includes(AUSSI.covoiturage),
    matinSeulement: filtre.aussi.includes(AUSSI.matin),
    placesCoteACote: filtre.aussi.includes(AUSSI.coteACote),
    ...(filtre.aussi.includes(AUSSI.prixMax) ? { prixMax: PRIX_MAX_RAPIDE } : {}),
  };
}

/**
 * Vrai quand le filtre restreint les bus au-delà du choix des compagnies (classe, matin, côte à côte, prix) :
 * le nombre exact vient alors de la recherche du serveur, car les options ne donnent que le nombre de départs
 * de chaque compagnie. Le covoiturage ne change pas le nombre de bus.
 */
export function restreintLesBus(filtre: Filtre): boolean {
  return (
    filtre.classe !== "toutes" ||
    filtre.aussi.includes(AUSSI.matin) ||
    filtre.aussi.includes(AUSSI.coteACote) ||
    filtre.aussi.includes(AUSSI.prixMax)
  );
}

/** Départs des compagnies cochées (« Toutes · 5 compagnies » = 14 départs). */
export function departsDesCompagnies(
  compagnies: readonly CompagnieFiltre[],
  filtre: Filtre,
): number {
  return compagniesCochees(compagnies, filtre).reduce((somme, x) => somme + x.departs, 0);
}

/* ------------------------------------------------------------------ mémoire de l'appareil, par trajet */

export function cleMemoire(depart: string, arrivee: string): string {
  return `afrimove.filtres.${depart}-${arrivee}`;
}

const CLASSES: readonly string[] = ["toutes", "vip", "classique"];

function listeDeTextes(valeur: unknown): string[] | undefined {
  return Array.isArray(valeur) && valeur.every((x) => typeof x === "string")
    ? (valeur as string[])
    : undefined;
}

/** Le filtre mémorisé sur l'appareil pour ce trajet ; `undefined` s'il n'y en a pas ou s'il est illisible. */
export function lireMemoire(depart: string, arrivee: string): Filtre | undefined {
  const brut = lire(cleMemoire(depart, arrivee));
  if (brut === null) return undefined;
  try {
    const x: unknown = JSON.parse(brut);
    if (typeof x !== "object" || x === null) return undefined;
    const { classe, decochees, aussi } = x as Record<string, unknown>;
    const d = listeDeTextes(decochees);
    const a = listeDeTextes(aussi);
    if (typeof classe !== "string" || !CLASSES.includes(classe) || !d || !a) return undefined;
    return { classe: classe as ClasseFiltre, decochees: d, aussi: a };
  } catch {
    return undefined;
  }
}

export function ecrireMemoire(depart: string, arrivee: string, filtre: Filtre): void {
  ecrire(cleMemoire(depart, arrivee), JSON.stringify(filtre));
}

/** Deux filtres identiques, quel que soit l'ordre des listes. */
export function memeFiltre(a: Filtre, b: Filtre): boolean {
  const meme = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((v) => y.includes(v));
  return a.classe === b.classe && meme(a.decochees, b.decochees) && meme(a.aussi, b.aussi);
}

/**
 * Filtre à afficher à l'ouverture : celui de l'appareil s'il existe (les compagnies disparues du trajet sont
 * ignorées), sinon celui du serveur.
 */
export function filtreInitial(
  options: c.OptionsFiltres,
  memorise: Filtre | undefined,
): { filtre: Filtre; deLAppareil: boolean } {
  if (!memorise) return { filtre: filtreDepuisOptions(options), deLAppareil: false };
  const connues = new Set(options.compagnies.map((x) => x.id));
  const decochees = memorise.decochees.filter((id) => connues.has(id));
  // Un filtre qui décocherait toutes les compagnies du trajet retombe sur « toutes ».
  const toutesDecochees = connues.size > 0 && decochees.length >= connues.size;
  return {
    filtre: { ...memorise, decochees: toutesDecochees ? [] : decochees },
    deLAppareil: true,
  };
}
