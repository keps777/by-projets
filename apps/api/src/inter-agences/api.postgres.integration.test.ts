import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Passagers } from "../billetterie/passagers";
import { FixturesPg } from "../caisse/testing/fixtures-pg";
import { ColisRepository } from "../colis/ports";
import { unColis } from "../colis/testing/contrat-ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { ReglementsMobileMemoire } from "./memoire";
import { CONTEXTE_MOMO_COMPAGNIE } from "./postgres";
import { ReglementsMobile } from "./ports";
import { ReglementsService } from "./reglements.service";
import { versIsoDouala } from "./temps";

/**
 * L'inter-agences sur PostgreSQL, par l'API : deux compagnies signent une convention (PIN des deux patrons),
 * un colis change de compagnie au scan, un billet voyageur est replacé gratuitement après un retard, une
 * contestation est tranchée par AfriMove, une invitation part une seule fois, puis le lundi le solde net est
 * réglé une seule fois par l'opérateur (simulé) — et l'API redémarre sur la même base sans rien repayer.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · inter-agences, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppPg;

  const PIN = "482915";
  const montage = () => creerAppPg({ url: base.url });
  const signature = () => ({
    pin: PIN,
    methode: "pin" as const,
    signeA: versIsoDouala(t.horloge.maintenant()),
  });
  const allerA = (iso: string): void => {
    const ecart = Date.parse(iso) - t.horloge.maintenant().getTime();
    if (ecart < 0) throw new Error(`L'horloge est déjà après ${iso}`);
    t.horloge.avancer(ecart);
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await montage();
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  it("de la convention au règlement du lundi, puis après un redémarrage", async () => {
    const fx = new FixturesPg(t.prisma);
    const chiffrement = t.resoudre(ChiffrementService);
    const passagers = t.resoudre(Passagers);
    const http = () => t.http();

    // Le réseau : Alpha (Douala → Bafoussam, Yaoundé → Bafoussam) et Oméga (Bafoussam → Bamenda).
    const alpha = await fx.compagnie();
    const omega = await fx.compagnie();
    await t.prisma.compagnie.update({ where: { id: alpha.id }, data: { nom: "Alpha" } });
    await t.prisma.compagnie.update({ where: { id: omega.id }, data: { nom: "Oméga" } });
    for (const [c, telephone, operateur] of [
      [alpha.id, "+237670000001", "mtn"],
      [omega.id, "+237670000002", "orange"],
    ] as const) {
      await t.prisma.compteMomoCompagnie.create({
        data: {
          compagnieId: c,
          telephoneChiffre: chiffrement.chiffrer(telephone, CONTEXTE_MOMO_COMPAGNIE),
          operateur,
        },
      });
    }
    const gareDla = await fx.gare(alpha.id, { ville: "Douala" });
    const gareYde = await fx.gare(alpha.id, { ville: "Yaoundé" });
    const gareBafA = await fx.gare(alpha.id, { ville: "Bafoussam" });
    const gareBafO = await fx.gare(omega.id, { ville: "Bafoussam" });
    const gareBam = await fx.gare(omega.id, { ville: "Bamenda" });
    const depart = async (
      compagnieId: string,
      origine: { id: string },
      destination: { id: string },
      heure: string,
      duree: number,
    ) => {
      const ligne = await fx.ligne(compagnieId, origine.id, destination.id);
      await t.prisma.ligne.update({ where: { id: ligne.id }, data: { dureeMinutes: duree } });
      const bus = await fx.bus(compagnieId);
      return (await fx.depart(ligne.id, { busId: bus.id, heureDepart: new Date(heure) })).id;
    };
    const dAlphaColis = await depart(alpha.id, gareDla, gareBafA, "2027-01-05T09:00:00.000Z", 300);
    const dAlphaYde = await depart(alpha.id, gareYde, gareBafA, "2027-01-05T10:00:00.000Z", 240);
    const dOmega = await depart(omega.id, gareBafO, gareBam, "2027-01-05T14:40:00.000Z", 150);
    const dOmegaSuivant = await depart(
      omega.id,
      gareBafO,
      gareBam,
      "2027-01-06T07:00:00.000Z",
      150,
    );

    const patronAlpha = await t.compte("patron", { compagnieId: alpha.id, gareId: null });
    const patronOmega = await t.compte("patron", { compagnieId: omega.id, gareId: null });
    const guichetier = await t.compte("guichetier", { compagnieId: alpha.id, gareId: gareDla.id });
    const convoyeurAlpha = await t.compte("convoyeur", { compagnieId: alpha.id, gareId: null });
    const convoyeurOmega = await t.compte("convoyeur", { compagnieId: omega.id, gareId: null });
    const afrimove = await t.compte("afrimove");

    // La convention : Alpha propose (PIN), Oméga signe (PIN) ; une seconde proposition est refusée.
    const parts = {
      colisType: { poidsKg: 3, prix: 3000 },
      lignes: [
        { troncon: "Douala → Bafoussam", parts: { [alpha.id]: 1400, [omega.id]: null } },
        { troncon: "Bafoussam → Bamenda", parts: { [alpha.id]: null, [omega.id]: 1200 } },
        { troncon: "Transbordement à Bafoussam", parts: { [alpha.id]: 200, [omega.id]: 200 } },
      ],
    };
    const voyageurs = {
      lignes: [
        {
          origine: "Yaoundé",
          via: "Bafoussam",
          destination: "Bamenda",
          premiere: alpha.id,
          parts: { [alpha.id]: 4000, [omega.id]: 3000 },
        },
      ],
    };
    const proposition = await http()
      .post("/inter-agences/conventions")
      .set(entetePg(patronAlpha.jeton))
      .send({
        compagnieId: omega.id,
        renouvellement: "trimestriel",
        parts,
        voyageurs,
        signature: signature(),
      });
    expect(proposition.status, JSON.stringify(proposition.body)).toBe(201);
    const conventionId = proposition.body.id as string;
    expect(
      await t.prisma.conventionInterAgences.findUniqueOrThrow({ where: { id: conventionId } }),
    ).toMatchObject({ statut: "proposee", activeLe: null, version: 1 });
    const faux = await http()
      .post(`/inter-agences/conventions/${conventionId}/signatures`)
      .set(entetePg(patronOmega.jeton))
      .send({ signature: { ...signature(), pin: "111111" } });
    expect(faux.status).toBe(403);
    const signee = await http()
      .post(`/inter-agences/conventions/${conventionId}/signatures`)
      .set(entetePg(patronOmega.jeton))
      .send({ signature: signature() });
    expect(signee.status, JSON.stringify(signee.body)).toBe(200);
    const ligneConvention = await t.prisma.conventionInterAgences.findUniqueOrThrow({
      where: { id: conventionId },
      include: { signatures: { orderBy: { rang: "asc" } } },
    });
    expect(ligneConvention).toMatchObject({ statut: "active", version: 2 });
    expect(ligneConvention.signatures.map((s) => s.compagnieId)).toEqual([alpha.id, omega.id]);
    const doublon = await http()
      .post("/inter-agences/conventions")
      .set(entetePg(patronOmega.jeton))
      .send({
        compagnieId: alpha.id,
        renouvellement: "annuel",
        parts,
        voyageurs,
        signature: signature(),
      });
    expect(doublon.status).toBe(409);
    expect(doublon.body.code).toBe("convention_existante");
    expect(
      await t.prisma.conventionInterAgences.count({
        where: { compagnieAId: { in: [alpha.id, omega.id] } },
      }),
    ).toBe(1);

    // Les opérations ont lieu le mardi 5 janvier (09:00 à Douala).
    allerA("2027-01-05T08:00:00.000Z");

    // Le colis d'Alpha change de compagnie à Bafoussam : enregistré une fois, passage de témoin scanné.
    const expediteur = await t.compte("voyageur", { telephone: "+237691221008" });
    const colis = unColis({
      compagnieId: alpha.id,
      origine: { id: gareDla.id, code: gareDla.code, nom: gareDla.nom, ville: gareDla.ville },
      destination: {
        id: gareBafA.id,
        code: gareBafA.code,
        nom: gareBafA.nom,
        ville: gareBafA.ville,
      },
      expediteurId: expediteur.id,
      auteurId: expediteur.id,
      departId: dAlphaColis,
    });
    await t.resoudre(ColisRepository).ajouter(colis);
    const plan = await http()
      .post("/inter-agences/colis")
      .set(entetePg(guichetier.jeton))
      .send({ colisId: colis.id, departIds: [dAlphaColis, dOmega] });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    const rejeuPlan = await http()
      .post("/inter-agences/colis")
      .set(entetePg(guichetier.jeton))
      .send({ colisId: colis.id, departIds: [dAlphaColis, dOmega] });
    expect(rejeuPlan.status).toBe(409);
    expect(rejeuPlan.body.code).toBe("deja_enregistre");
    const recuAvant = await http()
      .post("/inter-agences/transferts")
      .set(entetePg(convoyeurOmega.jeton))
      .send({ colisId: colis.id, sens: "recu", compagnie: "Oméga" });
    expect(recuAvant.status).toBe(409);
    expect(recuAvant.body.code).toBe("remise_non_scannee");
    const remis = await http()
      .post("/inter-agences/transferts")
      .set(entetePg(convoyeurAlpha.jeton))
      .send({ colisId: colis.id, sens: "remis_a", compagnie: "Oméga", lieu: "Bafoussam" });
    expect(remis.status, JSON.stringify(remis.body)).toBe(200);
    const recu = await http()
      .post("/inter-agences/transferts")
      .set(entetePg(convoyeurOmega.jeton))
      .send({ colisId: colis.id, sens: "recu", compagnie: "Oméga", lieu: "Bafoussam" });
    expect(recu.status, JSON.stringify(recu.body)).toBe(200);
    const enBase = await t.prisma.planColisInterAgences.findUniqueOrThrow({
      where: { colisId: colis.id },
    });
    expect(enBase.compagnieIds.sort()).toEqual([alpha.id, omega.id].sort());
    expect(JSON.stringify(enBase.transferts)).toContain("Bafoussam");
    expect((enBase.transferts as { recu: unknown }[])[0]!.recu).not.toBeNull();
    // Le colis n'est visible que des deux compagnies du plan.
    const patronTiers = await t.compte("patron", {
      compagnieId: (await fx.compagnie()).id,
      gareId: null,
    });
    expect(
      (await http().get(`/inter-agences/colis/${colis.id}`).set(entetePg(patronTiers.jeton)))
        .status,
    ).toBe(404);
    expect(
      (await http().get(`/inter-agences/colis/${colis.id}`).set(entetePg(patronOmega.jeton)))
        .status,
    ).toBe(200);

    // Le billet de Yaoundé à Bamenda via Bafoussam : le premier bus arrive trop tard, replacement gratuit.
    const billet = await fx.billet(
      { compagnieId: alpha.id, gareId: gareYde.id, departId: dAlphaYde },
      {
        prix: 7000,
        passagerChiffre: passagers.chiffrer({
          nom: "Éloïse Tchamba",
          telephone: "+237699887766",
          pieceQuatreDerniers: null,
        }),
      },
    );
    const equipe = await http()
      .post("/inter-agences/billets")
      .set(entetePg(guichetier.jeton))
      .send({ billet: billet.numero, departId: dOmega });
    expect(equipe.status, JSON.stringify(equipe.body)).toBe(201);
    expect(
      (await t.prisma.billetCorrespondance.findUniqueOrThrow({ where: { id: billet.id } }))
        .voyageurNomChiffre,
    ).not.toContain("Tchamba");
    const embarque = await http()
      .post(`/inter-agences/billets/${billet.numero}/embarquements`)
      .set(entetePg(convoyeurAlpha.jeton))
      .send({ rang: 1 });
    expect(embarque.status, JSON.stringify(embarque.body)).toBe(200);
    const arrivee = await http()
      .post(`/inter-agences/billets/${billet.numero}/arrivee-premier-bus`)
      .set(entetePg(convoyeurOmega.jeton))
      .send({ arriveeLe: "2027-01-05T15:56:00.000+01:00" });
    expect(arrivee.status, JSON.stringify(arrivee.body)).toBe(200);
    expect(arrivee.body.issue).toEqual({ type: "replacement", retardMinutes: 16 });
    const replace = await t.prisma.billetCorrespondance.findUniqueOrThrow({
      where: { id: billet.id },
    });
    expect(replace.replacement).toMatchObject({
      departId: dOmegaSuivant,
      retardataireId: alpha.id,
    });
    const rejeuArrivee = await http()
      .post(`/inter-agences/billets/${billet.numero}/arrivee-premier-bus`)
      .set(entetePg(convoyeurOmega.jeton))
      .send({ arriveeLe: "2027-01-05T15:00:00.000+01:00" });
    expect(rejeuArrivee.body.issue.type).toBe("replacement");
    const embarqueSuite = await http()
      .post(`/inter-agences/billets/${billet.numero}/embarquements`)
      .set(entetePg(convoyeurOmega.jeton))
      .send({ rang: 2 });
    expect(embarqueSuite.status, JSON.stringify(embarqueSuite.body)).toBe(200);

    // Alpha conteste son relevé ; AfriMove rejette : les opérations reviennent au règlement.
    const contestation = await http()
      .post("/inter-agences/reglement/contestations")
      .set(entetePg(patronAlpha.jeton))
      .send({ motif: "Je veux vérifier le relevé de la semaine" });
    expect(contestation.status, JSON.stringify(contestation.body)).toBeLessThan(300);
    const reference = contestation.body.reference as string;
    expect(reference).toMatch(/^CTX-270105-\d+$/);
    const ouverte = await t.prisma.contestationReglement.findUniqueOrThrow({
      where: { reference },
    });
    expect(ouverte).toMatchObject({ statut: "ouverte", recevable: true, compagnieId: alpha.id });
    expect(ouverte.cles.length).toBeGreaterThan(0);
    const refus = await http()
      .post(`/inter-agences/contestations/${reference}/resolution`)
      .set(entetePg(patronAlpha.jeton))
      .send({ issue: "rejetee" });
    expect(refus.status).toBe(403);
    const tranchee = await http()
      .post(`/inter-agences/contestations/${reference}/resolution`)
      .set(entetePg(afrimove.jeton))
      .send({ issue: "rejetee" });
    expect(tranchee.status, JSON.stringify(tranchee.body)).toBe(200);
    expect(
      await t.prisma.contestationReglement.findUniqueOrThrow({ where: { reference } }),
    ).toMatchObject({ statut: "rejetee", resoluePar: afrimove.id });
    const rejeuResolution = await http()
      .post(`/inter-agences/contestations/${reference}/resolution`)
      .set(entetePg(afrimove.jeton))
      .send({ issue: "accordee" });
    expect(rejeuResolution.status).toBe(409);

    // Une invitation par compagnie, numéro et jour : la seconde demande rend la première.
    const invitation = { compagnie: "Bêta Transport", patron: "+237655000777" };
    const inv1 = await http()
      .post("/inter-agences/invitations")
      .set(entetePg(patronAlpha.jeton))
      .send(invitation);
    const inv2 = await http()
      .post("/inter-agences/invitations")
      .set(entetePg(patronAlpha.jeton))
      .send(invitation);
    expect(inv1.status, JSON.stringify(inv1.body)).toBeLessThan(300);
    expect(inv2.body.reference).toBe(inv1.body.reference);
    expect(await t.prisma.invitationCompagnie.count({ where: { compagnieId: alpha.id } })).toBe(1);

    // Le lundi 11 janvier à 08:30 : le solde net est réglé, une seule fois.
    allerA("2027-01-11T07:30:00.000Z");
    const reglements = t.resoudre(ReglementsService);
    expect(await reglements.executer()).toEqual({ arretes: 1, payes: 1 });
    const operateur = t.resoudre(ReglementsMobile) as ReglementsMobileMemoire;
    expect(operateur.envoyes.size).toBe(1);
    const regle = await t.prisma.reglementInterAgences.findFirstOrThrow({
      where: { conventionId },
    });
    expect(regle).toMatchObject({ etat: "paye", reference: "MOMO-000001" });
    expect(regle.montant).toBeGreaterThan(0);
    const lignes = regle.lignes as { cle: string; debiteurId: string; montant: number }[];
    expect(lignes.length).toBeGreaterThanOrEqual(3);
    expect(await t.prisma.creanceReglee.count({ where: { reglementCle: regle.cle } })).toBe(
      lignes.length,
    );
    const net = lignes.reduce(
      (s, l) => s + (l.debiteurId === alpha.id ? l.montant : -l.montant),
      0,
    );
    expect(regle.montant).toBe(Math.abs(net));
    const ordre = [...operateur.envoyes.values()][0]!;
    expect(ordre.cle).toBe(regle.cle);
    expect(ordre.montant).toBe(regle.montant);
    expect([ordre.debiteur.momo.telephone, ordre.creancier.momo.telephone].sort()).toEqual([
      "+237670000001",
      "+237670000002",
    ]);
    // Rejouer la tâche ne repaie rien.
    expect(await reglements.executer()).toEqual({ arretes: 0, payes: 0 });
    expect(operateur.envoyes.size).toBe(1);
    const releve = await http().get("/inter-agences/reglement").set(entetePg(patronOmega.jeton));
    expect(releve.status, JSON.stringify(releve.body)).toBe(200);

    // Redémarrage : une autre instance de l'API sur la même base ne repaie rien et retrouve tout.
    await t.fermer();
    t = await montage();
    allerA("2027-01-11T07:30:00.000Z");
    const apres = t.resoudre(ReglementsService);
    expect(await apres.executer()).toEqual({ arretes: 0, payes: 0 });
    expect((t.resoudre(ReglementsMobile) as ReglementsMobileMemoire).envoyes.size).toBe(0);
    const convention = await http()
      .get(`/inter-agences/conventions/${conventionId}`)
      .set(entetePg(patronOmega.jeton));
    expect(convention.status, JSON.stringify(convention.body)).toBe(200);
    const suivi = await http()
      .get(`/inter-agences/colis/${colis.id}`)
      .set(entetePg(patronAlpha.jeton));
    expect(suivi.status, JSON.stringify(suivi.body)).toBe(200);
    const billets = await http().get("/inter-agences/billets").set(entetePg(patronOmega.jeton));
    expect(billets.status).toBe(200);
    expect(billets.body.billets).toHaveLength(1);
  }, 90_000);
});
