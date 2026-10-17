import { describe, expect, it } from "vitest";
import { chargerConfigAssistant, type ConfigModele } from "./config";
import {
  ErreurModele,
  MAX_TOKENS,
  ModeleAucun,
  ModeleClaude,
  TransportClaude,
  TransportFetch,
  VERSION_API_ANTHROPIC,
  extraireJson,
  type ReponseHttp,
  type RequeteClaude,
} from "./modele-langage";
import type { DemandeRedaction } from "./ports";

class TransportSimule extends TransportClaude {
  readonly requetes: Array<{ requete: RequeteClaude; delaiMs: number }> = [];
  constructor(public reponse: ReponseHttp | Error) {
    super();
  }
  async envoyer(requete: RequeteClaude, delaiMs: number): Promise<ReponseHttp> {
    this.requetes.push({ requete, delaiMs });
    if (this.reponse instanceof Error) throw this.reponse;
    return this.reponse;
  }
}

const config: ConfigModele = {
  fournisseur: "claude",
  cleApi: "cle-secrete-de-test",
  id: "claude-sonnet-5-5",
  url: "https://api.anthropic.com",
  effort: "low",
  delaiMs: 3_500,
};

const ok = (texte: string, extra: Record<string, unknown> = {}): ReponseHttp => ({
  statut: 200,
  corps: { stop_reason: "end_turn", content: [{ type: "text", text: texte }], ...extra },
});

const demande: DemandeRedaction = {
  intention: "pourquoi_ligne",
  question: "Pourquoi Bafoussam baisse ?",
  faits: ["Douala → Bafoussam fait − 14 % sur deux semaines."],
  avecPoints: true,
  motsObligatoires: [],
};

describe("la requête envoyée à l'API Messages d'Anthropic", () => {
  it("suit le format documenté : en-têtes, modèle, system, un seul message, effort bas, ni température ni préremplissage", async () => {
    const t = new TransportSimule(ok('{"resume":"a","points":["b"]}'));
    await new ModeleClaude(config, t).rediger(demande);
    const { requete, delaiMs } = t.requetes[0]!;
    expect(requete.url).toBe("https://api.anthropic.com/v1/messages");
    expect(requete.entetes).toEqual({
      "content-type": "application/json",
      "x-api-key": "cle-secrete-de-test",
      "anthropic-version": VERSION_API_ANTHROPIC,
    });
    expect(requete.corps).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
    });
    expect(Object.keys(requete.corps).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "output_config",
      "system",
    ]);
    const messages = requete.corps["messages"] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    // Pas de préremplissage : le dernier message est celui de l'utilisateur.
    expect(messages.at(-1)!.role).toBe("user");
    expect(delaiMs).toBe(3_500);
  });

  it("ne contient que la question et les faits : pas la clé, pas de donnée en plus", async () => {
    const t = new TransportSimule(ok('{"resume":"a","points":["b"]}'));
    await new ModeleClaude(config, t).rediger(demande);
    const corps = JSON.stringify(t.requetes[0]!.requete.corps);
    expect(corps).not.toContain("cle-secrete-de-test");
    expect(corps).toContain("Pourquoi Bafoussam baisse ?");
    expect(corps).toContain("Douala → Bafoussam fait − 14 % sur deux semaines.");
  });

  it("l'effort se règle ou se retire, le modèle et l'adresse aussi", async () => {
    const t = new TransportSimule(ok('{"resume":"a","points":[]}'));
    await new ModeleClaude(
      { ...config, effort: null, id: "claude-haiku-5-5", url: "http://localhost:9999" },
      t,
    ).rediger({
      ...demande,
      avecPoints: false,
    });
    const { requete } = t.requetes[0]!;
    expect(requete.url).toBe("http://localhost:9999/v1/messages");
    expect(requete.corps["model"]).toBe("claude-haiku-5-5");
    expect(requete.corps).not.toHaveProperty("output_config");
  });
});

describe("lire la réponse de l'API", () => {
  it("lit le texte par type de bloc, même si une réflexion le précède", async () => {
    const t = new TransportSimule({
      statut: 200,
      corps: {
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: 'Voici : {"resume": "Résumé", ' },
          { type: "text", text: '"points": ["Un", "Deux"]}' },
        ],
      },
    });
    expect(await new ModeleClaude(config, t).rediger(demande)).toEqual({
      resume: "Résumé",
      points: ["Un", "Deux"],
    });
  });

  it("accepte un JSON entouré de balises de code", async () => {
    const t = new TransportSimule(ok('```json\n{"resume":"R","points":[]}\n```'));
    expect(await new ModeleClaude(config, t).rediger(demande)).toEqual({ resume: "R", points: [] });
  });

  it("un refus des classifieurs de sécurité ou une réponse tronquée rendent null (les règles répondront)", async () => {
    for (const stop of ["refusal", "max_tokens"]) {
      const t = new TransportSimule(ok('{"resume":"R","points":[]}', { stop_reason: stop }));
      expect(await new ModeleClaude(config, t).rediger(demande)).toBeNull();
    }
  });

  it("une réponse sans JSON, sans texte ou de forme inattendue rend null", async () => {
    for (const reponse of [
      ok("Je ne peux pas répondre."),
      ok("{pas du json}"),
      ok('{"resume": 4}'),
      ok('{"resume":"R","points":"non"}'),
      ok('{"resume":"R","points":[1]}'),
      { statut: 200, corps: { stop_reason: "end_turn", content: [] } },
      { statut: 200, corps: { stop_reason: "end_turn", content: "texte" } },
      { statut: 200, corps: null },
    ] as ReponseHttp[]) {
      expect(
        await new ModeleClaude(config, new TransportSimule(reponse)).rediger(demande),
      ).toBeNull();
    }
  });

  it("une erreur HTTP lève ErreurModele avec le type d'erreur, jamais le contenu ni la clé", async () => {
    const t = new TransportSimule({
      statut: 429,
      corps: { type: "error", error: { type: "rate_limit_error", message: "trop de requêtes" } },
    });
    const erreur = await new ModeleClaude(config, t).rediger(demande).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurModele);
    expect((erreur as Error).message).toBe("Le modèle a répondu 429 (rate_limit_error)");
    expect((erreur as Error).message).not.toContain("cle-secrete");
  });

  it("une panne du transport (délai dépassé, réseau) remonte telle quelle", async () => {
    const t = new TransportSimule(new Error("délai dépassé"));
    await expect(new ModeleClaude(config, t).rediger(demande)).rejects.toThrow("délai dépassé");
  });
});

describe("interpréter une question libre", () => {
  const lignes = ["Douala → Bafoussam", "Douala → Yaoundé"];

  it("range la question dans un choix fermé, avec la liste des lignes dans le message", async () => {
    const t = new TransportSimule(
      ok('{"intention":"prevision_jour","ligne":null,"heure":null,"jourSemaine":6,"prix":null}'),
    );
    const choix = await new ModeleClaude(config, t).interpreter("Combien samedi ?", lignes);
    expect(choix).toEqual({
      intention: "prevision_jour",
      ligne: null,
      heure: null,
      jourSemaine: 6,
      prix: null,
    });
    const message = (t.requetes[0]!.requete.corps["messages"] as Array<{ content: string }>)[0]!
      .content;
    expect(message).toContain("- Douala → Bafoussam");
    expect(message).toContain("Question : Combien samedi ?");
  });

  it("une intention hors de la liste ou un JSON absent rendent null", async () => {
    for (const texte of [
      '{"intention":"supprimer_tout","ligne":null,"heure":null,"jourSemaine":null,"prix":null}',
      "rien",
      '{"ligne":"x"}',
    ]) {
      expect(
        await new ModeleClaude(config, new TransportSimule(ok(texte))).interpreter("q", lignes),
      ).toBeNull();
    }
  });

  it("des champs de mauvais type deviennent null plutôt que d'être crus", async () => {
    const t = new TransportSimule(
      ok('{"intention":"et_si_prix","ligne":4,"heure":930,"jourSemaine":"samedi","prix":"3500"}'),
    );
    expect(await new ModeleClaude(config, t).interpreter("q", lignes)).toEqual({
      intention: "et_si_prix",
      ligne: null,
      heure: null,
      jourSemaine: null,
      prix: null,
    });
  });
});

describe("sans modèle, et utilitaires", () => {
  it("ModeleAucun n'appelle rien et ne répond rien", async () => {
    const m = new ModeleAucun();
    expect(m.actif).toBe(false);
    expect(m.nom).toBe("regles");
    expect(await m.rediger()).toBeNull();
    expect(await m.interpreter()).toBeNull();
  });

  it("extraireJson ignore ce qui entoure l'objet", () => {
    expect(extraireJson('avant {"a":1} après')).toEqual({ a: 1 });
    expect(extraireJson("aucun objet")).toBeNull();
    expect(extraireJson("{cassé")).toBeNull();
  });

  it("le transport réel est celui du module par défaut et coupe au délai", async () => {
    const t = new TransportFetch();
    await expect(
      t.envoyer({ url: "http://127.0.0.1:9/v1/messages", entetes: {}, corps: {} }, 500),
    ).rejects.toBeDefined();
  });
});

describe("configuration de l'assistant", () => {
  it("par défaut : règles seules sans clé ; Claude, le modèle rapide et l'effort bas avec une clé", () => {
    expect(chargerConfigAssistant({}).modele).toMatchObject({
      fournisseur: "regles",
      cleApi: null,
      id: "claude-sonnet-5-5",
      url: "https://api.anthropic.com",
      effort: "low",
      delaiMs: 3_500,
    });
    expect(chargerConfigAssistant({ ANTHROPIC_API_KEY: "k" }).modele.fournisseur).toBe("claude");
    expect(
      chargerConfigAssistant({ ANTHROPIC_API_KEY: "k", ASSISTANT_MODELE_LANGAGE: "regles" }).modele
        .fournisseur,
    ).toBe("regles");
  });

  it("rejette ce qui est invalide, avec toutes les erreurs d'un coup", () => {
    expect(() =>
      chargerConfigAssistant({
        ASSISTANT_MODELE_LANGAGE: "claude",
        ASSISTANT_URL_API: "http://exemple.cm",
        ASSISTANT_EFFORT: "enorme",
        ASSISTANT_DELAI_MS: "10",
        ASSISTANT_PEREMPTION_JOURS: "0",
        ASSISTANT_QUESTIONS_PAR_MINUTE: "abc",
        ASSISTANT_ECHANGES_GARDES: "1000",
      }),
    ).toThrow(
      /ANTHROPIC_API_KEY est obligatoire.*https:\/\/.*ASSISTANT_EFFORT.*ASSISTANT_DELAI_MS.*ASSISTANT_PEREMPTION_JOURS.*ASSISTANT_QUESTIONS_PAR_MINUTE.*ASSISTANT_ECHANGES_GARDES/,
    );
    expect(() => chargerConfigAssistant({ ASSISTANT_MODELE_LANGAGE: "gpt" })).toThrow(
      /claude ou regles/,
    );
  });

  it("l'effort peut être retiré, le délai et les limites réglés", () => {
    const c = chargerConfigAssistant({
      ASSISTANT_EFFORT: "",
      ASSISTANT_DELAI_MS: "2000",
      ASSISTANT_PEREMPTION_JOURS: "14",
      ASSISTANT_QUESTIONS_PAR_MINUTE: "5",
      ASSISTANT_ECHANGES_GARDES: "20",
      ASSISTANT_MODELE: "claude-haiku-5-5",
    });
    expect(c.modele).toMatchObject({ effort: null, delaiMs: 2_000, id: "claude-haiku-5-5" });
    expect(c).toMatchObject({ peremptionJours: 14, questionsParMinute: 5, echangesGardes: 20 });
  });
});
