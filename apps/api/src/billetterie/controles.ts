import { conflit, inconnu } from "./erreurs";
import type { DepartComplet } from "./modeles";
import { ETATS_DEPART_VENDABLES } from "./regles";
import { enMs, type Instant } from "./temps";

/** Un départ accepte-t-il des ventes ? En vente ou en embarquement, avec un bus affecté. */
export function exigerVendable(dc: DepartComplet): void {
  if (!ETATS_DEPART_VENDABLES.includes(dc.depart.etat)) {
    throw conflit("DEPART_FERME", "Ce départ n'est pas ouvert à la vente", {
      etat: dc.depart.etat,
    });
  }
  if (!dc.bus) {
    throw conflit("BUS_NON_AFFECTE", "Aucun bus n'est affecté à ce départ");
  }
}

/** Les ventes en ligne s'arrêtent à l'heure du départ. */
export function exigerAvantLeDepart(dc: DepartComplet, maintenant: Instant): void {
  if (enMs(dc.depart.heureDepart) <= enMs(maintenant)) {
    throw conflit("DEPART_PASSE", "Ce départ est déjà parti ou sur le point de partir");
  }
}

/** Un siège doit exister dans le bus du départ. */
export function exigerSiegeExistant(dc: DepartComplet, siege: number): void {
  const capacite = dc.bus?.capacite ?? 0;
  if (!Number.isInteger(siege) || siege < 1 || siege > capacite) {
    throw inconnu("SIEGE_INCONNU", `Le siège ${siege} n'existe pas dans ce bus`);
  }
}
