import { patron as c } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ErreurHttp } from "../infra/erreurs";
import * as op from "./operations";
import { OPERATIONS_SIGNEES } from "./operations";
import { clientPatron } from "./mock/testing";

const noms = Object.keys(c.COMMANDES_SIGNEES) as c.NomCommandeSignee[];

describe("opérations patron", () => {
  it("chaque nom d'opération et de canal est unique", () => {
    const tout = (Object.values(op) as unknown[]).filter(
      (x): x is { nom: string } => typeof x === "object" && x !== null && "nom" in x,
    );
    const liste = tout.map((x) => x.nom);
    expect(liste.length).toBeGreaterThan(40);
    expect(new Set(liste).size).toBe(liste.length);
  });

  it("les chemins sont sous /patron et encodent leurs identifiants", () => {
    expect(op.OP_GARE.chemin({ gareId: "a/b" })).toBe("/patron/gares/a%2Fb");
    expect(op.OP_MODIFIER_LIGNE.chemin({ ligneId: "ligne-1" } as never)).toBe(
      "/patron/reglages/lignes/ligne-1",
    );
    expect(op.OP_COMPTABLE.requete?.({ mois: "2026-12" })).toEqual({ mois: "2026-12" });
    for (const o of Object.values(op)) {
      if (typeof o === "object" && o !== null && "chemin" in o) {
        const chemin = (o as { chemin: (p: never) => string }).chemin({} as never);
        expect(chemin.startsWith("/patron")).toBe(true);
      }
    }
  });
});

describe("toute écriture porte sa signature PIN, côté opération comme côté contrat", () => {
  it("OPERATIONS_SIGNEES a exactement les clés du registre des contrats", () => {
    expect(Object.keys(OPERATIONS_SIGNEES).sort()).toEqual([...noms].sort());
  });

  it.each(noms)("%s : opération non rejouable, nom identique, corps = commande complète", (nom) => {
    const operation = OPERATIONS_SIGNEES[nom];
    expect(operation.nom).toBe(nom);
    expect(["POST", "PUT", "PATCH", "DELETE"]).toContain(operation.methode);
    expect(operation.idempotente).toBe(false);
    const commande = { signature: { pin: "483920", methode: "pin", signeA: "x" }, ligneId: "l" };
    expect((operation.corps as (p: unknown) => { signature: unknown })(commande).signature).toEqual(
      commande.signature,
    );
  });

  it.each(noms)("%s : le mock refuse un corps sans signature (401 PIN_REQUIS)", async (nom) => {
    const client = clientPatron("defaut");
    const operation = OPERATIONS_SIGNEES[nom];
    const sansSignature = {
      ligneId: "l",
      personneId: "p",
      code: "relais",
      dossierId: "d",
      mois: "2026-12",
    };
    const erreur = await client.executer(operation as never, sansSignature as never).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(ErreurHttp);
    expect(erreur).toMatchObject({ statut: 401, code: "PIN_REQUIS" });
  });

  it.each(noms)("%s : un PIN à 5 chiffres est aussi refusé", async (nom) => {
    const client = clientPatron("defaut");
    const erreur = await client
      .executer(
        OPERATIONS_SIGNEES[nom] as never,
        {
          signature: { pin: "12345", methode: "pin", signeA: "2027-01-05T14:07:00.000+01:00" },
        } as never,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(erreur).toMatchObject({ statut: 401, code: "PIN_REQUIS" });
  });

  it("un corps signé mais incomplet est refusé avec les causes (422)", async () => {
    const client = clientPatron("defaut");
    const erreur = await client
      .executer(op.OP_CHANGER_MODULE, {
        code: "relais",
        signature: { pin: "483920", methode: "pin", signeA: "2027-01-05T14:07:00.000+01:00" },
      } as never)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(erreur).toMatchObject({ statut: 422, code: "COMMANDE_INVALIDE" });
    expect((erreur as ErreurHttp).details).toMatchObject({ issues: expect.any(Array) });
  });
});
