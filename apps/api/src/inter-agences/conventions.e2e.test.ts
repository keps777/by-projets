import { colis as contrats } from "@afrimove/contrats";
import type { ReferentielColis } from "../colis/ports";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALPHA,
  BETA,
  JOUR,
  OMEGA,
  PARTS_CONVENTION,
  allerA,
  creerAppInterAgencesTest,
  dernierSmsA,
  entete,
  proposition,
  type AppInterAgencesTest,
} from "./testing/app-inter-agences-test";

describe("conventions : proposition, signature des deux patrons, sortie", () => {
  let t: AppInterAgencesTest;

  beforeEach(async () => {
    t = await creerAppInterAgencesTest();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const proposer = (jeton: string, corps: Record<string, unknown> = {}) =>
    t
      .http()
      .post("/inter-agences/conventions")
      .set(entete(jeton))
      .send({ ...proposition(), ...t.signature(), ...corps });

  const signer = (jeton: string, id: string, corps: Record<string, unknown> = t.signature()) =>
    t.http().post(`/inter-agences/conventions/${id}/signatures`).set(entete(jeton)).send(corps);

  const lire = (jeton: string, id: string) =>
    t.http().get(`/inter-agences/conventions/${id}`).set(entete(jeton));

  describe("la convention n'existe qu'avec les deux signatures", () => {
    it("Alpha propose avec son PIN : la convention attend Oméga et n'est lisible par personne", async () => {
      const rep = await proposer(t.equipe.patronAlpha.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      expect(rep.body).toMatchObject({
        statut: "proposee",
        proposeePar: "Alpha",
        avec: "Oméga",
        renouvellement: "renouvelée chaque trimestre",
        signatures: 1,
      });
      // Pas encore une convention : le contrat n'a pas de statut « à signer ».
      expect((await lire(t.equipe.patronAlpha.jeton, rep.body.id)).status).toBe(404);
      expect((await lire(t.equipe.patronOmega.jeton, rep.body.id)).status).toBe(404);
      expect(await t.conventions.aUneConventionActive(ALPHA)).toBe(false);
    });

    it("le patron d'Oméga reçoit un SMS et retrouve la proposition dans sa liste", async () => {
      const rep = await proposer(t.equipe.patronAlpha.jeton);
      expect(dernierSmsA(t, t.equipe.patronOmega.telephone)).toMatch(
        /Alpha vous propose une convention/,
      );
      const liste = await t
        .http()
        .get("/inter-agences/propositions")
        .set(entete(t.equipe.patronOmega.jeton));
      expect(liste.status).toBe(200);
      expect(liste.body.propositions.map((p: { id: string }) => p.id)).toEqual([rep.body.id]);
      // Une troisième compagnie n'en voit aucune.
      const beta = await t
        .http()
        .get("/inter-agences/propositions")
        .set(entete(t.equipe.patronBeta.jeton));
      expect(beta.body.propositions).toEqual([]);
    });

    it("Oméga signe avec son PIN : la convention est en vigueur et suit le contrat complet", async () => {
      const id = await t.conventionEnVigueur();
      const rep = await lire(t.equipe.patronOmega.jeton, id);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const c = contrats.SchemaConvention.parse(rep.body);

      expect(c.titre).toBe("Convention Alpha – Oméga");
      expect(c.statut).toBe("active");
      expect(c.renouvellement).toBe("renouvelée chaque trimestre");
      expect(c.signeLe).toBe("2026-11-02T09:00:00.000+01:00");
      expect(c.pied).toBe(
        "Texte complet (2 pages) et historique des règlements dans les exports du comptable.",
      );
      expect(c.parts.entetes).toEqual(["tronçon", "Alpha", "Oméga"]);
      expect(c.parts.aide).toBe("colis · 3 kg type");
      expect(c.parts.lignes).toEqual([
        { troncon: "Douala → Bafoussam", parts: { Alpha: 1400, Oméga: null } },
        { troncon: "Bafoussam → Bamenda", parts: { Alpha: null, Oméga: 1200 } },
        { troncon: "Transbordement à Bafoussam", parts: { Alpha: 200, Oméga: 200 } },
      ]);
      expect(c.parts.total).toEqual({
        libelle: "Client paie 3 000 · AfriMove 150 (payé par l'émetteur)",
        prixClient: 3000,
        fraisAfrimove: 150,
        parts: { Alpha: 1600, Oméga: 1400 },
      });
      // Pas de réglement ni d'échange : le trimestre est vide, sans litige ni délai.
      expect(c.trimestre).toEqual({
        colisEchanges: 0,
        litiges: 0,
        delaiLitigeJours: null,
        netRecu: 0,
        lundis: 0,
      });
    });

    it("les cinq règles portent la ponctuation des titres de la planche", async () => {
      const id = await t.conventionEnVigueur();
      const c = contrats.SchemaConvention.parse((await lire(t.equipe.patronAlpha.jeton, id)).body);
      expect(c.regles.titre).toBe("Les 5 règles");
      expect(c.regles.liste.map((r) => `${r.rang} · ${r.titre}`)).toEqual([
        "1 · Responsabilité au scan.",
        "2 · Règlement le lundi 08:00",
        "3 · Correspondance voyageurs :",
        "4 · Un seul numéro",
        "5 · Sortie",
      ]);
      expect(c.regles.liste[0]?.texte).toBe(
        "Le colis est à celui dont le dernier scan est enregistré. Perte ou casse : il rembourse le client à la valeur déclarée (max 50 000).",
      );
      expect(c.regles.liste[2]?.texte).toBe(
        "25 min garanties · le second bus attend 15 min · au-delà, replacement gratuit sur le départ suivant, à la charge du retardataire.",
      );
      expect(c.regles.liste[4]?.texte).toBe(
        "à tout moment avec 30 jours de préavis · les colis en route vont au bout.",
      );
    });

    it("chaque patron se reconnaît dans les signatures (`moi`), avec le nom du signataire", async () => {
      const id = await t.conventionEnVigueur();
      const vuAlpha = contrats.SchemaConvention.parse(
        (await lire(t.equipe.patronAlpha.jeton, id)).body,
      );
      expect(vuAlpha.signatures.map((s) => [s.compagnie, s.signataire, s.moi, s.parPin])).toEqual([
        ["Alpha", "Kamga Paul", true, true],
        ["Oméga", "Tchoua Henri", false, true],
      ]);
      const vuOmega = contrats.SchemaConvention.parse(
        (await lire(t.equipe.patronOmega.jeton, id)).body,
      );
      expect(vuOmega.signatures.map((s) => s.moi)).toEqual([false, true]);
    });

    it("Alpha est prévenue par SMS de la signature d'Oméga", async () => {
      await t.conventionEnVigueur();
      expect(dernierSmsA(t, t.equipe.patronAlpha.telephone)).toMatch(
        /convention avec Oméga est signée/,
      );
    });
  });

  describe("le PIN prouve la signature", () => {
    it("sans signature : 401 PIN_REQUIS, rien n'est créé", async () => {
      const rep = await t
        .http()
        .post("/inter-agences/conventions")
        .set(entete(t.equipe.patronAlpha.jeton))
        .send(proposition());
      expect(rep.status).toBe(401);
      expect(rep.body.code).toBe("PIN_REQUIS");
      expect(t.conventionsRepo.lignes.size).toBe(0);
    });

    it("PIN faux : 403, rien n'est créé ; au troisième essai le PIN est bloqué (423)", async () => {
      for (let i = 0; i < 2; i++) {
        const rep = await proposer(t.equipe.patronAlpha.jeton, t.signature("111222"));
        expect(rep.status).toBe(403);
        expect(rep.body.code).toBe("PIN_INCORRECT");
      }
      expect(t.conventionsRepo.lignes.size).toBe(0);
      expect((await proposer(t.equipe.patronAlpha.jeton, t.signature("111222"))).status).toBe(403);
      // Même avec le bon PIN, le compte reste bloqué.
      const bloque = await proposer(t.equipe.patronAlpha.jeton);
      expect(bloque.status).toBe(423);
      expect(bloque.body.code).toBe("PIN_BLOQUE");
    });

    it("la signature d'Oméga exige son propre PIN", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      const faux = await signer(t.equipe.patronOmega.jeton, p.body.id, t.signature("999000"));
      expect(faux.status).toBe(403);
      expect(t.conventionsRepo.lignes.get(p.body.id)?.statut).toBe("proposee");
      expect((await signer(t.equipe.patronOmega.jeton, p.body.id)).status).toBe(200);
    });

    it("une signature trop ancienne (heure de l'appareil) est refusée : elle ne se rejoue pas", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      const rep = await signer(
        t.equipe.patronOmega.jeton,
        p.body.id,
        t.signature("482915", -30 * 60_000),
      );
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("SIGNATURE_PERIMEE");
    });
  });

  describe("qui peut signer", () => {
    it("la compagnie qui propose ne peut pas signer à la place de l'autre", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      const rep = await signer(t.equipe.patronAlpha.jeton, p.body.id);
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("attente_de_l_autre");
    });

    it("une troisième compagnie ne voit pas la proposition : « convention introuvable »", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      const rep = await signer(t.equipe.patronBeta.jeton, p.body.id);
      expect(rep.status).toBe(404);
      expect(rep.body.code).toBe("convention_introuvable");
    });

    it("signer deux fois : 409", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      await signer(t.equipe.patronOmega.jeton, p.body.id);
      const encore = await signer(t.equipe.patronOmega.jeton, p.body.id);
      expect(encore.status).toBe(409);
      expect(encore.body.code).toBe("deja_signee");
    });

    it("un guichetier ou un convoyeur ne signent pas : 403", async () => {
      const p = await proposer(t.equipe.patronAlpha.jeton);
      expect((await signer(t.equipe.convoyeurOmega.jeton, p.body.id)).status).toBe(403);
      expect((await proposer(t.equipe.guichetierAlpha.jeton)).status).toBe(403);
    });
  });

  describe("proposition invalide", () => {
    it("les parts doivent faire le prix du colis type : 422", async () => {
      const rep = await proposer(t.equipe.patronAlpha.jeton, {
        parts: { ...PARTS_CONVENTION, colisType: { poidsKg: 3, prix: 3100 } },
      });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("parts_invalides");
    });

    it("une compagnie inconnue, ou la sienne : refus", async () => {
      expect((await proposer(t.equipe.patronAlpha.jeton, { compagnieId: "inconnue" })).status).toBe(
        404,
      );
      const soi = await proposer(t.equipe.patronAlpha.jeton, { compagnieId: ALPHA });
      expect(soi.status).toBe(422);
      expect(soi.body.code).toBe("meme_compagnie");
    });

    it("une seule convention ouverte par paire, quel que soit l'ordre", async () => {
      await proposer(t.equipe.patronAlpha.jeton);
      const doublon = await proposer(t.equipe.patronAlpha.jeton);
      expect(doublon.status).toBe(409);
      expect(doublon.body.code).toBe("convention_existante");
      const inverse = await proposer(t.equipe.patronOmega.jeton, { compagnieId: ALPHA });
      expect(inverse.status).toBe(409);
    });

    it("une ligne voyageurs doit nommer une des deux compagnies en première", async () => {
      const rep = await proposer(t.equipe.patronAlpha.jeton, {
        voyageurs: {
          lignes: [
            {
              origine: "Yaoundé",
              via: "Bafoussam",
              destination: "Bamenda",
              premiere: BETA,
              parts: { [ALPHA]: 4000, [OMEGA]: 3000 },
            },
          ],
        },
      });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("ligne_voyageurs_invalide");
    });

    it("corps illisible : 400 avec le chemin du champ", async () => {
      const rep = await proposer(t.equipe.patronAlpha.jeton, {
        renouvellement: "mensuel",
        parts: { colisType: { poidsKg: 0, prix: 3000 }, lignes: [] },
      });
      expect(rep.status).toBe(400);
      expect(JSON.stringify(rep.body.details)).toContain("renouvellement");
      expect(JSON.stringify(rep.body.details)).toContain("parts.colisType.poidsKg");
    });
  });

  describe("sortie avec 30 jours de préavis", () => {
    it("la sortie prend effet 30 jours plus tard, la convention reste active entre-temps", async () => {
      const id = await t.conventionEnVigueur();
      const rep = await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronOmega.jeton))
        .send(t.signature());
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(contrats.SchemaConvention.parse(rep.body).statut).toBe("active");
      expect(t.conventionsRepo.lignes.get(id)?.denonciation).toEqual({
        par: OMEGA,
        le: "2026-11-02T09:00:00.000+01:00",
        effetLe: "2026-12-02T09:00:00.000+01:00",
      });
      expect(dernierSmsA(t, t.equipe.patronAlpha.telephone)).toMatch(/Oméga quitte la convention/);

      allerA(t, "2026-12-02T08:59:00.000+01:00");
      expect(await t.taches.appliquerSorties()).toBe(0);
      expect(t.conventionsRepo.lignes.get(id)?.statut).toBe("active");

      allerA(t, "2026-12-02T09:00:00.000+01:00");
      expect(await t.taches.appliquerSorties()).toBe(1);
      expect(t.conventionsRepo.lignes.get(id)?.statut).toBe("resiliee");
      const apres = contrats.SchemaConvention.parse(
        (await lire(t.equipe.patronAlpha.jeton, id)).body,
      );
      expect(apres.statut).toBe("resiliee");
      expect(await t.conventions.aUneConventionActive(ALPHA)).toBe(false);
    });

    it("la sortie se signe du PIN et ne se demande pas deux fois", async () => {
      const id = await t.conventionEnVigueur();
      const faux = await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronAlpha.jeton))
        .send(t.signature("000999"));
      expect(faux.status).toBe(403);
      expect(t.conventionsRepo.lignes.get(id)?.denonciation).toBeNull();
      const ok = await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronAlpha.jeton))
        .send(t.signature());
      expect(ok.status).toBe(200);
      const encore = await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronOmega.jeton))
        .send(t.signature());
      expect(encore.status).toBe(409);
    });

    it("une compagnie tierce ne peut pas dénoncer la convention des autres", async () => {
      const id = await t.conventionEnVigueur();
      const rep = await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronBeta.jeton))
        .send(t.signature());
      expect(rep.status).toBe(404);
      expect(t.conventionsRepo.lignes.get(id)?.denonciation).toBeNull();
    });

    it("une fois résiliée, on peut proposer une nouvelle convention à la même compagnie", async () => {
      const id = await t.conventionEnVigueur();
      await t
        .http()
        .post(`/inter-agences/conventions/${id}/denonciation`)
        .set(entete(t.equipe.patronAlpha.jeton))
        .send(t.signature());
      allerA(t, "2026-12-02T09:00:00.000+01:00");
      await t.taches.appliquerSorties();
      expect((await proposer(t.equipe.patronAlpha.jeton)).status).toBe(201);
    });
  });

  describe("inviter une compagnie", () => {
    it("envoie un SMS au patron invité et rend une référence", async () => {
      const rep = await t
        .http()
        .post("/inter-agences/invitations")
        .set(entete(t.equipe.patronAlpha.jeton))
        .send({ compagnie: "Transports Delta", patron: "677 12 34 56" });
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const accuse = contrats.SchemaInvitationCompagnieEnvoyee.parse(rep.body);
      expect(accuse.reference).toBe("INV-261102-1");
      expect(accuse.envoyeeLe).toBe("2026-11-02T09:00:00.000+01:00");
      expect(dernierSmsA(t, "+237677123456")).toMatch(/Alpha invite Transports Delta/);
    });

    it("la même invitation du jour ne part qu'une fois ; un autre jour, une nouvelle référence", async () => {
      const envoyer = () =>
        t
          .http()
          .post("/inter-agences/invitations")
          .set(entete(t.equipe.patronAlpha.jeton))
          .send({ compagnie: "Transports Delta", patron: "+237677123456" });
      const un = await envoyer();
      const deux = await envoyer();
      expect(deux.body.reference).toBe(un.body.reference);
      expect(t.sms.messages().filter((m) => m.telephone === "+237677123456")).toHaveLength(1);
      t.horloge.avancer(JOUR);
      const lendemain = await envoyer();
      expect(lendemain.body.reference).toBe("INV-261103-1");
    });

    it("refuse un numéro invalide (422) et un corps vide (400)", async () => {
      const mauvais = await t
        .http()
        .post("/inter-agences/invitations")
        .set(entete(t.equipe.patronAlpha.jeton))
        .send({ compagnie: "Delta", patron: "abc" });
      expect(mauvais.status).toBe(422);
      expect(mauvais.body.code).toBe("telephone_invalide");
      const vide = await t
        .http()
        .post("/inter-agences/invitations")
        .set(entete(t.equipe.patronAlpha.jeton))
        .send({});
      expect(vide.status).toBe(400);
    });
  });

  describe("branchement du module colis", () => {
    it("« Autre ville via une autre compagnie » n'est proposé qu'aux compagnies liées par une convention", async () => {
      const referentiel: ReferentielColis = t.referentiel;
      expect(await referentiel.interAgencesDisponible(ALPHA)).toBe(false);
      await t.conventionEnVigueur();
      expect(await referentiel.interAgencesDisponible(ALPHA)).toBe(true);
      expect(await referentiel.interAgencesDisponible(OMEGA)).toBe(true);
      expect(await referentiel.interAgencesDisponible(BETA)).toBe(false);
    });
  });
});
