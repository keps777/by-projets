import { patron } from "@afrimove/contrats";
import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import {
  CATALOGUE_MODULES as CATALOGUE_CLIENT,
  codeDuModule,
} from "../../../../packages/api-client/src/modules/catalogue";
import * as reglesClient from "../../../../packages/api-client/src/modules/mock/regles";
import {
  OP_CHANGER_MODULE,
  OP_MODULES,
} from "../../../../packages/api-client/src/patron/operations";
import { OP_MODULES_ACTIFS } from "../../../../packages/api-client/src/modules/operations";
import { ModulesActifsSchema } from "../../../../packages/api-client/src/modules/contrat";
import { CATALOGUE_MODULES } from "./catalogue";
import * as regles from "./portee";
import { versIsoDouala } from "./temps";
import { PIN_PATRON, creerAppModulesTest, DOUALA_AKWA } from "./testing/app-modules-test";

/**
 * L'API ne peut pas importer les contrats, le domaine ni le client à l'exécution (paquets non
 * compilés, API en CommonJS) : elle en recopie les règles. Ces tests les comparent aux sources, pour
 * qu'une règle ou une route modifiée d'un seul côté fasse échouer la CI.
 */

describe("parité avec le client d'API", () => {
  it("le catalogue des 12 modules est le même (code, nom, socle, défaut)", () => {
    expect(
      CATALOGUE_CLIENT.map(({ code, nom, socle, actifParDefaut }) => ({
        code,
        nom,
        socle,
        actifParDefaut,
      })),
    ).toEqual(CATALOGUE_MODULES);
  });

  it("chaque module a un identifiant web distinct, et les deux écritures désignent le même module", () => {
    const ids = CATALOGUE_CLIENT.map((m) => m.idWeb);
    expect(new Set(ids).size).toBe(12);
    for (const m of CATALOGUE_CLIENT) {
      expect(codeDuModule(m.idWeb)).toBe(m.code);
      expect(codeDuModule(m.code)).toBe(m.code);
    }
    expect(codeDuModule("inconnu")).toBeUndefined();
  });

  it("les règles de portée donnent les mêmes résultats que celles du mock du client", () => {
    const portees = [
      { type: "gare", id: "g1" },
      { type: "gare", id: "g2" },
      { type: "ville", nom: "Douala" },
      { type: "ville", nom: "yaounde" },
    ] as const;
    const etats = [true, false, null] as const;
    const exceptionsPossibles = [
      [],
      ...portees.flatMap((p) => [true, false].map((actif) => [{ portee: p, actif }])),
      [
        { portee: portees[2], actif: false },
        { portee: portees[0], actif: true },
      ],
      [
        { portee: portees[2], actif: true },
        { portee: portees[1], actif: false },
      ],
    ];
    const contextes = [
      { gareId: null, ville: null },
      { gareId: "g1", ville: "Douala" },
      { gareId: "g2", ville: "Douala" },
      { gareId: "g3", ville: "Yaoundé" },
      { gareId: null, ville: "YAOUNDÉ" },
    ];
    let cas = 0;
    for (const def of CATALOGUE_MODULES) {
      for (const actif of etats) {
        for (const exceptions of exceptionsPossibles) {
          const reglage = { actif, exceptions };
          expect(regles.etatAgence(def, reglage)).toBe(reglesClient.etatAgence(def, reglage));
          for (const contexte of contextes) {
            expect(regles.etatDans(def, reglage, contexte)).toBe(
              reglesClient.etatDans(def, reglage, contexte),
            );
            cas += 1;
          }
          for (const portee of portees) {
            for (const ville of [null, "Douala", "Yaoundé"]) {
              expect(regles.etatHerite(def, reglage, portee, ville)).toBe(
                reglesClient.etatHerite(def, reglage, portee, ville),
              );
            }
          }
        }
      }
    }
    expect(cas).toBeGreaterThan(1000);
    expect(regles.cleVille("  Yaoundé-Est ")).toBe(reglesClient.cleVille("  Yaoundé-Est "));
  });
});

describe("parité avec @afrimove/domain", () => {
  it("l'heure de Douala s'écrit comme dans le domaine", () => {
    for (const instant of [
      "2026-11-02T08:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      "2027-01-05T04:30:00.000Z",
    ]) {
      expect(versIsoDouala(instant)).toBe(domaine.versIsoDouala(instant));
    }
  });
});

describe("routes conformes aux contrats", () => {
  it("les opérations du client (méthode, chemin, corps) tombent sur les routes de l'API et les réponses passent les schémas zod", async () => {
    const t = await creerAppModulesTest();
    try {
      const { jeton } = await t.compte("patron", { gareId: null });
      const guichet = await t.compte("guichetier", { gareId: DOUALA_AKWA });
      const auth = (j: string) => ({ Authorization: `Bearer ${j}` });
      const appel = (
        operation: { methode: string; chemin: (p: never) => string },
        params: unknown,
        corps: unknown,
        j: string,
      ) => {
        const chemin = operation.chemin(params as never);
        const requete = t.http();
        const m = operation.methode.toLowerCase() as "get" | "put";
        const r = requete[m](chemin).set(auth(j));
        return corps === undefined ? r : r.send(corps as object);
      };

      // Lecture patron
      const lecture = await appel(OP_MODULES, undefined, undefined, jeton);
      expect(lecture.status).toBe(200);
      expect(OP_MODULES.reponse.parse(lecture.body).total).toBe(12);

      // Écriture signée, construite comme le client le fait (corps = paramètres de l'opération)
      const commande = patron.ChangerModuleSchema.parse(
        t.corps("colis", false, { type: "ville", nom: "Douala" }),
      );
      expect(commande.signature.pin).toBe(PIN_PATRON);
      const ecriture = await appel(
        OP_CHANGER_MODULE,
        commande,
        OP_CHANGER_MODULE.corps?.(commande),
        jeton,
      );
      expect(ecriture.status, JSON.stringify(ecriture.body)).toBe(200);
      const accuse = OP_CHANGER_MODULE.reponse.parse(ecriture.body);
      expect(accuse.module.exceptions).toEqual([
        { portee: { type: "ville", nom: "Douala" }, actif: false },
      ]);

      // Lecture des modules visibles, avec les paramètres de requête que le client fabrique
      const params = { gare: DOUALA_AKWA };
      const requete = Object.fromEntries(
        Object.entries(OP_MODULES_ACTIFS.requete?.(params) ?? {}).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, String(v)]],
        ),
      );
      const chemin = `${OP_MODULES_ACTIFS.chemin(params)}?${new URLSearchParams(requete).toString()}`;
      const actifs = await t.http().get(chemin).set(auth(guichet.jeton));
      expect(actifs.status).toBe(200);
      const lu = OP_MODULES_ACTIFS.reponse.parse(actifs.body);
      expect(ModulesActifsSchema.parse(actifs.body)).toEqual(lu);
      expect(lu.modules.find((m) => m.code === "colis")?.actif).toBe(false);
    } finally {
      await t.fermer();
    }
  });

  it("une écriture sans signature fait échouer le schéma des contrats, comme l'API", () => {
    const { signature: _signature, ...sans } = {
      code: "colis",
      actif: false,
      portee: { type: "agence" },
      signature: undefined,
    };
    expect(patron.ChangerModuleSchema.safeParse(sans).success).toBe(false);
  });
});
