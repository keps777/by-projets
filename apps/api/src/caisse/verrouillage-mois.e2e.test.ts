import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloture } from "../comptable/modele";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEBUT,
  GUICHET_2,
  creerAppAgenceTest,
  uuid,
  type AppAgenceTest,
} from "./testing/app-agence-test";
import { cloture, comptage, envoyer, ouverture } from "./testing/outils";
import { MS_PAR_HEURE } from "./temps";

let t: AppAgenceTest;

// Une application neuve par test : une clôture de mois ne se défait pas.
beforeEach(async () => {
  t = await creerAppAgenceTest();
});
afterEach(() => t.fermer());

const fermer = (compagnieId: string, mois: string) =>
  t.clotures.verrouiller({ compagnieId, mois } as unknown as Cloture);

function repartir() {
  t.sessions.lignes.clear();
  t.mouvements.vider();
  t.alertes.lignes.length = 0;
  t.horloge.avancer(DEBUT.getTime() - t.horloge.maintenant().getTime());
}

describe("caisse et mois clôturés (VerrouillageMois)", () => {
  it("une caisse ouverte à une date d'un mois clôturé est refusée : 409 MOIS_VERROUILLE, rien n'est créé", async () => {
    repartir();
    await fermer(COMPAGNIE, "2026-10");
    const g = await t.compte("guichetier");
    const tardive = ouverture(t, g.id, { at: "2026-10-20T09:00:00.000+01:00" });

    const rep = await envoyer(t, "/agence/caisse/ouverture", g.jeton, tardive);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("MOIS_VERROUILLE");
    expect(rep.body.message).toContain("Octobre 2026");
    expect(t.sessions.lignes.size).toBe(0);

    // Le mois courant, lui, reste ouvert à l'écriture.
    const ok = await envoyer(t, "/agence/caisse/ouverture", g.jeton, ouverture(t, g.id));
    expect(ok.status).toBe(200);
  });

  it("le verrou est propre à la compagnie : le mois clôturé d'une autre agence ne gêne pas", async () => {
    repartir();
    await fermer(AUTRE_COMPAGNIE, "2026-10");
    const g = await t.compte("guichetier");
    const rep = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, { at: "2026-10-20T09:00:00.000+01:00", id: uuid() }),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
  });

  it("comptage et clôture d'une session d'un mois clôturé sont refusés ; la clôture de minuit, jamais", async () => {
    repartir();
    const g = await t.compte("guichetier");
    const sessionId = uuid();
    const ouv = await envoyer(
      t,
      "/agence/caisse/ouverture",
      g.jeton,
      ouverture(t, g.id, { sessionId, guichetId: GUICHET_2 }),
    );
    expect(ouv.status).toBe(200);

    // Le comptable clôture novembre alors que la caisse est encore ouverte (cas limite).
    await fermer(COMPAGNIE, "2026-11");

    const compte = comptage(g.id, sessionId, { 10_000: 2 }, 0, { at: t.iso() });
    const refuseCompte = await envoyer(t, "/agence/caisse/comptage", g.jeton, compte);
    expect(refuseCompte.status).toBe(409);
    expect(refuseCompte.body.code).toBe("MOIS_VERROUILLE");

    const refuseCloture = await envoyer(
      t,
      "/agence/caisse/cloture",
      g.jeton,
      cloture(g.id, sessionId, 20_000, 25_000, { at: t.iso() }),
    );
    expect(refuseCloture.status).toBe(409);
    expect(refuseCloture.body.code).toBe("MOIS_VERROUILLE");
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("ouverte");

    // Minuit passé : le système ferme quand même la caisse (l'argent ne reste pas ouvert).
    t.horloge.avancer(16 * MS_PAR_HEURE);
    expect(await t.caisse.cloturerLesSessionsDeMinuit()).toBe(1);
    expect(t.sessions.lignes.get(sessionId)!.etat).toBe("cloturee");
  });

  it("rejouer un événement déjà accepté avant la clôture du mois répond deja_recu, sans erreur", async () => {
    repartir();
    const g = await t.compte("guichetier");
    const evt = ouverture(t, g.id);
    expect((await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt)).status).toBe(200);
    await fermer(COMPAGNIE, "2026-11");

    const rejeu = await envoyer(t, "/agence/caisse/ouverture", g.jeton, evt);
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
  });
});
