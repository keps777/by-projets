/**
 * Fabrique des variantes abîmées d'un document valide, une par champ : c'est ce qui permet de
 * comparer un lecteur écrit à la main au schéma zod du contrat sans lister les cas à la main.
 */

type Chemin = (string | number)[];

export interface Variante {
  /** Ce qu'on a abîmé : `donnees.total → texte`. */
  nom: string;
  valeur: unknown;
}

const clone = <T>(v: T): T => structuredClone(v);

function placer(racine: unknown, chemin: Chemin, valeur: unknown): unknown {
  const copie = clone(racine) as Record<string | number, unknown>;
  let courant: Record<string | number, unknown> = copie;
  for (const cle of chemin.slice(0, -1)) {
    courant = courant[cle] as Record<string | number, unknown>;
  }
  const derniere = chemin[chemin.length - 1]!;
  if (valeur === SUPPRIME) {
    if (Array.isArray(courant)) courant.splice(Number(derniere), 1);
    else delete courant[derniere];
  } else {
    courant[derniere] = valeur;
  }
  return copie;
}

const SUPPRIME = Symbol("supprime");

function feuilles(v: unknown, chemin: Chemin = []): Chemin[] {
  if (v !== null && typeof v === "object") {
    const sortie: Chemin[] = chemin.length > 0 ? [chemin] : [];
    for (const [cle, enfant] of Object.entries(v)) {
      sortie.push(...feuilles(enfant, [...chemin, Array.isArray(v) ? Number(cle) : cle]));
    }
    return sortie;
  }
  return [chemin];
}

/** Remplacements essayés selon le type de la valeur d'origine. */
function remplacements(v: unknown): [string, unknown][] {
  const communs: [string, unknown][] = [
    ["absent", SUPPRIME],
    ["null", null],
    ["objet vide", {}],
    ["liste vide", []],
    ["booléen", true],
  ];
  if (typeof v === "string") {
    return [...communs, ["nombre", 42], ["texte vide", ""], ["texte quelconque", "n'importe quoi"]];
  }
  if (typeof v === "number") {
    return [
      ...communs,
      ["texte", "12"],
      ["négatif", -1],
      ["zéro", 0],
      ["décimal", 1.5],
      ["NaN", Number.NaN],
    ];
  }
  if (typeof v === "boolean") return [...communs, ["texte", "true"], ["nombre", 1]];
  return [...communs, ["texte", "x"], ["nombre", 3]];
}

/** Une variante par champ de `valide` et par remplacement, sans l'original. */
export function variantes(valide: unknown): Variante[] {
  const sortie: Variante[] = [];
  for (const chemin of feuilles(valide)) {
    let original: unknown = valide;
    for (const cle of chemin) original = (original as Record<string | number, unknown>)[cle];
    for (const [nom, valeur] of remplacements(original)) {
      sortie.push({
        nom: `${chemin.join(".")} → ${nom}`,
        valeur: placer(valide, chemin, valeur),
      });
    }
  }
  return sortie;
}

/** Valeurs d'identifiant UUID à essayer à la place de `id`. */
export const UUID_ESSAIS = [
  "pas-un-uuid",
  "00000000-0000-4000-8000-000000000001",
  "123e4567-e89b-12d3-a456-426614174000",
  "123E4567-E89B-12D3-A456-426614174000",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "123e4567-e89b-92d3-a456-426614174000",
  "123e4567-e89b-12d3-c456-426614174000",
  "123e4567e89b12d3a456426614174000",
];

/** Heures ISO à essayer à la place de `at`. */
export const ISO_ESSAIS = [
  "2026-11-02T09:00:00.000+01:00",
  "2026-11-02T09:00:00+01:00",
  "2026-11-02T08:00:00.000Z",
  "2026-11-02T09:00:00.000+02:00",
  "2026-11-02 09:00:00.000+01:00",
  "2026-11-02T09:00+01:00",
  "02/11/2026",
  "",
];

/** Signatures à essayer dans `validePar.signature`. */
export const SIGNATURE_ESSAIS = [
  "a".repeat(16),
  "a".repeat(15),
  "A".repeat(16),
  "g".repeat(16),
  "a".repeat(72),
  "",
];
