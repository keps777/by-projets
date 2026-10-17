import type { voyageur as c } from "@afrimove/contrats";

/**
 * Applique un message du canal temps réel à la vue du plan de sièges.
 * - `plan` : instantané complet, il remplace la vue (sauf s'il est plus ancien que celle-ci).
 * - `siege` : changement d'un siège ; ignoré s'il est plus ancien que la vue ou si on n'a pas encore de plan.
 */
export function appliquerMessagePlan(
  courant: c.PlanSiegesVue | undefined,
  message: c.MessagePlanSieges,
): c.PlanSiegesVue | undefined {
  if (message.type === "plan") {
    if (courant && message.plan.departId === courant.departId) {
      if (message.plan.versionPlan < courant.versionPlan) return courant;
    }
    return message.plan;
  }
  if (!courant || courant.departId !== message.departId) return courant;
  if (message.versionPlan <= courant.versionPlan) return courant;

  const sieges = courant.sieges.map((s) =>
    s.numero === message.siege ? { ...s, etat: message.etat } : s,
  );
  const libres = sieges.filter((s) => s.etat === "libre" || s.etat === "a_moi").length;
  let mon = courant.mon;
  if (message.etat === "a_moi" && message.jusqua) {
    mon = { departId: courant.departId, siege: message.siege, jusqua: message.jusqua };
  } else if (mon?.siege === message.siege) {
    mon = undefined;
  }
  return { ...courant, sieges, libres, mon, versionPlan: message.versionPlan };
}
