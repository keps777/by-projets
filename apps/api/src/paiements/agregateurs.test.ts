import { describe, expect, it } from "vitest";
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  NotificationInvalide,
  lireCorpsNotifications,
  signerNotification,
  verifierSignature,
  type DemandeEncaissement,
} from "./agregateur";
import { AgregateurAbsent } from "./agregateur-absent";
import {
  AgregateurHttp,
  TransportPaiement,
  type ReponseHttp,
  type RequeteHttp,
} from "./agregateur-http";
import { AgregateurSimule } from "./agregateur-simule";

const SECRET = "secret-de-test-0123456789abcdef0123456789";
const MAINTENANT = new Date("2027-01-05T07:00:00.000Z");

const DEMANDE: DemandeEncaissement = {
  reference: "pay-1",
  moyen: "mtn_momo",
  montantFcfa: 4250,
  devise: null,
  telephone: "+237677012345",
  jetonCarte: null,
  libelle: "Alpha Voyages · Douala → Yaoundé",
  repartition: [
    { beneficiaire: "compagnie", compteId: "compte-alpha", montantFcfa: 4000 },
    { beneficiaire: "afrimove", compteId: "compte-afrimove", montantFcfa: 250 },
  ],
};

describe("signature des notifications", () => {
  const corps = JSON.stringify({ evenements: [] });
  const ts = Math.floor(MAINTENANT.getTime() / 1000);
  const entetes = (signature: string, horodatage = ts) => ({
    [ENTETE_SIGNATURE]: signature,
    [ENTETE_HORODATAGE]: String(horodatage),
  });

  it("accepte une signature valide et rend le corps", () => {
    const requete = {
      corpsBrut: corps,
      entetes: entetes(signerNotification(SECRET, ts, corps)),
      maintenant: MAINTENANT,
    };
    expect(verifierSignature(SECRET, requete)).toBe(corps);
  });

  it.each([
    ["mauvais secret", () => entetes(signerNotification("autre-secret", ts, corps)), corps],
    ["corps modifié", () => entetes(signerNotification(SECRET, ts, corps)), corps + " "],
    ["signature absente", () => ({ [ENTETE_HORODATAGE]: String(ts) }), corps],
    ["signature illisible", () => entetes("pas-de-l-hexa"), corps],
    [
      "horodatage absent",
      () => ({ [ENTETE_SIGNATURE]: signerNotification(SECRET, ts, corps) }),
      corps,
    ],
  ])("refuse : %s", (_nom, fabriquer, corpsRecu) => {
    expect(() =>
      verifierSignature(SECRET, {
        corpsBrut: corpsRecu,
        entetes: fabriquer(),
        maintenant: MAINTENANT,
      }),
    ).toThrow(NotificationInvalide);
  });

  it("refuse un corps brut absent (application sans rawBody)", () => {
    expect(() =>
      verifierSignature(SECRET, {
        corpsBrut: null,
        entetes: entetes(signerNotification(SECRET, ts, corps)),
        maintenant: MAINTENANT,
      }),
    ).toThrow(NotificationInvalide);
  });

  it("refuse un appel trop ancien ou venu du futur (rejeu)", () => {
    for (const decalage of [-6 * 60, 6 * 60]) {
      const h = ts + decalage;
      expect(() =>
        verifierSignature(SECRET, {
          corpsBrut: corps,
          entetes: entetes(signerNotification(SECRET, h, corps), h),
          maintenant: MAINTENANT,
        }),
      ).toThrow(/Horodatage/);
    }
  });
});

describe("lecture du corps des notifications", () => {
  const evenement = {
    id: "evt-1",
    type: "encaissement",
    transaction: "agg-1",
    reference: "pay-1",
    etat: "reussi",
    montant: 4250,
    referenceOperateur: "MP00000042",
    operateur: "mtn",
    at: "2027-01-05T07:00:00.000Z",
  };

  it("lit un événement complet", () => {
    const [n] = lireCorpsNotifications(JSON.stringify({ evenements: [evenement] }));
    expect(n).toEqual({
      evenementId: "evt-1",
      type: "encaissement",
      idFournisseur: "agg-1",
      reference: "pay-1",
      etat: "reussi",
      montantFcfa: 4250,
      referenceOperateur: "MP00000042",
      operateur: "mtn",
      code: null,
      at: new Date("2027-01-05T07:00:00.000Z"),
    });
  });

  it.each([
    ["JSON illisible", "{"],
    ["pas de liste", JSON.stringify({ autre: [] })],
    ["identifiant manquant", JSON.stringify({ evenements: [{ ...evenement, id: undefined }] })],
    ["type inconnu", JSON.stringify({ evenements: [{ ...evenement, type: "autre" }] })],
    ["état inconnu", JSON.stringify({ evenements: [{ ...evenement, etat: "peut-etre" }] })],
    ["date invalide", JSON.stringify({ evenements: [{ ...evenement, at: "hier" }] })],
    ["montant non entier", JSON.stringify({ evenements: [{ ...evenement, montant: 12.5 }] })],
    ["transaction vide", JSON.stringify({ evenements: [{ ...evenement, transaction: "" }] })],
  ])("refuse : %s", (_nom, corps) => {
    expect(() => lireCorpsNotifications(corps)).toThrow(NotificationInvalide);
  });

  it("plafonne le nombre d'événements d'un appel", () => {
    const trop = Array.from({ length: 201 }, (_, i) => ({ ...evenement, id: `e${i}` }));
    expect(() => lireCorpsNotifications(JSON.stringify({ evenements: trop }))).toThrow(
      NotificationInvalide,
    );
  });
});

describe("agrégateur simulé", () => {
  it("est idempotent : la même référence rend la même transaction, une seule fois", async () => {
    const a = new AgregateurSimule({ maintenant: () => MAINTENANT });
    const r1 = await a.initier(DEMANDE);
    const r2 = await a.initier(DEMANDE);
    expect(r2.idFournisseur).toBe(r1.idFournisseur);
    expect(a.transactions.size).toBe(1);
    expect(a.appelsEncaissement).toBe(2);
  });

  it("réponse perdue : la transaction existe malgré l'erreur, et se retrouve par sa référence", async () => {
    const a = new AgregateurSimule({ maintenant: () => MAINTENANT });
    a.programmer({ type: "reponse_perdue" });
    await expect(a.initier(DEMANDE)).rejects.toBeInstanceOf(ErreurAgregateurTemporaire);
    expect(await a.consulter("pay-1")).toMatchObject({ etat: "en_attente" });
    expect(await a.consulter("inconnue")).toBeNull();
  });

  it("refus définitif, panne temporaire puis rétablissement", async () => {
    const a = new AgregateurSimule({ maintenant: () => MAINTENANT });
    a.programmer({ type: "refuse", code: "carte_refusee" });
    await expect(a.initier(DEMANDE)).rejects.toMatchObject({ code: "carte_refusee" });
    await expect(a.initier(DEMANDE)).resolves.toBeDefined();
    a.mettreEnPanne();
    await expect(a.initier({ ...DEMANDE, reference: "pay-2" })).rejects.toBeInstanceOf(
      ErreurAgregateurTemporaire,
    );
    a.retablir();
    await expect(a.initier({ ...DEMANDE, reference: "pay-2" })).resolves.toBeDefined();
    const definitive = a.mettreEnPanne("refus", true);
    await expect(definitive.initier({ ...DEMANDE, reference: "pay-3" })).rejects.toBeInstanceOf(
      ErreurAgregateurDefinitive,
    );
  });

  it("une carte reçoit une adresse d'authentification, un mobile non ; la référence opérateur vient avec la réussite", async () => {
    const a = new AgregateurSimule({ issue: "reussi", maintenant: () => MAINTENANT });
    const mobile = await a.initier(DEMANDE);
    expect(mobile.urlAuthentification).toBeNull();
    expect(mobile).toMatchObject({ etat: "reussi", operateur: "mtn" });
    expect(mobile.referenceOperateur).toMatch(/^MP/);
    const carte = await a.initier({
      ...DEMANDE,
      reference: "pay-carte",
      moyen: "carte",
      telephone: null,
      jetonCarte: "tok_1NxQ7a2eZvKYlo2C",
    });
    expect(carte.urlAuthentification).toMatch(/^https:\/\//);
    expect(carte.operateur).toBeNull();
  });

  it("un remboursement est idempotent lui aussi", async () => {
    const a = new AgregateurSimule({ maintenant: () => MAINTENANT });
    const demande = {
      reference: "remb-1",
      idFournisseurPaiement: "simule-enc-1",
      montantFcfa: 4000,
      lignes: [{ beneficiaire: "compagnie" as const, montantFcfa: 4000 }],
    };
    const r1 = await a.rembourser(demande);
    const r2 = await a.rembourser(demande);
    expect(r2.idFournisseur).toBe(r1.idFournisseur);
    expect(a.remboursements.size).toBe(1);
  });

  it("fabrique des notifications que ses propres contrôles acceptent, et refuse un autre secret", () => {
    const a = new AgregateurSimule({ maintenant: () => MAINTENANT });
    const bonne = a.fabriquerNotification([
      { id: "e1", transaction: "agg-1", etat: "reussi", montant: 100 },
    ]);
    expect(a.lireNotifications({ ...bonne, maintenant: MAINTENANT })).toHaveLength(1);
    const fausse = a.fabriquerNotification([{ id: "e1", transaction: "agg-1", etat: "reussi" }], {
      secret: "pirate",
    });
    expect(() => a.lireNotifications({ ...fausse, maintenant: MAINTENANT })).toThrow(
      NotificationInvalide,
    );
  });
});

describe("aucun agrégateur", () => {
  it("n'appelle rien : chaque opération échoue avec un code reconnaissable", async () => {
    const a = new AgregateurAbsent();
    await expect(a.initier()).rejects.toMatchObject({ code: "agregateur_absent" });
    await expect(a.consulter()).rejects.toMatchObject({ code: "agregateur_absent" });
    await expect(a.rembourser()).rejects.toMatchObject({ code: "agregateur_absent" });
    expect(() => a.lireNotifications()).toThrow(NotificationInvalide);
  });
});

/* ------------------------------------------------------------------ client HTTP générique */

class TransportFactice extends TransportPaiement {
  readonly requetes: RequeteHttp[] = [];
  private readonly reponses: Array<ReponseHttp | Error> = [];

  repondre(...r: Array<ReponseHttp | Error>): this {
    this.reponses.push(...r);
    return this;
  }

  async appeler(requete: RequeteHttp): Promise<ReponseHttp> {
    this.requetes.push(requete);
    const r = this.reponses.shift();
    if (!r) throw new Error("Aucune réponse programmée");
    if (r instanceof Error) throw r;
    return r;
  }
}

const ok = (corps: unknown, statut = 201): ReponseHttp => ({
  statut,
  corps: JSON.stringify(corps),
});

function client(transport: TransportPaiement) {
  return new AgregateurHttp(
    {
      nom: "agregateur",
      urlApi: "https://api.agregateur.invalid/v1/",
      cleApi: "cle-api-de-test-0123456789",
      secretWebhook: SECRET,
      delaiMs: 5000,
    },
    transport,
  );
}

describe("client HTTP de l'agrégateur", () => {
  it("encaissement : URL, en-têtes d'identification et d'idempotence, corps avec répartition", async () => {
    const t = new TransportFactice().repondre(
      ok({ id: "agg-9", etat: "en_attente", operateur: "mtn" }),
    );
    const r = await client(t).initier(DEMANDE);
    expect(r).toMatchObject({ idFournisseur: "agg-9", etat: "en_attente", operateur: "mtn" });

    const q = t.requetes[0]!;
    expect(q.methode).toBe("POST");
    expect(q.url).toBe("https://api.agregateur.invalid/v1/encaissements");
    expect(q.entetes["authorization"]).toBe("Bearer cle-api-de-test-0123456789");
    expect(q.entetes["idempotency-key"]).toBe("pay-1");
    expect(q.delaiMs).toBe(5000);
    expect(JSON.parse(q.corps!)).toMatchObject({
      reference: "pay-1",
      moyen: "mtn_momo",
      montant: 4250,
      telephone: "+237677012345",
      repartition: [
        { beneficiaire: "compagnie", compte: "compte-alpha", montant: 4000 },
        { beneficiaire: "afrimove", compte: "compte-afrimove", montant: 250 },
      ],
    });
  });

  it("carte : le jeton du prestataire part tel quel, la devise en unité mineure", async () => {
    const t = new TransportFactice().repondre(
      ok({ id: "agg-c", etat: "en_attente", urlAuthentification: "https://3ds.banque.invalid/x" }),
    );
    const r = await client(t).initier({
      ...DEMANDE,
      moyen: "carte",
      telephone: null,
      jetonCarte: "tok_1NxQ7a2eZvKYlo2C",
      devise: { code: "CAD", montantMineur: 1290 },
    });
    expect(r.urlAuthentification).toBe("https://3ds.banque.invalid/x");
    const corps = JSON.parse(t.requetes[0]!.corps!);
    expect(corps.jetonCarte).toBe("tok_1NxQ7a2eZvKYlo2C");
    expect(corps.devise).toEqual({ code: "CAD", montant: 1290 });
    expect(corps).not.toHaveProperty("telephone");
  });

  it("n'accepte qu'une adresse d'authentification en https", async () => {
    const t = new TransportFactice().repondre(
      ok({ id: "agg-c", etat: "en_attente", urlAuthentification: "javascript:alert(1)" }),
    );
    const r = await client(t).initier(DEMANDE);
    expect(r.urlAuthentification).toBeNull();
  });

  it.each([
    [400, ErreurAgregateurDefinitive, "refuse"],
    [422, ErreurAgregateurDefinitive, "refuse"],
    [401, ErreurAgregateurTemporaire, "acces_refuse"],
    [403, ErreurAgregateurTemporaire, "acces_refuse"],
    [402, ErreurAgregateurTemporaire, "credit_insuffisant"],
    [429, ErreurAgregateurTemporaire, "limite_debit"],
    [500, ErreurAgregateurTemporaire, "agregateur_indisponible"],
    [503, ErreurAgregateurTemporaire, "agregateur_indisponible"],
    [408, ErreurAgregateurTemporaire, "agregateur_indisponible"],
    [418, ErreurAgregateurTemporaire, "reponse_inattendue"],
  ])("statut %i : erreur %s (%s), sans recopier la réponse", async (statut, classe, code) => {
    const t = new TransportFactice().repondre({
      statut,
      corps: '{"detail":"numéro +237677012345 invalide"}',
    });
    const erreur = await client(t)
      .initier(DEMANDE)
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(classe);
    expect((erreur as Error & { code: string }).code).toBe(code);
    expect((erreur as Error).message).not.toContain("677012345");
  });

  it("réseau coupé ou délai dépassé : erreur temporaire", async () => {
    const delai = Object.assign(new Error("trop long"), { name: "TimeoutError" });
    const t = new TransportFactice().repondre(new Error("ECONNRESET"), delai);
    await expect(client(t).initier(DEMANDE)).rejects.toMatchObject({ code: "reseau" });
    await expect(client(t).initier(DEMANDE)).rejects.toMatchObject({ code: "delai_depasse" });
  });

  it("réponse de succès illisible : temporaire (la transaction a pu être créée)", async () => {
    const t = new TransportFactice().repondre(
      { statut: 200, corps: "<html>" },
      ok({ id: "x", etat: "bizarre" }),
    );
    await expect(client(t).initier(DEMANDE)).rejects.toMatchObject({ code: "reponse_illisible" });
    await expect(client(t).initier(DEMANDE)).rejects.toMatchObject({ code: "reponse_illisible" });
  });

  it("consulter : 404 = transaction inconnue ; sinon l'état et la référence opérateur", async () => {
    const t = new TransportFactice().repondre(
      { statut: 404, corps: "" },
      ok(
        { id: "agg-9", etat: "reussi", montant: 4250, referenceOperateur: "MP1", operateur: "mtn" },
        200,
      ),
    );
    expect(await client(t).consulter("pay-1")).toBeNull();
    expect(await client(t).consulter("pay 2/../x")).toMatchObject({
      idFournisseur: "agg-9",
      etat: "reussi",
      montantFcfa: 4250,
      referenceOperateur: "MP1",
    });
    expect(t.requetes[1]!.url).toBe(
      "https://api.agregateur.invalid/v1/encaissements/pay%202%2F..%2Fx",
    );
    expect(t.requetes[1]!.methode).toBe("GET");
  });

  it("rembourser : référence idempotente et part de chaque bénéficiaire", async () => {
    const t = new TransportFactice().repondre(ok({ id: "rb-1", etat: "reussi" }));
    const r = await client(t).rembourser({
      reference: "remb-1",
      idFournisseurPaiement: "agg-9",
      montantFcfa: 4250,
      lignes: [
        { beneficiaire: "compagnie", montantFcfa: 4000 },
        { beneficiaire: "afrimove", montantFcfa: 250 },
      ],
    });
    expect(r).toMatchObject({ idFournisseur: "rb-1", etat: "reussi" });
    expect(t.requetes[0]!.url).toBe("https://api.agregateur.invalid/v1/remboursements");
    expect(t.requetes[0]!.entetes["idempotency-key"]).toBe("remb-1");
    expect(JSON.parse(t.requetes[0]!.corps!)).toMatchObject({
      encaissement: "agg-9",
      montant: 4250,
    });
  });

  it("taux : en millièmes de FCFA, inconnu = null, devise mal formée jamais envoyée", async () => {
    const t = new TransportFactice().repondre(ok({ taux: 440.5 }, 200), { statut: 404, corps: "" });
    expect(await client(t).tauxMillieme("CAD")).toBe(440_500);
    expect(await client(t).tauxMillieme("XXX")).toBeNull();
    expect(await client(t).tauxMillieme("../etc")).toBeNull();
    expect(t.requetes).toHaveLength(2);
  });

  it("vérifie la signature des notifications avec son secret", () => {
    const a = client(new TransportFactice());
    const corps = JSON.stringify({
      evenements: [
        {
          id: "e1",
          type: "encaissement",
          transaction: "agg-9",
          etat: "reussi",
          at: MAINTENANT.toISOString(),
        },
      ],
    });
    const ts = Math.floor(MAINTENANT.getTime() / 1000);
    const entetes = {
      [ENTETE_HORODATAGE]: String(ts),
      [ENTETE_SIGNATURE]: signerNotification(SECRET, ts, corps),
    };
    expect(a.lireNotifications({ corpsBrut: corps, entetes, maintenant: MAINTENANT })).toHaveLength(
      1,
    );
    expect(() =>
      a.lireNotifications({
        corpsBrut: corps,
        entetes: { ...entetes, [ENTETE_SIGNATURE]: signerNotification("autre", ts, corps) },
        maintenant: MAINTENANT,
      }),
    ).toThrow(NotificationInvalide);
  });
});
