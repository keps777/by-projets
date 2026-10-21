import type { ErreurApi } from "./erreurs";
import type { Horloge } from "./horloge";
import type { Canal, Operation } from "./operations";

/** Ce que reçoit une implémentation mock. */
export interface ContexteMock {
  readonly horloge: Horloge;
  readonly scenario: string;
  /** Nombre pseudo-aléatoire dans [0, 1) : injectable pour des tests déterministes. */
  readonly alea: () => number;
}

export interface ContexteFlux extends ContexteMock {
  /** Publie un message (validé par le schéma du canal avant d'arriver à l'écouteur). */
  emettre(message: unknown): void;
  /** Minuterie sur l'horloge injectable, annulée automatiquement au désabonnement. */
  planifier(ms: number, fn: () => void): void;
  /** Signale une erreur au flux. */
  echouer(erreur: ErreurApi): void;
}

export interface ImplementationMock {
  readonly operation: Operation<never, unknown>;
  readonly repondre: (params: never, ctx: ContexteMock) => unknown;
}

export interface FluxMock {
  readonly canal: Canal<never, unknown>;
  readonly demarrer: (params: never, ctx: ContexteFlux) => void | (() => void);
}

/**
 * Un scénario de planche : l'état du monde de démo et la façon dont il répond.
 * Chaque appel à `SourceScenarios.charger` renvoie une instance neuve (état propre à un client).
 */
export interface Scenario {
  readonly nom: string;
  readonly operations: readonly ImplementationMock[];
  readonly flux?: readonly FluxMock[];
}

/**
 * Interface de lecture des scénarios. L'implémentation réelle (au-dessus de `@afrimove/fixtures`)
 * est injectée par l'application ; le client ne les importe jamais.
 */
export interface SourceScenarios {
  noms(): readonly string[];
  /** « Maintenant » propre au scénario (ISO) quand la planche fige l'heure ; l'URL `horloge` prime. */
  instantInitial?(nom: string): string | undefined;
  charger(nom: string): Scenario | Promise<Scenario>;
}

export const SCENARIO_PAR_DEFAUT = "defaut";

/** Source par défaut : un seul scénario vide, qui répond « non implémenté » à tout. */
export function sourceScenariosVide(): SourceScenarios {
  return {
    noms: () => [SCENARIO_PAR_DEFAUT],
    charger: (nom) => ({ nom, operations: [] }),
  };
}

/** Type l'implémentation mock d'une opération. */
export function implementer<P, R>(
  operation: Operation<P, R>,
  repondre: (params: P, ctx: ContexteMock) => R | Promise<R>,
): ImplementationMock {
  return { operation, repondre } as unknown as ImplementationMock;
}

/** Type un flux temps réel simulé. */
export function simulerFlux<P, M>(
  canal: Canal<P, M>,
  demarrer: (params: P, ctx: ContexteFlux) => void | (() => void),
): FluxMock {
  return { canal, demarrer } as unknown as FluxMock;
}
