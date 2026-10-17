/** Jeton d'injection de la configuration de l'assistant. */
export const CONFIG_ASSISTANT = Symbol("CONFIG_ASSISTANT");

export type FournisseurModele = "regles" | "claude";

export interface ConfigModele {
  fournisseur: FournisseurModele;
  /** Clé de l'API Anthropic ; jamais journalisée. */
  cleApi: string | null;
  /** Identifiant du modèle Claude. */
  id: string;
  /** Adresse de base de l'API. */
  url: string;
  /** Niveau d'effort demandé (`low` : réponse courte et rapide) ; `null` pour ne rien envoyer. */
  effort: "low" | "medium" | "high" | null;
  /** Au-delà, le modèle est abandonné et les règles répondent (le budget de la réponse est de 5 s). */
  delaiMs: number;
}

export interface ConfigAssistant {
  production: boolean;
  modele: ConfigModele;
  /** Une proposition non appliquée ou appliquée se périme au bout de ce nombre de jours. */
  peremptionJours: number;
  /** Questions par minute et par patron (le modèle de langage est payant). */
  questionsParMinute: number;
  /** Échanges gardés dans la conversation rendue au patron. */
  echangesGardes: number;
}

export class ConfigAssistantInvalide extends Error {
  constructor(erreurs: string[]) {
    super(`Configuration de l'assistant invalide : ${erreurs.join(" ; ")}`);
    this.name = "ConfigAssistantInvalide";
  }
}

/** Modèle par défaut : rapide et peu coûteux pour reformuler une réponse déjà calculée. */
export const MODELE_PAR_DEFAUT = "claude-sonnet-5-5";
export const URL_API_PAR_DEFAUT = "https://api.anthropic.com";
export const DELAI_MODELE_PAR_DEFAUT_MS = 3_500;

function entier(
  env: Record<string, string | undefined>,
  nom: string,
  defaut: number,
  min: number,
  max: number,
  erreurs: string[],
): number {
  const brut = env[nom]?.trim();
  if (brut === undefined || brut === "") return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < min || n > max) {
    erreurs.push(`${nom} : entier de ${min} à ${max} attendu`);
    return defaut;
  }
  return n;
}

/**
 * Variables d'environnement :
 * - `ASSISTANT_MODELE_LANGAGE` (`claude` si `ANTHROPIC_API_KEY` est donnée, sinon `regles`) : `claude` ou `regles`.
 *   `regles` : l'API écrit seule ses réponses, sans appel externe (mode dégradé complet) ;
 * - `ANTHROPIC_API_KEY` : clé de l'API Anthropic (obligatoire avec `claude`) ;
 * - `ASSISTANT_MODELE` (`claude-sonnet-5-5`) : identifiant du modèle ;
 * - `ASSISTANT_URL_API` (`https://api.anthropic.com`) : adresse de l'API (https obligatoire) ;
 * - `ASSISTANT_EFFORT` (`low`) : `low`, `medium`, `high`, ou vide pour ne pas l'envoyer ;
 * - `ASSISTANT_DELAI_MS` (`3500`, de 500 à 30000) : délai maximal d'attente du modèle ;
 * - `ASSISTANT_PEREMPTION_JOURS` (`7`, de 1 à 30) ;
 * - `ASSISTANT_QUESTIONS_PAR_MINUTE` (`10`, de 1 à 60) ;
 * - `ASSISTANT_ECHANGES_GARDES` (`50`, de 1 à 200).
 */
export function chargerConfigAssistant(
  env: Record<string, string | undefined>,
  production = false,
): ConfigAssistant {
  const erreurs: string[] = [];
  const cleApi = env["ANTHROPIC_API_KEY"]?.trim() || null;

  let fournisseur: FournisseurModele = cleApi ? "claude" : "regles";
  const brutFournisseur = env["ASSISTANT_MODELE_LANGAGE"]?.trim().toLowerCase();
  if (brutFournisseur !== undefined && brutFournisseur !== "") {
    if (brutFournisseur === "claude" || brutFournisseur === "regles") fournisseur = brutFournisseur;
    else erreurs.push("ASSISTANT_MODELE_LANGAGE doit valoir claude ou regles");
  }
  if (fournisseur === "claude" && !cleApi) {
    erreurs.push("ANTHROPIC_API_KEY est obligatoire avec ASSISTANT_MODELE_LANGAGE=claude");
  }

  const url = (env["ASSISTANT_URL_API"]?.trim() || URL_API_PAR_DEFAUT).replace(/\/+$/, "");
  if (
    !/^https:\/\/[^\s/]+/.test(url) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
  ) {
    erreurs.push("ASSISTANT_URL_API doit commencer par https://");
  }

  let effort: ConfigModele["effort"] = "low";
  const brutEffort = env["ASSISTANT_EFFORT"];
  if (brutEffort !== undefined) {
    const e = brutEffort.trim().toLowerCase();
    if (e === "") effort = null;
    else if (e === "low" || e === "medium" || e === "high") effort = e;
    else erreurs.push("ASSISTANT_EFFORT doit valoir low, medium, high ou rester vide");
  }

  const delaiMs = entier(
    env,
    "ASSISTANT_DELAI_MS",
    DELAI_MODELE_PAR_DEFAUT_MS,
    500,
    30_000,
    erreurs,
  );
  const peremptionJours = entier(env, "ASSISTANT_PEREMPTION_JOURS", 7, 1, 30, erreurs);
  const questionsParMinute = entier(env, "ASSISTANT_QUESTIONS_PAR_MINUTE", 10, 1, 60, erreurs);
  const echangesGardes = entier(env, "ASSISTANT_ECHANGES_GARDES", 50, 1, 200, erreurs);

  if (erreurs.length > 0) throw new ConfigAssistantInvalide(erreurs);
  return {
    production,
    modele: {
      fournisseur,
      cleApi,
      id: env["ASSISTANT_MODELE"]?.trim() || MODELE_PAR_DEFAUT,
      url,
      effort,
      delaiMs,
    },
    peremptionJours,
    questionsParMinute,
    echangesGardes,
  };
}
