import type { Id, PlanSieges } from "./entites";
import { finBlocageSiege } from "./regles";
import type { Instant } from "./temps";
import { enMs } from "./temps";

export function creerPlanSieges(capacite: number): PlanSieges {
  if (!Number.isInteger(capacite) || capacite < 1) throw new RangeError("Capacité invalide");
  return { capacite, occupes: {}, bloques: {}, partsHorsLigne: {} };
}

function verifierSiege(plan: PlanSieges, siege: number): void {
  if (!Number.isInteger(siege) || siege < 1 || siege > plan.capacite) {
    throw new RangeError(`Siège inexistant : ${siege}`);
  }
}

/** Siège libre : ni occupé, ni bloqué par une commande encore valable. */
export function siegeLibre(plan: PlanSieges, siege: number, maintenant: Instant): boolean {
  verifierSiege(plan, siege);
  if (plan.occupes[siege] !== undefined) return false;
  const blocage = plan.bloques[siege];
  return !blocage || enMs(blocage.jusqua) <= enMs(maintenant);
}

export function siegesLibres(plan: PlanSieges, maintenant: Instant): number[] {
  const libres: number[] = [];
  for (let s = 1; s <= plan.capacite; s++) if (siegeLibre(plan, s, maintenant)) libres.push(s);
  return libres;
}

/** Bloque un siège 15 min pour une commande en cours. */
export function bloquerSiege(
  plan: PlanSieges,
  siege: number,
  par: Id,
  maintenant: Instant,
): PlanSieges {
  if (!siegeLibre(plan, siege, maintenant)) throw new Error(`Siège ${siege} indisponible`);
  return {
    ...plan,
    bloques: { ...plan.bloques, [siege]: { par, jusqua: finBlocageSiege(maintenant) } },
  };
}

/** Occupe un siège pour un billet ; le blocage éventuel de la même commande est levé. */
export function occuperSiege(
  plan: PlanSieges,
  siege: number,
  billetId: Id,
  maintenant: Instant,
  parCommande?: Id,
): PlanSieges {
  verifierSiege(plan, siege);
  if (plan.occupes[siege] !== undefined) throw new Error(`Siège ${siege} déjà occupé`);
  const blocage = plan.bloques[siege];
  const bloquePourAutrui =
    blocage !== undefined && enMs(blocage.jusqua) > enMs(maintenant) && blocage.par !== parCommande;
  if (bloquePourAutrui) throw new Error(`Siège ${siege} bloqué par une autre commande`);
  const { [siege]: _levee, ...bloques } = plan.bloques;
  return { ...plan, occupes: { ...plan.occupes, [siege]: billetId }, bloques };
}

/** Libère le siège d'un billet annulé (le billet, lui, garde son numéro). */
export function libererSiege(plan: PlanSieges, siege: number): PlanSieges {
  verifierSiege(plan, siege);
  const { [siege]: _retire, ...occupes } = plan.occupes;
  return { ...plan, occupes };
}

/**
 * Répartit les sièges entre les guichets pour la vente hors ligne : chaque guichet reçoit un bloc de
 * sièges contigus qui n'appartient qu'à lui, pour qu'aucun siège ne soit vendu deux fois hors ligne.
 * `reserveEnLigne` sièges (les derniers) restent réservés à la vente connectée.
 */
export function repartirPartsHorsLigne(
  plan: PlanSieges,
  guichetIds: readonly Id[],
  reserveEnLigne = 0,
): PlanSieges {
  if (guichetIds.length === 0) throw new RangeError("Au moins un guichet");
  if (reserveEnLigne < 0 || reserveEnLigne >= plan.capacite)
    throw new RangeError("Réserve invalide");
  const disponibles = plan.capacite - reserveEnLigne;
  const base = Math.floor(disponibles / guichetIds.length);
  const reste = disponibles % guichetIds.length;
  const parts: Record<Id, number[]> = {};
  let prochain = 1;
  guichetIds.forEach((id, i) => {
    const taille = base + (i < reste ? 1 : 0);
    parts[id] = Array.from({ length: taille }, (_, k) => prochain + k);
    prochain += taille;
  });
  return { ...plan, partsHorsLigne: parts };
}

/** Prochain siège que ce guichet peut vendre hors ligne (dans sa part, et seulement là). */
export function prochainSiegeHorsLigne(
  plan: PlanSieges,
  guichetId: Id,
  maintenant: Instant,
): number | null {
  const part = plan.partsHorsLigne[guichetId];
  if (!part) throw new Error(`Aucune part hors ligne pour le guichet ${guichetId}`);
  return part.find((s) => siegeLibre(plan, s, maintenant)) ?? null;
}
