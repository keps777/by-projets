/** Jeton d'injection de la configuration du module patron. */
export const CONFIG_PATRON = Symbol("CONFIG_PATRON");

export interface ConfigPatron {
  /** Période du balayage des modifications de ligne arrivées à leur jour d'effet (0 : pas de balayage). */
  balayageMs: number;
  production: boolean;
}

export class ConfigPatronInvalide extends Error {
  constructor(erreurs: string[]) {
    super(`Configuration du module patron invalide : ${erreurs.join(" ; ")}`);
    this.name = "ConfigPatronInvalide";
  }
}

/**
 * Variables d'environnement :
 * - `PATRON_BALAYAGE_MS` (`300000`, `0` pour désactiver ; `0` par défaut en test) : fréquence à laquelle
 *   les modifications de ligne programmées « dès lundi » sont mises en vigueur sans attendre que le patron
 *   ouvre ses réglages.
 */
export function chargerConfigPatron(
  env: Record<string, string | undefined>,
  production = false,
): ConfigPatron {
  const erreurs: string[] = [];
  let balayageMs = env["NODE_ENV"] === "test" ? 0 : 300_000;
  const brut = env["PATRON_BALAYAGE_MS"];
  if (brut !== undefined && brut.trim() !== "") {
    const n = Number(brut);
    if (!Number.isInteger(n) || n < 0)
      erreurs.push("PATRON_BALAYAGE_MS : entier positif ou nul attendu");
    else balayageMs = n;
  }
  if (erreurs.length > 0) throw new ConfigPatronInvalide(erreurs);
  return { balayageMs, production };
}
