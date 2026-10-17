import type { EvenementFile } from "./protocole";

/**
 * Sièges et vente hors ligne.
 *
 * Hors ligne, un guichet ne vend que dans **sa part** du plan de sièges (`repartirPartsHorsLigne`
 * du domaine : des blocs de sièges contigus, un par guichet). Le serveur envoie la part de chaque
 * départ à chaque synchronisation ; l'appareil la garde et refuse de vendre au-delà.
 */

/** Événements qui occupent un siège (billet vendu avec un siège). */
export const TYPES_SIEGE_OCCUPE = [
  "billet.vendu",
  "billet.vendu_cadence",
  "route.billet_vendu",
  "controle.regularise",
] as const;

/** Événements qui libèrent un siège déjà occupé. */
export const TYPES_SIEGE_LIBERE = ["quai.libere"] as const;

export interface SiegeVise {
  departId: string;
  billetId: string;
  siege: number;
}

function donneesDe(evenement: Pick<EvenementFile, "donnees">): Record<string, unknown> {
  const d = evenement.donnees;
  return d !== null && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

/** Le siège qu'un événement occupe, ou `null` (autre type, vente sans siège). */
export function siegeOccupeParEvenement(
  evenement: Pick<EvenementFile, "type" | "donnees">,
): SiegeVise | null {
  if (!(TYPES_SIEGE_OCCUPE as readonly string[]).includes(evenement.type)) return null;
  const d = donneesDe(evenement);
  const { departId, billetId, siege } = d;
  if (typeof departId !== "string" || typeof billetId !== "string") return null;
  if (typeof siege !== "number" || !Number.isInteger(siege) || siege < 1) return null;
  return { departId, billetId, siege };
}

/** Le siège qu'un événement libère, ou `null`. */
export function siegeLibereParEvenement(
  evenement: Pick<EvenementFile, "type" | "donnees">,
): SiegeVise | null {
  if (!(TYPES_SIEGE_LIBERE as readonly string[]).includes(evenement.type)) return null;
  const d = donneesDe(evenement);
  const { departId, billetId, siege } = d;
  if (typeof departId !== "string" || typeof billetId !== "string") return null;
  if (typeof siege !== "number" || !Number.isInteger(siege) || siege < 1) return null;
  return { departId, billetId, siege };
}

/** Un siège vendu hors de la part de l'appareil. */
export class SiegeHorsPart extends Error {
  constructor(
    readonly departId: string,
    readonly siege: number,
  ) {
    super(
      `Siège ${siege} hors de votre part du plan (départ ${departId}) : hors ligne, ce guichet ne vend que ses sièges`,
    );
    this.name = "SiegeHorsPart";
  }
}

/** Hors ligne et la part de l'appareil sur ce départ n'a jamais été reçue. */
export class PartInconnue extends Error {
  constructor(readonly departId: string) {
    super(
      `Part de sièges inconnue pour le départ ${departId} : une synchronisation est nécessaire avant de vendre hors ligne`,
    );
    this.name = "PartInconnue";
  }
}

/** Le siège a déjà été vendu sur cet appareil. */
export class SiegeDejaVendu extends Error {
  constructor(
    readonly departId: string,
    readonly siege: number,
  ) {
    super(`Siège ${siege} déjà vendu sur cet appareil (départ ${departId})`);
    this.name = "SiegeDejaVendu";
  }
}

/**
 * Sièges encore vendables hors ligne : la part moins ceux que cet appareil a déjà vendus (et pas
 * libérés depuis). `evenements` : ceux de la file locale, dans l'ordre.
 */
export function siegesVendablesHorsLigne(
  part: readonly number[],
  departId: string,
  evenements: readonly Pick<EvenementFile, "type" | "donnees">[],
): number[] {
  const pris = siegesPris(departId, evenements);
  return part.filter((s) => !pris.has(s));
}

/** Sièges de ce départ qui ont été vendus et pas libérés, d'après la file locale. */
export function siegesPris(
  departId: string,
  evenements: readonly Pick<EvenementFile, "type" | "donnees">[],
): Set<number> {
  const occupes = new Map<string, number>(); // billetId → siège
  for (const e of evenements) {
    const prend = siegeOccupeParEvenement(e);
    if (prend && prend.departId === departId) occupes.set(prend.billetId, prend.siege);
    const libere = siegeLibereParEvenement(e);
    if (libere && libere.departId === departId) occupes.delete(libere.billetId);
  }
  return new Set(occupes.values());
}
