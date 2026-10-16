import { z } from "zod";
import { definirCanal, definirOperation } from "./operations";
import { implementer, simulerFlux } from "./scenarios";
import type { Scenario, SourceScenarios } from "./scenarios";

/**
 * Contrats d'exemple utilisés par les tests et la documentation. Les vrais contrats métier
 * vivent dans `@afrimove/contrats` ; ils se déclarent exactement de la même façon.
 */
export const SchemaDepart = z.object({ id: z.string(), numero: z.string(), places: z.number() });
export type DepartExemple = z.infer<typeof SchemaDepart>;

export const OP_DEPARTS = definirOperation<{ gare: string }, DepartExemple[]>({
  nom: "departs.lister",
  methode: "GET",
  chemin: () => "/departs",
  requete: (p) => ({ gare: p.gare }),
  reponse: z.array(SchemaDepart),
});

export const OP_RESERVER = definirOperation<
  { departId: string; siege: number },
  { billetId: string }
>({
  nom: "billets.reserver",
  methode: "POST",
  chemin: (p) => `/departs/${p.departId}/billets`,
  corps: (p) => ({ siege: p.siege }),
  reponse: z.object({ billetId: z.string() }),
});

export const CANAL_POSITION = definirCanal<{ departId: string }, { km: number }>({
  nom: "departs.position",
  chemin: (p) => `/departs/${p.departId}/direct`,
  message: z.object({ km: z.number() }),
});

export const DEPARTS_DEMO: DepartExemple[] = [
  { id: "d1", numero: "ALP-DLAYDE-261016-0530", places: 12 },
  { id: "d2", numero: "ALP-DLAYDE-261016-0700", places: 40 },
];

export function scenarioDemo(nom: string): Scenario {
  let reservations = 0;
  return {
    nom,
    operations: [
      implementer(OP_DEPARTS, () => DEPARTS_DEMO),
      implementer(OP_RESERVER, () => ({ billetId: `b${++reservations}` })),
    ],
    flux: [
      simulerFlux(CANAL_POSITION, (_p, ctx) => {
        let km = 0;
        const avancer = (): void => {
          km += 10;
          ctx.emettre({ km });
          ctx.planifier(1000, avancer);
        };
        ctx.planifier(1000, avancer);
      }),
    ],
  };
}

export function sourceDemo(): SourceScenarios {
  return {
    noms: () => ["defaut", "depart-0530", "vide"],
    instantInitial: (nom) => (nom === "depart-0530" ? "2026-10-16T05:30:00+01:00" : undefined),
    charger: (nom) =>
      nom === "vide" ? { nom, operations: [implementer(OP_DEPARTS, () => [])] } : scenarioDemo(nom),
  };
}
