import type { ZodIssue } from "zod";

export type GenreErreur =
  | "reseau"
  | "delai"
  | "http"
  | "validation"
  | "annule"
  | "non_implemente"
  | "scenario_inconnu"
  | "configuration";

/** Base de toutes les erreurs du client : les écrans testent `genre`, jamais le message. */
export class ErreurApi extends Error {
  readonly genre: GenreErreur;
  /** Une relance automatique a-t-elle une chance de réussir ? */
  readonly retentable: boolean;

  constructor(
    genre: GenreErreur,
    message: string,
    options?: { retentable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.genre = genre;
    this.retentable = options?.retentable ?? false;
  }
}

export class ErreurReseau extends ErreurApi {
  constructor(message = "Le réseau est injoignable", cause?: unknown) {
    super("reseau", message, { retentable: true, cause });
  }
}

export class ErreurDelai extends ErreurApi {
  readonly delaiMs: number;
  constructor(delaiMs: number) {
    super("delai", `Pas de réponse après ${delaiMs} ms`, { retentable: true });
    this.delaiMs = delaiMs;
  }
}

export class ErreurAnnulee extends ErreurApi {
  constructor() {
    super("annule", "Requête annulée");
  }
}

const STATUTS_RETENTABLES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Réponse HTTP en erreur. `code` et `details` viennent du corps `{ code, message, details }` de l'API. */
export class ErreurHttp extends ErreurApi {
  readonly statut: number;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly reessayerApresMs: number | undefined;

  constructor(
    statut: number,
    message: string,
    code?: string,
    details?: unknown,
    reessayerApresMs?: number,
  ) {
    super("http", message, { retentable: STATUTS_RETENTABLES.has(statut) });
    this.statut = statut;
    this.code = code;
    this.details = details;
    this.reessayerApresMs = reessayerApresMs;
  }
}

/** Réponse (ou message temps réel) qui ne respecte pas son schéma zod. */
export class ErreurValidation extends ErreurApi {
  readonly operation: string;
  readonly issues: readonly ZodIssue[];

  constructor(operation: string, issues: readonly ZodIssue[], message?: string) {
    super("validation", message ?? `Réponse invalide pour « ${operation} »`);
    this.operation = operation;
    this.issues = issues;
  }
}

/** Mock : aucune implémentation de cette opération dans le scénario actif. */
export class ErreurNonImplementee extends ErreurApi {
  readonly operation: string;
  readonly scenario: string;

  constructor(operation: string, scenario: string) {
    super("non_implemente", `Le scénario « ${scenario} » n'implémente pas « ${operation} »`);
    this.operation = operation;
    this.scenario = scenario;
  }
}

export class ErreurScenarioInconnu extends ErreurApi {
  readonly scenario: string;
  readonly disponibles: readonly string[];

  constructor(scenario: string, disponibles: readonly string[]) {
    super(
      "scenario_inconnu",
      `Scénario « ${scenario} » inconnu (disponibles : ${disponibles.join(", ") || "aucun"})`,
    );
    this.scenario = scenario;
    this.disponibles = disponibles;
  }
}

export class ErreurConfiguration extends ErreurApi {
  constructor(message: string) {
    super("configuration", message);
  }
}

export function estErreurApi(e: unknown): e is ErreurApi {
  return e instanceof ErreurApi;
}
