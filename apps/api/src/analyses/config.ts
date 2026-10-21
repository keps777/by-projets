import { SEUIL_ANONYMAT } from "./regles";

/** Jeton d'injection de la configuration des analyses. */
export const CONFIG_ANALYSES = Symbol("CONFIG_ANALYSES");

export interface ConfigAnalyses {
  /**
   * Citer le nom d'une compagnie concurrente à côté de son horaire et de son prix publics
   * (« Oméga 09:30 à 3 000 ») ? Sinon : « Une autre compagnie ». Ces deux informations sont publiques
   * (la recherche du voyageur les affiche) ; les ventes d'une autre compagnie ne sortent jamais.
   */
  nommerConcurrents: boolean;
  /** Nombre minimum d'autres compagnies derrière une moyenne du réseau pour qu'elle sorte. */
  seuilAnonymat: number;
  production: boolean;
}

export class ConfigAnalysesInvalide extends Error {
  constructor(erreurs: string[]) {
    super(`Configuration des analyses invalide : ${erreurs.join(" ; ")}`);
    this.name = "ConfigAnalysesInvalide";
  }
}

/**
 * Variables d'environnement :
 * - `ANALYSES_NOMMER_CONCURRENTS` (`true`) : nommer les concurrents dont l'horaire et le prix sont publics ;
 * - `ANALYSES_SEUIL_ANONYMAT` (`3`, au moins 3) : compagnies minimum pour une moyenne du réseau.
 */
export function chargerConfigAnalyses(
  env: Record<string, string | undefined>,
  production = false,
): ConfigAnalyses {
  const erreurs: string[] = [];
  const brutNommer = env["ANALYSES_NOMMER_CONCURRENTS"]?.trim().toLowerCase();
  let nommerConcurrents = true;
  if (brutNommer !== undefined && brutNommer !== "") {
    if (["true", "1", "oui"].includes(brutNommer)) nommerConcurrents = true;
    else if (["false", "0", "non"].includes(brutNommer)) nommerConcurrents = false;
    else erreurs.push("ANALYSES_NOMMER_CONCURRENTS doit valoir true ou false");
  }
  let seuilAnonymat = SEUIL_ANONYMAT;
  const brutSeuil = env["ANALYSES_SEUIL_ANONYMAT"]?.trim();
  if (brutSeuil !== undefined && brutSeuil !== "") {
    const n = Number(brutSeuil);
    if (!Number.isInteger(n) || n < SEUIL_ANONYMAT) {
      erreurs.push(
        `ANALYSES_SEUIL_ANONYMAT : entier d'au moins ${SEUIL_ANONYMAT} attendu (en dessous, la moyenne désigne une compagnie)`,
      );
    } else {
      seuilAnonymat = n;
    }
  }
  if (erreurs.length > 0) throw new ConfigAnalysesInvalide(erreurs);
  return { nommerConcurrents, seuilAnonymat, production };
}
