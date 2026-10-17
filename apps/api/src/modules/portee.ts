import type { ModuleCatalogue } from "./catalogue";

/**
 * Où un réglage s'applique : toute l'agence, une gare ou une ville (`PorteeModule` des contrats
 * patron). Une gare est dans une ville : la gare l'emporte sur la ville, la ville sur l'agence.
 */
export type PorteeException = { type: "gare"; id: string } | { type: "ville"; nom: string };
export type Portee = { type: "agence" } | PorteeException;

export interface ExceptionModule {
  portee: PorteeException;
  actif: boolean;
}

/**
 * Ce qu'une agence a réglé pour un module : sa règle générale (`null` tant qu'elle n'en a pas posé :
 * l'état par défaut du catalogue s'applique) et ses exceptions.
 */
export interface ReglageModule {
  actif: boolean | null;
  exceptions: readonly ExceptionModule[];
}

/** D'où l'on regarde : la gare de l'écran et sa ville (ou seulement une ville, pour un voyageur). */
export interface ContexteModule {
  gareId: string | null;
  ville: string | null;
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

/** Règle générale de l'agence pour ce module (état par défaut tant qu'elle n'a rien réglé). */
export function etatAgence(def: ModuleCatalogue, reglage: ReglageModule | undefined): boolean {
  return def.socle ? true : (reglage?.actif ?? def.actifParDefaut);
}

/**
 * Ce que `portee` hériterait si elle n'avait pas d'exception : la ville pour une gare, l'agence
 * pour une ville. `villeDeLaGare` est la ville de la gare visée (inconnue : `null`).
 */
export function etatHerite(
  def: ModuleCatalogue,
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

/**
 * Le module est-il actif vu de `contexte` ? L'exception de la gare prime, puis celle de la ville,
 * puis la règle de l'agence. Le socle est toujours actif.
 */
export function etatDans(
  def: ModuleCatalogue,
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
