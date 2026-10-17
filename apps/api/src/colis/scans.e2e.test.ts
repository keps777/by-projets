import { randomUUID } from "node:crypto";
import { agence, colis as contrats } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  DEPART_BAF,
  GARE_BAF,
  GARE_DLA,
  POINT_RELAIS,
  creerAppColisTest,
  dernierSmsA,
  entete,
  type AppColisTest,
} from "./testing/app-colis-test";
import {
  amenerJusquaDisponible,
  creerColisApp,
  creerEquipe,
  scanner,
  type ColisApp,
  type Equipe,
} from "./testing/scenarios";

const TEL_EXPEDITEUR = "+237691221008";
const TEL_DESTINATAIRE = "+237699401822";

/** Un code à six chiffres qui n'est pas le bon. */
const fauxCode = (code: string): string => (code === "123456" ? "654321" : "123456");

describe("scans des colis (chaîne guichet, route, remise)", () => {
  let t: AppColisTest;
  let e: Equipe;

  beforeAll(async () => {
    t = await creerAppColisTest();
    e = await creerEquipe(t);
  });
  afterAll(async () => {
    await t.fermer();
  });
  beforeEach(() => {
    t.horloge.regler();
    t.assureur.indisponible = false;
  });

  /** Un colis neuf, avec une photo à lui (une photo n'appartient qu'à un colis). */
  const neuf = (): Promise<ColisApp> =>
    creerColisApp(t, e, { photoRef: `photos/colis-${randomUUID()}.jpg` });

  const remise = (colis: ColisApp, over: Record<string, unknown> = {}) =>
    scanner(t, e.guichetierBaf.jeton, {
      colisId: colis.colisId,
      action: "remettre",
      code: colis.code,
      pieceVerifiee: true,
      photoRef: `photos/remise-${randomUUID()}.jpg`,
      ...over,
    });

  describe("la chaîne complète", () => {
    it("fait avancer l'état à chaque scan, prévient l'expéditeur et diffuse le suivi", async () => {
      const colis = await neuf();
      const etapes = [
        [e.guichetier.jeton, "charger", "charge", "est chargé dans le bus"],
        [e.convoyeur.jeton, "expedier", "en_route", "est en route"],
        [e.convoyeur.jeton, "decharger", "decharge", "est arrivé à destination"],
        [e.guichetierBaf.jeton, "rendre_disponible", "disponible", "est disponible au retrait"],
      ] as const;

      for (const [jeton, action, etat, phrase] of etapes) {
        const smsAvant = t.sms.messages().length;
        const rep = await scanner(t, jeton, { colisId: colis.colisId, action });
        expect(rep.status, JSON.stringify(rep.body)).toBe(200);
        const vue = contrats.SchemaColisPartenaire.parse(rep.body);
        expect(vue).toMatchObject({ id: colis.colisId, numero: colis.numero, etat });
        // L'expéditeur est prévenu à chaque étape, et lui seul (sauf la mise à disposition).
        const sms = dernierSmsA(t, TEL_EXPEDITEUR);
        expect(sms).toContain(colis.numero);
        expect(sms).toContain(phrase);
        expect(t.sms.messages().length).toBeGreaterThan(smsAvant);
        expect(t.diffusion.publies.at(-1)).toMatchObject({ colisId: colis.colisId, etat });
      }

      // À la mise à disposition, le destinataire est prévenu du lieu, sans le code.
      const aviso = dernierSmsA(t, TEL_DESTINATAIRE)!;
      expect(aviso).toContain("est disponible au retrait");
      expect(aviso).toContain(GARE_BAF.nom);
      expect(aviso).not.toContain(colis.code);

      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.disponibleDepuis).toBe("2026-11-02T09:00:00.000+01:00");
      expect(stocke?.historique.map((h) => h.action)).toEqual([
        "charger",
        "expedier",
        "decharger",
        "rendre_disponible",
      ]);
    });

    it("remet le colis avec le bon code, la pièce vérifiée et la photo", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      t.horloge.avancer(2 * 24 * 3600_000);
      const rep = await remise(colis, { photoRef: "photos/remise-ok.jpg" });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(contrats.SchemaColisPartenaire.parse(rep.body).etat).toBe("remis");

      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke).toMatchObject({
        etat: "remis",
        remise: { par: e.guichetierBaf.id, photoRef: "photos/remise-ok.jpg" },
      });
      expect(
        (await t.photos.parColis(colis.colisId)).find((p) => p.ref === "photos/remise-ok.jpg"),
      ).toMatchObject({ genre: "remise" });
      expect(dernierSmsA(t, TEL_EXPEDITEUR)).toContain("a été remis au destinataire");
      expect(
        t.auditRepo.lignes.some(
          (l) =>
            l.action === "colis.remettre" && l.resultat === "succes" && l.cibleId === colis.colisId,
        ),
      ).toBe(true);
    });

    it("retrouve le colis par son numéro, y compris tel qu'il s'affiche chez le client", async () => {
      const colis = await neuf();
      const long = colis.numero.replace("C-", "C-ALP-");
      // Le premier scan ouvre le litige ; les suivants trouvent le colis (409, pas 404) par son numéro.
      for (const numero of [colis.numero, long, colis.numero.toLowerCase()]) {
        const rep = await scanner(t, e.guichetier.jeton, { numero, action: "ouvrir_litige" });
        expect(rep.status, `${numero} : ${JSON.stringify(rep.body)}`).toBe(
          numero === colis.numero ? 200 : 409,
        );
      }
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("litige");
    });

    it("envoie le colis en relais : le destinataire apprend le nom du point relais", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      const inconnu = await scanner(t, e.guichetierBaf.jeton, {
        colisId: colis.colisId,
        action: "envoyer_en_relais",
        relaisId: "relais-fantome",
      });
      expect(inconnu.status).toBe(404);
      expect(inconnu.body.code).toBe("relais_introuvable");

      const rep = await scanner(t, e.guichetierBaf.jeton, {
        colisId: colis.colisId,
        action: "envoyer_en_relais",
        relaisId: POINT_RELAIS.id,
      });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(contrats.SchemaColisPartenaire.parse(rep.body).etat).toBe("en_relais");
      expect(dernierSmsA(t, TEL_DESTINATAIRE)).toContain(POINT_RELAIS.nom);
      expect((await t.repo.trouver(colis.colisId))?.relaisId).toBe(POINT_RELAIS.id);
    });
  });

  describe("règles d'accès", () => {
    it("refuse un voyageur, un jeton absent et un corps illisible", async () => {
      const colis = await neuf();
      expect(
        (
          await t
            .http()
            .post("/agence/colis/scans")
            .send({ colisId: colis.colisId, action: "charger" })
        ).status,
      ).toBe(401);
      const voyageur = await scanner(t, e.expediteur.jeton, {
        colisId: colis.colisId,
        action: "charger",
      });
      expect(voyageur.status).toBe(403);

      for (const corps of [
        {},
        { action: "charger" },
        { colisId: colis.colisId },
        { colisId: colis.colisId, action: "voler" },
        { colisId: colis.colisId, action: "remettre", code: "12" },
      ]) {
        const rep = await scanner(t, e.guichetier.jeton, corps);
        expect(rep.status, JSON.stringify(corps)).toBe(400);
        expect(rep.body.code).toBe("REQUETE_INVALIDE");
      }
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("enregistre");
    });

    it("n'accorde chaque action qu'aux rôles prévus", async () => {
      const colis = await neuf();
      const interdits: [string, string][] = [
        [e.convoyeur.jeton, "rendre_disponible"],
        [e.guichetier.jeton, "expedier"],
        [e.guichetier.jeton, "declarer_perdu"],
        [e.convoyeur.jeton, "remettre"],
        [e.convoyeur.jeton, "ouvrir_litige"],
        [e.superviseur.jeton, "charger"],
        [e.patron.jeton, "charger"],
      ];
      for (const [jeton, action] of interdits) {
        const rep = await scanner(t, jeton, { colisId: colis.colisId, action });
        expect(rep.status, action).toBe(403);
      }
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("enregistre");
    });

    it("refuse un scan hors de l'ordre de la machine d'états (409) sans rien changer ni notifier", async () => {
      const colis = await neuf();
      const smsAvant = t.sms.messages().length;
      for (const action of ["expedier", "decharger", "rendre_disponible"] as const) {
        const jeton = action === "rendre_disponible" ? e.guichetierBaf.jeton : e.convoyeur.jeton;
        const rep = await scanner(t, jeton, { colisId: colis.colisId, action });
        expect(rep.status, action).toBe(409);
        expect(rep.body).toMatchObject({
          code: "TRANSITION_INTERDITE",
          details: { etat: "enregistre", action },
        });
      }
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.etat).toBe("enregistre");
      expect(stocke?.historique).toEqual([]);
      expect(t.sms.messages()).toHaveLength(smsAvant);

      // Un scan rejoué (charger deux fois) est refusé aussi.
      expect(
        (await scanner(t, e.guichetier.jeton, { colisId: colis.colisId, action: "charger" }))
          .status,
      ).toBe(200);
      const deux = await scanner(t, e.guichetier.jeton, {
        colisId: colis.colisId,
        action: "charger",
      });
      expect(deux.status).toBe(409);
    });

    it("garde le guichetier dans sa gare : chargement au départ, remise à l'arrivée", async () => {
      const colis = await neuf();
      const mauvais = await scanner(t, e.guichetierBaf.jeton, {
        colisId: colis.colisId,
        action: "charger",
      });
      expect(mauvais.status).toBe(403);
      expect(mauvais.body.code).toBe("AUTRE_GARE");

      await amenerJusquaDisponible(t, e, colis.colisId);
      const aDepart = await remise(colis);
      expect(aDepart.status).toBe(200);

      const autre = await neuf();
      await amenerJusquaDisponible(t, e, autre.colisId);
      const refus = await scanner(t, e.guichetier.jeton, {
        colisId: autre.colisId,
        action: "remettre",
        code: autre.code,
        pieceVerifiee: true,
        photoRef: "photos/mauvaise-gare.jpg",
      });
      expect(refus.status).toBe(403);
      expect(refus.body.code).toBe("AUTRE_GARE");
      expect((await t.repo.trouver(autre.colisId))?.etat).toBe("disponible");
    });

    it("ne laisse pas une autre compagnie toucher au colis", async () => {
      const colis = await neuf();
      const etranger = await t.compte("guichetier", {
        compagnieId: AUTRE_COMPAGNIE,
        gareId: GARE_DLA.id,
      });
      const rep = await scanner(t, etranger.jeton, { colisId: colis.colisId, action: "charger" });
      expect(rep.status).toBe(404);
      expect(rep.body.code).toBe("COLIS_INCONNU");
      const inconnu = await scanner(t, e.guichetier.jeton, {
        colisId: randomUUID(),
        action: "charger",
      });
      expect(inconnu.status).toBe(404);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("enregistre");
    });
  });

  describe("remise et code de retrait", () => {
    it("exige le code, la pièce vérifiée et la photo avant de regarder le code", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);

      const sansCode = await remise(colis, { code: undefined });
      expect(sansCode.status).toBe(422);
      expect(sansCode.body.code).toBe("code_requis");
      const sansPiece = await remise(colis, { pieceVerifiee: false });
      expect(sansPiece.status).toBe(422);
      expect(sansPiece.body.code).toBe("piece_non_verifiee");
      const sansPhoto = await remise(colis, { photoRef: undefined });
      expect(sansPhoto.status).toBe(422);
      expect(sansPhoto.body.code).toBe("photo_requise");

      // Ces refus ne comptent pas comme des essais de code.
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.code.essais).toBe(0);
      expect(stocke?.etat).toBe("disponible");
    });

    it("compte les essais faux, ne répète jamais le code et bloque au troisième (423)", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      const faux = fauxCode(colis.code);

      const premier = await remise(colis, { code: faux });
      expect(premier.status).toBe(422);
      expect(premier.body).toMatchObject({ code: "code_invalide", details: { essaisRestants: 2 } });
      const deuxieme = await remise(colis, { code: faux });
      expect(deuxieme.body).toMatchObject({
        code: "code_invalide",
        details: { essaisRestants: 1 },
      });
      expect(JSON.stringify([premier.body, deuxieme.body])).not.toContain(faux);

      const troisieme = await remise(colis, { code: faux });
      expect(troisieme.status).toBe(423);
      expect(troisieme.body.code).toBe("code_bloque");

      // Bloqué : même le bon code est refusé.
      const bon = await remise(colis);
      expect(bon.status).toBe(423);
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke).toMatchObject({ etat: "disponible", code: { essais: 3, bloque: true } });

      // Les échecs sont au journal d'audit, sans aucun code.
      const refus = t.auditRepo.lignes.filter(
        (l) => l.resultat === "refus" && l.cibleId === colis.colisId,
      );
      expect(refus.map((l) => l.action)).toEqual([
        "colis.code_faux",
        "colis.code_faux",
        "colis.code_bloque",
        "colis.code_bloque",
      ]);
      expect(
        JSON.stringify(refus, (_, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
      ).not.toContain(faux);
    });

    it("se débloque par un superviseur de la compagnie, puis accepte le bon code", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      for (let i = 0; i < 3; i += 1) await remise(colis, { code: fauxCode(colis.code) });
      expect((await remise(colis)).status).toBe(423);

      const url = `/agence/colis/${colis.colisId}/deblocage`;
      expect((await t.http().post(url).set(entete(e.guichetierBaf.jeton))).status).toBe(403);
      expect((await t.http().post(url).set(entete(e.expediteur.jeton))).status).toBe(403);
      const etranger = await t.compte("superviseur", { compagnieId: AUTRE_COMPAGNIE });
      expect((await t.http().post(url).set(entete(etranger.jeton))).status).toBe(404);
      expect(
        (
          await t
            .http()
            .post(`/agence/colis/${randomUUID()}/deblocage`)
            .set(entete(e.superviseur.jeton))
        ).status,
      ).toBe(404);
      expect((await t.repo.trouver(colis.colisId))?.code.bloque).toBe(true);

      const debloque = await t.http().post(url).set(entete(e.superviseur.jeton));
      expect(debloque.status).toBe(204);
      expect((await t.repo.trouver(colis.colisId))?.code).toMatchObject({
        essais: 0,
        bloque: false,
      });
      expect(
        t.auditRepo.lignes.some(
          (l) => l.action === "colis.code_debloque" && l.cibleId === colis.colisId,
        ),
      ).toBe(true);

      const rep = await remise(colis);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.etat).toBe("remis");
    });

    it("remet le colis après des essais faux isolés : le bon code l'emporte avant le blocage", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      await remise(colis, { code: fauxCode(colis.code) });
      await remise(colis, { code: fauxCode(colis.code) });
      expect((await remise(colis)).status).toBe(200);
    });

    it("compte exactement trois essais quand ils arrivent tous en même temps", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      const faux = fauxCode(colis.code);
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () => remise(colis, { code: faux })),
      );
      const statuts = reponses.map((r) => r.status).sort();
      expect(statuts.filter((s) => s === 422)).toHaveLength(2);
      expect(statuts.filter((s) => s === 423)).toHaveLength(6);
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.code).toMatchObject({ essais: 3, bloque: true });
    });

    it("ne remet le colis qu'une fois quand deux guichets scannent en même temps", async () => {
      const colis = await neuf();
      await amenerJusquaDisponible(t, e, colis.colisId);
      const [a, b] = await Promise.all([remise(colis), remise(colis)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("remis");
      const sms = t.sms.messages().filter((m) => m.message.includes(`${colis.numero} a été remis`));
      expect(sms).toHaveLength(1);
    });

    it("refuse une remise sur un colis pas encore à disposition (409), sans compter d'essai", async () => {
      const colis = await neuf();
      const rep = await remise(colis, { code: fauxCode(colis.code) });
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("TRANSITION_INTERDITE");
      const route = await neuf();
      await scanner(t, e.guichetier.jeton, { colisId: route.colisId, action: "charger" });
      await scanner(t, e.convoyeur.jeton, { colisId: route.colisId, action: "expedier" });
      await scanner(t, e.convoyeur.jeton, { colisId: route.colisId, action: "decharger" });
      const trop_tot = await remise(route, { code: fauxCode(route.code) });
      expect(trop_tot.status).toBe(409);
      expect((await t.repo.trouver(route.colisId))?.code.essais).toBe(0);
    });
  });

  describe("le code de retrait ne sort jamais", () => {
    it("n'est dans aucune réponse partenaire, aucun journal, aucune ligne stockée en clair", async () => {
      const colis = await neuf();
      const reponses: unknown[] = [];
      for (const [jeton, action] of [
        [e.guichetier.jeton, "charger"],
        [e.convoyeur.jeton, "expedier"],
        [e.convoyeur.jeton, "decharger"],
        [e.guichetierBaf.jeton, "rendre_disponible"],
      ] as const) {
        reponses.push((await scanner(t, jeton, { colisId: colis.colisId, action })).body);
      }
      reponses.push((await remise(colis, { code: fauxCode(colis.code) })).body);
      reponses.push((await remise(colis)).body);
      reponses.push(
        (
          await t
            .http()
            .get(`/agence/colis/depot?code=${colis.numero}`)
            .set(entete(e.guichetier.jeton))
        ).body,
      );

      expect(contrats.fuitesCodeRetrait(reponses, [colis.code])).toEqual([]);

      const bigint = (_: string, v: unknown): unknown => (typeof v === "bigint" ? String(v) : v);
      const lignesStockees = JSON.stringify(await t.repo.trouver(colis.colisId));
      const audit = JSON.stringify(t.auditRepo.lignes, bigint);
      const journal = JSON.stringify([...t.evenements.lignes.values()], bigint);
      for (const [nom, texte] of [
        ["colis stocké", lignesStockees],
        ["audit", audit],
        ["journal des événements", journal],
      ] as const) {
        expect(texte, nom).not.toContain(colis.code);
      }

      // Seul le SMS au destinataire porte le code.
      const portent = t.sms.messages().filter((m) => m.message.includes(colis.code));
      expect(portent.map((m) => m.telephone)).toEqual([TEL_DESTINATAIRE]);

      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke?.code.hache).toMatch(/^[0-9a-f]{64}$/);
      expect(stocke?.code.chiffre.startsWith("enc:v1:")).toBe(true);
      expect(stocke?.code.chiffre).not.toContain(colis.code);
    });

    it("donne deux hachés différents pour deux colis qui ont le même code", async () => {
      const a = await neuf();
      const b = await neuf();
      const [ca, cb] = [await t.repo.trouver(a.colisId), await t.repo.trouver(b.colisId)];
      expect(ca?.code.sel).not.toBe(cb?.code.sel);
      expect(ca?.code.hache).not.toBe(cb?.code.hache);
    });
  });

  describe("déchargement en route (route.colis_decharges)", () => {
    const evenement = (
      auteurId: string,
      colisIds: string[],
      over: Record<string, unknown> = {},
    ) => ({
      id: randomUUID(),
      type: "route.colis_decharges",
      at: "2026-11-02T14:30:00.000+01:00",
      appareilId: "appareil-convoyeur-1",
      auteurId,
      cible: { type: "depart", id: DEPART_BAF.id },
      numeroPlage: null,
      donnees: { departId: DEPART_BAF.id, arret: "Bafoussam", colisIds, ...over },
    });
    const poster = (jeton: string, corps: unknown) =>
      t
        .http()
        .post("/agence/bus/dechargements")
        .set(entete(jeton))
        .send(corps as object);

    it("décharge les colis en route, accuse la réception et compte les colis restants", async () => {
      const a = await neuf();
      const b = await neuf();
      for (const c of [a, b]) {
        await scanner(t, e.guichetier.jeton, { colisId: c.colisId, action: "charger" });
        await scanner(t, e.convoyeur.jeton, { colisId: c.colisId, action: "expedier" });
      }
      const ev = evenement(e.convoyeur.id, [a.colisId]);
      expect(agence.EVENEMENT_ROUTE_COLIS_DECHARGES.schema.safeParse(ev).success).toBe(true);
      const rep = await poster(e.convoyeur.jeton, ev);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const r = agence.SchemaResultatDechargement.parse(rep.body);
      expect(r.accuse).toMatchObject({ evenementId: ev.id, statut: "accepte" });
      expect(r.colisRestants).toBeGreaterThanOrEqual(1);
      expect((await t.repo.trouver(a.colisId))?.etat).toBe("decharge");
      expect((await t.repo.trouver(b.colisId))?.etat).toBe("en_route");
      expect(dernierSmsA(t, TEL_EXPEDITEUR)).toContain("est arrivé à destination");
      expect(t.evenements.lignes.get(ev.id)).toBeDefined();

      // Rejouer l'événement ne refait rien.
      const smsAvant = t.sms.messages().length;
      const rejeu = await poster(e.convoyeur.jeton, ev);
      expect(agence.SchemaResultatDechargement.parse(rejeu.body).accuse.statut).toBe("deja_recu");
      expect(t.sms.messages()).toHaveLength(smsAvant);
    });

    it("tolère un départ jamais scanné : charge, expédie puis décharge", async () => {
      const c = await neuf();
      await scanner(t, e.guichetier.jeton, { colisId: c.colisId, action: "charger" });
      const rep = await poster(e.convoyeur.jeton, evenement(e.convoyeur.id, [c.colisId]));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const stocke = await t.repo.trouver(c.colisId);
      expect(stocke?.etat).toBe("decharge");
      expect(stocke?.historique.map((h) => h.action)).toEqual(["charger", "expedier", "decharger"]);
      expect(stocke?.historique.at(1)?.motif).toBe("départ non scanné");
    });

    it("refuse un colis d'un autre départ, un colis inconnu, un autre rôle et un corps illisible", async () => {
      const c = await neuf();
      await scanner(t, e.guichetier.jeton, { colisId: c.colisId, action: "charger" });
      await scanner(t, e.convoyeur.jeton, { colisId: c.colisId, action: "expedier" });

      const autreDepart = await poster(
        e.convoyeur.jeton,
        evenement(e.convoyeur.id, [c.colisId], { departId: "dep-autre-250101-0800" }),
      );
      expect(autreDepart.status).toBe(422);
      expect(autreDepart.body.code).toBe("COLIS_AUTRE_DEPART");
      expect(
        (await poster(e.convoyeur.jeton, evenement(e.convoyeur.id, [randomUUID()]))).status,
      ).toBe(404);
      expect(
        (await poster(e.guichetier.jeton, evenement(e.guichetier.id, [c.colisId]))).status,
      ).toBe(403);
      expect((await poster(e.convoyeur.jeton, evenement(e.convoyeur.id, []))).status).toBe(400);
      expect(
        (await poster(e.convoyeur.jeton, { ...evenement(e.convoyeur.id, [c.colisId]), id: "x" }))
          .status,
      ).toBe(400);
      expect(
        (await poster(e.convoyeur.jeton, evenement(e.superviseur.id, [c.colisId]))).status,
      ).toBeGreaterThanOrEqual(400);
      expect((await t.repo.trouver(c.colisId))?.etat).toBe("en_route");
    });
  });
});
