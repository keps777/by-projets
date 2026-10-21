/** Jeton d'injection de la configuration du module patron. */
export const CONFIG_PATRON = Symbol("CONFIG_PATRON");

export interface ConfigPatron {
  /** En production, le module refuse de démarrer tant qu'un de ses ports est en mémoire. */
  production: boolean;
}

/**
 * Le module patron n'a plus de variable d'environnement propre : le balayage des modifications de ligne
 * programmées appartient au module administration (`ADMIN_BALAYAGE_MS`, voir `administration/config.ts`).
 */
export function chargerConfigPatron(production = false): ConfigPatron {
  return { production };
}
