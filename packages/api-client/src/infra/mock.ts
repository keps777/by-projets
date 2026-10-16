import type { ClientApi, Desabonnement, OptionsExecution, OptionsFlux } from "./client";
import {
  ErreurAnnulee,
  ErreurApi,
  ErreurNonImplementee,
  ErreurScenarioInconnu,
  estErreurApi,
} from "./erreurs";
import { horlogeDepuis, horlogeSysteme } from "./horloge";
import type { Horloge } from "./horloge";
import { validerAvec } from "./operations";
import type { Canal, Operation } from "./operations";
import { SCENARIO_PAR_DEFAUT, sourceScenariosVide } from "./scenarios";
import type { ContexteFlux, ContexteMock, Scenario, SourceScenarios } from "./scenarios";

export interface LatenceMock {
  min: number;
  max: number;
}

export interface OptionsMock {
  /** Source des scénarios (au-dessus de `@afrimove/fixtures`) ; vide par défaut. */
  source?: SourceScenarios;
  /** Nom du scénario (paramètre d'URL `scenario`) ; « defaut » si absent. */
  scenario?: string;
  /** Horloge injectée (paramètre d'URL `horloge`) ; sinon celle du scénario, sinon le système. */
  horloge?: Horloge;
  /** Latence simulée en ms : fixe ou intervalle. 0 pour la supprimer. Défaut : 120 à 400 ms. */
  latenceMs?: number | LatenceMock;
  /** Source d'aléa dans [0, 1) pour la latence et les scénarios. */
  alea?: () => number;
}

export interface ClientMock extends ClientApi {
  readonly mode: "mock";
  readonly scenario: string;
}

const LATENCE_PAR_DEFAUT: LatenceMock = { min: 120, max: 400 };

export function creerClientMock(options: OptionsMock = {}): ClientMock {
  const source = options.source ?? sourceScenariosVide();
  const nomScenario = options.scenario ?? SCENARIO_PAR_DEFAUT;
  const disponibles = source.noms();
  if (!disponibles.includes(nomScenario)) {
    throw new ErreurScenarioInconnu(nomScenario, disponibles);
  }
  const instantScenario = source.instantInitial?.(nomScenario);
  const horloge =
    options.horloge ?? (instantScenario ? horlogeDepuis(instantScenario) : horlogeSysteme());
  const alea = options.alea ?? Math.random;
  const latence: LatenceMock =
    typeof options.latenceMs === "number"
      ? { min: options.latenceMs, max: options.latenceMs }
      : (options.latenceMs ?? LATENCE_PAR_DEFAUT);

  let scenarioChargement: Promise<Scenario> | undefined;
  const scenario = (): Promise<Scenario> => {
    scenarioChargement ??= Promise.resolve(source.charger(nomScenario));
    return scenarioChargement;
  };
  const contexte: ContexteMock = { horloge, scenario: nomScenario, alea };

  const delai = (): number => latence.min + alea() * Math.max(0, latence.max - latence.min);

  return {
    mode: "mock",
    scenario: nomScenario,
    horloge,

    async executer<P, R>(
      operation: Operation<P, R>,
      params: P,
      opts?: OptionsExecution,
    ): Promise<R> {
      await horloge.attendre(delai(), opts?.signal);
      const sc = await scenario();
      const impl = sc.operations.find((o) => o.operation.nom === operation.nom);
      if (!impl) throw new ErreurNonImplementee(operation.nom, nomScenario);
      const brut = await (impl.repondre as (p: P, c: ContexteMock) => unknown)(params, contexte);
      if (opts?.signal?.aborted) throw new ErreurAnnulee();
      return validerAvec(operation.reponse, brut, operation.nom);
    },

    souscrire<P, M>(
      canal: Canal<P, M>,
      params: P,
      ecouteur: (message: M) => void,
      opts?: OptionsFlux,
    ): Desabonnement {
      let actif = true;
      const annulations = new Set<() => void>();
      let arret: void | (() => void);

      const echouer = (e: unknown): void => {
        const erreur = estErreurApi(e) ? e : new ErreurApi("reseau", String(e));
        opts?.surErreur?.(erreur);
      };

      opts?.surEtat?.("connexion");
      void scenario().then(
        (sc) => {
          if (!actif) return;
          const flux = sc.flux?.find((f) => f.canal.nom === canal.nom);
          if (!flux) {
            echouer(new ErreurNonImplementee(canal.nom, nomScenario));
            return;
          }
          const ctx: ContexteFlux = {
            ...contexte,
            emettre: (brut) => {
              if (!actif) return;
              try {
                ecouteur(validerAvec(canal.message, brut, canal.nom));
              } catch (e) {
                echouer(e);
              }
            },
            planifier: (ms, fn) => {
              const annuler = horloge.planifier(ms, () => {
                annulations.delete(annuler);
                if (actif) fn();
              });
              annulations.add(annuler);
            },
            echouer,
          };
          opts?.surEtat?.("ouvert");
          arret = (flux.demarrer as (p: P, c: ContexteFlux) => void | (() => void))(params, ctx);
        },
        (e: unknown) => echouer(e),
      );

      return () => {
        if (!actif) return;
        actif = false;
        for (const annuler of annulations) annuler();
        annulations.clear();
        if (typeof arret === "function") arret();
        opts?.surEtat?.("ferme");
      };
    },
  };
}
