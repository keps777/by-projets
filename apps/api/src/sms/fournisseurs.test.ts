import { describe, expect, it } from "vitest";
import {
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  RecuInvalide,
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  signerRecu,
  TOLERANCE_HORODATAGE_MS,
} from "./fournisseur";
import { FournisseurHttp, TransportHttp, type ReponseHttp } from "./fournisseur-http";
import { FournisseurSimule } from "./fournisseur-simule";

const DEMANDE = {
  reference: "ref-1",
  expediteur: "AfriMove",
  destinataire: "+237655012345",
  texte: "Bonjour",
};
const SECRET = "s".repeat(40);
const MAINTENANT = new Date("2027-01-05T07:00:00Z");

describe("FournisseurSimule", () => {
  it("accepte, garde le message et rend un identifiant", async () => {
    const f = new FournisseurSimule();
    const r = await f.envoyer(DEMANDE);
    expect(r.idFournisseur).toMatch(/^simule-/);
    expect(f.envoyes).toHaveLength(1);
    expect(f.envoyes[0]).toMatchObject({ destinataire: "+237655012345", texte: "Bonjour" });
  });

  it("la même référence rend le même identifiant et n'est comptée qu'une fois", async () => {
    const f = new FournisseurSimule();
    const a = await f.envoyer(DEMANDE);
    const b = await f.envoyer(DEMANDE);
    expect(b).toEqual(a);
    expect(f.envoyes).toHaveLength(1);
    expect(f.appels).toBe(2);
  });

  it("joue les scénarios dans l'ordre puis redevient normal", async () => {
    const f = new FournisseurSimule().programmer(
      { type: "temporaire", code: "limite_debit" },
      { type: "definitif", code: "destinataire_invalide" },
    );
    await expect(f.envoyer(DEMANDE)).rejects.toMatchObject({ code: "limite_debit" });
    await expect(f.envoyer(DEMANDE)).rejects.toBeInstanceOf(ErreurFournisseurDefinitive);
    await expect(f.envoyer(DEMANDE)).resolves.toBeDefined();
  });

  it("réponse perdue : le message est accepté mais l'appelant voit un délai dépassé", async () => {
    const f = new FournisseurSimule().programmer({ type: "reponse_perdue" });
    await expect(f.envoyer(DEMANDE)).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
    expect(f.envoyes).toHaveLength(1);
  });

  it("panne jusqu'au rétablissement", async () => {
    const f = new FournisseurSimule().mettreEnPanne();
    await expect(f.envoyer(DEMANDE)).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
    f.retablir();
    await expect(f.envoyer(DEMANDE)).resolves.toBeDefined();
  });

  it("fabrique des accusés que lui-même sait vérifier, et eux seuls", () => {
    const f = new FournisseurSimule({ maintenant: () => MAINTENANT });
    const recu = f.fabriquerRecu([{ idFournisseur: "x", etat: "livre", reference: "ref-1" }]);
    const lus = f.lireRecus({ ...recu, maintenant: MAINTENANT });
    expect(lus).toEqual([
      { idFournisseur: "x", reference: "ref-1", etat: "livre", at: MAINTENANT, code: null },
    ]);
    const autre = f.fabriquerRecu([{ idFournisseur: "x", etat: "livre" }], { secret: "autre" });
    expect(() => f.lireRecus({ ...autre, maintenant: MAINTENANT })).toThrow(RecuInvalide);
  });
});

describe("signature des accusés", () => {
  const f = new FournisseurSimule({ secretWebhook: SECRET, maintenant: () => MAINTENANT });
  const valide = () => f.fabriquerRecu([{ idFournisseur: "x", etat: "livre" }]);

  it("refuse un corps modifié", () => {
    const r = valide();
    const modifie = (r.corpsBrut ?? "").replace("livre", "non_livre");
    expect(() => f.lireRecus({ ...r, corpsBrut: modifie, maintenant: MAINTENANT })).toThrow(
      RecuInvalide,
    );
  });

  it("refuse l'absence de signature, d'horodatage ou de corps", () => {
    const r = valide();
    for (const retire of [ENTETE_SIGNATURE, ENTETE_HORODATAGE]) {
      const entetes = { ...r.entetes, [retire]: undefined };
      expect(() => f.lireRecus({ ...r, entetes, maintenant: MAINTENANT })).toThrow(RecuInvalide);
    }
    expect(() => f.lireRecus({ ...r, corpsBrut: null, maintenant: MAINTENANT })).toThrow(
      RecuInvalide,
    );
  });

  it("refuse une signature mal formée", () => {
    const r = valide();
    for (const signature of ["zz", "", "a".repeat(64), "0".repeat(63)]) {
      const entetes = { ...r.entetes, [ENTETE_SIGNATURE]: signature };
      expect(() => f.lireRecus({ ...r, entetes, maintenant: MAINTENANT })).toThrow(RecuInvalide);
    }
  });

  it("refuse un appel rejoué trop tard (ou daté du futur), accepte dans la tolérance", () => {
    const r = valide();
    const plusTard = (ms: number) => new Date(MAINTENANT.getTime() + ms);
    expect(() =>
      f.lireRecus({ ...r, maintenant: plusTard(TOLERANCE_HORODATAGE_MS + 2000) }),
    ).toThrow(expect.objectContaining({ raison: "horodatage" }));
    expect(() =>
      f.lireRecus({ ...r, maintenant: plusTard(-TOLERANCE_HORODATAGE_MS - 2000) }),
    ).toThrow(expect.objectContaining({ raison: "horodatage" }));
    expect(
      f.lireRecus({ ...r, maintenant: plusTard(TOLERANCE_HORODATAGE_MS - 2000) }),
    ).toHaveLength(1);
  });

  it("l'horodatage est dans la signature : le changer invalide l'appel", () => {
    const r = valide();
    const entetes = {
      ...r.entetes,
      [ENTETE_HORODATAGE]: String(Number(r.entetes[ENTETE_HORODATAGE]) + 1),
    };
    expect(() => f.lireRecus({ ...r, entetes, maintenant: MAINTENANT })).toThrow(RecuInvalide);
  });

  it("signature valide mais corps hors format : refus de format", () => {
    const corps = "pas du json";
    const h = Math.floor(MAINTENANT.getTime() / 1000);
    const entetes = {
      [ENTETE_HORODATAGE]: String(h),
      [ENTETE_SIGNATURE]: signerRecu(SECRET, h, corps),
    };
    expect(() => f.lireRecus({ entetes, corpsBrut: corps, maintenant: MAINTENANT })).toThrow(
      expect.objectContaining({ raison: "format" }),
    );
    const mauvais = JSON.stringify({
      messages: [{ id: "x", etat: "inconnu", at: "2027-01-05T07:00:00Z" }],
    });
    const entetes2 = { ...entetes, [ENTETE_SIGNATURE]: signerRecu(SECRET, h, mauvais) };
    expect(() =>
      f.lireRecus({ entetes: entetes2, corpsBrut: mauvais, maintenant: MAINTENANT }),
    ).toThrow(expect.objectContaining({ raison: "format" }));
  });
});

class TransportFictif extends TransportHttp {
  appels: Array<{ url: string; corps: string; entetes: Readonly<Record<string, string>> }> = [];
  constructor(private readonly reponse: ReponseHttp | Error) {
    super();
  }
  async poster(url: string, corps: string, entetes: Readonly<Record<string, string>>) {
    this.appels.push({ url, corps, entetes });
    if (this.reponse instanceof Error) throw this.reponse;
    return this.reponse;
  }
}

describe("FournisseurHttp", () => {
  const config = {
    nom: "agregateur",
    urlApi: "https://api.sms.example/v1/",
    cleApi: "cle-api-de-test-0123456789",
    secretWebhook: SECRET,
    delaiMs: 5000,
  };
  const avec = (r: ReponseHttp | Error) => {
    const t = new TransportFictif(r);
    return { t, f: new FournisseurHttp(config, t) };
  };

  it("poste le message avec la clé et l'idempotence par référence", async () => {
    const { t, f } = avec({ statut: 202, corps: '{"id":"abc-1"}' });
    await expect(f.envoyer(DEMANDE)).resolves.toEqual({ idFournisseur: "abc-1" });
    expect(t.appels[0]?.url).toBe("https://api.sms.example/v1/messages");
    expect(JSON.parse(t.appels[0]!.corps)).toEqual({
      from: "AfriMove",
      to: "+237655012345",
      text: "Bonjour",
      reference: "ref-1",
    });
    expect(t.appels[0]?.entetes).toMatchObject({
      authorization: "Bearer cle-api-de-test-0123456789",
      "idempotency-key": "ref-1",
    });
  });

  it.each([
    [400, ErreurFournisseurDefinitive, "refuse"],
    [422, ErreurFournisseurDefinitive, "refuse"],
    [401, ErreurFournisseurTemporaire, "acces_refuse"],
    [403, ErreurFournisseurTemporaire, "acces_refuse"],
    [402, ErreurFournisseurTemporaire, "credit_insuffisant"],
    [429, ErreurFournisseurTemporaire, "limite_debit"],
    [500, ErreurFournisseurTemporaire, "fournisseur_indisponible"],
    [503, ErreurFournisseurTemporaire, "fournisseur_indisponible"],
    [408, ErreurFournisseurTemporaire, "fournisseur_indisponible"],
    [418, ErreurFournisseurTemporaire, "reponse_inattendue"],
  ])("statut HTTP %i : classe et code", async (statut, classe, code) => {
    const { f } = avec({ statut, corps: "Bonjour +237655012345 mal envoyé" });
    const e = await f.envoyer(DEMANDE).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(classe);
    expect((e as { code: string }).code).toBe(code);
    // la réponse du fournisseur (qui peut citer le message) n'est jamais recopiée
    expect((e as Error).message).not.toContain("237655012345");
  });

  it("réponse acceptée sans identifiant lisible : à réessayer", async () => {
    for (const corps of ["", "pas du json", "{}", '{"id":""}', '{"id":12}']) {
      const { f } = avec({ statut: 200, corps });
      await expect(f.envoyer(DEMANDE)).rejects.toMatchObject({ code: "reponse_illisible" });
    }
  });

  it("réseau coupé ou délai dépassé : temporaire", async () => {
    const delai = Object.assign(new Error("x"), { name: "TimeoutError" });
    await expect(avec(delai).f.envoyer(DEMANDE)).rejects.toMatchObject({ code: "delai_depasse" });
    await expect(avec(new Error("ECONNRESET")).f.envoyer(DEMANDE)).rejects.toMatchObject({
      code: "reseau",
    });
  });

  it("vérifie les accusés avec son secret", () => {
    const { f } = avec({ statut: 200, corps: "{}" });
    const emetteur = new FournisseurSimule({ secretWebhook: SECRET, maintenant: () => MAINTENANT });
    const r = emetteur.fabriquerRecu([
      { idFournisseur: "abc-1", etat: "non_livre", code: "telephone_eteint" },
    ]);
    expect(f.lireRecus({ ...r, maintenant: MAINTENANT })[0]).toMatchObject({
      idFournisseur: "abc-1",
      etat: "non_livre",
      code: "telephone_eteint",
    });
    const faux = emetteur.fabriquerRecu([{ idFournisseur: "abc-1", etat: "livre" }], {
      secret: "x",
    });
    expect(() => f.lireRecus({ ...faux, maintenant: MAINTENANT })).toThrow(RecuInvalide);
  });
});
