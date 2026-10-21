import { HEURE_RAPPORT } from "./regles";
import { minutesDeHeure } from "./temps";

/** Jeton d'injection de la configuration du rapport du soir. */
export const CONFIG_RAPPORT = Symbol("CONFIG_RAPPORT");

export interface ConfigRapport {
  /** Heure d'arrêt et de génération du rapport, `HH:MM` à Douala. */
  heure: string;
  /** Minutes depuis minuit correspondant à `heure`. */
  minutesDepart: number;
  /** Période du planificateur en ms ; 0 le désactive (les tests appellent `tick()` eux-mêmes). */
  planificateurMs: number;
  /** Rapports plus anciens que cela : plus produits à la demande (jours). */
  joursHistorique: number;
  production: boolean;
}

export class ConfigRapportInvalide extends Error {
  constructor(erreurs: string[]) {
    super(`Configuration du rapport du soir invalide : ${erreurs.join(" ; ")}`);
    this.name = "ConfigRapportInvalide";
  }
}

/**
 * Variables d'environnement :
 * - `RAPPORT_HEURE` (`21:00`) : heure de génération du rapport, heure de Douala ;
 * - `RAPPORT_PLANIFICATEUR_MS` (`30000`, `0` pour désactiver) ;
 * - `RAPPORT_JOURS_HISTORIQUE` (`31`).
 *
 * Dans les tests (`NODE_ENV=test`), le planificateur est désactivé par défaut.
 */
export function chargerConfigRapport(
  env: Record<string, string | undefined>,
  production = false,
): ConfigRapport {
  const erreurs: string[] = [];
  const entier = (nom: string, defaut: number, min: number): number => {
    const brut = env[nom];
    if (brut === undefined || brut.trim() === "") return defaut;
    const n = Number(brut);
    if (!Number.isInteger(n) || n < min) {
      erreurs.push(`${nom} : entier d'au moins ${min} attendu`);
      return defaut;
    }
    return n;
  };

  const heure = env["RAPPORT_HEURE"]?.trim() || HEURE_RAPPORT;
  let minutesDepart = 0;
  try {
    minutesDepart = minutesDeHeure(heure);
  } catch {
    erreurs.push("RAPPORT_HEURE : heure HH:MM attendue");
  }
  const planificateurMs = entier(
    "RAPPORT_PLANIFICATEUR_MS",
    env["NODE_ENV"] === "test" ? 0 : 30_000,
    0,
  );
  const joursHistorique = entier("RAPPORT_JOURS_HISTORIQUE", 31, 1);
  if (erreurs.length > 0) throw new ConfigRapportInvalide(erreurs);
  return { heure, minutesDepart, planificateurMs, joursHistorique, production };
}
