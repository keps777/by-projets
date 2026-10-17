import { voyageur } from "@afrimove/contrats";
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanalIndisponible, ReessayerPlusTard } from "./erreurs";
import { formatWebOtp } from "./regles";
import {
  AUTRE_TEL,
  MIN,
  TEL,
  autreCode,
  monterConnexion,
  refus,
  type Montage,
} from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

/** Cinq mauvais codes de suite : le numéro est bloqué. */
async function bloquer(m: Montage, telephone = TEL): Promise<string> {
  const code = await m.demanderEtLire(telephone);
  for (let i = 0; i < 5; i++) {
    const r = await refus(m.service.verifierCode({ telephone, code: autreCode(code) }));
    expect(r.getStatus()).toBe(i < 4 ? 401 : 429);
  }
  return code;
}

describe("demander un code", () => {
  it("répond comme le contrat : numéro, canal, 4 chiffres, renvoi dans 40 s, expiration à 5 min", async () => {
    const m = monterConnexion();
    const reponse = await m.service.demanderCode({ telephone: TEL });
    expect(voyageur.SchemaReponseDemandeCode.parse(reponse)).toEqual({
      telephone: TEL,
      canal: "sms",
      longueurCode: 4,
      renvoiDansSecondes: 40,
      expireA: "2027-01-05T09:05:00.000+01:00",
    });
  });

  it("envoie un code de 4 chiffres dont le SMS se termine par « @domaine #code » (WebOTP)", async () => {
    const m = monterConnexion({ config: { AUTH_VOYAGEUR_WEBOTP_DOMAINE: "app.exemple.cm" } });
    await m.service.demanderCode({ telephone: TEL });
    const envoye = m.sms.boite.at(-1)!;
    expect(envoye.telephone).toBe(TEL);
    expect(envoye.code).toMatch(/^\d{4}$/);
    expect(formatWebOtp(envoye.texte, "app.exemple.cm", envoye.code)).toBe(true);
    expect(envoye.texte.split("\n").at(-1)).toBe(`@app.exemple.cm #${envoye.code}`);
  });

  it("accepte un numéro avec ou sans le canal, mais pas l'USSD ni un numéro hors du pays", async () => {
    const m = monterConnexion();
    await m.service.demanderCode({ telephone: TEL, canal: "sms" });
    const ussd = await refus(m.service.demanderCode({ telephone: AUTRE_TEL, canal: "ussd" }));
    expect([ussd.getStatus(), ussd.code]).toEqual([422, "CANAL_INDISPONIBLE"]);
    const etranger = await refus(m.service.demanderCode({ telephone: "+33612345678" }));
    expect([etranger.getStatus(), etranger.code]).toEqual([422, "NUMERO_NON_AUTORISE"]);
    const faux = await refus(m.service.demanderCode({ telephone: "+0123456789" }));
    expect([faux.getStatus(), faux.code]).toEqual([400, "REQUETE_INVALIDE"]);
    expect(m.sms.boite).toHaveLength(1);
  });

  it("un autre indicatif peut être autorisé par la configuration", async () => {
    const m = monterConnexion({ config: { AUTH_VOYAGEUR_INDICATIFS: "+237,+241" } });
    const reponse = await m.service.demanderCode({ telephone: "+24106123456" });
    expect(reponse.telephone).toBe("+24106123456");
  });

  describe("un envoi par 40 secondes", () => {
    it("refuse un second envoi trop tôt, avec l'attente restante", async () => {
      const m = monterConnexion();
      await m.service.demanderCode({ telephone: TEL });
      m.avancer(15_000);
      const r = await refus(m.service.demanderCode({ telephone: TEL }));
      expect(r.getStatus()).toBe(429);
      expect(r.code).toBe("ENVOI_TROP_RAPPROCHE");
      expect(r.details).toEqual({ renvoiDansSecondes: 25, reessayerDansSecondes: 25 });
      expect((r as ReessayerPlusTard).attenteSecondes).toBe(25);
      expect(m.sms.boite).toHaveLength(1);
    });

    it("accepte à 40 s pile", async () => {
      const m = monterConnexion();
      await m.service.demanderCode({ telephone: TEL });
      m.avancer(40_000);
      await m.service.demanderCode({ telephone: TEL });
      expect(m.sms.boite).toHaveLength(2);
    });

    it("chaque numéro a son propre délai", async () => {
      const m = monterConnexion();
      await m.service.demanderCode({ telephone: TEL });
      await m.service.demanderCode({ telephone: AUTRE_TEL });
      expect(m.sms.boite.map((b) => b.telephone)).toEqual([TEL, AUTRE_TEL]);
    });

    it("le délai suit la configuration", async () => {
      const m = monterConnexion({ config: { AUTH_VOYAGEUR_RENVOI_S: "90" } });
      const reponse = await m.service.demanderCode({ telephone: TEL });
      expect(reponse.renvoiDansSecondes).toBe(90);
      m.avancer(60_000);
      expect((await refus(m.service.demanderCode({ telephone: TEL }))).code).toBe(
        "ENVOI_TROP_RAPPROCHE",
      );
    });
  });

  it("limite à 5 codes par heure et par numéro (un SMS coûte 12 F)", async () => {
    const m = monterConnexion();
    for (let i = 0; i < 5; i++) {
      await m.service.demanderCode({ telephone: TEL });
      m.avancer(41_000);
    }
    const r = await refus(m.service.demanderCode({ telephone: TEL }));
    expect([r.getStatus(), r.code]).toEqual([429, "TROP_DE_DEMANDES"]);
    expect((r as ReessayerPlusTard).attenteSecondes).toBeGreaterThan(3000);
    expect(m.sms.boite).toHaveLength(5);
    // Une heure après le premier envoi, la place se libère.
    m.avancer(3_600_000 - 5 * 41_000 + 1000);
    await m.service.demanderCode({ telephone: TEL });
    expect(m.sms.boite).toHaveLength(6);
  });

  describe("même réponse que le numéro ait un compte ou non", () => {
    it("un compte désactivé ne reçoit rien mais ne le sait pas, ni personne d'autre", async () => {
      const m = monterConnexion();
      const connu = await m.demanderEtLire(AUTRE_TEL);
      await m.service.verifierCode({ telephone: AUTRE_TEL, code: connu });
      m.comptes.modifier(AUTRE_TEL, { eligible: false });
      m.avancer(41_000);
      m.sms.boite.length = 0;

      const desactive = await m.service.demanderCode({ telephone: AUTRE_TEL });
      const inconnu = await m.service.demanderCode({ telephone: TEL });
      expect(m.sms.boite.map((b) => b.telephone)).toEqual([TEL]);
      expect({ ...desactive, telephone: "", expireA: "" }).toEqual({
        ...inconnu,
        telephone: "",
        expireA: "",
      });
    });
  });

  describe("WhatsApp en alternative", () => {
    it("envoie par WhatsApp quand le canal est branché", async () => {
      const m = monterConnexion({ whatsapp: "memoire" });
      const reponse = await m.service.demanderCode({ telephone: TEL, canal: "whatsapp" });
      expect(reponse.canal).toBe("whatsapp");
      expect(m.sms.boite).toHaveLength(0);
      const recu = m.whatsapp.boite.at(-1)!;
      expect(recu.telephone).toBe(TEL);
      expect(recu.code).toMatch(/^\d{4}$/);
      // Le code reçu par WhatsApp ouvre la session.
      const session = await m.service.verifierCode({ telephone: TEL, code: recu.code });
      expect(session.nouveauCompte).toBe(true);
    });

    it("se replie sur le SMS quand WhatsApp n'est pas branché, et le dit dans la réponse", async () => {
      const m = monterConnexion({ whatsapp: "absent" });
      const reponse = await m.service.demanderCode({ telephone: TEL, canal: "whatsapp" });
      expect(reponse.canal).toBe("sms");
      expect(m.sms.boite).toHaveLength(1);
    });

    it("se replie sur le SMS quand WhatsApp tombe en panne, sans doublon", async () => {
      const m = monterConnexion({ whatsapp: "memoire" });
      m.whatsapp.tomberEnPanne();
      const reponse = await m.service.demanderCode({ telephone: TEL, canal: "whatsapp" });
      expect(reponse.canal).toBe("sms");
      expect(m.whatsapp.boite).toHaveLength(0);
      expect(m.sms.boite).toHaveLength(1);
    });

    it("le SMS reste le canal par défaut", async () => {
      const m = monterConnexion({ whatsapp: "memoire" });
      expect((await m.service.demanderCode({ telephone: TEL })).canal).toBe("sms");
      expect(m.whatsapp.boite).toHaveLength(0);
    });
  });

  describe("quand le SMS ne peut pas partir", () => {
    it("répond 503 et laisse la personne réessayer tout de suite (le délai de 40 s ne court pas)", async () => {
      const m = monterConnexion();
      m.sms.tomberEnPanne(new CanalIndisponible("sms"));
      const r = await refus(m.service.demanderCode({ telephone: TEL }));
      expect([r.getStatus(), r.code]).toEqual([503, "ENVOI_IMPOSSIBLE"]);
      expect(m.stockage.codes.size).toBe(0);

      m.sms.retablir();
      await m.service.demanderCode({ telephone: TEL });
      expect(m.sms.boite).toHaveLength(1);
    });

    it("un échec ne consomme pas le quota de l'heure", async () => {
      const m = monterConnexion();
      m.sms.tomberEnPanne();
      for (let i = 0; i < 8; i++) {
        await refus(m.service.demanderCode({ telephone: TEL }));
      }
      m.sms.retablir();
      await m.service.demanderCode({ telephone: TEL });
      expect(m.sms.boite).toHaveLength(1);
    });
  });
});

describe("vérifier le code", () => {
  it("ouvre la session comme le contrat et crée le compte au premier code valide", async () => {
    const m = monterConnexion();
    const code = await m.demanderEtLire();
    expect(m.comptes.comptes.size).toBe(0);

    const session = await m.service.verifierCode({ telephone: TEL, code });
    expect(voyageur.SchemaSessionVoyageur.parse(session)).toEqual(session);
    expect(session.nouveauCompte).toBe(true);
    expect(session.jeton).not.toBe("");
    expect(session.expireA).toBe("2027-01-05T10:00:00.000+01:00");
    expect(session.profil).toMatchObject({
      telephone: TEL,
      prenom: "",
      nom: "",
      initiales: "",
      pieceVerifiee: false,
      inscritDepuis: "2027-01-05T09:00:00.000+01:00",
      langue: "fr",
    });
    expect(session.profil.id).toBe(m.comptes.comptes.get(TEL)!.id);
    expect(m.comptes.comptes.size).toBe(1);
  });

  it("reconnaît le compte existant : pas de nouveau compte, profil du compte", async () => {
    const m = monterConnexion();
    const premier = await m.service.verifierCode({
      telephone: TEL,
      code: await m.demanderEtLire(),
    });
    m.comptes.modifier(TEL, { nom: "Aïcha Ngo Bella" });
    m.avancer(10 * MIN);
    const second = await m.service.verifierCode({
      telephone: TEL,
      code: await m.demanderEtLire(),
    });
    expect(second.nouveauCompte).toBe(false);
    expect(second.profil.id).toBe(premier.profil.id);
    expect(second.profil).toMatchObject({
      prenom: "Aïcha",
      nom: "Ngo Bella",
      initiales: "AB",
      // La date d'inscription est celle de la première connexion.
      inscritDepuis: premier.profil.inscritDepuis,
    });
    expect(second.jeton).not.toBe(premier.jeton);
  });

  describe("usage unique et expiration", () => {
    it("un code ne sert qu'une fois", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      await m.service.verifierCode({ telephone: TEL, code });
      const r = await refus(m.service.verifierCode({ telephone: TEL, code }));
      expect([r.getStatus(), r.code]).toEqual([401, "CODE_EXPIRE"]);
    });

    it("deux vérifications simultanées du bon code : une seule réussit", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      const resultats = await Promise.allSettled([
        m.service.verifierCode({ telephone: TEL, code }),
        m.service.verifierCode({ telephone: TEL, code }),
        m.service.verifierCode({ telephone: TEL, code }),
      ]);
      expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(m.comptes.comptes.size).toBe(1);
    });

    it("le code expire au bout de 5 minutes, pas avant", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      m.avancer(5 * MIN - 1);
      const ok = await m.service.verifierCode({ telephone: TEL, code });
      expect(ok.jeton).not.toBe("");

      const m2 = monterConnexion();
      const code2 = await m2.demanderEtLire();
      m2.avancer(5 * MIN);
      const r = await refus(m2.service.verifierCode({ telephone: TEL, code: code2 }));
      expect([r.getStatus(), r.code]).toEqual([401, "CODE_EXPIRE"]);
    });

    it("sans code demandé, la vérification échoue sans rien compter ni créer", async () => {
      const m = monterConnexion();
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: "1234" }));
      expect([r.getStatus(), r.code]).toEqual([401, "CODE_EXPIRE"]);
      expect(m.stockage.limites.size).toBe(0);
      expect(m.comptes.comptes.size).toBe(0);
    });

    it("le code d'un numéro ne marche pas pour un autre", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire(TEL);
      await m.service.demanderCode({ telephone: AUTRE_TEL });
      const r = await refus(m.service.verifierCode({ telephone: AUTRE_TEL, code }));
      // Le code de l'autre numéro est faux ici, sauf coïncidence de tirage.
      if (m.sms.dernierCode() !== code) expect(r.code).toBe("CODE_INVALIDE");
      expect(m.comptes.comptes.has(AUTRE_TEL)).toBe(false);
    });

    it("seul le dernier code demandé est valable", async () => {
      const m = monterConnexion();
      let ancien = await m.demanderEtLire();
      m.avancer(41_000);
      let recent = await m.demanderEtLire();
      // Deux tirages identiques (1 chance sur 10 000) rendraient le test sans objet : on retire.
      while (recent === ancien) {
        m.avancer(41_000);
        ancien = recent;
        recent = await m.demanderEtLire();
      }
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: ancien }));
      expect([r.getStatus(), r.code]).toEqual([401, "CODE_INVALIDE"]);
      const ok = await m.service.verifierCode({ telephone: TEL, code: recent });
      expect(ok.profil.telephone).toBe(TEL);
    });
  });

  describe("5 essais maximum, puis attente", () => {
    it("dit combien d'essais restent après chaque mauvais code", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      const restants: unknown[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
        expect([r.getStatus(), r.code]).toEqual([401, "CODE_INVALIDE"]);
        restants.push((r.details as { essaisRestants: number }).essaisRestants);
      }
      expect(restants).toEqual([4, 3, 2, 1]);
    });

    it("la 5e erreur bloque le numéro : 429 avec l'attente (15 min)", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      for (let i = 0; i < 4; i++) {
        await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      }
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect([r.getStatus(), r.code]).toEqual([429, "TROP_ESSAIS"]);
      expect((r as ReessayerPlusTard).attenteSecondes).toBe(15 * 60);
      expect(r.message).toContain("15 min");
    });

    it("pendant le blocage, même le bon code est refusé", async () => {
      const m = monterConnexion();
      const code = await bloquer(m);
      m.avancer(10 * MIN);
      const r = await refus(m.service.verifierCode({ telephone: TEL, code }));
      expect([r.getStatus(), r.code]).toEqual([429, "TROP_ESSAIS"]);
      expect((r as ReessayerPlusTard).attenteSecondes).toBe(5 * 60);
      expect(m.comptes.comptes.size).toBe(0);
    });

    it("pendant le blocage, aucun nouveau code n'est envoyé", async () => {
      const m = monterConnexion();
      await bloquer(m);
      m.avancer(2 * MIN);
      const envoyesAvant = m.sms.boite.length;
      const r = await refus(m.service.demanderCode({ telephone: TEL }));
      expect([r.getStatus(), r.code]).toEqual([429, "TROP_ESSAIS"]);
      expect(m.sms.boite).toHaveLength(envoyesAvant);
    });

    it("après l'attente, un nouveau code fonctionne", async () => {
      const m = monterConnexion();
      await bloquer(m);
      m.avancer(15 * MIN);
      const code = await m.demanderEtLire();
      const session = await m.service.verifierCode({ telephone: TEL, code });
      expect(session.nouveauCompte).toBe(true);
    });

    it("redemander un code ne remet pas le compteur à zéro", async () => {
      const m = monterConnexion();
      let code = await m.demanderEtLire();
      for (let i = 0; i < 4; i++) {
        await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      }
      m.avancer(41_000);
      code = await m.demanderEtLire();
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect([r.getStatus(), r.code]).toEqual([429, "TROP_ESSAIS"]);
    });

    it("le blocage double quand les erreurs reprennent aussitôt après l'attente", async () => {
      const m = monterConnexion();
      await bloquer(m);
      m.avancer(15 * MIN);
      const code = await m.demanderEtLire();
      for (let i = 0; i < 4; i++) {
        await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      }
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect((r as ReessayerPlusTard).attenteSecondes).toBe(30 * 60);
    });

    it("une connexion réussie remet les compteurs à zéro", async () => {
      const m = monterConnexion();
      let code = await m.demanderEtLire();
      for (let i = 0; i < 4; i++) {
        await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      }
      await m.service.verifierCode({ telephone: TEL, code });
      m.avancer(41_000);
      code = await m.demanderEtLire();
      const r = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect((r.details as { essaisRestants: number }).essaisRestants).toBe(4);
    });

    it("le blocage d'un numéro ne touche pas les autres", async () => {
      const m = monterConnexion();
      await bloquer(m);
      const code = await m.demanderEtLire(AUTRE_TEL);
      const session = await m.service.verifierCode({ telephone: AUTRE_TEL, code });
      expect(session.profil.telephone).toBe(AUTRE_TEL);
    });

    it("des essais simultanés ne contournent pas la limite", async () => {
      const m = monterConnexion();
      const code = await m.demanderEtLire();
      const mauvais = autreCode(code);
      const resultats = await Promise.allSettled(
        Array.from({ length: 20 }, () => m.service.verifierCode({ telephone: TEL, code: mauvais })),
      );
      const codes = resultats.map((r) =>
        r.status === "rejected" ? (r.reason as { code: string }).code : "ok",
      );
      expect(codes.filter((c) => c === "CODE_INVALIDE")).toHaveLength(4);
      expect(codes.filter((c) => c === "TROP_ESSAIS").length).toBeGreaterThanOrEqual(1);
      expect(codes).not.toContain("ok");
    });

    it("la limite suit la configuration", async () => {
      const m = monterConnexion({ config: { AUTH_VOYAGEUR_ESSAIS_MAX: "2" } });
      const code = await m.demanderEtLire();
      const r1 = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect((r1.details as { essaisRestants: number }).essaisRestants).toBe(1);
      const r2 = await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
      expect(r2.getStatus()).toBe(429);
    });
  });

  describe("compte non éligible", () => {
    it("un compte désactivé ne peut pas ouvrir de session", async () => {
      const m = monterConnexion();
      await m.service.verifierCode({ telephone: TEL, code: await m.demanderEtLire() });
      m.comptes.modifier(TEL, { eligible: false });
      m.avancer(41_000);
      m.sms.boite.length = 0;
      await m.service.demanderCode({ telephone: TEL });
      expect(m.sms.boite).toHaveLength(0); // aucun code envoyé : la personne ne peut pas en avoir un
      // Même en devinant, on n'ouvre pas de session.
      let ouverte = false;
      for (const code of ["0000", "1111", "2222"]) {
        ouverte ||= await m.service
          .verifierCode({ telephone: TEL, code })
          .then(() => true)
          .catch(() => false);
      }
      expect(ouverte).toBe(false);
    });
  });
});

describe("le code n'est jamais journalisé en clair", () => {
  /**
   * Le code apparaît isolé : après « # », « est », une espace, une quote ou « : », et sans suite
   * alphanumérique ni « - ». Les identifiants, les hachages et les dates, qui portent parfois quatre
   * chiffres de suite, ne comptent pas.
   */
  const contient = (texte: string, code: string): boolean =>
    new RegExp(`(?:#|\\best |["'\\s:=])${code}(?![-\\w])`).test(texte);

  it("ni dans les journaux techniques, ni dans l'audit, ni dans le stockage", async () => {
    const lignes: string[] = [];
    for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, niveau).mockImplementation((...args: unknown[]) => {
        lignes.push(args.map(String).join(" "));
      });
    }
    const m = monterConnexion();
    // Un parcours complet : demande, mauvais codes, WhatsApp en panne, bon code, blocage.
    const code = await m.demanderEtLire();
    await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
    await m.service.verifierCode({ telephone: TEL, code });
    m.avancer(41_000);
    m.sms.tomberEnPanne();
    await refus(m.service.demanderCode({ telephone: TEL, canal: "whatsapp" }));
    m.sms.retablir();
    const dernier = await m.demanderEtLire();
    await bloquer(m, AUTRE_TEL);

    // Les codes émis, et ceux que les gens ont tapés (aussi faux, ils ressemblent au vrai).
    const codes = [code, dernier, autreCode(code), ...m.sms.boite.map((b) => b.code)];
    const audit = JSON.stringify(m.auditRepo.lignes.map((l) => ({ ...l, seq: String(l.seq) })));
    const stockage = JSON.stringify([...m.stockage.codes.values()]);
    const journaux = lignes.join("\n");
    for (const c of new Set(codes)) {
      expect(contient(audit, c), `audit, code ${c}`).toBe(false);
      expect(contient(stockage, c), `stockage, code ${c}`).toBe(false);
      expect(contient(journaux, c), `journaux, code ${c}`).toBe(false);
    }
    // Ni le numéro en clair, que l'audit n'a pas à connaître.
    expect(audit).not.toContain("691221008");
    expect(journaux).not.toContain("691221008");
    expect(audit.length).toBeGreaterThan(100);
  });

  it("l'audit raconte les étapes sans le code ni le numéro", async () => {
    const m = monterConnexion();
    const code = await m.demanderEtLire();
    await refus(m.service.verifierCode({ telephone: TEL, code: autreCode(code) }));
    await m.service.verifierCode({ telephone: TEL, code });
    expect(m.auditRepo.lignes.map((l) => [l.action, l.resultat])).toEqual([
      ["connexion.voyageur.code_demande", "succes"],
      ["connexion.voyageur.code", "echec"],
      ["connexion.voyageur", "succes"],
    ]);
  });
});
