import { createServer } from "node:net";
import { MOT_DE_PASSE, PIN, PIN_SUPERVISEUR } from "./config";

/** Un port libre entre 5200 et 5999 (la plage réservée à la recette), différent de ceux déjà pris. */
export async function portLibre(deja: number[]): Promise<number> {
  for (let i = 0; i < 80; i++) {
    const port = 5200 + Math.floor(Math.random() * 800);
    if (deja.includes(port)) continue;
    const libre = await new Promise<boolean>((fin) => {
      const s = createServer();
      s.once("error", () => fin(false));
      s.listen(port, "127.0.0.1", () => s.close(() => fin(true)));
    });
    if (libre) return port;
  }
  throw new Error("Aucun port libre entre 5200 et 5999.");
}

/** Attend qu'une URL réponde 2xx. */
export async function attendre(url: string, delaiMs = 90_000): Promise<void> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Rien ne répond sur ${url}`);
}

/**
 * L'environnement de l'API de la recette : PostgreSQL, secrets de développement, SMS simulés dont le code est écrit
 * dans le journal. Ces secrets sont ceux dont dépend le contenu de la base (poivre des PIN, clé de chiffrement des
 * champs sensibles) : une base restaurée ne se relit qu'avec les mêmes.
 */
export function envApi(o: {
  serveurPg: string;
  base: string;
  portApi: number;
  origines: string;
  surcharges?: Record<string, string>;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(o.portApi),
    HOST: "127.0.0.1",
    DATABASE_URL: `${o.serveurPg}/${o.base}`,
    API_STOCKAGE: "postgres",
    JWT_SECRET: "dev-seulement-jwt-secret-0123456789abcdef",
    JWT_TTL_SECONDS: "36000",
    AUTH_PEPPER: "dev-seulement-pepper-0123456789abcdef",
    ENCRYPTION_KEY: "ZGV2LXNldWxlbWVudC1jbGUtMzItb2N0ZXRzLTAwMDA=",
    ENCRYPTION_KEY_ID: "k1",
    BLIND_INDEX_KEY: "ZGV2LXNldWxlbWVudC1jbGUtaW5kZXgtYXZldWdsZS0=",
    AUDIT_HMAC_KEY: "dev-seulement-audit-0123456789abcdef",
    SMS_DRIVER: "mock",
    SMS_MOCK_LOG_CODES: "true",
    CORS_ORIGINS: o.origines,
    OPENAPI_ENABLED: "true",
    RATE_LIMIT_ENABLED: "false",
    // La production n'accepte que 3 codes SMS par quart d'heure et par numéro ; chaque fichier de scénarios ouvre
    // sa propre session de superviseur et de patron, d'où une limite relevée pour la recette seulement.
    OTP_MAX_DEMANDES_15MIN: "20",
    SEED_PIN: PIN,
    SEED_MOT_DE_PASSE: MOT_DE_PASSE,
    SEED_PIN_SUPERVISEUR: PIN_SUPERVISEUR,
    ...o.surcharges,
  };
}
