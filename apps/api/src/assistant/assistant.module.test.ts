import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerAppAnalysesTest } from "../analyses/testing/app-analyses-test";
import { HorlogeSysteme } from "../socle/horloge";
import { AssistantModule, VerificationAssistant } from "./assistant.module";
import {
  CONFIG_ASSISTANT,
  ConfigAssistantInvalide,
  MODELE_PAR_DEFAUT,
  chargerConfigAssistant,
} from "./config";
import { AppliquerActionsMemoire, ConversationsMemoire, PropositionsMemoire } from "./memoire";
import { ModeleAucun } from "./modele-langage";

let avertissements: string[];
beforeEach(() => {
  avertissements = [];
  for (const niveau of ["log", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
  vi.spyOn(Logger.prototype, "warn").mockImplementation((message: unknown) => {
    avertissements.push(String(message));
  });
});
afterEach(() => vi.restoreAllMocks());

describe("chargerConfigAssistant", () => {
  it("sans clé : les règles répondent seules, avec les valeurs par défaut", () => {
    expect(chargerConfigAssistant({})).toEqual({
      production: false,
      modele: {
        fournisseur: "regles",
        cleApi: null,
        id: MODELE_PAR_DEFAUT,
        url: "https://api.anthropic.com",
        effort: "low",
        delaiMs: 3_500,
      },
      peremptionJours: 7,
      questionsParMinute: 10,
      echangesGardes: 50,
    });
  });

  it("avec une clé : Claude, sauf si ASSISTANT_MODELE_LANGAGE=regles", () => {
    expect(chargerConfigAssistant({ ANTHROPIC_API_KEY: "cle" }).modele.fournisseur).toBe("claude");
    expect(
      chargerConfigAssistant({ ANTHROPIC_API_KEY: "cle", ASSISTANT_MODELE_LANGAGE: "regles" })
        .modele.fournisseur,
    ).toBe("regles");
  });

  it("lit chaque réglage et refuse les valeurs hors bornes, toutes d'un coup", () => {
    const c = chargerConfigAssistant(
      {
        ANTHROPIC_API_KEY: "cle",
        ASSISTANT_MODELE: "claude-opus-5-5",
        ASSISTANT_EFFORT: "",
        ASSISTANT_DELAI_MS: "2000",
        ASSISTANT_PEREMPTION_JOURS: "3",
        ASSISTANT_QUESTIONS_PAR_MINUTE: "20",
        ASSISTANT_ECHANGES_GARDES: "10",
        ASSISTANT_URL_API: "http://localhost:8080/",
      },
      true,
    );
    expect(c).toMatchObject({
      production: true,
      modele: { id: "claude-opus-5-5", effort: null, delaiMs: 2_000, url: "http://localhost:8080" },
      peremptionJours: 3,
      questionsParMinute: 20,
      echangesGardes: 10,
    });
    expect(() =>
      chargerConfigAssistant({
        ASSISTANT_MODELE_LANGAGE: "claude",
        ASSISTANT_DELAI_MS: "10",
        ASSISTANT_PEREMPTION_JOURS: "31",
        ASSISTANT_URL_API: "http://exemple.fr",
        ASSISTANT_EFFORT: "max",
      }),
    ).toThrow(ConfigAssistantInvalide);
    try {
      chargerConfigAssistant({ ASSISTANT_DELAI_MS: "10", ASSISTANT_QUESTIONS_PAR_MINUTE: "0" });
    } catch (e) {
      expect((e as Error).message).toContain("ASSISTANT_DELAI_MS");
      expect((e as Error).message).toContain("ASSISTANT_QUESTIONS_PAR_MINUTE");
    }
  });
});

describe("VerificationAssistant (garde de production)", () => {
  const durable = <T extends object>(port: T): T => Object.assign(port, { durable: true });
  const garde = (production: boolean, ports: { c?: boolean; p?: boolean; a?: boolean } = {}) => {
    const conversations = new ConversationsMemoire();
    const propositions = new PropositionsMemoire();
    const actions = new AppliquerActionsMemoire(new HorlogeSysteme());
    return new VerificationAssistant(
      chargerConfigAssistant({}, production),
      ports.c ? durable(conversations) : conversations,
      ports.p ? durable(propositions) : propositions,
      ports.a ? durable(actions) : actions,
      new ModeleAucun(),
    );
  };

  it("hors production, tout est permis", () => {
    expect(() => garde(false).onModuleInit()).not.toThrow();
  });

  it("en production, refuse de démarrer tant qu'un port est en mémoire, et les nomme", () => {
    expect(() => garde(true).onModuleInit()).toThrow(
      /ConversationsAssistant, PropositionsAssistant, AppliquerActions/,
    );
    expect(() => garde(true, { c: true, p: true }).onModuleInit()).toThrow(/AppliquerActions/);
  });

  it("en production avec des ports durables : démarre, et prévient quand il n'y a pas de modèle", () => {
    expect(() => garde(true, { c: true, p: true, a: true }).onModuleInit()).not.toThrow();
    expect(avertissements.join(" ")).toContain("ANTHROPIC_API_KEY");
  });

  it("l'application complète refuse de démarrer en production avec les adaptateurs en mémoire", async () => {
    await expect(
      creerAppAnalysesTest({
        modules: [AssistantModule],
        remplacements: [[CONFIG_ASSISTANT, chargerConfigAssistant({}, true)]],
      }),
    ).rejects.toThrow(/AssistantModule/);
  });
});
