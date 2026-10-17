/**
 * Validation des corps et des paramètres reçus.
 *
 * L'API ne peut pas importer les schémas zod de `@afrimove/contrats` à l'exécution (paquet non
 * compilé, API en CommonJS) : les formes sont relues ici par de petits lecteurs. `contrats.test.ts`
 * compare chacun d'eux aux schémas zod (mêmes valeurs acceptées, mêmes valeurs refusées).
 *
 * Comme zod, un objet ignore les champs qu'il ne connaît pas et la première erreur arrête la lecture.
 */

export class DonneesInvalides extends Error {
  constructor(
    readonly chemin: string,
    message: string,
  ) {
    super(chemin === "" ? message : `${chemin} : ${message}`);
    this.name = "DonneesInvalides";
  }
}

/** Un lecteur lit une valeur inconnue et la renvoie typée, ou lève `DonneesInvalides`. */
export type Lecteur<T> = (valeur: unknown, chemin: string) => T;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function texte(
  options: { min?: number; max?: number; motif?: RegExp; message?: string } = {},
): Lecteur<string> {
  const { min = 1, max = 500, motif, message } = options;
  return (v, chemin) => {
    if (typeof v !== "string") throw new DonneesInvalides(chemin, "texte attendu");
    if (v.length < min) throw new DonneesInvalides(chemin, "texte trop court");
    if (v.length > max) throw new DonneesInvalides(chemin, "texte trop long");
    if (motif && !motif.test(v)) throw new DonneesInvalides(chemin, message ?? "format invalide");
    return v;
  };
}

export function entier(options: { min?: number; max?: number } = {}): Lecteur<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
  return (v, chemin) => {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      throw new DonneesInvalides(chemin, "entier attendu");
    }
    if (v < min) throw new DonneesInvalides(chemin, `au moins ${min}`);
    if (v > max) throw new DonneesInvalides(chemin, `au plus ${max}`);
    return v;
  };
}

export const booleen: Lecteur<boolean> = (v, chemin) => {
  if (typeof v !== "boolean") throw new DonneesInvalides(chemin, "booléen attendu");
  return v;
};

export function enumeration<const T extends string>(...valeurs: readonly T[]): Lecteur<T> {
  return (v, chemin) => {
    if (typeof v !== "string" || !(valeurs as readonly string[]).includes(v)) {
      throw new DonneesInvalides(chemin, `valeur attendue : ${valeurs.join(", ")}`);
    }
    return v as T;
  };
}

export function litteral<const T extends string>(valeur: T): Lecteur<T> {
  return (v, chemin) => {
    if (v !== valeur) throw new DonneesInvalides(chemin, `« ${valeur} » attendu`);
    return valeur;
  };
}

/** Exactement `null` (le numéro de plage des événements non numérotés). */
export const nul: Lecteur<null> = (v, chemin) => {
  if (v !== null) throw new DonneesInvalides(chemin, "null attendu");
  return null;
};

export function nullable<T>(lecteur: Lecteur<T>): Lecteur<T | null> {
  return (v, chemin) => (v === null ? null : lecteur(v, chemin));
}

/** Champ facultatif d'un objet : absent (ou `undefined`) est accepté, `null` ne l'est pas. */
export function optionnel<T>(lecteur: Lecteur<T>): Lecteur<T | undefined> {
  return (v, chemin) => (v === undefined ? undefined : lecteur(v, chemin));
}

export function tableau<T>(
  lecteur: Lecteur<T>,
  options: { min?: number; max?: number } = {},
): Lecteur<T[]> {
  const { min = 0, max = 1000 } = options;
  return (v, chemin) => {
    if (!Array.isArray(v)) throw new DonneesInvalides(chemin, "liste attendue");
    if (v.length < min) throw new DonneesInvalides(chemin, `au moins ${min} élément(s)`);
    if (v.length > max) throw new DonneesInvalides(chemin, `au plus ${max} élément(s)`);
    // `Array.from` lit aussi les trous d'un tableau creux (comme zod) : ils sont refusés.
    return Array.from(v as unknown[], (x, i) => lecteur(x, `${chemin}[${i}]`));
  };
}

type Forme = Record<string, Lecteur<unknown>>;
type CleFacultative<F extends Forme> = {
  [K in keyof F]: undefined extends ReturnType<F[K]> ? K : never;
}[keyof F];
type Aplati<T> = { [K in keyof T]: T[K] };
/** Les champs dont le lecteur accepte `undefined` deviennent facultatifs. */
type Sortie<F extends Forme> = Aplati<
  { [K in Exclude<keyof F, CleFacultative<F>>]: ReturnType<F[K]> } & {
    [K in CleFacultative<F>]?: ReturnType<F[K]>;
  }
>;

export function objet<F extends Forme>(forme: F): Lecteur<Sortie<F>> {
  return (v, chemin) => {
    if (!estObjet(v)) throw new DonneesInvalides(chemin, "objet attendu");
    const sortie: Record<string, unknown> = {};
    for (const [cle, lecteur] of Object.entries(forme)) {
      const valeur = lecteur(v[cle], chemin === "" ? cle : `${chemin}.${cle}`);
      if (valeur !== undefined) sortie[cle] = valeur;
    }
    return sortie as Sortie<F>;
  };
}

/** Une valeur libre (objet JSON) que le serveur recopie sans la lire. */
export const objetLibre: Lecteur<Record<string, unknown>> = (v, chemin) => {
  if (!estObjet(v)) throw new DonneesInvalides(chemin, "objet attendu");
  return v;
};

/* ------------------------------------------------------------------ formats communs */

export const idOpaque = texte({ min: 1, max: 128 });
export const uuid = texte({
  min: 36,
  max: 36,
  motif: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  message: "UUID attendu",
});
export const isoDouala = texte({
  max: 40,
  motif: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
  message: "heure ISO en Africa/Douala attendue (décalage +01:00)",
});
export const telephone = texte({ max: 20, motif: /^\+\d{8,15}$/, message: "format +237XXXXXXXXX" });
export const quatreChiffres = texte({ min: 4, max: 4, motif: /^\d{4}$/, message: "4 chiffres" });
export const fcfaPositif = entier({ min: 0 });
/** Un siège hors du bus est refusé plus loin (404 `SIEGE_INCONNU`), comme le fait le contrat. */
export const siegeNumero = entier({ min: 1 });

/* ------------------------------------------------------------------ utilitaires */

/** Lit `brut` avec `lecteur` ; l'erreur est une `DonneesInvalides` (400 côté HTTP). */
export function lire<T>(lecteur: Lecteur<T>, brut: unknown): T {
  return lecteur(brut, "");
}

/** Paramètre de requête texte (`?depart=DLA`) → valeur, ou `undefined` si absent. */
export function parametre(requete: Record<string, unknown>, cle: string): string | undefined {
  const v = requete[cle];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new DonneesInvalides(cle, "un seul texte attendu");
  return v;
}

export function parametreBooleen(
  requete: Record<string, unknown>,
  cle: string,
): boolean | undefined {
  const v = parametre(requete, cle);
  if (v === undefined) return undefined;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new DonneesInvalides(cle, "true ou false attendu");
}

export function parametreEntier(
  requete: Record<string, unknown>,
  cle: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const v = parametre(requete, cle);
  if (v === undefined) return undefined;
  if (!/^-?\d{1,15}$/.test(v)) throw new DonneesInvalides(cle, "entier attendu");
  return entier(options)(Number(v), cle);
}
