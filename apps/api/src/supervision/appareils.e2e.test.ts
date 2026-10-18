import { agence as c } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTRE_GARE, COMPAGNIE, GARE } from "../caisse/testing/app-agence-test";
import { envoyer, lire } from "../caisse/testing/outils";
import { MS_PAR_HEURE, versIsoDouala } from "../caisse/temps";
import { AlertesSync, AppareilsSync, type AlerteSync } from "../sync";
import {
  creerAppSupervisionTest,
  type AppSupervisionTest,
  type SuperviseurTest,
} from "./testing/app-supervision-test";

/**
 * Les appareils bloqués : `GET /agence/superviseur/appareils/:appareilId` et
 * `POST /agence/superviseur/appareils/deblocage` (événement `appareil.debloque`, avec le PIN).
 */

let t: AppSupervisionTest;
let sup: SuperviseurTest;
let appareils: AppareilsSync;
let alertes: AlertesSync;

beforeAll(async () => {
  t = await creerAppSupervisionTest();
  appareils = t.app.get(AppareilsSync);
  alertes = t.app.get(AlertesSync);
});
afterAll(() => t.fermer());

beforeEach(async () => {
  t.reinitialiser();
  sup = await t.superviseur();
});

const heuresAvant = (h: number): string =>
  versIsoDouala(t.horloge.maintenant().getTime() - h * MS_PAR_HEURE);

/** Un téléphone du guichet 3 de la gare de Douala, synchronisé il y a `h` heures. */
async function appareil(
  id: string,
  h: number | null,
  o: { gareId?: string; compagnieId?: string } = {},
) {
  await appareils.declarer({
    id,
    genre: "guichet",
    rang: 3,
    gareId: o.gareId ?? GARE,
    compagnieId: o.compagnieId ?? COMPAGNIE,
    derniereSyncA: h === null ? null : heuresAvant(h),
  });
  return id;
}

const deblocageEvt = (appareilId: string, option: string) =>
  t.evenementSuperviseur("appareil.debloque", sup, { appareilId, option });

describe("GET /agence/superviseur/appareils/:appareilId", () => {
  it("un téléphone hors ligne depuis plus de 12 h est bloqué : durée, limite, options dans l'ordre", async () => {
    const id = await appareil("tel-gu3-a", 12.7);
    const rep = await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const vue = c.SchemaSuperviseurAppareil.parse(rep.body);
    expect(vue.etat).toBe("bloque");
    expect(vue.appareil).toMatchObject({ id, guichetRang: 3, gareId: GARE });
    expect(vue.appareil.code).toMatch(/^GU3-/);
    expect(vue.horsLigneMinutes).toBe(762);
    expect(vue.limiteHeures).toBe(12);
    expect(vue.derniereSyncA).toBe(heuresAvant(12.7));
    expect(vue.options).toEqual([
      { rang: 1, option: "synchroniser", recommande: true },
      { rang: 2, option: "debloquer_4h", recommande: false },
      { rang: 3, option: "telephone_secours", recommande: false },
    ]);
    expect(vue.diagnostics[0]).toMatchObject({ niveau: "alerte" });
    expect(vue.diagnostics[0]?.constat).toContain("12 h 42");
    expect(vue.enAttente).toMatchObject({ ventes: 0, colis: 0, cash: 0 });
    expect(vue.enAttente.plage).toEqual({ debut: 2001, fin: 2999, trous: [] });
    expect(vue.rappelSupport).toBe(false);
  });

  it("un téléphone synchronisé il y a moins de 12 h est en ligne, sans option", async () => {
    const id = await appareil("tel-gu3-b", 2);
    const vue = c.SchemaSuperviseurAppareil.parse(
      (await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton)).body,
    );
    expect(vue.etat).toBe("en_ligne");
    expect(vue.options).toEqual([]);
    expect(vue.diagnostics[0]).toMatchObject({ niveau: "info" });
  });

  it("ajoute au diagnostic les alertes de synchronisation ouvertes de ce téléphone", async () => {
    const id = await appareil("tel-gu3-c", 13);
    const alerte = (appareilId: string, type: AlerteSync["type"], resolueA: string | null) =>
      alertes.ajouter({
        id: `${appareilId}-${type}-${resolueA ?? "o"}`,
        type,
        gravite: "alerte",
        creeeA: heuresAvant(1),
        appareilId,
        auteurId: null,
        evenementId: null,
        gareId: GARE,
        compagnieId: COMPAGNIE,
        details: {},
        resolueA,
      });
    await alerte(id, "file_avec_trou", null);
    await alerte(id, "horloge_en_avance", heuresAvant(0.5));
    await alerte("autre-tel", "numero_en_double", null);
    const vue = c.SchemaSuperviseurAppareil.parse(
      (await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton)).body,
    );
    expect(vue.diagnostics).toHaveLength(2);
    expect(vue.diagnostics[1]?.constat).toContain("File d'envoi avec un trou");
  });

  it("refuse un appareil inconnu, d'une autre gare ou d'une autre compagnie : 404", async () => {
    await appareil("tel-ailleurs", 20, { gareId: AUTRE_GARE });
    await appareil("tel-autre-agence", 20, { compagnieId: "autre-compagnie" });
    for (const id of ["inexistant", "tel-ailleurs", "tel-autre-agence"]) {
      const rep = await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton);
      expect(rep.status, id).toBe(404);
      expect(rep.body.code).toBe("APPAREIL_INCONNU");
    }
  });

  it("répond 409 pour un appareil qui ne s'est jamais synchronisé", async () => {
    const id = await appareil("tel-neuf", null);
    const rep = await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("APPAREIL_JAMAIS_SYNCHRONISE");
  });

  it("n'est ouverte qu'au superviseur", async () => {
    const id = await appareil("tel-gu3-d", 14);
    const guichetier = await t.membre("guichetier");
    expect((await lire(t, `/agence/superviseur/appareils/${id}`, guichetier.jeton)).status).toBe(
      403,
    );
    expect((await lire(t, `/agence/superviseur/appareils/${id}`, "")).status).toBe(401);
  });
});

describe("appareil.debloque : POST /agence/superviseur/appareils/deblocage", () => {
  it("accorde 4 h de plus avec le PIN : octroi posé sur l'appareil, état débloqué, journal et audit", async () => {
    const id = await appareil("tel-4h", 13);
    const evt = await t.signer(sup, deblocageEvt(id, "debloquer_4h"));
    const rep = await envoyer(t, "/agence/superviseur/appareils/deblocage", sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const res = c.SchemaResultatDeblocage.parse(rep.body);
    expect(res.accuse.statut).toBe("accepte");
    expect(res.appareil).toEqual({
      id,
      etat: "debloque_temporairement",
      debloqueJusqua: versIsoDouala(t.horloge.maintenant().getTime() + 4 * MS_PAR_HEURE),
      ventesSynchronisees: 0,
    });
    const fiche = await appareils.trouver(id);
    expect(fiche?.octroi).toMatchObject({ option: "debloquer_4h", superviseurId: sup.id });
    expect(fiche?.retire).toBe(false);
    expect(t.journalRepo.lignes.some((l) => l.type === "appareil.debloque")).toBe(true);

    const vue = c.SchemaSuperviseurAppareil.parse(
      (await lire(t, `/agence/superviseur/appareils/${id}`, sup.jeton)).body,
    );
    expect(vue.etat).toBe("debloque_temporairement");
    expect(vue.options).toEqual([]);
  });

  it("le téléphone de secours retire l'appareil ; synchroniser pose l'octroi sans retirer", async () => {
    const secours = await appareil("tel-secours", 15);
    const r1 = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      await t.signer(sup, deblocageEvt(secours, "telephone_secours")),
    );
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    expect(c.SchemaResultatDeblocage.parse(r1.body).appareil.debloqueJusqua).toBeNull();
    expect((await appareils.trouver(secours))?.retire).toBe(true);

    const sync = await appareil("tel-sync", 15);
    const r2 = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      await t.signer(sup, deblocageEvt(sync, "synchroniser")),
    );
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    // Tant que le téléphone n'a pas synchronisé, il reste bloqué : c'est sa synchronisation qui le libère.
    expect(c.SchemaResultatDeblocage.parse(r2.body).appareil.etat).toBe("bloque");
    const fiche = await appareils.trouver(sync);
    expect(fiche?.octroi).toMatchObject({ option: "synchroniser", debloqueJusqua: null });
    expect(fiche?.retire).toBe(false);
  });

  it("rejoue le même événement sans rien refaire : deja_recu, un seul octroi", async () => {
    const id = await appareil("tel-rejeu", 13);
    const evt = await t.signer(sup, deblocageEvt(id, "debloquer_4h"));
    const a = await envoyer(t, "/agence/superviseur/appareils/deblocage", sup.jeton, evt);
    const octroi = (await appareils.trouver(id))?.octroi;
    t.horloge.avancer(30 * 60_000);
    const b = await envoyer(t, "/agence/superviseur/appareils/deblocage", sup.jeton, evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(b.body.appareil).toEqual(a.body.appareil);
    expect((await appareils.trouver(id))?.octroi).toEqual(octroi);
    expect(t.journalRepo.lignes.filter((l) => l.type === "appareil.debloque")).toHaveLength(1);
  });

  it("exige le PIN du superviseur : sans preuve, preuve d'un autre événement ou d'un autre compte", async () => {
    const id = await appareil("tel-pin", 13);
    const sansPreuve = deblocageEvt(id, "debloquer_4h");
    const r1 = await envoyer(t, "/agence/superviseur/appareils/deblocage", sup.jeton, sansPreuve);
    // Un `validePar` sans signature n'a pas la forme du contrat : 422, comme pour les autres écritures.
    expect(r1.status).toBe(422);
    const autreEvt = await t.signer(sup, deblocageEvt(id, "synchroniser"));
    const r2 = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      t.avecPreuve(
        deblocageEvt(id, "debloquer_4h"),
        (autreEvt.donnees as { validePar: { signature: string } }).validePar.signature,
      ),
    );
    expect(r2.status).toBe(403);
    expect(r2.body.code).toBe("PREUVE_PIN_INVALIDE");
    expect((await appareils.trouver(id))?.octroi).toBeNull();
  });

  it("refuse l'auteur d'un autre compte et un autre rôle", async () => {
    const id = await appareil("tel-auteur", 13);
    const autre = await t.superviseur({ nom: "Autre superviseur" });
    const evt = await t.signer(sup, deblocageEvt(id, "debloquer_4h"));
    const r1 = await envoyer(t, "/agence/superviseur/appareils/deblocage", autre.jeton, evt);
    expect(r1.status).toBe(403);
    expect(r1.body.code).toBe("AUTEUR_INCOHERENT");
    const guichetier = await t.membre("guichetier");
    expect(
      (await envoyer(t, "/agence/superviseur/appareils/deblocage", guichetier.jeton, evt)).status,
    ).toBe(403);
  });

  it("refuse un appareil d'une autre gare (404) et un appareil qui n'est pas bloqué (409)", async () => {
    const ailleurs = await appareil("tel-autre-gare", 20, { gareId: AUTRE_GARE });
    const r1 = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      await t.signer(sup, deblocageEvt(ailleurs, "debloquer_4h")),
    );
    expect(r1.status).toBe(404);
    expect(r1.body.code).toBe("APPAREIL_INCONNU");

    const enLigne = await appareil("tel-en-ligne", 1);
    const r2 = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      await t.signer(sup, deblocageEvt(enLigne, "debloquer_4h")),
    );
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe("APPAREIL_NON_BLOQUE");
  });

  it("refuse une option inconnue : 422", async () => {
    const id = await appareil("tel-option", 13);
    const rep = await envoyer(
      t,
      "/agence/superviseur/appareils/deblocage",
      sup.jeton,
      deblocageEvt(id, "magie"),
    );
    expect(rep.status).toBe(422);
  });
});
