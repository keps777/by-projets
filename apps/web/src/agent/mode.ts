import { lireConfig } from "@afrimove/api-client";

function environnement(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

/** Racine de l'API réelle (`VITE_API_URL`, sinon `/api`), comme pour le client d'API. */
export function urlBaseApi(): string {
  return lireConfig(environnement(), "").urlBase;
}

/**
 * Vrai quand l'application parle à la vraie API (`VITE_API_MODE=http`). En démonstration (mock) il n'y a ni
 * serveur de connexion des agents, ni appareil à enrôler ou à effacer : l'écran des agents n'est pas proposé.
 */
export function modeHttp(): boolean {
  try {
    return lireConfig(environnement(), "").mode === "http";
  } catch {
    return false;
  }
}
