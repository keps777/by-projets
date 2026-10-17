import { agence as c } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTRE_GARE, GARE, GUICHET_3, uuid } from "../caisse/testing/app-agence-test";
import { envoyer, lire } from "../caisse/testing/outils";
import { MS_PAR_JOUR, MS_PAR_MINUTE } from "../caisse/temps";
import {
  creerAppSupervisionTest,
  type AppSupervisionTest,
  type CompteTest,
  type SuperviseurTest,
} from "./testing/app-supervision-test";

let t: AppSupervisionTest;
let sup: SuperviseurTest;

beforeAll(async () => {
  t = await creerAppSupervisionTest();
});
afterAll(() => t.fermer());

beforeEach(async () => {
  t.reinitialiser();
  t.equipe.lignes.clear();
  sup = await t.superviseur();
});

const CHEMINS = {
  "equipe.pin_renouvele": "/agence/superviseur/equipe/pin",
  "equipe.affectation_changee": "/agence/superviseur/equipe/affectation",
  "equipe.compte_desactive": "/agence/superviseur/equipe/desactivation",
  "equipe.personne_debloquee": "/agence/superviseur/equipe/deblocage",
} as const;

const pinEvt = (personneId: string) =>
  t.evenementSuperviseur("equipe.pin_renouvele", sup, { personneId });
const desactivationEvt = (personneId: string) =>
  t.evenementSuperviseur("equipe.compte_desactive", sup, { personneId });
const deblocageEvt = (personneId: string) =>
  t.evenementSuperviseur("equipe.personne_debloquee", sup, { personneId });
const affectationEvt = (personneId: string, guichetId: string | null, role: string | null) =>
  t.evenementSuperviseur("equipe.affectation_changee", sup, { personneId, guichetId, role });

/** Bloque le compte comme le ferait la connexion après 3 PIN faux. */
function bloquer(personneId: string) {
  t.personnes.modifier(personneId, {
    echecsConnexion: 0,
    bloqueJusqua: new Date(t.horloge.maintenant().getTime() + 15 * MS_PAR_MINUTE),
  });
}

describe("lecture de l'équipe", () => {
  it("répond comme le contrat : en service, autres par rôle, fiche, PIN provisoire", async () => {
    const joseph = await t.membre("guichetier", {
      nom: "Joseph Mbarga",
      affectation: "guichet 2",
      billets: 412,
    });
    await t.membre("convoyeur", {
      nom: "Paul Biya Essomba",
      situationDuJour: "a_bord",
      situation: "en route vers Yaoundé",
    });
    await t.membre("chauffeur", { nom: "Samuel Eto", situationDuJour: "hors_service" });
    await t.membre("chauffeur", { nom: "Roger Milla", situationDuJour: "hors_service" });
    await t.membre("controleur", { nom: "Alice Nkoulou", situationDuJour: "hors_service" });
    // Une personne d'une autre gare n'apparaît pas.
    await t.membre("guichetier", { nom: "Étrangère", gareId: AUTRE_GARE });

    const rep = await lire(t, "/agence/superviseur/equipe", sup.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaSuperviseurEquipe.parse(rep.body);
    expect(lu.gare).toEqual({ id: GARE, nom: "Gare de Douala" });
    expect(lu.effectif).toBe(5);
    expect(lu.pinProvisoireMinutes).toBe(60);
    expect(lu.enService.map((p) => [p.nom, p.statut, p.situation, p.affectation])).toEqual([
      ["Joseph M.", "en_service", null, "guichet 2"],
      ["Paul E.", "a_bord", "en route vers Yaoundé", null],
    ]);
    expect(lu.enService[0]).toMatchObject({
      initiales: "JM",
      pin: { etat: "ok", fauxEssais: 0, bloqueA: null },
      alerte: null,
    });
    expect(lu.autres).toEqual({ nombre: 3, detail: "2 chauffeurs, 1 contrôleur" });
    expect(lu.fiche).toBeNull();
    expect(joseph.id).toBeTruthy();
  });

  it("la fiche s'ouvre sur la personne à renouveler, puis sur la première bloquée, ou sur celle demandée", async () => {
    const a = await t.membre("guichetier", {
      nom: "Joseph Mbarga",
      billets: 412,
      depuis: "2026-01-05T08:00:00.000+01:00",
    });
    const b = await t.membre("convoyeur", { nom: "Paul Essomba" });
    const d = await t.membre("controleur", { nom: "Alice Nkoulou" });

    bloquer(b.id);
    let lu = c.SchemaSuperviseurEquipe.parse(
      (await lire(t, "/agence/superviseur/equipe", sup.jeton)).body,
    );
    expect(lu.fiche).toMatchObject({
      personneId: b.id,
      role: "convoyeur",
      actions: ["renouveler_pin", "changer_affectation", "voir_journal", "desactiver"],
    });
    expect(lu.enService.find((p) => p.personneId === b.id)).toMatchObject({
      statut: "bloquee",
      alerte: null,
      pin: { etat: "bloque", fauxEssais: 3, bloqueA: t.iso() },
    });

    await t.pins.definirProvisoire(
      d.id,
      "hache",
      new Date(t.horloge.maintenant().getTime() + 30 * MS_PAR_MINUTE),
    );
    lu = c.SchemaSuperviseurEquipe.parse(
      (await lire(t, "/agence/superviseur/equipe", sup.jeton)).body,
    );
    expect(lu.fiche!.personneId).toBe(d.id);
    expect(lu.enService.find((p) => p.personneId === d.id)!.pin.etat).toBe("a_renouveler");
    expect(lu.fiche!.personnesADebloquer).toEqual([{ id: b.id, nom: "Paul Essomba" }]);

    const choisie = c.SchemaSuperviseurEquipe.parse(
      (await lire(t, `/agence/superviseur/equipe?personneId=${a.id}`, sup.jeton)).body,
    );
    expect(choisie.fiche).toMatchObject({
      personneId: a.id,
      nom: "Joseph Mbarga",
      billets: 412,
      depuisLibelle: "depuis le 5 janv.",
    });
    expect(
      (await lire(t, "/agence/superviseur/equipe?personneId=inconnue", sup.jeton)).status,
    ).toBe(404);
  });

  it("signale « N écarts en 10 jours » à partir de trois caisses qui ne tombent pas juste", async () => {
    const g = await t.membre("guichetier", { nom: "Joseph Mbarga" });
    const modele = {
      numero: "",
      guichetId: GUICHET_3,
      guichetRang: 3,
      gareId: GARE,
      compagnieId: "00000000-0000-4000-8000-0000000000c1",
      agentId: g.id,
      fondDeCaisse: 0,
      tolerance: 1_000,
      reouverteA: null,
      etat: "validee" as const,
      comptage: null,
      validation: null,
      refus: [],
    };
    const ajouter = (i: number, joursAvant: number, ecart: number) => {
      const at = t.iso(-joursAvant * MS_PAR_JOUR);
      t.sessions.lignes.set(`e${i}`, {
        ...modele,
        id: `e${i}`,
        numero: `K-e${i}`,
        ouverteA: at,
        cloture: {
          at,
          auto: false,
          cashCompte: 0,
          cashAttendu: 0,
          ecart,
          divergenceAppareil: 0,
          comptageAbsent: false,
          decompte: {
            billetsCash: { nombre: 0, montant: 0 },
            colisCash: { nombre: 0, montant: 0 },
            annulationsValidees: { nombre: 0, montant: 0 },
            momo: { ventes: 0, montant: 0 },
          },
          evenementId: uuid(),
        },
        evenementOuvertureId: uuid(),
      });
    };
    const alerte = async () =>
      c.SchemaSuperviseurEquipe.parse((await lire(t, "/agence/superviseur/equipe", sup.jeton)).body)
        .enService[0]!.alerte;

    ajouter(1, 1, -500);
    ajouter(2, 3, 200);
    expect(await alerte()).toBeNull();
    ajouter(3, 5, 0); // une caisse juste ne compte pas
    expect(await alerte()).toBeNull();
    ajouter(4, 9, -100);
    expect(await alerte()).toBe("3 écarts en 10 jours");
    ajouter(5, 12, -100); // trop ancienne
    expect(await alerte()).toBe("3 écarts en 10 jours");
  });

  it("un superviseur ne lit que sa gare ; le guichetier ne lit pas l'équipe", async () => {
    await t.membre("guichetier", { nom: "Joseph Mbarga" });
    expect(
      (await lire(t, `/agence/superviseur/equipe?gareId=${AUTRE_GARE}`, sup.jeton)).status,
    ).toBe(403);
    const g = await t.compte("guichetier");
    expect((await lire(t, "/agence/superviseur/equipe", g.jeton)).status).toBe(403);
  });
});

describe("aucune action d'équipe sans le PIN du superviseur", () => {
  it("chacune des quatre actions refuse une preuve absente, inventée ou changée d'événement", async () => {
    const cible = await t.membre("guichetier", { nom: "Joseph Mbarga", guichetId: null });
    bloquer(cible.id);
    const evenements = [
      pinEvt(cible.id),
      affectationEvt(cible.id, GUICHET_3, "controleur"),
      desactivationEvt(cible.id),
      deblocageEvt(cible.id),
    ];
    for (const evt of evenements) {
      const chemin = CHEMINS[evt.type as keyof typeof CHEMINS];
      const sansPreuve = await envoyer(t, chemin, sup.jeton, {
        ...evt,
        donnees: { personneId: cible.id },
      });
      expect(sansPreuve.status, `${evt.type} sans validePar`).toBe(422);

      const inventee = await envoyer(t, chemin, sup.jeton, t.avecPreuve(evt, "b".repeat(72)));
      expect(inventee.status, `${evt.type} inventée`).toBe(403);
      expect(inventee.body.code).toBe("PREUVE_PIN_INVALIDE");

      // La preuve d'une autre action ne vaut pas : celle de « renouveler » ne désactive pas.
      const autre = await t.signer(
        sup,
        evt.type === "equipe.pin_renouvele" ? desactivationEvt(cible.id) : pinEvt(cible.id),
      );
      const signature = (autre.donnees as { validePar: { signature: string } }).validePar.signature;
      const emprunt = await envoyer(t, chemin, sup.jeton, t.avecPreuve(evt, signature));
      expect(emprunt.status, `${evt.type} preuve empruntée`).toBe(403);
    }
    // Rien n'a changé.
    expect(t.sms.messages()).toHaveLength(0);
    expect(await t.equipe.trouver(cible.id)).toMatchObject({
      actif: true,
      role: "guichetier",
      guichetId: null,
    });
    expect((await t.personnes.trouverParId(cible.id))!.bloqueJusqua).not.toBeNull();
    expect(t.journalRepo.lignes.filter((l) => l.type.startsWith("equipe."))).toEqual([]);
  });
});

describe("renouveler le PIN : un PIN provisoire part par SMS", () => {
  it("envoie un PIN provisoire de 6 chiffres valable 1 h, haché, jamais renvoyé ni écrit", async () => {
    const cible = await t.membre("guichetier", { nom: "Joseph Mbarga" });
    const avant = (await t.personnes.trouverParId(cible.id))!.pinHache;
    const evt = await t.signer(sup, pinEvt(cible.id));
    const rep = await envoyer(t, CHEMINS["equipe.pin_renouvele"], sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatEquipe.parse(rep.body);
    expect(lu.personne).toEqual({
      personneId: cible.id,
      actif: true,
      pin: "a_renouveler",
      smsProvisoireEnvoye: true,
    });

    const sms = t.sms.dernier()!;
    const pin = /(\d{6})/.exec(sms.message)![1]!;
    expect(sms.message).toContain("1 h");
    expect(sms.telephone).toBe(
      t.comptes.telephoneEnClair((await t.personnes.trouverParId(cible.id))!),
    );

    // Le haché remplace l'ancien, et ne laisse pas lire le PIN.
    const apres = (await t.personnes.trouverParId(cible.id))!.pinHache!;
    expect(apres).not.toBe(avant);
    expect(apres).not.toContain(pin);
    expect(await t.hachage.verifier(apres, pin)).toBe(true);
    expect(await t.hachage.verifier(apres, "482915")).toBe(false);
    expect((await t.pins.lire(cible.id)).provisoireJusqua).toEqual(
      new Date(t.horloge.maintenant().getTime() + 60 * MS_PAR_MINUTE),
    );

    const ecrit = JSON.stringify(
      [rep.body, t.journalRepo.lignes, t.auditRepo.lignes, t.alertes.lignes],
      (_c, v) => (typeof v === "bigint" ? v.toString() : v),
    );
    expect(ecrit).not.toContain(pin);
    expect(t.journalRepo.lignes.find((l) => l.type === "equipe.pin_renouvele")!.resume).toBe(
      "PIN provisoire de Joseph Mbarga envoyé par SMS (valable 1 h)",
    );
    expect(
      t.auditRepo.lignes.some(
        (l) => l.action === "equipe.pin_renouvele" && l.resultat === "succes",
      ),
    ).toBe(true);
  });

  it("rejouer l'événement n'envoie pas un deuxième SMS", async () => {
    const cible = await t.membre("guichetier");
    const avant = t.sms.messages().length;
    const evt = await t.signer(sup, pinEvt(cible.id));
    await envoyer(t, CHEMINS["equipe.pin_renouvele"], sup.jeton, evt);
    const rejeu = await envoyer(t, CHEMINS["equipe.pin_renouvele"], sup.jeton, evt);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(t.sms.messages().length - avant).toBe(1);
  });

  it("lève aussi le blocage : la personne n'a plus l'ancien PIN en tête", async () => {
    const cible = await t.membre("guichetier");
    bloquer(cible.id);
    const rep = await envoyer(
      t,
      CHEMINS["equipe.pin_renouvele"],
      sup.jeton,
      await t.signer(sup, pinEvt(cible.id)),
    );
    expect(rep.status).toBe(200);
    expect((await t.personnes.trouverParId(cible.id))!.bloqueJusqua).toBeNull();
  });

  it("après un renouvellement, l'équipe montre le PIN « à renouveler » jusqu'à ce que la personne le remplace", async () => {
    const cible = await t.membre("guichetier");
    await envoyer(
      t,
      CHEMINS["equipe.pin_renouvele"],
      sup.jeton,
      await t.signer(sup, pinEvt(cible.id)),
    );
    const etat = async () =>
      c.SchemaSuperviseurEquipe.parse(
        (await lire(t, "/agence/superviseur/equipe", sup.jeton)).body,
      ).enService.find((p) => p.personneId === cible.id)!.pin.etat;
    expect(await etat()).toBe("a_renouveler");
  });

  it("un SMS qui ne part pas : 502, on peut renouveler de nouveau", async () => {
    const cible = await t.membre("guichetier");
    const espion = vi
      .spyOn(t.sms, "envoyer")
      .mockRejectedValueOnce(new Error("passerelle en panne"));
    const rep = await envoyer(
      t,
      CHEMINS["equipe.pin_renouvele"],
      sup.jeton,
      await t.signer(sup, pinEvt(cible.id)),
    );
    expect(rep.status).toBe(502);
    expect(rep.body.code).toBe("SMS_ECHEC");
    espion.mockRestore();
    const retente = await envoyer(
      t,
      CHEMINS["equipe.pin_renouvele"],
      sup.jeton,
      await t.signer(sup, pinEvt(cible.id)),
    );
    expect(retente.status).toBe(200);
  });

  it("jamais pour un autre superviseur, ni hors de la gare, ni pour un compte désactivé", async () => {
    const avant = t.sms.messages().length;
    const autreSup = await t.membre("superviseur", { nom: "Autre Superviseur" });
    const protege = await envoyer(
      t,
      CHEMINS["equipe.pin_renouvele"],
      sup.jeton,
      await t.signer(sup, pinEvt(autreSup.id)),
    );
    expect(protege.status).toBe(403);
    expect(protege.body.code).toBe("ROLE_PROTEGE");

    const ailleurs = await t.membre("guichetier", { gareId: AUTRE_GARE });
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.pin_renouvele"],
          sup.jeton,
          await t.signer(sup, pinEvt(ailleurs.id)),
        )
      ).status,
    ).toBe(404);

    const parti = await t.membre("guichetier");
    await t.equipe.desactiver(parti.id);
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.pin_renouvele"],
          sup.jeton,
          await t.signer(sup, pinEvt(parti.id)),
        )
      ).status,
    ).toBe(404);
    expect(t.sms.messages().length).toBe(avant);
  });
});

describe("changer une affectation", () => {
  it("change le guichet et le rôle, et le journalise", async () => {
    const cible = await t.membre("guichetier", { nom: "Joseph Mbarga", guichetId: null });
    const rep = await envoyer(
      t,
      CHEMINS["equipe.affectation_changee"],
      sup.jeton,
      await t.signer(sup, affectationEvt(cible.id, GUICHET_3, "controleur")),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(c.SchemaResultatEquipe.parse(rep.body).personne).toMatchObject({
      personneId: cible.id,
      actif: true,
      smsProvisoireEnvoye: false,
    });
    expect(await t.equipe.trouver(cible.id)).toMatchObject({
      guichetId: GUICHET_3,
      role: "controleur",
    });
    expect(t.journalRepo.lignes.find((l) => l.type === "equipe.affectation_changee")!.resume).toBe(
      "Affectation de Joseph Mbarga changée · guichet 3 · rôle contrôleur",
    );
  });

  it("un guichet seul ou un rôle seul suffit ; rien du tout est refusé", async () => {
    const cible = await t.membre("guichetier", { guichetId: null });
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.affectation_changee"],
          sup.jeton,
          await t.signer(sup, affectationEvt(cible.id, GUICHET_3, null)),
        )
      ).status,
    ).toBe(200);
    expect(await t.equipe.trouver(cible.id)).toMatchObject({
      guichetId: GUICHET_3,
      role: "guichetier",
    });
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.affectation_changee"],
          sup.jeton,
          await t.signer(sup, affectationEvt(cible.id, null, "convoyeur")),
        )
      ).status,
    ).toBe(200);
    expect(await t.equipe.trouver(cible.id)).toMatchObject({
      guichetId: GUICHET_3,
      role: "convoyeur",
    });

    const vide = await envoyer(
      t,
      CHEMINS["equipe.affectation_changee"],
      sup.jeton,
      await t.signer(sup, affectationEvt(cible.id, null, null)),
    );
    expect(vide.status).toBe(422);
    expect(vide.body.code).toBe("AFFECTATION_VIDE");
  });

  it("seul le patron nomme un superviseur ; un guichet inconnu ou d'une autre gare est refusé", async () => {
    const cible = await t.membre("guichetier");
    const promu = await envoyer(
      t,
      CHEMINS["equipe.affectation_changee"],
      sup.jeton,
      await t.signer(sup, affectationEvt(cible.id, null, "superviseur")),
    );
    expect(promu.status).toBe(403);
    expect(promu.body.code).toBe("ROLE_INTERDIT");

    const inconnu = await envoyer(
      t,
      CHEMINS["equipe.affectation_changee"],
      sup.jeton,
      await t.signer(sup, affectationEvt(cible.id, "guichet-fantome", null)),
    );
    expect(inconnu.status).toBe(404);
    expect(inconnu.body.code).toBe("GUICHET_INCONNU");

    t.guichets.declarer({
      id: "guichet-ailleurs",
      rang: 1,
      gareId: AUTRE_GARE,
      gareCode: "YDE",
      compagnieId: "00000000-0000-4000-8000-0000000000c1",
    });
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.affectation_changee"],
          sup.jeton,
          await t.signer(sup, affectationEvt(cible.id, "guichet-ailleurs", null)),
        )
      ).status,
    ).toBe(404);
    expect(await t.equipe.trouver(cible.id)).toMatchObject({ role: "guichetier", guichetId: null });
  });

  it("un rôle hors équipe est refusé par la validation", async () => {
    const cible = await t.membre("guichetier");
    const evt = await t.signer(sup, affectationEvt(cible.id, null, "patron"));
    const rep = await envoyer(t, CHEMINS["equipe.affectation_changee"], sup.jeton, evt);
    expect(rep.status).toBe(422);
    expect(rep.body.code).toBe("EVENEMENT_INVALIDE");
  });
});

describe("désactiver un compte", () => {
  it("est immédiat : le jeton déjà émis ne passe plus, le patron est prévenu, tout est tracé", async () => {
    const cible = await t.membre("guichetier", { nom: "Joseph Mbarga" });
    expect((await lire(t, "/agence/caisse/session", cible.jeton)).status).toBe(404); // le jeton marche
    const rep = await envoyer(
      t,
      CHEMINS["equipe.compte_desactive"],
      sup.jeton,
      await t.signer(sup, desactivationEvt(cible.id)),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(c.SchemaResultatEquipe.parse(rep.body).personne).toMatchObject({
      personneId: cible.id,
      actif: false,
      smsProvisoireEnvoye: false,
    });

    expect((await lire(t, "/agence/caisse/session", cible.jeton)).status).toBe(401);
    expect(t.alertes.lignes).toHaveLength(1);
    expect(t.alertes.lignes[0]).toMatchObject({
      type: "compte_desactive",
      gareId: GARE,
      details: { personneId: cible.id, parId: sup.id },
    });
    expect(t.journalRepo.lignes.find((l) => l.type === "equipe.compte_desactive")!.resume).toBe(
      "Compte de Joseph Mbarga désactivé",
    );
    expect(
      t.auditRepo.lignes.some(
        (l) => l.action === "equipe.compte_desactive" && l.cibleId === cible.id,
      ),
    ).toBe(true);

    // Il disparaît de l'équipe.
    const equipe = c.SchemaSuperviseurEquipe.parse(
      (await lire(t, "/agence/superviseur/equipe", sup.jeton)).body,
    );
    expect(equipe.effectif).toBe(0);
  });

  it("jamais son propre compte, jamais un autre superviseur ; rejouer ne prévient pas deux fois le patron", async () => {
    const moi = await envoyer(
      t,
      CHEMINS["equipe.compte_desactive"],
      sup.jeton,
      await t.signer(sup, desactivationEvt(sup.id)),
    );
    expect(moi.status).toBe(403);
    expect(moi.body.code).toBe("AUTO_DESACTIVATION");
    expect((await t.personnes.trouverParId(sup.id))!.actif).toBe(true);

    const autreSup = await t.membre("superviseur");
    const protege = await envoyer(
      t,
      CHEMINS["equipe.compte_desactive"],
      sup.jeton,
      await t.signer(sup, desactivationEvt(autreSup.id)),
    );
    expect(protege.body.code).toBe("ROLE_PROTEGE");

    const cible = await t.membre("convoyeur");
    const evt = await t.signer(sup, desactivationEvt(cible.id));
    await envoyer(t, CHEMINS["equipe.compte_desactive"], sup.jeton, evt);
    const rejeu = await envoyer(t, CHEMINS["equipe.compte_desactive"], sup.jeton, evt);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(t.alertes.lignes).toHaveLength(1);
    // Une deuxième désactivation, d'un autre événement : la personne n'est plus dans l'équipe.
    const encore = await envoyer(
      t,
      CHEMINS["equipe.compte_desactive"],
      sup.jeton,
      await t.signer(sup, desactivationEvt(cible.id)),
    );
    expect(encore.status).toBe(404);
  });
});

describe("débloquer une personne", () => {
  it("lève le blocage après 3 PIN faux et le journalise", async () => {
    const cible = await t.membre("guichetier", { nom: "Joseph Mbarga" });
    bloquer(cible.id);
    const rep = await envoyer(
      t,
      CHEMINS["equipe.personne_debloquee"],
      sup.jeton,
      await t.signer(sup, deblocageEvt(cible.id)),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(c.SchemaResultatEquipe.parse(rep.body).personne).toEqual({
      personneId: cible.id,
      actif: true,
      pin: "ok",
      smsProvisoireEnvoye: false,
    });
    const p = (await t.personnes.trouverParId(cible.id))!;
    expect(p.bloqueJusqua).toBeNull();
    expect(p.echecsConnexion).toBe(0);
    expect(t.journalRepo.lignes.find((l) => l.type === "equipe.personne_debloquee")!.resume).toBe(
      "Compte de Joseph Mbarga débloqué après 3 PIN faux",
    );
  });

  it("une personne qui n'est pas bloquée, ou dont le blocage est fini : 409", async () => {
    const cible: CompteTest = await t.membre("guichetier");
    const libre = await envoyer(
      t,
      CHEMINS["equipe.personne_debloquee"],
      sup.jeton,
      await t.signer(sup, deblocageEvt(cible.id)),
    );
    expect(libre.status).toBe(409);
    expect(libre.body.code).toBe("COMPTE_NON_BLOQUE");

    bloquer(cible.id);
    t.horloge.avancer(16 * MS_PAR_MINUTE);
    expect(
      (
        await envoyer(
          t,
          CHEMINS["equipe.personne_debloquee"],
          sup.jeton,
          await t.signer(sup, deblocageEvt(cible.id)),
        )
      ).status,
    ).toBe(409);
  });
});
