import type { ClientApi } from "./client";
import { ErreurConfiguration } from "./erreurs";
import { horlogeDepuis, horlogeGelee } from "./horloge";
import type { Horloge } from "./horloge";
import { creerClientHttp } from "./http";
import type { OptionsHttp } from "./http";
import { creerClientMock } from "./mock";
import type { OptionsMock } from "./mock";
import { SCENARIO_PAR_DEFAUT } from "./scenarios";

export type ModeApi = "mock" | "http";

/** Variables d'environnement lues (Vite : `import.meta.env`). */
export interface EnvironnementApi {
  /** `mock` (défaut) ou `http`. */
  VITE_API_MODE?: string;
  /** Racine de l'API en mode http. Défaut `/api`. */
  VITE_API_URL?: string;
  /** Scénario mock par défaut, si l'URL n'en donne pas. */
  VITE_API_SCENARIO?: string;
}

export interface ConfigClient {
  mode: ModeApi;
  urlBase: string;
  scenario: string;
  /** Valeur brute du paramètre d'URL `horloge` (mock uniquement). */
  horloge?: string;
}

export interface ParametresUrl {
  scenario?: string;
  horloge?: string;
}

/** Paramètres d'URL du banc : `?scenario=<nom>&horloge=<ISO>` ou `horloge=gelee:<ISO>`. */
export function lireParametresUrl(search: string): ParametresUrl {
  const p = new URLSearchParams(search);
  const resultat: ParametresUrl = {};
  const scenario = p.get("scenario");
  if (scenario) resultat.scenario = scenario;
  const horloge = p.get("horloge");
  if (horloge) resultat.horloge = horloge;
  return resultat;
}

/** `2026-10-16T05:30:00+01:00` : part de cet instant puis s'écoule ; `gelee:` devant : figée. */
export function analyserHorloge(valeur: string): Horloge {
  const gelee = valeur.startsWith("gelee:");
  const iso = gelee ? valeur.slice("gelee:".length) : valeur;
  if (!Number.isFinite(Date.parse(iso))) {
    throw new ErreurConfiguration(`Paramètre « horloge » invalide : ${valeur}`);
  }
  return gelee ? horlogeGelee(iso) : horlogeDepuis(iso);
}

export function lireConfig(env: EnvironnementApi, search = ""): ConfigClient {
  const mode = env.VITE_API_MODE ?? "mock";
  if (mode !== "mock" && mode !== "http") {
    throw new ErreurConfiguration(
      `VITE_API_MODE doit valoir « mock » ou « http » (reçu : ${mode})`,
    );
  }
  const url = lireParametresUrl(search);
  const config: ConfigClient = {
    mode,
    urlBase: env.VITE_API_URL || "/api",
    scenario: url.scenario ?? (env.VITE_API_SCENARIO || SCENARIO_PAR_DEFAUT),
  };
  if (url.horloge) config.horloge = url.horloge;
  return config;
}

export type DependancesClient = Omit<OptionsMock, "scenario"> & Omit<OptionsHttp, "urlBase">;

/**
 * Seul endroit où l'on choisit l'adaptateur. Les écrans ne reçoivent qu'un `ClientApi`.
 * L'horloge du paramètre d'URL ne s'applique qu'au mock (en HTTP, c'est le serveur qui fait foi).
 */
export function creerClient(config: ConfigClient, deps: DependancesClient = {}): ClientApi {
  if (config.mode === "http") {
    return creerClientHttp({ ...deps, urlBase: config.urlBase });
  }
  const horloge = deps.horloge ?? (config.horloge ? analyserHorloge(config.horloge) : undefined);
  const options: OptionsMock = { ...deps, scenario: config.scenario };
  if (horloge) options.horloge = horloge;
  return creerClientMock(options);
}

function environnementVite(): EnvironnementApi {
  return (import.meta as unknown as { env?: EnvironnementApi }).env ?? {};
}

/** Raccourci d'une application : lit `import.meta.env` et `location.search`. */
export function creerClientDepuisEnvironnement(
  deps: DependancesClient = {},
  env: EnvironnementApi = environnementVite(),
  search: string = (globalThis as { location?: { search: string } }).location?.search ?? "",
): ClientApi {
  return creerClient(lireConfig(env, search), deps);
}
