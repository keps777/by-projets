import type { ModuleCatalogue } from "../catalogue";

/** Ce que les règles lisent d'un module. */
export type DefModule = Pick<ModuleCatalogue, "socle" | "actifParDefaut">;

/**
 * Règles du moteur des modules, recopiées de `apps/api/src/modules/portee.ts` pour le mock du
 * client. Fichier sans dépendance externe : `apps/api/src/modules/parite.test.ts` l'importe et
 * compare ses résultats à ceux de l'API sur les mêmes cas.
 */

export type PorteeException =
  | { readonly type: "gare"; readonly id: string }
  | { readonly type: "ville"; readonly nom: string };
export type Portee = { readonly type: "agence" } | PorteeException;

export interface ExceptionModule {
  readonly portee: PorteeException;
  readonly actif: boolean;
}

export interface ReglageModule {
  /** `null` : l'agence n'a pas posé de règle, l'état par défaut du catalogue s'applique. */
  readonly actif: boolean | null;
  readonly exceptions: readonly ExceptionModule[];
}

export interface ContexteModule {
  readonly gareId: string | null;
  readonly ville: string | null;
}

/** Clé de comparaison d'une ville : sans accents, sans casse, espaces et tirets unifiés. */
export function cleVille(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s'’-]+/g, " ")
    .trim();
}

export function memePortee(a: Portee, b: Portee): boolean {
  if (a.type === "agence" || b.type === "agence") return a.type === b.type;
  if (a.type === "gare") return b.type === "gare" && a.id === b.id;
  return b.type === "ville" && cleVille(a.nom) === cleVille(b.nom);
}

export function etatAgence(def: DefModule, reglage: ReglageModule | undefined): boolean {
  return def.socle ? true : (reglage?.actif ?? def.actifParDefaut);
}

/** Ce que `portee` hériterait sans exception : la ville pour une gare, l'agence pour une ville. */
export function etatHerite(
  def: DefModule,
  reglage: ReglageModule | undefined,
  portee: PorteeException,
  villeDeLaGare: string | null,
): boolean {
  if (def.socle) return true;
  if (portee.type === "gare" && villeDeLaGare !== null) {
    const exception = reglage?.exceptions.find((e) =>
      memePortee(e.portee, { type: "ville", nom: villeDeLaGare }),
    );
    if (exception) return exception.actif;
  }
  return etatAgence(def, reglage);
}

/** Actif vu de `contexte` : la gare prime sur la ville, la ville sur l'agence ; le socle reste actif. */
export function etatDans(
  def: DefModule,
  reglage: ReglageModule | undefined,
  contexte: ContexteModule,
): boolean {
  if (def.socle) return true;
  const exceptions = reglage?.exceptions ?? [];
  const { gareId, ville } = contexte;
  if (gareId !== null) {
    const gare = exceptions.find((e) => e.portee.type === "gare" && e.portee.id === gareId);
    if (gare) return gare.actif;
  }
  if (ville !== null) {
    const cle = cleVille(ville);
    const exception = exceptions.find(
      (e) => e.portee.type === "ville" && cleVille(e.portee.nom) === cle,
    );
    if (exception) return exception.actif;
  }
  return etatAgence(def, reglage);
}
