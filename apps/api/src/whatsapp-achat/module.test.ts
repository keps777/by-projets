import { Logger } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FenetreFermee } from "../whatsapp/erreurs";
import type { EntrantRecu } from "../whatsapp/ports";
import { MessagerieAchatPasserelle } from "./adaptateurs";
import { chargerConfigAchatWhatsApp } from "./config";
import type { ConversationAchatService } from "./conversation.service";
import { GestionnaireEntrantsAchat } from "./gestionnaire";
import {
  AchatsMemoire,
  ConversationsMemoire,
  EquipeMemoire,
  JournalAchatMemoire,
  MessagerieMemoire,
  TranscriptionAucune,
  TranscriptionMemoire,
} from "./memoire";
import { EnvoiAchatImpossible, type MessageAchat } from "./ports";
import { VerificationAchatWhatsApp } from "./whatsapp-achat.module";

afterEach(() => vi.restoreAllMocks());

const durable = <T extends object>(o: T): T =>
  Object.assign(Object.create(Object.getPrototypeOf(o)), o, { durable: true });

describe("VerificationAchatWhatsApp : garde-fou de production", () => {
  const verifier = (
    options: {
      production?: boolean;
      vocal?: boolean;
      conversations?: ConversationsMemoire;
      journal?: JournalAchatMemoire;
      achats?: AchatsMemoire;
      messagerie?: MessagerieMemoire | MessagerieAchatPasserelle;
      transcription?: TranscriptionAucune | TranscriptionMemoire;
    } = {},
  ) => {
    const config = {
      ...chargerConfigAchatWhatsApp({ WHATSAPP_ACHAT_VOCAL: String(options.vocal ?? true) }),
      production: options.production ?? true,
    };
    return new VerificationAchatWhatsApp(
      config,
      options.conversations ?? new ConversationsMemoire(),
      options.journal ?? new JournalAchatMemoire(),
      options.achats ?? new AchatsMemoire(),
      options.messagerie ?? new MessagerieMemoire(),
      options.transcription ?? new TranscriptionAucune(),
    ).onApplicationBootstrap();
  };

  const passerelleMontee = () =>
    new MessagerieAchatPasserelle({ get: () => ({}) } as unknown as ModuleRef);
  const passerelleAbsente = () =>
    new MessagerieAchatPasserelle({
      get: () => {
        throw new Error("introuvable");
      },
    } as unknown as ModuleRef);

  it("refuse de démarrer en production avec tout en mémoire, et dit tout ce qui manque", () => {
    expect(() => verifier()).toThrow(/conversations sont en mémoire/);
    expect(() => verifier()).toThrow(/journal est en mémoire/);
    expect(() => verifier()).toThrow(/achats sont en mémoire/);
    expect(() => verifier()).toThrow(/envoi des messages n'est pas branché/);
  });

  it.each([
    [
      "les conversations",
      { conversations: new ConversationsMemoire() },
      /conversations sont en mémoire/,
    ],
    ["le journal", { journal: new JournalAchatMemoire() }, /journal est en mémoire/],
    ["les achats", { achats: new AchatsMemoire() }, /achats sont en mémoire/],
  ] as const)("refuse si seul(e) %s reste en mémoire", (_nom, enMemoire, message) => {
    expect(() =>
      verifier({
        conversations: durable(new ConversationsMemoire()),
        journal: durable(new JournalAchatMemoire()),
        achats: durable(new AchatsMemoire()),
        messagerie: passerelleMontee(),
        ...enMemoire,
      }),
    ).toThrow(message);
  });

  it("refuse si la passerelle WhatsApp n'est pas montée dans l'application", () => {
    expect(() =>
      verifier({
        conversations: durable(new ConversationsMemoire()),
        journal: durable(new JournalAchatMemoire()),
        achats: durable(new AchatsMemoire()),
        messagerie: passerelleAbsente(),
      }),
    ).toThrow(/WhatsAppModule n'est pas monté/);
  });

  it("démarre en production quand tout est branché", () => {
    expect(() =>
      verifier({
        conversations: durable(new ConversationsMemoire()),
        journal: durable(new JournalAchatMemoire()),
        achats: durable(new AchatsMemoire()),
        messagerie: passerelleMontee(),
        transcription: new TranscriptionMemoire(),
      }),
    ).not.toThrow();
  });

  it("hors production, la mémoire est permise", () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    expect(() => verifier({ production: false })).not.toThrow();
  });

  it("signale (sans bloquer) des vocaux activés sans transcription branchée", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    verifier({ production: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("transcription vocale");
  });

  it("ne signale rien si les vocaux sont coupés ou la transcription branchée", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    verifier({ production: false, vocal: false });
    verifier({ production: false, transcription: new TranscriptionMemoire() });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("MessagerieAchatPasserelle", () => {
  const message: MessageAchat = {
    destinataire: "+237691221008",
    texte: "✓ Payé.",
    cle: "achat-wa:billet:b1",
    compagnieId: "c1",
  };
  const billet = {
    billetId: "b1",
    demandeurId: "v1",
    variables: {
      compagnie: "Alpha",
      origine: "Douala",
      destination: "Yaoundé",
      departA: new Date("2026-11-03T07:30:00Z"),
      siege: "4",
      code: "5582",
      lien: "https://afrimove.app/b/x",
    },
  };

  const avec = (passerelle: {
    repondre: ReturnType<typeof vi.fn>;
    envoyer: ReturnType<typeof vi.fn>;
  }) => new MessagerieAchatPasserelle({ get: () => passerelle } as unknown as ModuleRef);

  it("envoie le texte libre par `repondre`, avec la clé d'idempotence", async () => {
    const passerelle = { repondre: vi.fn().mockResolvedValue(undefined), envoyer: vi.fn() };
    await avec(passerelle).envoyer(message);
    expect(passerelle.repondre).toHaveBeenCalledWith({
      destinataire: "+237691221008",
      texte: "✓ Payé.",
      cle: "achat-wa:billet:b1",
      compagnieId: "c1",
    });
    expect(passerelle.envoyer).not.toHaveBeenCalled();
  });

  it("fenêtre de 24 h fermée : le billet part par le gabarit « billet »", async () => {
    const passerelle = {
      repondre: vi.fn().mockRejectedValue(new FenetreFermee()),
      envoyer: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await avec(passerelle).envoyer({ ...message, billet });
    expect(passerelle.envoyer).toHaveBeenCalledWith({
      type: "billet",
      variables: billet.variables,
      destinataire: "+237691221008",
      cle: "achat-wa:billet:b1:gabarit",
      reference: { type: "billet", id: "b1" },
      compagnieId: "c1",
      demandeurId: "v1",
    });
  });

  it("fenêtre fermée pour un message qui n'est pas un billet : envoi impossible, sans réessai", async () => {
    const passerelle = {
      repondre: vi.fn().mockRejectedValue(new FenetreFermee()),
      envoyer: vi.fn(),
    };
    await expect(avec(passerelle).envoyer(message)).rejects.toMatchObject({
      name: "EnvoiAchatImpossible",
      code: "FENETRE_FERMEE",
    });
    await expect(avec(passerelle).envoyer(message)).rejects.toBeInstanceOf(EnvoiAchatImpossible);
    expect(passerelle.envoyer).not.toHaveBeenCalled();
  });

  it("toute autre erreur d'envoi remonte (elle est supposée passagère)", async () => {
    const passerelle = {
      repondre: vi.fn().mockRejectedValue(new Error("file saturée")),
      envoyer: vi.fn(),
    };
    await expect(avec(passerelle).envoyer({ ...message, billet })).rejects.toThrow("file saturée");
    expect(passerelle.envoyer).not.toHaveBeenCalled();
  });
});

describe("GestionnaireEntrantsAchat : qui reçoit quoi", () => {
  const entrant = (
    de = "+237691221008",
    texte: string | null = "billet Douala Yaoundé",
  ): EntrantRecu => ({
    id: "m1",
    de,
    texte,
    typeMessage: "text",
    recuA: new Date("2026-11-02T06:00:00Z"),
  });

  const monter = (
    resultat: "traite" | "ignore",
    options: { suivant?: boolean; panne?: boolean } = {},
  ) => {
    const conversation = {
      traiter: vi.fn(async () => {
        if (options.panne) throw new Error("base indisponible");
        return resultat;
      }),
      repondreHorsSujet: vi.fn().mockResolvedValue(undefined),
    };
    const suivant = options.suivant ? { traiter: vi.fn().mockResolvedValue(undefined) } : null;
    const equipe = new EquipeMemoire().ajouter("+237655010001");
    const gestionnaire = new GestionnaireEntrantsAchat(
      conversation as unknown as ConversationAchatService,
      equipe,
      suivant,
    );
    return { gestionnaire, conversation, suivant };
  };

  it("un voyageur va à l'achat", async () => {
    const { gestionnaire, conversation, suivant } = monter("traite", { suivant: true });
    await gestionnaire.traiter(entrant());
    expect(conversation.traiter).toHaveBeenCalledTimes(1);
    expect(suivant!.traiter).not.toHaveBeenCalled();
  });

  it("l'équipe va à l'assistant, jamais à l'achat", async () => {
    const { gestionnaire, conversation, suivant } = monter("traite", { suivant: true });
    await gestionnaire.traiter(entrant("+237655010001", "Combien de billets hier ?"));
    expect(conversation.traiter).not.toHaveBeenCalled();
    expect(suivant!.traiter).toHaveBeenCalledTimes(1);
  });

  it("l'équipe sans assistant : rien ne part", async () => {
    const { gestionnaire, conversation } = monter("traite");
    await gestionnaire.traiter(entrant("+237655010001"));
    expect(conversation.traiter).not.toHaveBeenCalled();
    expect(conversation.repondreHorsSujet).not.toHaveBeenCalled();
  });

  it("un message hors sujet va à l'assistant s'il y en a un", async () => {
    const { gestionnaire, conversation, suivant } = monter("ignore", { suivant: true });
    await gestionnaire.traiter(entrant("+237691221008", "Pourquoi le 09:30 part si vide ?"));
    expect(suivant!.traiter).toHaveBeenCalledTimes(1);
    expect(conversation.repondreHorsSujet).not.toHaveBeenCalled();
  });

  it("un message hors sujet sans assistant reçoit la phrase d'orientation", async () => {
    const { gestionnaire, conversation } = monter("ignore");
    await gestionnaire.traiter(entrant("+237691221008", "Pourquoi le 09:30 part si vide ?"));
    expect(conversation.repondreHorsSujet).toHaveBeenCalledTimes(1);
  });

  it("une erreur ne remonte jamais au webhook et n'écrit ni numéro ni texte dans les logs", async () => {
    const erreur = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { gestionnaire } = monter("traite", { panne: true });
    await expect(gestionnaire.traiter(entrant())).resolves.toBeUndefined();
    expect(erreur).toHaveBeenCalledTimes(1);
    const trace = String(erreur.mock.calls[0]![0]);
    expect(trace).toContain("m1");
    expect(trace).not.toContain("691221008");
    expect(trace).not.toContain("Douala");
  });
});

describe("adaptateurs en mémoire", () => {
  const maintenant = new Date("2026-11-02T06:00:00Z");
  const plus = (min: number) => new Date(maintenant.getTime() + min * 60_000);

  it("une conversation expire à son échéance et se purge", async () => {
    const c = new ConversationsMemoire();
    await c.ecrire({ cle: "a", expireA: plus(15), charge: "x" });
    await c.ecrire({ cle: "b", expireA: plus(5), charge: "y" });
    expect(await c.lire("a", plus(14))).toMatchObject({ charge: "x" });
    expect(await c.lire("b", plus(5))).toBeNull();
    expect(await c.purger(plus(20))).toBe(1);
    expect(await c.lire("a", plus(20))).toBeNull();
    expect(c.toutes).toEqual([]);
  });

  it("la lecture renvoie une copie : modifier le résultat ne change pas le stockage", async () => {
    const c = new ConversationsMemoire();
    await c.ecrire({ cle: "a", expireA: plus(15), charge: "x" });
    const lue = (await c.lire("a", maintenant))!;
    lue.charge = "modifiée";
    expect((await c.lire("a", maintenant))!.charge).toBe("x");
  });

  it("supprimer une conversation", async () => {
    const c = new ConversationsMemoire();
    await c.ecrire({ cle: "a", expireA: plus(15), charge: "x" });
    await c.supprimer("a");
    expect(await c.lire("a", maintenant)).toBeNull();
  });

  it("les achats : transition seulement depuis un état attendu, plus anciens d'abord", async () => {
    const achats = new AchatsMemoire();
    const base = { voyageurId: "v", langue: "fr" as const, destinataireChiffre: "c" };
    await achats.ajouter({ ...base, commandeId: "c2", etat: "reservee", creeA: plus(2) });
    await achats.ajouter({ ...base, commandeId: "c1", etat: "reservee", creeA: plus(1) });
    expect((await achats.enEtat(["reservee"], 10)).map((a) => a.commandeId)).toEqual(["c1", "c2"]);
    expect(await achats.enEtat(["reservee"], 1)).toHaveLength(1);

    expect((await achats.transitionner("c1", ["reservee"], "paiement_demande"))!.etat).toBe(
      "paiement_demande",
    );
    // déjà changé : le second appelant n'obtient rien (un seul traitement par achat)
    expect(await achats.transitionner("c1", ["reservee"], "abandonnee")).toBeNull();
    expect(await achats.transitionner("inconnue", ["reservee"], "abandonnee")).toBeNull();
    expect((await achats.trouver("c1"))!.etat).toBe("paiement_demande");
    expect(await achats.trouver("inconnue")).toBeNull();
  });

  it("le journal en mémoire a un plafond", async () => {
    const journal = new JournalAchatMemoire();
    const entree = {
      id: "i",
      at: maintenant,
      numeroMasque: null,
      conversationRef: null,
      evenement: "message" as const,
      etape: null,
      langue: null,
      source: null,
      code: null,
      dureeMs: null,
    };
    for (let i = 0; i < JournalAchatMemoire.PLAFOND + 5; i++)
      await journal.enregistrer({ ...entree, id: String(i) });
    expect(journal.entrees).toHaveLength(JournalAchatMemoire.PLAFOND);
    expect(journal.entrees[0]!.id).toBe("5");
  });

  it("la messagerie en mémoire n'envoie qu'une fois par clé, et peut tomber en panne", async () => {
    const m = new MessagerieMemoire();
    const message = { destinataire: "+237691221008", texte: "a", cle: "k" };
    await m.envoyer(message);
    await m.envoyer({ ...message, texte: "b" });
    expect(m.envoyes).toHaveLength(1);
    m.panne = true;
    await expect(m.envoyer({ ...message, cle: "k2" })).rejects.toThrow();
  });

  it("la transcription en mémoire ne connaît que ce qu'on lui apprend", async () => {
    const tr = new TranscriptionMemoire().definir("m1", { texte: "bonjour", langue: "fr" });
    expect(await tr.transcrire({ idMedia: "m1", expediteur: "+237691221008" })).toEqual({
      texte: "bonjour",
      langue: "fr",
    });
    expect(await tr.transcrire({ idMedia: "m2", expediteur: "+237691221008" })).toBeNull();
    expect(tr.demandes).toHaveLength(2);
    expect(await new TranscriptionAucune().transcrire()).toBeNull();
    expect(new TranscriptionAucune().branchee).toBe(false);
  });
});
