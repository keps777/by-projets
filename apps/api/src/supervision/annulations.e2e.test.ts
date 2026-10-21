import { agence as c } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTRE_GARE, GUICHET_2, uuid } from "../caisse/testing/app-agence-test";
import { envoyer, evenement, lire, ouverture } from "../caisse/testing/outils";
import { MS_PAR_MINUTE, versIsoDouala } from "../caisse/temps";
import {
  billet,
  creerAppSupervisionTest,
  type AppSupervisionTest,
  type CompteTest,
  type SuperviseurTest,
} from "./testing/app-supervision-test";

let t: AppSupervisionTest;
let sup: SuperviseurTest;
let guichetier: CompteTest;

beforeAll(async () => {
  t = await creerAppSupervisionTest();
});
afterAll(() => t.fermer());

beforeEach(async () => {
  t.reinitialiser();
  sup = await t.superviseur();
  guichetier = await t.compte("guichetier", { nom: "Joseph Mbarga" });
});

const DECISION = "/agence/superviseur/annulations";

/** `annulation.decidee` à faire signer. */
function decision(
  demandeId: string,
  billetId: string,
  d: "rembourser" | "reporter" | "avoir" | "refuser",
  montant: number,
) {
  return t.evenementSuperviseur("annulation.decidee", sup, {
    demandeId,
    billetId,
    decision: d,
    montant,
  });
}

/** Demande déposée et décision signée, prête à envoyer. */
async function pret(
  d: "rembourser" | "reporter" | "avoir" | "refuser",
  montant: number,
  b = billet(),
) {
  const demandeId = await t.demanderAnnulation(guichetier, b);
  const evt = await t.signer(sup, decision(demandeId, b.billetId, d, montant));
  return { demandeId, evt, b };
}

describe("demande d'annulation par un guichetier", () => {
  it("enregistre la demande, répond comme le contrat et laisse une entrée au journal", async () => {
    t.registre.ajouter(billet());
    const evt = evenement(
      "annulation.demandee",
      guichetier.id,
      { demandeId: "dem-1", billetId: "billet-171", motif: "Le client a changé d'avis" },
      { at: t.iso() },
    );
    const rep = await envoyer(t, "/agence/annulations", guichetier.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatDemandeAnnulation.parse(rep.body);
    expect(lu).toMatchObject({ demandeId: "dem-1", statut: "en_attente_du_pin" });
    expect(lu.accuse).toMatchObject({ evenementId: evt.id, statut: "accepte" });

    // Rien n'est annulé tant qu'un superviseur n'a pas mis son PIN.
    expect((await t.registre.trouver("billet-171"))!.etat).toBe("paye");
    expect(t.registre.transitions).toEqual([]);
    const entree = t.journalRepo.lignes.find((l) => l.type === "annulation.demandee")!;
    expect(entree.resume).toBe(
      "Demande d'annulation du billet 0171 · « Le client a changé d'avis »",
    );
    expect(entree.validePar).toBeNull();
  });

  it("rejouer le même événement ne crée pas une deuxième demande", async () => {
    t.registre.ajouter(billet());
    const evt = evenement(
      "annulation.demandee",
      guichetier.id,
      { demandeId: "dem-1", billetId: "billet-171", motif: "Erreur de destination" },
      { at: t.iso() },
    );
    const premier = await envoyer(t, "/agence/annulations", guichetier.jeton, evt);
    const second = await envoyer(t, "/agence/annulations", guichetier.jeton, evt);
    expect(second.status).toBe(200);
    expect(second.body.accuse.statut).toBe("deja_recu");
    expect(second.body.demandeId).toBe(premier.body.demandeId);
    expect(t.demandes.lignes.size).toBe(1);
    expect(t.journalRepo.lignes.filter((l) => l.type === "annulation.demandee")).toHaveLength(1);
  });

  it("une seule demande en attente par billet", async () => {
    await t.demanderAnnulation(guichetier, billet(), { demandeId: "dem-1" });
    const evt = evenement(
      "annulation.demandee",
      guichetier.id,
      { demandeId: "dem-2", billetId: "billet-171", motif: "Encore" },
      { at: t.iso() },
    );
    const rep = await envoyer(t, "/agence/annulations", guichetier.jeton, evt);
    expect(rep.status).toBe(409);
    expect(rep.body).toMatchObject({ code: "DEMANDE_EXISTANTE", details: { demandeId: "dem-1" } });
    expect(t.demandes.lignes.size).toBe(1);
  });

  it("refuse un billet inconnu, d'une autre gare, ou déjà embarqué, voyagé ou annulé", async () => {
    const demander = (billetId: string) =>
      envoyer(
        t,
        "/agence/annulations",
        guichetier.jeton,
        evenement(
          "annulation.demandee",
          guichetier.id,
          { demandeId: `dem-${billetId}`, billetId, motif: "Test" },
          { at: t.iso() },
        ),
      );

    expect((await demander("fantome")).status).toBe(404);
    t.registre.ajouter(billet({ billetId: "ailleurs", gareId: AUTRE_GARE }));
    expect((await demander("ailleurs")).status).toBe(404);
    for (const etat of ["embarque", "voyage", "annule"] as const) {
      t.registre.ajouter(billet({ billetId: etat, etat }));
      const rep = await demander(etat);
      expect(rep.status, etat).toBe(409);
      expect(rep.body.code).toBe("BILLET_NON_ANNULABLE");
    }
    expect(t.demandes.lignes.size).toBe(0);
  });

  it("un guichetier ne signe pas à la place d'un autre et n'envoie pas un événement mal formé", async () => {
    t.registre.ajouter(billet());
    const autre = await t.compte("guichetier");
    const usurpe = await envoyer(
      t,
      "/agence/annulations",
      guichetier.jeton,
      evenement(
        "annulation.demandee",
        autre.id,
        { demandeId: "d", billetId: "billet-171", motif: "x" },
        { at: t.iso() },
      ),
    );
    expect(usurpe.status).toBe(403);
    expect(usurpe.body.code).toBe("AUTEUR_INCOHERENT");
    const sansMotif = await envoyer(
      t,
      "/agence/annulations",
      guichetier.jeton,
      evenement(
        "annulation.demandee",
        guichetier.id,
        { demandeId: "d", billetId: "billet-171", motif: "" },
        { at: t.iso() },
      ),
    );
    expect(sansMotif.status).toBe(422);
    expect(sansMotif.body.code).toBe("EVENEMENT_INVALIDE");
  });
});

describe("lecture d'une demande par le superviseur", () => {
  it("répond comme le contrat (SchemaSuperviseurAnnulation), départ lointain : remboursement intégral proposé", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet(), {
      motif: "Le client a changé d'avis",
    });
    const rep = await lire(t, `/agence/superviseur/annulations/${demandeId}`, sup.jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaSuperviseurAnnulation.parse(rep.body);
    expect(lu.demandeur).toEqual({ id: guichetier.id, nom: "Joseph Mbarga" });
    expect(lu.billet).toMatchObject({
      numero: "AFRI-DLA-261102-0171",
      sequence: 171,
      prix: 7_500,
      etat: "paye",
      motif: "Le client a changé d'avis",
    });
    expect(lu.billet.depart.siege).toBe(14);
    expect(lu.verifications).toMatchObject({
      scanne: false,
      siegeLiberable: true,
      remboursementIntegral: true,
      retenue: 0,
      aRendreCash: 7_500,
    });
    expect(lu.decisionsPossibles).toEqual(["rembourser", "reporter", "avoir", "refuser"]);
    expect(lu.decisionProposee).toBe("rembourser");
  });

  it("à moins d'une heure du départ, la retenue est de 25 % (classique) ou 50 % (VIP), arrondie au franc supérieur", async () => {
    const proche = versIsoDouala(t.horloge.maintenant().getTime() + 30 * MS_PAR_MINUTE);
    const classique = billet({
      billetId: "b-classique",
      prix: 7_510,
      depart: { ...billet().depart, heureDepart: proche },
    });
    const vip = billet({
      billetId: "b-vip",
      prix: 10_000,
      classe: "vip",
      depart: { ...billet().depart, heureDepart: proche },
    });
    const d1 = await t.demanderAnnulation(guichetier, classique);
    const d2 = await t.demanderAnnulation(guichetier, vip);

    const a = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${d1}`, sup.jeton)).body,
    );
    expect(a.verifications).toMatchObject({
      remboursementIntegral: false,
      retenue: 1_878,
      aRendreCash: 5_632,
    });
    const b = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${d2}`, sup.jeton)).body,
    );
    expect(b.verifications).toMatchObject({
      remboursementIntegral: false,
      retenue: 5_000,
      aRendreCash: 5_000,
    });
  });

  it("un billet payé en MoMo ne laisse rien à rendre en cash", async () => {
    const b = billet({ vendu: { ...billet().vendu, mode: "momo" } });
    const demandeId = await t.demanderAnnulation(guichetier, b);
    const lu = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, sup.jeton)).body,
    );
    expect(lu.verifications.aRendreCash).toBe(0);
    expect(lu.billet.vendu.mode).toBe("momo");
  });

  it("un billet déjà scanné ou embarqué ne peut qu'être refusé", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    t.registre.lignes.set("billet-171", { ...billet(), scanne: true });
    let lu = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, sup.jeton)).body,
    );
    expect(lu.verifications).toMatchObject({ scanne: true, siegeLiberable: false });
    expect(lu.decisionProposee).toBe("refuser");

    t.registre.lignes.set("billet-171", { ...billet(), etat: "embarque", scanne: true });
    lu = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, sup.jeton)).body,
    );
    expect(lu.decisionsPossibles).toEqual(["refuser"]);
  });

  it("les statistiques de l'agent viennent de la source de la gare", async () => {
    t.source.definirAnnulations(guichetier.id, { aujourdhui: 2, dixJours: 7, moyenneGuichets: 3 });
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    const lu = c.SchemaSuperviseurAnnulation.parse(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, sup.jeton)).body,
    );
    expect(lu.verifications).toMatchObject({
      annulationsAgentAujourdhui: 2,
      annulationsAgent10Jours: 7,
      moyenneGuichets: 3,
    });
  });

  it("une demande d'une autre gare ou inconnue : 404 ; le guichetier ne peut pas la lire", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    const ailleurs = await t.superviseur({ gareId: AUTRE_GARE });
    expect(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, ailleurs.jeton)).status,
    ).toBe(404);
    expect((await lire(t, "/agence/superviseur/annulations/inconnue", sup.jeton)).status).toBe(404);
    expect(
      (await lire(t, `/agence/superviseur/annulations/${demandeId}`, guichetier.jeton)).status,
    ).toBe(403);
  });

  it("l'accueil de la gare liste la demande, avec le numéro (NNNN), le montant et le motif", async () => {
    await t.demanderAnnulation(guichetier, billet(), { motif: "Doublon" });
    const rep = await lire(t, "/agence/superviseur/gare", sup.jeton);
    const gare = c.SchemaSuperviseurGare.parse(rep.body);
    expect(gare.demandes).toEqual([
      {
        genre: "annulation",
        demandeId: "dem-billet-171",
        billetId: "billet-171",
        billetSequence: 171,
        guichetRang: 2,
        montant: 7_500,
        motif: "Doublon",
      },
    ]);
  });
});

describe("décision du superviseur : aucune annulation sans son PIN", () => {
  it("rembourser : le billet est annulé, garde son numéro, le siège est libéré, la décision est journalisée avec la preuve", async () => {
    const { demandeId, evt } = await pret("rembourser", 7_500);
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const lu = c.SchemaResultatAnnulation.parse(rep.body);
    expect(lu).toMatchObject({
      billet: { billetId: "billet-171", numero: "AFRI-DLA-261102-0171", etat: "annule" },
      decision: "rembourser",
      montant: 7_500,
      siegeLibere: true,
    });
    expect(lu.accuse.statut).toBe("accepte");
    expect((await t.registre.trouver("billet-171"))!.numero).toBe("AFRI-DLA-261102-0171");
    expect(t.registre.transitions).toEqual([
      { billetId: "billet-171", action: "annuler", parId: sup.id },
    ]);
    expect(t.demandes.lignes.get(demandeId)).toMatchObject({
      statut: "decidee",
      decision: "rembourser",
      montant: 7_500,
      decideeParId: sup.id,
    });

    const entree = t.journalRepo.lignes.find((l) => l.type === "annulation.decidee")!;
    expect(entree.resume).toBe(
      "Annulation du billet 0171 · remboursement 7 500 F · validée par Marie Ngo Bayiha",
    );
    expect(entree.validePar).toMatchObject({ superviseurId: sup.id, methode: "pin" });
    expect(entree.validePar!.signature).toBe(
      (evt.donnees as { validePar: { signature: string } }).validePar.signature,
    );
    expect(await t.journal.verifier("00000000-0000-4000-8000-0000000000c1")).toMatchObject({
      valide: true,
    });
  });

  it("sans preuve du PIN : 422 si validePar manque, 403 s'il est inventé, et rien ne bouge", async () => {
    const { demandeId, b } = await pret("rembourser", 7_500);
    const sansValidePar = evenement(
      "annulation.decidee",
      sup.id,
      { demandeId, billetId: b.billetId, decision: "rembourser", montant: 7_500 },
      { at: t.iso() },
    );
    const manque = await envoyer(t, DECISION, sup.jeton, sansValidePar);
    expect(manque.status).toBe(422);
    expect(manque.body.code).toBe("EVENEMENT_INVALIDE");

    const invente = t.avecPreuve(
      decision(demandeId, b.billetId, "rembourser", 7_500),
      "a".repeat(72),
    );
    const faux = await envoyer(t, DECISION, sup.jeton, invente);
    expect(faux.status).toBe(403);
    expect(faux.body.code).toBe("PREUVE_PIN_INVALIDE");

    const courte = t.avecPreuve(
      decision(demandeId, b.billetId, "rembourser", 7_500),
      "ab".repeat(8),
    );
    expect((await envoyer(t, DECISION, sup.jeton, courte)).status).toBe(403);

    expect((await t.registre.trouver(b.billetId))!.etat).toBe("paye");
    expect(t.registre.transitions).toEqual([]);
    expect(t.demandes.lignes.get(demandeId)!.statut).toBe("en_attente");
    expect(t.journalRepo.lignes.some((l) => l.type === "annulation.decidee")).toBe(false);
    // Chaque refus laisse une trace dans l'audit.
    const refus = t.auditRepo.lignes.filter((l) => l.action === "superviseur.validation.refusee");
    expect(refus).toHaveLength(2);
    expect(refus[0]).toMatchObject({
      resultat: "refus",
      details: { type: "annulation.decidee", cause: "preuve_invalide" },
    });
  });

  it("la preuve ne vaut que pour l'événement signé : décision, montant, billet ou identifiant changés", async () => {
    const { demandeId, evt, b } = await pret("avoir", 3_000);
    const signature = (evt.donnees as { validePar: { signature: string } }).validePar.signature;
    const variantes: Record<string, ReturnType<typeof decision>> = {
      "autre décision": decision(demandeId, b.billetId, "rembourser", 3_000),
      "autre montant": decision(demandeId, b.billetId, "avoir", 7_500),
      "autre billet": decision(demandeId, "autre-billet", "avoir", 3_000),
      "autre demande": decision("autre-demande", b.billetId, "avoir", 3_000),
    };
    for (const [nom, v] of Object.entries(variantes)) {
      const rep = await envoyer(
        t,
        DECISION,
        sup.jeton,
        t.avecPreuve({ ...v, id: evt.id, at: evt.at }, signature),
      );
      expect(rep.status, nom).toBe(403);
      expect(rep.body.code, nom).toBe("PREUVE_PIN_INVALIDE");
    }
    // Un autre identifiant d'événement, ou une autre heure, invalident aussi la preuve.
    const autreId = { ...evt, id: uuid() };
    expect((await envoyer(t, DECISION, sup.jeton, autreId)).status).toBe(403);
    const autreHeure = { ...evt, at: t.iso(1_000) };
    expect((await envoyer(t, DECISION, sup.jeton, autreHeure)).status).toBe(403);
    expect(t.registre.transitions).toEqual([]);
    // L'événement tel qu'il a été signé passe.
    expect((await envoyer(t, DECISION, sup.jeton, evt)).status).toBe(200);
  });

  it("la preuve d'un superviseur ne sert pas à un autre, et l'empreinte n'est pas acceptée", async () => {
    const { demandeId, b } = await pret("refuser", 0);
    const autre = await t.superviseur({ nom: "Autre Superviseur" });

    // Preuve obtenue par un autre superviseur pour le même contenu : l'événement porte son identité.
    const evtDeAutre = await t.signer(
      autre,
      t.evenementSuperviseur("annulation.decidee", autre, {
        demandeId,
        billetId: b.billetId,
        decision: "refuser",
        montant: 0,
      }),
    );
    const parSup = await envoyer(t, DECISION, sup.jeton, evtDeAutre);
    expect(parSup.status).toBe(403);
    expect(parSup.body.code).toBe("AUTEUR_INCOHERENT");

    // validePar au nom d'un autre superviseur dans l'événement de sup.
    const emprunte = t.evenementSuperviseur("annulation.decidee", sup, {
      demandeId,
      billetId: b.billetId,
      decision: "refuser",
      montant: 0,
    });
    (emprunte.donnees as { validePar: { superviseurId: string } }).validePar.superviseurId =
      autre.id;
    const rep = await envoyer(t, DECISION, sup.jeton, t.avecPreuve(emprunte, "c".repeat(72)));
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("SUPERVISEUR_INCOHERENT");

    const empreinte = decision(demandeId, b.billetId, "refuser", 0);
    (empreinte.donnees as { validePar: { methode: string } }).validePar.methode = "empreinte";
    const parEmpreinte = await envoyer(
      t,
      DECISION,
      sup.jeton,
      t.avecPreuve(empreinte, "d".repeat(72)),
    );
    expect(parEmpreinte.status).toBe(403);
    expect(parEmpreinte.body.code).toBe("METHODE_NON_PRISE_EN_CHARGE");
  });

  it("une preuve vaut dix minutes, pas une de plus", async () => {
    const { evt } = await pret("rembourser", 7_500);
    t.horloge.avancer(10 * MS_PAR_MINUTE + 1_000);
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(rep.status).toBe(403);
    expect(rep.body.code).toBe("PREUVE_PIN_INVALIDE");
  });

  it("une preuve de neuf minutes passe encore", async () => {
    const { evt } = await pret("rembourser", 7_500);
    t.horloge.avancer(9 * MS_PAR_MINUTE);
    expect((await envoyer(t, DECISION, sup.jeton, evt)).status).toBe(200);
  });

  it("rejouer la décision répond deja_recu sans appliquer deux fois ; une autre décision sur la même demande : 409", async () => {
    const { demandeId, evt, b } = await pret("rembourser", 7_500);
    const premier = await envoyer(t, DECISION, sup.jeton, evt);
    const rejeu = await envoyer(t, DECISION, sup.jeton, evt);
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.accuse.statut).toBe("deja_recu");
    expect(rejeu.body.billet).toEqual(premier.body.billet);
    expect(t.registre.transitions).toHaveLength(1);

    const autre = await t.signer(sup, decision(demandeId, b.billetId, "refuser", 0));
    const rep = await envoyer(t, DECISION, sup.jeton, autre);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("DEJA_DECIDEE");
    expect((await t.registre.trouver(b.billetId))!.etat).toBe("annule");
  });

  it("deux décisions simultanées sur la même demande : une seule passe", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    const a = await t.signer(sup, decision(demandeId, "billet-171", "rembourser", 7_500));
    const b = await t.signer(sup, decision(demandeId, "billet-171", "avoir", 7_500));
    const [ra, rb] = await Promise.all([
      envoyer(t, DECISION, sup.jeton, a),
      envoyer(t, DECISION, sup.jeton, b),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect(t.registre.transitions).toHaveLength(1);
  });

  it("reporter : le billet est reporté à demain, sans montant", async () => {
    const { evt } = await pret("reporter", 0);
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(c.SchemaResultatAnnulation.parse(rep.body)).toMatchObject({
      billet: { etat: "reporte" },
      decision: "reporter",
      montant: 0,
      siegeLibere: true,
    });
    expect(t.journalRepo.lignes.find((l) => l.type === "annulation.decidee")!.resume).toBe(
      "Report du billet 0171 à demain · validé par Marie Ngo Bayiha",
    );
  });

  it("un report ou un refus ne rembourse rien ; un remboursement ne dépasse pas le prix", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    for (const [d, montant, code] of [
      ["reporter", 100, "MONTANT_NON_NUL"],
      ["refuser", 7_500, "MONTANT_NON_NUL"],
      ["rembourser", 7_501, "MONTANT_TROP_ELEVE"],
      ["avoir", 20_000, "MONTANT_TROP_ELEVE"],
    ] as const) {
      const evt = await t.signer(sup, decision(demandeId, "billet-171", d, montant));
      const rep = await envoyer(t, DECISION, sup.jeton, evt);
      expect(rep.status, `${d} ${montant}`).toBe(422);
      expect(rep.body.code).toBe(code);
    }
    expect(t.demandes.lignes.get(demandeId)!.statut).toBe("en_attente");
    expect(t.registre.transitions).toEqual([]);
  });

  it("avoir : le billet est annulé, l'avoir est tracé au franc près et ne sort pas de la caisse", async () => {
    const { evt } = await pret("avoir", 5_625);
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(c.SchemaResultatAnnulation.parse(rep.body)).toMatchObject({
      billet: { etat: "annule" },
      decision: "avoir",
      montant: 5_625,
    });
    expect(t.journalRepo.lignes.find((l) => l.type === "annulation.decidee")!.resume).toContain(
      "avoir 5 625 F",
    );
  });

  it("refuser : le billet reste valable, le siège reste pris", async () => {
    const { evt, demandeId } = await pret("refuser", 0);
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(c.SchemaResultatAnnulation.parse(rep.body)).toMatchObject({
      billet: { etat: "paye" },
      decision: "refuser",
      montant: 0,
      siegeLibere: false,
    });
    expect(t.registre.transitions).toEqual([]);
    expect(t.demandes.lignes.get(demandeId)).toMatchObject({
      statut: "decidee",
      decision: "refuser",
    });
  });

  it("un billet embarqué entre-temps ne s'annule pas : 409 et la demande reste à décider", async () => {
    const { demandeId, evt } = await pret("rembourser", 7_500);
    t.registre.lignes.set("billet-171", { ...billet(), etat: "embarque", scanne: true });
    const rep = await envoyer(t, DECISION, sup.jeton, evt);
    expect(rep.status).toBe(409);
    expect(rep.body.code).toBe("TRANSITION_INTERDITE");
    expect(t.demandes.lignes.get(demandeId)).toMatchObject({
      statut: "en_attente",
      decision: null,
      montant: null,
    });
    expect(t.registre.transitions).toEqual([]);
    // Le superviseur peut encore la refuser.
    const refus = await t.signer(sup, decision(demandeId, "billet-171", "refuser", 0));
    expect((await envoyer(t, DECISION, sup.jeton, refus)).status).toBe(200);
  });

  it("le billet doit être celui de la demande ; demande d'une autre gare ou inconnue : 404", async () => {
    const demandeId = await t.demanderAnnulation(guichetier, billet());
    t.registre.ajouter(billet({ billetId: "autre", sequence: 5 }));
    const autreBillet = await t.signer(sup, decision(demandeId, "autre", "rembourser", 1_000));
    const rep = await envoyer(t, DECISION, sup.jeton, autreBillet);
    expect(rep.status).toBe(422);
    expect(rep.body.code).toBe("BILLET_DIFFERENT");

    const ailleurs = await t.superviseur({ gareId: AUTRE_GARE });
    const evt = await t.signer(
      ailleurs,
      t.evenementSuperviseur("annulation.decidee", ailleurs, {
        demandeId,
        billetId: "billet-171",
        decision: "refuser",
        montant: 0,
      }),
    );
    expect((await envoyer(t, DECISION, ailleurs.jeton, evt)).status).toBe(404);

    const inconnue = await t.signer(sup, decision("inconnue", "billet-171", "refuser", 0));
    expect((await envoyer(t, DECISION, sup.jeton, inconnue)).status).toBe(404);
  });

  it("le guichetier ne peut pas décider, même avec une preuve valide", async () => {
    const { evt } = await pret("rembourser", 7_500);
    expect((await envoyer(t, DECISION, guichetier.jeton, evt)).status).toBe(403);
  });
});

describe("le remboursement cash sort de la caisse du guichetier", () => {
  async function caisseOuverte() {
    const rep = await envoyer(
      t,
      "/agence/caisse/ouverture",
      guichetier.jeton,
      ouverture(t, guichetier.id, { guichetId: GUICHET_2, fond: 25_000 }),
    );
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    return rep.body.session.sessionId as string;
  }

  it("rembourser en cash retranche le montant du cash attendu (annulation validée)", async () => {
    const sessionId = await caisseOuverte();
    const { evt } = await pret("rembourser", 7_500);
    await envoyer(t, DECISION, sup.jeton, evt);
    const session = c.SchemaCaisseSession.parse(
      (await lire(t, "/agence/caisse/session", guichetier.jeton)).body,
    );
    expect(session.sessionId).toBe(sessionId);
    expect(session.decompte.annulationsValidees).toEqual({ nombre: 1, montant: 7_500 });
    expect(session.cashAttendu).toBe(25_000 - 7_500);
  });

  it("rejouer la décision ne retranche pas deux fois ; un avoir, un report, un refus ou un billet MoMo ne touchent pas la caisse", async () => {
    await caisseOuverte();
    const { evt } = await pret("rembourser", 7_500);
    await envoyer(t, DECISION, sup.jeton, evt);
    await envoyer(t, DECISION, sup.jeton, evt);

    const momo = billet({
      billetId: "b-momo",
      sequence: 2,
      vendu: { ...billet().vendu, mode: "momo" },
    });
    const d2 = await t.demanderAnnulation(guichetier, momo);
    await envoyer(
      t,
      DECISION,
      sup.jeton,
      await t.signer(sup, decision(d2, "b-momo", "rembourser", 7_500)),
    );

    const b3 = billet({ billetId: "b-avoir", sequence: 3 });
    const d3 = await t.demanderAnnulation(guichetier, b3);
    await envoyer(
      t,
      DECISION,
      sup.jeton,
      await t.signer(sup, decision(d3, "b-avoir", "avoir", 7_500)),
    );

    const b4 = billet({ billetId: "b-report", sequence: 4 });
    const d4 = await t.demanderAnnulation(guichetier, b4);
    await envoyer(
      t,
      DECISION,
      sup.jeton,
      await t.signer(sup, decision(d4, "b-report", "reporter", 0)),
    );

    const session = c.SchemaCaisseSession.parse(
      (await lire(t, "/agence/caisse/session", guichetier.jeton)).body,
    );
    expect(session.decompte.annulationsValidees).toEqual({ nombre: 1, montant: 7_500 });
    expect(session.cashAttendu).toBe(17_500);
  });
});
