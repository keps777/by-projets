import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTRE_GARE } from "../caisse/testing/app-agence-test";
import { envoyer, lire } from "../caisse/testing/outils";
import { MS_PAR_MINUTE } from "../caisse/temps";
import {
  creerAppSupervisionTest,
  PIN_SUPERVISEUR,
  type AppSupervisionTest,
} from "./testing/app-supervision-test";

let t: AppSupervisionTest;

beforeAll(async () => {
  t = await creerAppSupervisionTest();
});
afterAll(() => t.fermer());
beforeEach(() => {
  t.reinitialiser();
  t.alertes.lignes.length = 0;
});

/** Un événement de validation de caisse à faire signer (le contenu importe peu pour la preuve). */
const aSigner = (supId: string) =>
  t.evenementSuperviseur(
    "caisse.validee",
    { id: supId },
    { sessionId: "s1", ecart: 0, commentaire: null },
  );

describe("accès à la supervision", () => {
  it("sans jeton : 401 sur toutes les routes", async () => {
    for (const chemin of [
      "/agence/superviseur/gare",
      "/agence/superviseur/clotures/s1",
      "/agence/superviseur/annulations/d1",
      "/agence/superviseur/equipe",
    ]) {
      expect((await t.http().get(chemin)).status, chemin).toBe(401);
    }
    for (const chemin of [
      "/agence/annulations",
      "/agence/superviseur/pin",
      "/agence/superviseur/annulations",
      "/agence/superviseur/validations",
      "/agence/superviseur/refus",
      "/agence/superviseur/equipe/pin",
      "/agence/superviseur/equipe/affectation",
      "/agence/superviseur/equipe/desactivation",
      "/agence/superviseur/equipe/deblocage",
    ]) {
      expect((await t.http().post(chemin).send({})).status, chemin).toBe(401);
    }
  });

  it("seul un superviseur lit et décide ; les autres rôles reçoivent 403", async () => {
    for (const role of [
      "guichetier",
      "convoyeur",
      "chauffeur",
      "controleur",
      "patron",
      "comptable",
      "afrimove",
      "voyageur",
    ] as const) {
      const { jeton } = await t.compte(role, role === "patron" ? { gareId: null } : {});
      for (const chemin of ["gare", "equipe"]) {
        expect(
          (await lire(t, `/agence/superviseur/${chemin}`, jeton)).status,
          `${role} ${chemin}`,
        ).toBe(403);
      }
      for (const chemin of [
        "pin",
        "annulations",
        "validations",
        "refus",
        "equipe/pin",
        "equipe/affectation",
        "equipe/desactivation",
        "equipe/deblocage",
      ]) {
        expect(
          (await envoyer(t, `/agence/superviseur/${chemin}`, jeton, {})).status,
          `${role} ${chemin}`,
        ).toBe(403);
      }
    }
  });

  it("seuls guichetier, convoyeur et vendeur demandent une annulation ; le superviseur ne se la demande pas", async () => {
    for (const role of [
      "superviseur",
      "patron",
      "comptable",
      "afrimove",
      "voyageur",
      "chauffeur",
    ] as const) {
      const { jeton } = await t.compte(role, role === "patron" ? { gareId: null } : {});
      expect((await envoyer(t, "/agence/annulations", jeton, {})).status, role).toBe(403);
    }
  });

  it("un superviseur sans gare, ou qui demande la gare d'un autre, est refusé", async () => {
    const sansGare = await t.superviseur({ gareId: null });
    const rep = await lire(t, "/agence/superviseur/gare", sansGare.jeton);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("GARE_REQUISE");

    const sup = await t.superviseur();
    const autre = await lire(t, `/agence/superviseur/gare?gareId=${AUTRE_GARE}`, sup.jeton);
    expect(autre.status).toBe(403);
    expect(autre.body.code).toBe("GARE_AUTRE");
  });
});

describe("POST /agence/superviseur/pin : la preuve du PIN", () => {
  it("un PIN juste donne une preuve liée à l'événement, valable dix minutes", async () => {
    const sup = await t.superviseur();
    const evt = aSigner(sup.id);
    const rep = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: evt,
    });
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body).toMatchObject({ methode: "pin", superviseurId: sup.id });
    expect(rep.body.signature).toMatch(/^[0-9a-f]{72}$/);
    expect(rep.body.expireA).toBe(t.iso(10 * MS_PAR_MINUTE));
    // Le PIN n'est ni renvoyé ni dans la signature.
    expect(JSON.stringify(rep.body)).not.toContain(PIN_SUPERVISEUR);
  });

  it("deux événements différents n'ont pas la même preuve ; le même événement, au même instant, oui", async () => {
    const sup = await t.superviseur();
    const a = aSigner(sup.id);
    const b = aSigner(sup.id);
    const p = (e: unknown) =>
      envoyer(t, "/agence/superviseur/pin", sup.jeton, { pin: sup.pin, evenement: e });
    const [pa, pa2, pb] = await Promise.all([p(a), p(a), p(b)]);
    expect(pa.body.signature).toBe(pa2.body.signature);
    expect(pa.body.signature).not.toBe(pb.body.signature);
  });

  it("un PIN faux : 401 avec les essais restants, puis le 3e faux bloque 15 minutes et alerte le patron", async () => {
    const sup = await t.superviseur({ nom: "Clarisse Eyenga" });
    const faux = (pin: string) =>
      envoyer(t, "/agence/superviseur/pin", sup.jeton, { pin, evenement: aSigner(sup.id) });

    const un = await faux("111222");
    expect(un.status).toBe(401);
    expect(un.body).toMatchObject({ code: "PIN_INCORRECT", details: { essaisRestants: 2 } });
    const deux = await faux("111222");
    expect(deux.body.details).toEqual({ essaisRestants: 1 });
    expect(t.alertes.lignes).toHaveLength(0);

    const trois = await faux("111222");
    expect(trois.status).toBe(423);
    expect(trois.body.code).toBe("PIN_BLOQUE");
    expect(trois.body.details.reessayerApres).toBe(t.iso(15 * MS_PAR_MINUTE));
    expect(t.alertes.lignes).toHaveLength(1);
    expect(t.alertes.lignes[0]).toMatchObject({ type: "pin_bloque", gareId: expect.any(String) });
    expect(t.alertes.lignes[0]!.message).toContain("Clarisse Eyenga");

    // Même le bon PIN est refusé pendant le blocage ; l'essai ne compte plus.
    const bon = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: aSigner(sup.id),
    });
    expect(bon.status).toBe(423);
    t.horloge.avancer(15 * MS_PAR_MINUTE - 1_000);
    expect(
      (
        await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
          pin: sup.pin,
          evenement: aSigner(sup.id),
        })
      ).status,
    ).toBe(423);
    t.horloge.avancer(2_000);
    expect(
      (
        await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
          pin: sup.pin,
          evenement: aSigner(sup.id),
        })
      ).status,
    ).toBe(200);
  });

  it("un PIN juste remet le compteur à zéro", async () => {
    const sup = await t.superviseur();
    const essai = (pin: string) =>
      envoyer(t, "/agence/superviseur/pin", sup.jeton, { pin, evenement: aSigner(sup.id) });
    expect((await essai("111222")).body.details.essaisRestants).toBe(2);
    expect((await essai("111222")).body.details.essaisRestants).toBe(1);
    expect((await essai(sup.pin)).status).toBe(200);
    expect((await essai("111222")).body.details.essaisRestants).toBe(2);
  });

  it("le PIN est refusé s'il n'a pas 6 chiffres, sans compter comme un essai", async () => {
    const sup = await t.superviseur();
    for (const pin of ["12345", "1234567", "abcdef", "12 456", ""]) {
      const rep = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
        pin,
        evenement: aSigner(sup.id),
      });
      expect(rep.status, pin).toBe(422);
      expect(rep.body.code).toBe("PIN_FORMAT");
    }
    const sansPin = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      evenement: aSigner(sup.id),
    });
    expect(sansPin.status).toBe(422);
    expect((await t.personnes.trouverParId(sup.id))!.echecsConnexion).toBe(0);
  });

  it("refuse une demande de preuve mal formée ou pour un autre superviseur", async () => {
    const sup = await t.superviseur();
    const autre = await t.superviseur({ nom: "Autre Superviseur" });
    const evt = aSigner(sup.id);

    const pourUnAutre = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: aSigner(autre.id),
    });
    expect(pourUnAutre.status).toBe(422);
    expect(pourUnAutre.body.code).toBe("DEMANDE_PREUVE_INVALIDE");

    const mauvaisType = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: { ...evt, type: "caisse.ouverte" },
    });
    expect(mauvaisType.status).toBe(422);

    const empreinte = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: {
        ...evt,
        donnees: { ...evt.donnees, validePar: { superviseurId: sup.id, methode: "empreinte" } },
      },
    });
    expect(empreinte.status).toBe(422);

    for (const corps of [
      {},
      { pin: sup.pin },
      { pin: sup.pin, evenement: "x" },
      { pin: sup.pin, evenement: { ...evt, id: "pas-un-uuid" } },
    ]) {
      expect((await envoyer(t, "/agence/superviseur/pin", sup.jeton, corps)).status).toBe(422);
    }
  });

  it("sans PIN défini : 409 ; un PIN provisoire expiré : 409 tant qu'il n'est pas renouvelé", async () => {
    const sansPin = await t.superviseur();
    t.personnes.modifier(sansPin.id, { pinHache: null });
    const rep = await envoyer(t, "/agence/superviseur/pin", sansPin.jeton, {
      pin: "739104",
      evenement: aSigner(sansPin.id),
    });
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("PIN_NON_DEFINI");

    const sup = await t.superviseur();
    await t.pins.definirProvisoire(
      sup.id,
      await t.hachage.hacher("580264"),
      new Date(t.horloge.maintenant().getTime() + 60 * MS_PAR_MINUTE),
    );
    t.personnes.modifier(sup.id, { pinHache: await t.hachage.hacher("580264") });
    const avant = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: "580264",
      evenement: aSigner(sup.id),
    });
    expect(avant.status).toBe(200);
    t.horloge.avancer(61 * MS_PAR_MINUTE);
    const apres = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: "580264",
      evenement: aSigner(sup.id),
    });
    expect(apres.status).toBe(409);
    expect(apres.body.code).toBe("PIN_PROVISOIRE_EXPIRE");
  });

  it("un compte désactivé n'obtient plus de preuve", async () => {
    const sup = await t.superviseur();
    t.personnes.modifier(sup.id, { actif: false });
    const rep = await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: aSigner(sup.id),
    });
    expect(rep.status).toBe(401);
  });

  it("le PIN ne se retrouve ni dans l'audit ni dans le journal, et le haché n'est jamais renvoyé", async () => {
    const sup = await t.superviseur();
    await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: "111222",
      evenement: aSigner(sup.id),
    });
    await envoyer(t, "/agence/superviseur/pin", sup.jeton, {
      pin: sup.pin,
      evenement: aSigner(sup.id),
    });
    const tout = JSON.stringify([t.auditRepo.lignes, t.journalRepo.lignes], (_c, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(tout).not.toContain(PIN_SUPERVISEUR);
    expect(tout).not.toContain("111222");
    const actions = t.auditRepo.lignes.map((l) => `${l.action}:${l.resultat}`);
    expect(actions).toContain("superviseur.pin.verification:echec");
    expect(actions).toContain("superviseur.pin.verification:succes");
  });
});
