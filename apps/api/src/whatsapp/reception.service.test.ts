import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebhookInvalide, type EtatRecu } from "./fournisseur";
import { VARIABLES_BILLET, monterWhatsApp, type MontageWhatsApp } from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

const TEL = "+237655012345";

async function billetEnvoye(m: MontageWhatsApp, tel = TEL) {
  const { message } = await m.passerelle.envoyer({
    type: "billet",
    variables: VARIABLES_BILLET,
    destinataire: tel,
  });
  await m.vider();
  const envoye = await m.passerelle.obtenir(message.id);
  return { id: message.id, wamid: envoye.idFournisseur! };
}

const accuse = (
  m: MontageWhatsApp,
  wamid: string,
  etat: EtatRecu,
  extra: { code?: number | string; secondes?: number; reference?: string } = {},
) =>
  m.reception.traiter(
    m.fournisseur.fabriquerWebhook({
      statuts: [
        {
          idFournisseur: wamid,
          etat,
          ...(extra.reference ? { reference: extra.reference } : {}),
          ...(extra.code !== undefined ? { code: extra.code } : {}),
          at: new Date(m.horloge.maintenant().getTime() + (extra.secondes ?? 0) * 1000),
        },
      ],
    }),
  );

describe("accusés de livraison", () => {
  it("fait avancer le statut : envoyé, remis, lu, avec l'heure de chaque étape", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);
    const t0 = m.horloge.maintenant().getTime();

    expect(await accuse(m, wamid, "remis", { secondes: 3 })).toMatchObject({
      statuts: { recus: 1, appliques: 1, ignores: 0, inconnus: 0 },
    });
    expect(await m.passerelle.obtenir(id)).toMatchObject({
      statut: "remis",
      remisA: new Date(t0 + 3000),
      luA: null,
    });

    await accuse(m, wamid, "lu", { secondes: 60 });
    expect(await m.passerelle.obtenir(id)).toMatchObject({
      statut: "lu",
      remisA: new Date(t0 + 3000),
      luA: new Date(t0 + 60_000),
    });
  });

  it("ne recule jamais : un « envoyé » ou un « remis » tardif après « lu » est ignoré, un doublon aussi", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);
    await accuse(m, wamid, "lu");
    for (const etat of ["envoye", "remis", "lu"] as const) {
      expect(await accuse(m, wamid, etat)).toMatchObject({ statuts: { appliques: 0, ignores: 1 } });
    }
    expect((await m.passerelle.obtenir(id)).statut).toBe("lu");
  });

  it("un « lu » sans « remis » (accusé perdu) renseigne aussi l'heure de remise", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);
    await accuse(m, wamid, "lu", { secondes: 30 });
    const msg = await m.passerelle.obtenir(id);
    expect(msg.remisA).toEqual(msg.luA);
  });

  it("un accusé qui précède l'enregistrement de l'envoi retrouve son message par la référence, et le message n'est pas renvoyé", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { message } = await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: TEL,
    });
    // WhatsApp a déjà remis le message (réponse d'envoi perdue) : l'accusé arrive pendant l'attente
    const r = await accuse(m, "wamid.arrive-avant", "remis", { reference: message.id });
    expect(r.statuts.appliques).toBe(1);
    expect(await m.passerelle.obtenir(message.id)).toMatchObject({
      statut: "remis",
      idFournisseur: "wamid.arrive-avant",
    });
    await m.vider();
    expect(m.fournisseur.appels).toBe(0); // le travail en file ne renvoie rien
    expect((await m.passerelle.obtenir(message.id)).statut).toBe("remis");
  });

  it("une référence qui n'est pas un identifiant de message, ou celle d'un message déjà lié à un autre accusé, ne se rattache pas", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id } = await billetEnvoye(m);
    const r1 = await accuse(m, "wamid.autre", "remis", { reference: id });
    expect(r1.statuts.inconnus).toBe(1);
    const r2 = await accuse(m, "wamid.inconnu", "remis", { reference: "n'importe quoi" });
    expect(r2.statuts.inconnus).toBe(1);
  });

  it("compte les accusés d'un message inconnu sans échouer", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    expect(await accuse(m, "wamid.inconnu", "remis")).toEqual({
      statuts: { recus: 1, appliques: 0, ignores: 0, inconnus: 1 },
      messages: { recus: 0, enregistres: 0, doublons: 0, ignores: 0 },
    });
  });

  it("rejouer exactement le même appel signé n'a aucun effet de plus", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { wamid } = await billetEnvoye(m);
    const appel = m.fournisseur.fabriquerWebhook({
      statuts: [{ idFournisseur: wamid, etat: "remis" }],
    });
    expect((await m.reception.traiter(appel)).statuts.appliques).toBe(1);
    expect(await m.reception.traiter(appel)).toMatchObject({
      statuts: { appliques: 0, ignores: 1 },
    });
  });

  it("refuse un appel dont la signature est mauvaise : rien n'est appliqué", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);
    const faux = m.fournisseur.fabriquerWebhook(
      { statuts: [{ idFournisseur: wamid, etat: "remis" }] },
      { secret: "un-autre-secret-0123456789" },
    );
    await expect(m.reception.traiter(faux)).rejects.toBeInstanceOf(WebhookInvalide);
    expect((await m.passerelle.obtenir(id)).statut).toBe("envoye");
  });
});

describe("accusé d'échec : repli par SMS", () => {
  it("un message accepté puis signalé non remis (numéro sans WhatsApp) passe à « non remis » et part par SMS, une fois", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);

    const r = await accuse(m, wamid, "echec", { code: 131026 });
    expect(r.statuts.appliques).toBe(1);
    expect(await m.passerelle.obtenir(id)).toMatchObject({
      statut: "non_remis",
      derniereErreur: "131026",
      secours: "sms",
      secoursSmsId: "sms-1",
      secoursChiffre: null,
    });
    expect(m.secoursSms.demandes).toHaveLength(1);
    expect(m.secoursSms.demandes[0]).toMatchObject({
      type: "billet",
      destinataire: TEL,
      cle: `whatsapp-secours:${id}`,
      variables: { code: "7341" },
    });
    // doublon de l'accusé : pas de second SMS
    await accuse(m, wamid, "echec", { code: 131026 });
    expect(m.secoursSms.demandes).toHaveLength(1);
    expect(m.auditRepo.lignes.map((l) => l.action)).toEqual(["whatsapp.secours_sms"]);
  });

  it("un échec signalé après une remise est ignoré : pas de SMS en double d'un message arrivé", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { id, wamid } = await billetEnvoye(m);
    await accuse(m, wamid, "remis");
    const r = await accuse(m, wamid, "echec", { code: 131026 });
    expect(r.statuts).toMatchObject({ appliques: 0, ignores: 1 });
    expect((await m.passerelle.obtenir(id)).statut).toBe("remis");
    expect(m.secoursSms.demandes).toHaveLength(0);
  });

  it("sans canal de repli branché, le message est « non remis » et l'échec du repli est audité", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const m = monterWhatsApp({ secoursBranche: false });
    const { id, wamid } = await billetEnvoye(m);
    await accuse(m, wamid, "echec", { code: "131049" });
    expect(await m.passerelle.obtenir(id)).toMatchObject({
      statut: "non_remis",
      secours: "echec_sms",
    });
    expect(m.auditRepo.lignes.map((l) => [l.action, l.resultat])).toEqual([
      ["whatsapp.secours_echec", "echec"],
    ]);
  });

  it("un échec signalé avant même que l'envoi soit enregistré empêche l'envoi, et le SMS prend le relais", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { message } = await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: TEL,
    });
    await accuse(m, "wamid.x", "echec", { reference: message.id, code: 131026 });
    await m.vider();
    expect(m.fournisseur.appels).toBe(0);
    expect((await m.passerelle.obtenir(message.id)).statut).toBe("non_remis");
    expect(m.secoursSms.demandes).toHaveLength(1);
  });
});

describe("messages reçus", () => {
  const ecrit = (
    m: MontageWhatsApp,
    messages: Parameters<MontageWhatsApp["fournisseur"]["fabriquerWebhook"]>[0]["messages"],
  ) => m.reception.traiter(m.fournisseur.fabriquerWebhook({ messages }));

  it("enregistre le message, le remet à l'assistant avec le numéro et le texte, et ouvre la fenêtre de 24 h", async () => {
    const m = monterWhatsApp();
    const at = new Date(m.horloge.maintenant().getTime() - 5000);
    const r = await ecrit(m, [
      {
        idFournisseur: "wamid.in-1",
        de: "237655012345",
        texte: "Pourquoi le 09:30 part si vide ?",
        at,
      },
    ]);
    expect(r.messages).toEqual({ recus: 1, enregistres: 1, doublons: 0, ignores: 0 });
    expect(m.gestionnaire.recus).toHaveLength(1);
    expect(m.gestionnaire.recus[0]).toMatchObject({
      de: TEL,
      texte: "Pourquoi le 09:30 part si vide ?",
      typeMessage: "text",
      recuA: at,
    });
    const index = m.chiffrement.indexAveugle(TEL, "whatsapp.destinataire");
    expect(await m.journal.dernierEntrant(index)).toMatchObject({
      idFournisseur: "wamid.in-1",
      expediteurMasque: "+237 ••••• 345",
      repondueA: null,
    });
  });

  it("ne conserve ni le texte ni le numéro en clair dans le journal", async () => {
    const m = monterWhatsApp();
    await ecrit(m, [
      { idFournisseur: "wamid.in-1", de: "237655012345", texte: "Mon chiffre secret 4821" },
    ]);
    const index = m.chiffrement.indexAveugle(TEL, "whatsapp.destinataire");
    const stocke = JSON.stringify(await m.journal.dernierEntrant(index));
    expect(stocke).not.toContain("secret");
    expect(stocke).not.toContain("655012345");
    expect(stocke).not.toContain("4821");
  });

  it("un message reçu deux fois (WhatsApp réessaie) n'est traité qu'une fois", async () => {
    const m = monterWhatsApp();
    const appel = m.fournisseur.fabriquerWebhook({
      messages: [{ idFournisseur: "wamid.in-1", de: "237655012345", texte: "Bonjour" }],
    });
    await m.reception.traiter(appel);
    const deuxieme = await m.reception.traiter(appel);
    expect(deuxieme.messages).toMatchObject({ enregistres: 0, doublons: 1 });
    expect(m.gestionnaire.recus).toHaveLength(1);
  });

  it("un média sans texte est enregistré, remis avec texte nul", async () => {
    const m = monterWhatsApp();
    await ecrit(m, [{ idFournisseur: "wamid.in-2", de: "237655012345", type: "image" }]);
    expect(m.gestionnaire.recus[0]).toMatchObject({ typeMessage: "image", texte: null });
  });

  it("ignore un numéro illisible", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const r2 = await ecrit(m, [{ idFournisseur: "wamid.in-4", de: "00000000", texte: "x" }]);
    expect(r2.messages.ignores).toBe(1);
  });

  it("l'échec de l'assistant ne fait pas échouer le webhook (le message reste enregistré) et ne fuit pas le texte", async () => {
    const erreurs: string[] = [];
    vi.spyOn(Logger.prototype, "error").mockImplementation((...a: unknown[]) => {
      erreurs.push(a.map(String).join(" "));
    });
    const m = monterWhatsApp();
    m.gestionnaire.erreur = new Error("assistant en panne : Mon texte privé");
    const r = await ecrit(m, [
      { idFournisseur: "wamid.in-5", de: "237655012345", texte: "Mon texte privé" },
    ]);
    expect(r.messages.enregistres).toBe(1);
    expect(erreurs).toHaveLength(1);
    expect(erreurs.join("")).not.toContain("privé");
    expect(erreurs.join("")).not.toContain("655012345");
  });

  it("traite dans un même appel des accusés et des messages", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const m = monterWhatsApp();
    const { wamid } = await billetEnvoye(m);
    const r = await m.reception.traiter(
      m.fournisseur.fabriquerWebhook({
        statuts: [{ idFournisseur: wamid, etat: "remis" }],
        messages: [{ idFournisseur: "wamid.in-6", de: "237655012345", texte: "Merci" }],
      }),
    );
    expect(r).toEqual({
      statuts: { recus: 1, appliques: 1, ignores: 0, inconnus: 0 },
      messages: { recus: 1, enregistres: 1, doublons: 0, ignores: 0 },
    });
  });
});

describe("vérification d'abonnement", () => {
  it("rend le challenge au bon jeton, refuse sinon", () => {
    const m = monterWhatsApp();
    expect(
      m.reception.verifierAbonnement({
        mode: "subscribe",
        jeton: "jeton-verification-simule-tests",
        challenge: "42",
      }),
    ).toBe("42");
    expect(() =>
      m.reception.verifierAbonnement({ mode: "subscribe", jeton: "mauvais", challenge: "42" }),
    ).toThrowError(WebhookInvalide);
  });
});
