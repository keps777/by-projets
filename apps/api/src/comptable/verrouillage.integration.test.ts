import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerAppAgencePg, type AppAgencePg } from "../caisse/testing/app-agence-pg";
import { cloture, comptage, envoyer, ouverture } from "../caisse/testing/outils";
import { aammjjDouala } from "../caisse/temps";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { Clotures } from "./ports";
import { uneCloture } from "./testing/contrat-ports";
import { VerrouillageMois } from "./verrouillage.service";

/**
 * Le verrou des mois clôturés sur l'API complète, stockage PostgreSQL : la clôture écrite dans la base
 * (avec ses fichiers) refuse ensuite les écritures de la caisse datées de ce mois, et
 * `VerrouillageMois` lit bien la table `cloture_mois`.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · verrou des mois clôturés", () => {
  let base: BaseDeTest;
  let t: AppAgencePg;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await creerAppAgencePg({ url: base.url });
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("le verrou lit la clôture dans la base, pour sa compagnie seulement", async () => {
    const d = await t.decor();
    const autre = await t.decor();
    await t.app.get(Clotures).verrouiller(uneCloture(d.compagnie.id, "2026-10"));
    const verrou = t.app.get(VerrouillageMois);

    expect(await verrou.estVerrouille(d.compagnie.id, "2026-10")).toBe(true);
    expect(await verrou.estVerrouille(d.compagnie.id, "2026-11")).toBe(false);
    expect(await verrou.estVerrouille(autre.compagnie.id, "2026-10")).toBe(false);
    await expect(
      verrou.exigerOuvert(d.compagnie.id, new Date("2026-10-15T10:00:00Z")),
    ).rejects.toMatchObject({ status: 409, response: { code: "MOIS_VERROUILLE" } });
    expect(
      await verrou.premierInstantOuvert(d.compagnie.id, new Date("2026-10-15T10:00:00Z")),
    ).toBe("2026-10-31T23:00:00.000Z");
  });

  it("une caisse ouverte à une date d'un mois clôturé est refusée, rien n'est écrit ; le mois courant passe", async () => {
    const d = await t.decor();
    await t.app.get(Clotures).verrouiller(uneCloture(d.compagnie.id, "2026-10"));
    const g = await t.compte("guichetier", { compagnieId: d.compagnie.id, gareId: d.gare.id });
    const guichet = d.guichets[1]!;

    const at = "2026-10-20T09:00:00.000+01:00";
    const refusee = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, {
        at,
        guichetId: guichet.id,
        numero: `K-${d.gare.code}-${aammjjDouala(at)}-2-1`,
      }),
    );
    expect(refusee.status).toBe(409);
    expect(refusee.body.code).toBe("MOIS_VERROUILLE");
    const { rows } = await base.sql.query(
      `SELECT count(*)::int AS n FROM session_caisse WHERE "agentId" = $1`,
      [g.id],
    );
    expect(rows[0].n).toBe(0);

    const ok = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, {
        guichetId: guichet.id,
        numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
      }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("comptage et clôture d'une session dont le mois vient d'être clôturé : 409 MOIS_VERROUILLE", async () => {
    const d = await t.decor();
    const g = await t.compte("guichetier", { compagnieId: d.compagnie.id, gareId: d.gare.id });
    const ouv = ouverture(t, g.id, {
      guichetId: d.guichets[1]!.id,
      numero: `K-${d.gare.code}-${aammjjDouala(t.iso())}-2-1`,
    });
    expect((await envoyer(t, "/agence/caisse/ouverture", g.jeton, ouv)).status).toBe(200);
    const sessionId = String(ouv.donnees["sessionId"]);

    await t.app.get(Clotures).verrouiller(uneCloture(d.compagnie.id, "2026-11"));

    const compte = await envoyer(
      t,
      "/agence/caisse/comptage",
      g.jeton,
      comptage(g.id, sessionId, { 10_000: 2 }, 0, { at: t.iso() }),
    );
    expect(compte.status).toBe(409);
    expect(compte.body.code).toBe("MOIS_VERROUILLE");
    const fin = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, sessionId, 20_000, 25_000, { at: t.iso() }),
    );
    expect(fin.status).toBe(409);
    expect(fin.body.code).toBe("MOIS_VERROUILLE");
    const { rows } = await base.sql.query(`SELECT etat FROM session_caisse WHERE id = $1`, [
      sessionId,
    ]);
    expect(rows[0].etat).toBe("ouverte");
  });
});
