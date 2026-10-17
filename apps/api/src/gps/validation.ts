import { BadRequestException } from "@nestjs/common";

/**
 * Validation des corps et des paramètres reçus.
 *
 * L'API ne peut pas importer les schémas zod de `@afrimove/contrats` à l'exécution (paquet non
 * compilé, API en CommonJS) : les formes sont relues ici par de petits lecteurs, comme dans la
 * billetterie. `contrats.test.ts` les confronte aux schémas zod (mêmes valeurs acceptées ou
 * refusées). Comme zod, un objet ignore les champs qu'il ne connaît pas et la première erreur
 * arrête la lecture.
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

/** Un nombre fini (les décimales sont permises), borné. */
export function nombre(options: { min?: number; max?: number } = {}): Lecteur<number> {
  const { min = -Infinity, max = Infinity } = options;
  return (v, chemin) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new DonneesInvalides(chemin, "nombre attendu");
    }
    if (v < min) throw new DonneesInvalides(chemin, `au moins ${min}`);
    if (v > max) throw new DonneesInvalides(chemin, `au plus ${max}`);
    return v;
  };
}

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
    return Array.from(v as unknown[], (x, i) => lecteur(x, `${chemin}[${i}]`));
  };
}

type Forme = Record<string, Lecteur<unknown>>;
type CleFacultative<F extends Forme> = {
  [K in keyof F]: undefined extends ReturnType<F[K]> ? K : never;
}[keyof F];
type Aplati<T> = { [K in keyof T]: T[K] };
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

/* ------------------------------------------------------------------ formats communs */

export const idOpaque = texte({ min: 1, max: 128 });
export const isoDouala = texte({
  max: 40,
  motif: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
  message: "heure ISO en Africa/Douala attendue (décalage +01:00)",
});
export const latitude = nombre({ min: -90, max: 90 });
export const longitude = nombre({ min: -180, max: 180 });

/* ------------------------------------------------------------------ utilitaires HTTP */

/** Lit `brut` avec `lecteur` ; l'erreur est une `DonneesInvalides` (400 côté HTTP). */
export function lire<T>(lecteur: Lecteur<T>, brut: unknown): T {
  return lecteur(brut, "");
}

/** Exécute une lecture ; une donnée invalide devient une réponse 400 `REQUETE_INVALIDE`. */
export function ou400<T>(lecture: () => T): T {
  try {
    return lecture();
  } catch (e) {
    if (e instanceof DonneesInvalides) {
      throw new BadRequestException({ code: "REQUETE_INVALIDE", message: e.message });
    }
    throw e;
  }
}

export function corps<T>(lecteur: Lecteur<T>, brut: unknown): T {
  return ou400(() => lire(lecteur, brut));
}

/** Paramètre de requête texte → valeur, ou `undefined` si absent. */
export function parametre(requete: Record<string, unknown>, cle: string): string | undefined {
  const v = requete[cle];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new DonneesInvalides(cle, "un seul texte attendu");
  return v;
}

/** Paramètre de requête numérique (`?lat=4.05`), borné ; `undefined` si absent. */
export function parametreNombre(
  requete: Record<string, unknown>,
  cle: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const v = parametre(requete, cle);
  if (v === undefined) return undefined;
  if (!/^-?\d{1,6}(\.\d{1,12})?$/.test(v)) throw new DonneesInvalides(cle, "nombre attendu");
  return nombre(options)(Number(v), cle);
}
