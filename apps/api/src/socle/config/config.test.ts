import { describe, expect, it } from "vitest";
import { ENV_TEST } from "../testing/app-test";
import { ConfigInvalide, chargerConfig } from "./config";

const ENV_PROD = { ...ENV_TEST, NODE_ENV: "production" };

function erreurs(env: Record<string, string | undefined>): readonly string[] {
  try {
    chargerConfig(env);
  } catch (e) {
    if (e instanceof ConfigInvalide) return e.erreurs;
    throw e;
  }
  return [];
}

describe("configuration par variables d'environnement", () => {
  it("accepte un environnement complet et applique les valeurs par défaut", () => {
    const c = chargerConfig(ENV_TEST);
    expect(c.port).toBe(3000);
    expect(c.jwt.ttlSeconds).toBe(3600);
    expect(c.chiffrement.active.id).toBe("k1");
    expect(c.chiffrement.active.cle).toHaveLength(32);
    expect(c.otp).toEqual({ ttlSeconds: 300, essaisMax: 5, demandesParQuartHeure: 3 });
    expect(c.openapi).toBe(true);
    expect(c.corsOrigins).toEqual([]);
  });

  it("liste toutes les variables manquantes d'un coup, sans afficher de valeur", () => {
    const e = erreurs({});
    for (const nom of [
      "DATABASE_URL",
      "JWT_SECRET",
      "AUDIT_HMAC_KEY",
      "AUTH_PEPPER",
      "ENCRYPTION_KEY",
      "BLIND_INDEX_KEY",
    ]) {
      expect(e.some((m) => m.startsWith(nom))).toBe(true);
    }
  });

  it("refuse les secrets trop courts et les clés de mauvaise taille", () => {
    expect(erreurs({ ...ENV_TEST, JWT_SECRET: "court" })).toContain(
      "JWT_SECRET doit faire au moins 32 caractères",
    );
    expect(
      erreurs({ ...ENV_TEST, ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }).some((m) =>
        m.startsWith("ENCRYPTION_KEY doit être une clé"),
      ),
    ).toBe(true);
    expect(erreurs({ ...ENV_TEST, ENCRYPTION_KEY: Buffer.alloc(48).toString("base64") })).toContain(
      "ENCRYPTION_KEY doit faire exactement 32 octets",
    );
  });

  it("valide les nombres, booléens et NODE_ENV", () => {
    expect(erreurs({ ...ENV_TEST, PORT: "abc" })).toContain(
      "PORT doit être un entier entre 1 et 65535",
    );
    expect(erreurs({ ...ENV_TEST, OPENAPI_ENABLED: "peut-etre" })).toContain(
      "OPENAPI_ENABLED doit valoir true ou false",
    );
    expect(erreurs({ ...ENV_TEST, NODE_ENV: "staging" })).toContain(
      "NODE_ENV doit valoir development, test ou production",
    );
    expect(erreurs({ ...ENV_TEST, DATABASE_URL: "mysql://x" })).toContain(
      "DATABASE_URL doit commencer par postgresql://",
    );
  });

  it("refuse en production toute valeur d'exemple (marqueur « dev-seulement »)", () => {
    const exemple = {
      ...ENV_PROD,
      JWT_SECRET: "dev-seulement-jwt-secret-0123456789abcdef",
      ENCRYPTION_KEY: Buffer.from("dev-seulement-cle-32-octets-0000").toString("base64"),
    };
    const e = erreurs(exemple);
    expect(e.some((m) => m.startsWith("JWT_SECRET porte une valeur d'exemple"))).toBe(true);
    expect(e.some((m) => m.startsWith("ENCRYPTION_KEY porte une valeur d'exemple"))).toBe(true);
    // Même valeurs en développement : acceptées.
    expect(erreurs({ ...exemple, NODE_ENV: "development" })).toEqual([]);
  });

  it("interdit de journaliser les codes SMS en production", () => {
    expect(erreurs({ ...ENV_PROD, SMS_MOCK_LOG_CODES: "true" }).join()).toContain(
      "SMS_MOCK_LOG_CODES est interdit en production",
    );
    expect(erreurs(ENV_PROD)).toEqual([]);
  });

  it("lit la rotation des clés de chiffrement", () => {
    const ancienne = Buffer.alloc(32, 1).toString("base64");
    const c = chargerConfig({
      ...ENV_TEST,
      ENCRYPTION_KEY_ID: "k2",
      ENCRYPTION_PREVIOUS_KEYS: `k1:${ancienne}`,
    });
    expect(c.chiffrement.active.id).toBe("k2");
    expect(c.chiffrement.anciennes.map((k) => k.id)).toEqual(["k1"]);
    expect(erreurs({ ...ENV_TEST, ENCRYPTION_PREVIOUS_KEYS: `k0:${ancienne}` })).toEqual([]);
    expect(
      erreurs({ ...ENV_TEST, ENCRYPTION_KEY_ID: "k1", ENCRYPTION_PREVIOUS_KEYS: `k1:${ancienne}` }),
    ).not.toEqual([]);
  });

  it("l'exemple .env.example est une configuration valide en développement", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const texte = readFileSync(join(__dirname, "../../../.env.example"), "utf8");
    const env: Record<string, string> = {};
    for (const ligne of texte.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(ligne);
      if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
    }
    expect(erreurs(env)).toEqual([]);
    expect(erreurs({ ...env, NODE_ENV: "production" }).length).toBeGreaterThan(0);
  });
});
