/** Jeton d'injection de la configuration du module administration. */
export const CONFIG_ADMINISTRATION = Symbol("CONFIG_ADMINISTRATION");

export interface ConfigAdministration {
  /** Période du balayage des modifications de ligne arrivées à leur jour d'effet (0 : pas de balayage). */
  balayageMs: number;
}

export class ConfigAdministrationInvalide extends Error {
  constructor(erreurs: string[]) {
    super(`Configuration du module administration invalide : ${erreurs.join(" ; ")}`);
    this.name = "ConfigAdministrationInvalide";
  }
}

/**
 * Variables d'environnement :
 * - `ADMIN_BALAYAGE_MS` (`300000`, `0` pour désactiver ; `0` par défaut en test) : fréquence à laquelle les
 *   modifications de ligne programmées « dès lundi » sont mises en vigueur sans attendre que le patron rouvre
 *   l'écran des réglages ou que les départs soient générés. Sans balayage, elles s'appliquent quand même à la
 *   prochaine lecture de la ligne ou génération de départs.
 */
export function chargerConfigAdministration(
  env: Record<string, string | undefined>,
): ConfigAdministration {
  const erreurs: string[] = [];
  let balayageMs = env["NODE_ENV"] === "test" ? 0 : 300_000;
  const brut = env["ADMIN_BALAYAGE_MS"];
  if (brut !== undefined && brut.trim() !== "") {
    const n = Number(brut);
    if (!Number.isInteger(n) || n < 0) {
      erreurs.push("ADMIN_BALAYAGE_MS : entier positif ou nul attendu");
    } else {
      balayageMs = n;
    }
  }
  if (erreurs.length > 0) throw new ConfigAdministrationInvalide(erreurs);
  return { balayageMs };
}
