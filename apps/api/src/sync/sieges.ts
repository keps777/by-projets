import type { EvenementRecu } from "./protocole";
import { TYPES_SIEGE_OCCUPE } from "./regles";

/**
 * Qui a le siège ? Le **premier horodatage gagne**.
 *
 * Les événements arrivent dans l'ordre où les appareils se synchronisent, pas dans l'ordre où les
 * ventes ont eu lieu. Pour chaque siège d'un départ, on garde donc toutes les opérations (siège
 * pris, siège libéré) et on les rejoue **par heure du geste** à chaque arrivée : le résultat ne
 * dépend pas de l'ordre d'arrivée. Un billet qui prend un siège déjà occupé à cet instant-là est
 * « à replacer » ; son numéro et sa vente restent dans le journal (rien ne s'efface).
 */

export interface OperationSiege {
  evenementId: string;
  billetId: string;
  kind: "prend" | "libere";
  /** Heure du geste (ms depuis l'époque). */
  at: number;
  appareilId: string;
  auteurId: string;
}

export interface Perdant {
  billetId: string;
  evenementId: string;
  gagnantBilletId: string;
  appareilId: string;
  auteurId: string;
}

export interface ResolutionSiege {
  occupant: string | null;
  perdants: Perdant[];
}

/**
 * Rejoue les opérations d'un siège par heure du geste. Égalité d'heure : l'appareil, puis
 * l'identifiant d'événement, départagent (toujours le même résultat, quel que soit l'ordre d'arrivée).
 */
export function resoudreSiege(operations: readonly OperationSiege[]): ResolutionSiege {
  const triees = [...operations].sort(
    (a, b) =>
      a.at - b.at ||
      a.appareilId.localeCompare(b.appareilId) ||
      a.evenementId.localeCompare(b.evenementId),
  );
  let occupant: string | null = null;
  const vus = new Set<string>();
  const perdants: Perdant[] = [];
  for (const op of triees) {
    if (op.kind === "prend") {
      if (vus.has(op.billetId)) continue; // le même billet rejoué sous un autre identifiant
      vus.add(op.billetId);
      if (occupant === null) occupant = op.billetId;
      else {
        perdants.push({
          billetId: op.billetId,
          evenementId: op.evenementId,
          gagnantBilletId: occupant,
          appareilId: op.appareilId,
          auteurId: op.auteurId,
        });
      }
    } else if (occupant === op.billetId) {
      occupant = null; // un perdant qui « libère » ne libère rien : il n'avait pas le siège
    }
  }
  return { occupant, perdants };
}

export interface SiegeVise {
  departId: string;
  billetId: string;
  siege: number;
}

const lire = (e: EvenementRecu): { departId?: unknown; billetId?: unknown; siege?: unknown } =>
  e.donnees as { departId?: unknown; billetId?: unknown; siege?: unknown };

/** Le siège occupé par un événement de vente, ou `null` (autre type, vente sans siège). */
export function siegeOccupe(e: EvenementRecu): SiegeVise | null {
  if (!TYPES_SIEGE_OCCUPE.includes(e.type)) return null;
  const { departId, billetId, siege } = lire(e);
  if (typeof departId !== "string" || typeof billetId !== "string" || typeof siege !== "number") {
    return null;
  }
  return { departId, billetId, siege };
}

/** Le siège libéré au quai. */
export function siegeLibere(e: EvenementRecu): SiegeVise | null {
  if (e.type !== "quai.libere") return null;
  const { departId, billetId, siege } = lire(e);
  if (typeof departId !== "string" || typeof billetId !== "string" || typeof siege !== "number") {
    return null;
  }
  return { departId, billetId, siege };
}

/** Une annulation acceptée libère le siège du billet (remboursé, avoir ou reporté ; pas un refus). */
export function annulationAcceptee(e: EvenementRecu): string | null {
  if (e.type !== "annulation.decidee") return null;
  const { billetId } = lire(e);
  const decision = (e.donnees as { decision?: unknown }).decision;
  if (typeof billetId !== "string" || decision === "refuser") return null;
  return billetId;
}

export const cleSiege = (departId: string, siege: number): string => `${departId}#${siege}`;
