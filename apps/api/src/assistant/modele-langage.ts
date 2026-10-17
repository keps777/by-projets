import { Injectable } from "@nestjs/common";
import type { ConfigModele } from "./config";
import {
  ModeleLangage,
  type ChoixInterpretation,
  type DemandeRedaction,
  type Redige,
} from "./ports";
import {
  INSTRUCTIONS_INTERPRETATION,
  INSTRUCTIONS_REDACTION,
  messageInterpretation,
  messageRedaction,
} from "./redaction";

/**
 * Pas de modèle de langage : l'API écrit seule ses réponses (c'est aussi le mode de repli de tous les autres).
 */
@Injectable()
export class ModeleAucun extends ModeleLangage {
  readonly nom = "regles";
  readonly actif = false;
  async rediger(): Promise<null> {
    return null;
  }
  async interpreter(): Promise<null> {
    return null;
  }
}

/* ------------------------------------------------------------------ transport HTTP */

export interface RequeteClaude {
  url: string;
  entetes: Record<string, string>;
  corps: Record<string, unknown>;
}

export interface ReponseHttp {
  statut: number;
  corps: unknown;
}

/**
 * L'appel HTTP vers l'API Anthropic, derrière un port : les tests le remplacent, et le jour où le SDK
 * officiel (`@anthropic-ai/sdk`) est ajouté aux dépendances de l'API, seul ce transport change.
 */
export abstract class TransportClaude {
  /** Doit lever une erreur au-delà de `delaiMs`. */
  abstract envoyer(requete: RequeteClaude, delaiMs: number): Promise<ReponseHttp>;
}

@Injectable()
export class TransportFetch extends TransportClaude {
  async envoyer(requete: RequeteClaude, delaiMs: number): Promise<ReponseHttp> {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delaiMs);
    try {
      const reponse = await fetch(requete.url, {
        method: "POST",
        headers: requete.entetes,
        body: JSON.stringify(requete.corps),
        signal: arret.signal,
      });
      const texte = await reponse.text();
      let corps: unknown = null;
      try {
        corps = JSON.parse(texte);
      } catch {
        corps = null;
      }
      return { statut: reponse.status, corps };
    } finally {
      clearTimeout(minuteur);
    }
  }
}

/* ------------------------------------------------------------------ Claude */

export const VERSION_API_ANTHROPIC = "2023-06-01";
/** Place pour la réponse et pour la réflexion (qui compte dans `max_tokens`). */
export const MAX_TOKENS = 2_000;

export class ErreurModele extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurModele";
  }
}

/** L'objet JSON d'un texte, même entouré de quelques mots ou de balises de code. */
export function extraireJson(texte: string): unknown {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

const INTENTIONS_CHOIX = [
  "pourquoi_ligne",
  "cout_bus",
  "prevision_jour",
  "et_si_prix",
  "ou_part_argent",
  "inconnue",
] as const;

/**
 * Claude, par l'API Messages (`POST /v1/messages`). Pas de température ni de préremplissage ; l'effort
 * est réglé par `ASSISTANT_EFFORT` (bas par défaut : on reformule, on ne raisonne pas). Une réponse
 * refusée par les classifieurs de sécurité (`stop_reason: "refusal"`), tronquée, illisible ou une erreur
 * HTTP rendent `null` ou lèvent `ErreurModele` : l'appelant retombe sur les règles.
 *
 * La clé ne figure dans aucun message d'erreur ni journal.
 */
export class ModeleClaude extends ModeleLangage {
  readonly actif = true;

  constructor(
    private readonly config: ConfigModele,
    private readonly transport: TransportClaude,
  ) {
    super();
  }

  get nom(): string {
    return this.config.id;
  }

  /** La requête exacte envoyée (exposée pour les tests : elle ne doit contenir aucune donnée personnelle). */
  requete(systeme: string, message: string): RequeteClaude {
    return {
      url: `${this.config.url}/v1/messages`,
      entetes: {
        "content-type": "application/json",
        "x-api-key": this.config.cleApi ?? "",
        "anthropic-version": VERSION_API_ANTHROPIC,
      },
      corps: {
        model: this.config.id,
        max_tokens: MAX_TOKENS,
        system: systeme,
        messages: [{ role: "user", content: message }],
        ...(this.config.effort ? { output_config: { effort: this.config.effort } } : {}),
      },
    };
  }

  private async demander(systeme: string, message: string): Promise<string | null> {
    const reponse = await this.transport.envoyer(
      this.requete(systeme, message),
      this.config.delaiMs,
    );
    const corps = reponse.corps as {
      stop_reason?: unknown;
      content?: unknown;
      error?: { type?: unknown };
    } | null;
    if (reponse.statut < 200 || reponse.statut >= 300) {
      const type = typeof corps?.error?.type === "string" ? ` (${corps.error.type})` : "";
      throw new ErreurModele(`Le modèle a répondu ${reponse.statut}${type}`);
    }
    if (corps === null || corps.stop_reason === "refusal" || corps.stop_reason === "max_tokens") {
      return null;
    }
    if (!Array.isArray(corps.content)) return null;
    // Par type de bloc, jamais par position : une réflexion peut précéder le texte.
    const texte = (corps.content as Array<{ type?: unknown; text?: unknown }>)
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    return texte.length > 0 ? texte : null;
  }

  async rediger(demande: DemandeRedaction): Promise<Redige | null> {
    const texte = await this.demander(INSTRUCTIONS_REDACTION, messageRedaction(demande));
    if (texte === null) return null;
    const json = extraireJson(texte) as { resume?: unknown; points?: unknown } | null;
    if (json === null || typeof json.resume !== "string") return null;
    const points = json.points === undefined ? [] : json.points;
    if (!Array.isArray(points) || !points.every((p) => typeof p === "string")) return null;
    return { resume: json.resume, points: points as string[] };
  }

  async interpreter(
    question: string,
    lignes: readonly string[],
  ): Promise<ChoixInterpretation | null> {
    const texte = await this.demander(
      INSTRUCTIONS_INTERPRETATION,
      messageInterpretation(question, lignes),
    );
    if (texte === null) return null;
    const json = extraireJson(texte) as Record<string, unknown> | null;
    if (json === null) return null;
    const intention = INTENTIONS_CHOIX.find((i) => i === json["intention"]);
    if (!intention) return null;
    const optionnel = <T>(v: unknown, type: "string" | "number"): T | null =>
      typeof v === type ? (v as T) : null;
    return {
      intention,
      ligne: optionnel<string>(json["ligne"], "string"),
      heure: optionnel<string>(json["heure"], "string"),
      jourSemaine: optionnel<number>(json["jourSemaine"], "number"),
      prix: optionnel<number>(json["prix"], "number"),
    };
  }
}
