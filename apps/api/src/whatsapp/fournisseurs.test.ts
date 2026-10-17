import { describe, expect, it } from "vitest";
import {
  ENTETE_SIGNATURE,
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  WebhookInvalide,
  lireCorpsWebhookMeta,
  signerWebhook,
  verifierAbonnementMeta,
  verifierSignatureWebhook,
  type DemandeFournisseur,
} from "./fournisseur";
import {
  FournisseurWhatsAppHttp,
  TransportHttp,
  type ConfigFournisseurHttp,
  type ReponseHttp,
} from "./fournisseur-http";
import {
  FournisseurWhatsAppSimule,
  JETON_VERIFICATION_SIMULE,
  SECRET_SIMULE,
} from "./fournisseur-simule";

/* ----------------------------------------------------------------------------------- simulateur */

const GABARIT: DemandeFournisseur = {
  reference: "ref-1",
  destinataire: "+237655012345",
  contenu: {
    type: "gabarit",
    nom: "afrimove_colis_retrait",
    langue: "fr",
    parametres: ["COL-1", "Alpha", "gare de Yaoundé", "482915"],
    boutonUrl: null,
  },
};

describe("FournisseurWhatsAppSimule", () => {
  it("accepte un gabarit et garde le message tel que la personne le lira", async () => {
    const f = new FournisseurWhatsAppSimule();
    const r = await f.envoyer(GABARIT);
    expect(r.idFournisseur).toMatch(/^wamid\./);
    expect(f.envoyes).toHaveLength(1);
    expect(f.envoyes[0]?.texte).toBe(
      "Colis COL-1 de Alpha : à retirer à gare de Yaoundé.\nCode de retrait : 482915\nNe le donnez qu'à la remise du colis.",
    );
    expect(f.reel).toBe(false);
  });

  it("est idempotent sur la référence : même identifiant, un seul message", async () => {
    const f = new FournisseurWhatsAppSimule();
    const a = await f.envoyer(GABARIT);
    const b = await f.envoyer(GABARIT);
    expect(b).toEqual(a);
    expect(f.envoyes).toHaveLength(1);
    expect(f.appels).toBe(2);
  });

  it("suit les scénarios programmés, un par appel", async () => {
    const f = new FournisseurWhatsAppSimule().programmer(
      { type: "temporaire", code: "limite_debit" },
      { type: "definitif" },
      { type: "ok" },
    );
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({
      name: "ErreurFournisseurTemporaire",
      code: "limite_debit",
    });
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({
      name: "ErreurFournisseurDefinitive",
      code: "pas_sur_whatsapp",
    });
    await expect(f.envoyer(GABARIT)).resolves.toBeDefined();
  });

  it("simule une réponse perdue : accepté chez le fournisseur, délai dépassé chez l'appelant", async () => {
    const f = new FournisseurWhatsAppSimule().programmer({ type: "reponse_perdue" });
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: "delai_depasse" });
    expect(f.envoyes).toHaveLength(1);
    const reprise = await f.envoyer(GABARIT);
    expect(reprise.idFournisseur).toBe(f.envoyes[0]?.idFournisseur);
    expect(f.envoyes).toHaveLength(1);
  });

  it("tombe en panne jusqu'au rétablissement", async () => {
    const f = new FournisseurWhatsAppSimule().mettreEnPanne();
    await expect(f.envoyer(GABARIT)).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
    await expect(f.envoyer(GABARIT)).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
    f.retablir();
    await expect(f.envoyer(GABARIT)).resolves.toBeDefined();
  });

  it("fabrique des appels signés que son propre webhook relit", () => {
    const f = new FournisseurWhatsAppSimule();
    const at = new Date("2027-01-05T07:00:00.000Z");
    const requete = f.fabriquerWebhook({
      statuts: [{ idFournisseur: "wamid.1", etat: "remis", reference: "ref-1", at }],
      messages: [{ idFournisseur: "wamid.in-1", de: "237655012345", texte: "Bonjour", at }],
    });
    expect(f.lireWebhook(requete)).toEqual({
      statuts: [{ idFournisseur: "wamid.1", reference: "ref-1", etat: "remis", at, code: null }],
      messages: [
        {
          idFournisseur: "wamid.in-1",
          de: "237655012345",
          typeMessage: "text",
          texte: "Bonjour",
          at,
        },
      ],
    });
  });

  it("refuse un appel signé avec un autre secret", () => {
    const f = new FournisseurWhatsAppSimule();
    const requete = f.fabriquerWebhook({ statuts: [] }, { secret: "un-autre-secret-0123456789" });
    expect(() => f.lireWebhook(requete)).toThrowError(WebhookInvalide);
  });

  it("répond à la vérification d'abonnement avec son jeton", () => {
    const f = new FournisseurWhatsAppSimule();
    expect(
      f.verifierAbonnement({
        mode: "subscribe",
        jeton: JETON_VERIFICATION_SIMULE,
        challenge: "1158201444",
      }),
    ).toBe("1158201444");
  });

  it("annonce un compte vérifié avec tous les gabarits approuvés, ou devient injoignable", async () => {
    const f = new FournisseurWhatsAppSimule();
    const compte = await f.etatCompte();
    expect(compte.verifie).toBe(true);
    expect(compte.gabarits.map((g) => g.nom).sort()).toEqual([
      "afrimove_alerte_proche",
      "afrimove_alerte_retard",
      "afrimove_billet",
      "afrimove_colis_retrait",
      "afrimove_rapport_soir",
    ]);
    expect(compte.gabarits.every((g) => g.statut === "approuve")).toBe(true);
    f.compteInjoignable = true;
    await expect(f.etatCompte()).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
  });
});

/* ------------------------------------------------------------------------------- client HTTP */

class TransportFactice extends TransportHttp {
  readonly appels: Array<{
    methode: "POST" | "GET";
    url: string;
    corps: string | null;
    entetes: Readonly<Record<string, string>>;
    delaiMs: number;
  }> = [];
  private readonly reponses: Array<ReponseHttp | Error> = [];

  repondre(...r: Array<ReponseHttp | Error>): this {
    this.reponses.push(...r);
    return this;
  }

  private prochaine(): ReponseHttp {
    const r = this.reponses.shift();
    if (!r) throw new Error("Aucune réponse programmée");
    if (r instanceof Error) throw r;
    return r;
  }

  async poster(
    url: string,
    corps: string,
    entetes: Readonly<Record<string, string>>,
    delaiMs: number,
  ) {
    this.appels.push({ methode: "POST", url, corps, entetes, delaiMs });
    return this.prochaine();
  }

  async obtenir(url: string, entetes: Readonly<Record<string, string>>, delaiMs: number) {
    this.appels.push({ methode: "GET", url, corps: null, entetes, delaiMs });
    return this.prochaine();
  }
}

const CONFIG: ConfigFournisseurHttp = {
  urlApi: "https://graph.example/v21.0/",
  jeton: "jeton-de-test-0123456789",
  numeroId: "109876543210",
  compteId: "208765432109",
  secretApplication: "secret-application-de-test-0123456789",
  jetonVerification: "jeton-de-verification-0123456789",
  delaiMs: 8000,
};

const ok = (corps: unknown, statut = 200): ReponseHttp => ({
  statut,
  corps: JSON.stringify(corps),
});
const erreurApi = (statut: number, code: number): ReponseHttp =>
  ok({ error: { message: "texte de l'API avec 482915", type: "OAuthException", code } }, statut);

function client() {
  const transport = new TransportFactice();
  return { transport, f: new FournisseurWhatsAppHttp(CONFIG, transport) };
}

describe("FournisseurWhatsAppHttp : envoi", () => {
  it("poste un gabarit à l'API Cloud : adresse, en-têtes, corps et délai", async () => {
    const { transport, f } = client();
    transport.repondre(ok({ messaging_product: "whatsapp", messages: [{ id: "wamid.HBgL" }] }));
    const r = await f.envoyer({
      reference: "0b4c1f3e-0000-4000-8000-000000000001",
      destinataire: "+237655012345",
      contenu: {
        type: "gabarit",
        nom: "afrimove_billet",
        langue: "fr",
        parametres: ["Alpha Voyages", "Douala", "Yaoundé", "05/01 à 08h30", "14", "7341"],
        boutonUrl: "Xk3pQ9",
      },
    });
    expect(r).toEqual({ idFournisseur: "wamid.HBgL" });
    const appel = transport.appels[0]!;
    expect(appel.methode).toBe("POST");
    expect(appel.url).toBe("https://graph.example/v21.0/109876543210/messages");
    expect(appel.entetes).toEqual({
      authorization: "Bearer jeton-de-test-0123456789",
      "idempotency-key": "0b4c1f3e-0000-4000-8000-000000000001",
    });
    expect(appel.delaiMs).toBe(8000);
    expect(JSON.parse(appel.corps!)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "237655012345",
      biz_opaque_callback_data: "0b4c1f3e-0000-4000-8000-000000000001",
      type: "template",
      template: {
        name: "afrimove_billet",
        language: { code: "fr" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Alpha Voyages" },
              { type: "text", text: "Douala" },
              { type: "text", text: "Yaoundé" },
              { type: "text", text: "05/01 à 08h30" },
              { type: "text", text: "14" },
              { type: "text", text: "7341" },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "Xk3pQ9" }],
          },
        ],
      },
    });
  });

  it("omet le bouton quand le gabarit n'en a pas", async () => {
    const { transport, f } = client();
    transport.repondre(ok({ messages: [{ id: "wamid.2" }] }));
    await f.envoyer(GABARIT);
    const composants = JSON.parse(transport.appels[0]!.corps!).template.components as Array<{
      type: string;
    }>;
    expect(composants.map((c) => c.type)).toEqual(["body"]);
  });

  it("poste un texte libre", async () => {
    const { transport, f } = client();
    transport.repondre(ok({ messages: [{ id: "wamid.3" }] }));
    await f.envoyer({
      reference: "ref",
      destinataire: "+237655012345",
      contenu: { type: "texte", texte: "Bonjour" },
    });
    expect(JSON.parse(transport.appels[0]!.corps!)).toMatchObject({
      type: "text",
      text: { preview_url: false, body: "Bonjour" },
      to: "237655012345",
    });
  });

  it("une réponse 2xx sans identifiant est traitée comme perdue (à réessayer)", async () => {
    const { transport, f } = client();
    transport.repondre(ok({ messages: [] }), { statut: 200, corps: "<html>" });
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: "reponse_illisible" });
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: "reponse_illisible" });
  });

  it.each([
    [400, 131026, "definitif", "pas_sur_whatsapp"],
    [400, 131030, "definitif", "numero_non_autorise"],
    [400, 131047, "definitif", "fenetre_fermee"],
    [404, 132001, "definitif", "gabarit_inconnu"],
    [400, 132000, "definitif", "gabarit_parametres"],
    [400, 100, "definitif", "parametre_invalide"],
    [429, 130429, "temporaire", "limite_debit"],
    [400, 131056, "temporaire", "limite_debit"],
    [400, 131042, "temporaire", "paiement_requis"],
    [500, 131016, "temporaire", "fournisseur_indisponible"],
    [401, 190, "temporaire", "acces_refuse"],
  ] as const)("HTTP %i, code %i : erreur %s « %s »", async (statut, code, nature, attendu) => {
    const { transport, f } = client();
    transport.repondre(erreurApi(statut, code));
    const classe =
      nature === "definitif" ? ErreurFournisseurDefinitive : ErreurFournisseurTemporaire;
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: attendu });
    transport.repondre(erreurApi(statut, code));
    await expect(f.envoyer(GABARIT)).rejects.toBeInstanceOf(classe);
  });

  it("sans code reconnu : 5xx, 408, 429 à réessayer ; autre 4xx refusé pour de bon", async () => {
    const cas: Array<[number, string, "t" | "d"]> = [
      [503, "fournisseur_indisponible", "t"],
      [408, "fournisseur_indisponible", "t"],
      [429, "limite_debit", "t"],
      [403, "acces_refuse", "t"],
      [400, "refuse", "d"],
      [422, "refuse", "d"],
    ];
    for (const [statut, code, nature] of cas) {
      const { transport, f } = client();
      transport.repondre({ statut, corps: "{}" });
      await expect(f.envoyer(GABARIT), String(statut)).rejects.toMatchObject({
        code,
        name: nature === "t" ? "ErreurFournisseurTemporaire" : "ErreurFournisseurDefinitive",
      });
    }
  });

  it("réseau coupé ou délai dépassé : erreur temporaire", async () => {
    const delai = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const { transport, f } = client();
    transport.repondre(delai, new Error("ECONNRESET"));
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: "delai_depasse" });
    await expect(f.envoyer(GABARIT)).rejects.toMatchObject({ code: "reseau" });
  });

  it("ne recopie jamais la réponse de l'API dans l'erreur (elle pourrait citer le message)", async () => {
    const { transport, f } = client();
    transport.repondre(erreurApi(400, 131026));
    try {
      await f.envoyer(GABARIT);
      expect.unreachable();
    } catch (e) {
      expect(JSON.stringify(e) + (e as Error).message).not.toContain("482915");
    }
  });
});

describe("FournisseurWhatsAppHttp : webhook", () => {
  const { f } = client();
  const corps = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "208765432109",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: "wamid.A",
                  status: "delivered",
                  timestamp: "1799395200",
                  recipient_id: "237655012345",
                  biz_opaque_callback_data: "ref-A",
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const signe = (c: string, secret = CONFIG.secretApplication) => ({
    corpsBrut: c,
    entetes: { [ENTETE_SIGNATURE]: signerWebhook(secret, c) },
  });

  it("vérifie la signature du corps exact puis lit l'accusé", () => {
    expect(f.lireWebhook(signe(corps))).toEqual({
      statuts: [
        {
          idFournisseur: "wamid.A",
          reference: "ref-A",
          etat: "remis",
          at: new Date(1799395200 * 1000),
          code: null,
        },
      ],
      messages: [],
    });
  });

  it("refuse un corps modifié d'un octet, un autre secret, une signature absente ou mal formée", () => {
    const requete = signe(corps);
    expect(() => f.lireWebhook({ ...requete, corpsBrut: `${corps} ` })).toThrowError(
      expect.objectContaining({ raison: "signature" }),
    );
    expect(() => f.lireWebhook(signe(corps, "un-autre-secret-0123456789"))).toThrowError(
      expect.objectContaining({ raison: "signature" }),
    );
    expect(() => f.lireWebhook({ corpsBrut: corps, entetes: {} })).toThrowError(WebhookInvalide);
    expect(() =>
      f.lireWebhook({ corpsBrut: corps, entetes: { [ENTETE_SIGNATURE]: "sha256=zz" } }),
    ).toThrowError(WebhookInvalide);
    expect(() => f.lireWebhook({ corpsBrut: null, entetes: requete.entetes })).toThrowError(
      WebhookInvalide,
    );
  });

  it("répond à la vérification d'abonnement seulement avec le bon jeton", () => {
    expect(
      f.verifierAbonnement({
        mode: "subscribe",
        jeton: CONFIG.jetonVerification,
        challenge: "1158201444",
      }),
    ).toBe("1158201444");
    for (const demande of [
      { mode: "subscribe", jeton: "mauvais", challenge: "1" },
      { mode: "unsubscribe", jeton: CONFIG.jetonVerification, challenge: "1" },
      { mode: "subscribe", jeton: undefined, challenge: "1" },
      { mode: "subscribe", jeton: CONFIG.jetonVerification, challenge: undefined },
      { mode: "subscribe", jeton: CONFIG.jetonVerification, challenge: "<script>" },
    ]) {
      expect(() => verifierAbonnementMeta(CONFIG.jetonVerification, demande)).toThrowError(
        expect.objectContaining({ raison: "abonnement" }),
      );
    }
  });
});

describe("lireCorpsWebhookMeta", () => {
  const enveloppe = (valeur: unknown) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "1", changes: [{ field: "messages", value: valeur }] }],
    });

  it("traduit les quatre statuts de WhatsApp, avec le code d'une erreur de remise", () => {
    const e = lireCorpsWebhookMeta(
      enveloppe({
        statuses: [
          { id: "a", status: "sent", timestamp: "1799395200" },
          { id: "b", status: "delivered", timestamp: "1799395201" },
          { id: "c", status: "read", timestamp: "1799395202" },
          {
            id: "d",
            status: "failed",
            timestamp: "1799395203",
            errors: [{ code: 131026, title: "Message undeliverable" }],
          },
          { id: "e", status: "failed", timestamp: "1799395204" },
        ],
      }),
    );
    expect(e.statuts.map((s) => [s.idFournisseur, s.etat, s.code])).toEqual([
      ["a", "envoye", null],
      ["b", "remis", null],
      ["c", "lu", null],
      ["d", "echec", "131026"],
      ["e", "echec", "inconnu"],
    ]);
  });

  it("ignore les statuts qui n'intéressent pas la passerelle (deleted, warning)", () => {
    const e = lireCorpsWebhookMeta(
      enveloppe({ statuses: [{ id: "a", status: "deleted", timestamp: "1799395200" }] }),
    );
    expect(e.statuts).toEqual([]);
  });

  it("lit les messages reçus : texte, bouton, et média sans texte", () => {
    const e = lireCorpsWebhookMeta(
      enveloppe({
        messages: [
          {
            id: "m1",
            from: "237655012345",
            timestamp: "1799395200",
            type: "text",
            text: { body: "Bonjour" },
          },
          {
            id: "m2",
            from: "237655012345",
            timestamp: "1799395201",
            type: "button",
            button: { text: "Voir" },
          },
          {
            id: "m3",
            from: "237655012345",
            timestamp: "1799395202",
            type: "image",
            image: { id: "x" },
          },
        ],
      }),
    );
    expect(e.messages.map((m) => [m.typeMessage, m.texte])).toEqual([
      ["text", "Bonjour"],
      ["button", "Voir"],
      ["image", null],
    ]);
  });

  it("ignore les changements d'un autre champ que « messages »", () => {
    const corps = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "1", changes: [{ field: "message_template_status_update", value: {} }] }],
    });
    expect(lireCorpsWebhookMeta(corps)).toEqual({ statuts: [], messages: [] });
  });

  it.each([
    ["JSON illisible", "pas du json"],
    ["autre objet", JSON.stringify({ object: "page", entry: [] })],
    ["entrées absentes", JSON.stringify({ object: "whatsapp_business_account" })],
    [
      "statut sans identifiant",
      enveloppe({ statuses: [{ status: "sent", timestamp: "1799395200" }] }),
    ],
    ["statut sans date", enveloppe({ statuses: [{ id: "a", status: "sent" }] })],
    [
      "numéro d'expéditeur invalide",
      enveloppe({ messages: [{ id: "m", from: "abc", timestamp: "1799395200", type: "text" }] }),
    ],
    [
      "valeur absente",
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "messages" }] }],
      }),
    ],
  ])("refuse un corps mal formé : %s", (_nom, corps) => {
    expect(() => lireCorpsWebhookMeta(corps)).toThrowError(
      expect.objectContaining({ raison: "format" }),
    );
  });

  it("la signature seule ne suffit pas : un corps signé mais illisible est refusé en 400", () => {
    const c = "{}";
    const requete = {
      corpsBrut: c,
      entetes: { [ENTETE_SIGNATURE]: signerWebhook(SECRET_SIMULE, c) },
    };
    expect(verifierSignatureWebhook(SECRET_SIMULE, requete)).toBe(c);
    expect(() => lireCorpsWebhookMeta(c)).toThrowError(
      expect.objectContaining({ raison: "format" }),
    );
  });
});

describe("FournisseurWhatsAppHttp : état du compte", () => {
  it("lit la vérification, la qualité du numéro et le statut des gabarits", async () => {
    const { transport, f } = client();
    transport.repondre(
      ok({
        verified_name: "AfriMove",
        code_verification_status: "VERIFIED",
        name_status: "APPROVED",
        quality_rating: "GREEN",
        display_phone_number: "+237 6 00 00 00 00",
      }),
      ok({
        data: [
          { name: "afrimove_rapport_soir", language: "fr", status: "APPROVED" },
          { name: "afrimove_billet", language: "fr", status: "PENDING" },
          { name: "afrimove_colis_retrait", language: "fr", status: "REJECTED" },
          { name: "afrimove_alerte_proche", language: "fr", status: "PAUSED" },
        ],
      }),
    );
    const compte = await f.etatCompte();
    expect(compte).toEqual({
      verifie: true,
      nomAffiche: "AfriMove",
      numeroAffiche: "+237 6 00 00 00 00",
      qualite: "haute",
      gabarits: [
        { nom: "afrimove_rapport_soir", langue: "fr", statut: "approuve" },
        { nom: "afrimove_billet", langue: "fr", statut: "en_attente" },
        { nom: "afrimove_colis_retrait", langue: "fr", statut: "refuse" },
        { nom: "afrimove_alerte_proche", langue: "fr", statut: "suspendu" },
      ],
    });
    expect(transport.appels.map((a) => a.url)).toEqual([
      "https://graph.example/v21.0/109876543210?fields=verified_name,code_verification_status,name_status,quality_rating,display_phone_number",
      "https://graph.example/v21.0/208765432109/message_templates?fields=name,language,status&limit=100",
    ]);
    expect(transport.appels[0]?.entetes).toEqual({
      authorization: "Bearer jeton-de-test-0123456789",
    });
  });

  it("un nom non approuvé ou un numéro non vérifié donne « non vérifié »", async () => {
    const { transport, f } = client();
    transport.repondre(
      ok({
        code_verification_status: "VERIFIED",
        name_status: "PENDING_REVIEW",
        quality_rating: "RED",
      }),
      ok({ data: [] }),
    );
    const compte = await f.etatCompte();
    expect(compte.verifie).toBe(false);
    expect(compte.qualite).toBe("basse");
  });

  it("lève une erreur temporaire quand l'API ne répond pas", async () => {
    const { transport, f } = client();
    transport.repondre({ statut: 500, corps: "" });
    await expect(f.etatCompte()).rejects.toBeInstanceOf(ErreurFournisseurTemporaire);
    transport.repondre(new Error("ECONNRESET"));
    await expect(f.etatCompte()).rejects.toMatchObject({ code: "reseau" });
  });
});
