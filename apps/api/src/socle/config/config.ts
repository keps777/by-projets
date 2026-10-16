/**
 * Configuration de l'API : tout vient des variables d'environnement, rien n'est écrit dans le code.
 * `chargerConfig` valide l'ensemble et signale TOUTES les erreurs d'un coup (démarrage refusé).
 */

export const CONFIG = Symbol("CONFIG");

/** Les valeurs d'exemple (.env.example, docker-compose.yml) portent ce marqueur : jamais en production. */
export const MARQUEUR_VALEUR_DE_DEV = "dev-seulement";

export type Environnement = "development" | "test" | "production";

export interface CleChiffrement {
  id: string;
  cle: Buffer;
}

export interface AppConfig {
  env: Environnement;
  port: number;
  host: string;
  databaseUrl: string;
  jwt: { secret: string; ttlSeconds: number; issuer: string; audience: string };
  chiffrement: { active: CleChiffrement; anciennes: readonly CleChiffrement[] };
  /** Clé de l'index aveugle (HMAC) des téléphones. */
  cleIndexAveugle: Buffer;
  /** Clé de la chaîne d'empreintes du journal d'audit. */
  cleAudit: Buffer;
  /** Poivre des PIN, mots de passe et codes SMS. */
  poivre: Buffer;
  otp: { ttlSeconds: number; essaisMax: number; demandesParQuartHeure: number };
  sms: { driver: "mock"; journaliserCodes: boolean };
  corsOrigins: readonly string[];
  openapi: boolean;
  /** Limitation de débit par adresse (désactivable pour les tests). */
  limitationDebit: boolean;
  trustProxy: boolean | number;
}

export class ConfigInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function estValeurDeDev(brut: string): boolean {
  if (brut.toLowerCase().includes(MARQUEUR_VALEUR_DE_DEV)) return true;
  try {
    return Buffer.from(brut, "base64").toString("latin1").startsWith(MARQUEUR_VALEUR_DE_DEV);
  } catch {
    return false;
  }
}

function decoderBase64(brut: string): Buffer | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(brut)) return null;
  return Buffer.from(brut.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function chargerConfig(env: Env): AppConfig {
  const erreurs: string[] = [];
  const lire = (nom: string): string | undefined => {
    const v = env[nom]?.trim();
    return v === undefined || v === "" ? undefined : v;
  };
  const requis = (nom: string): string => {
    const v = lire(nom);
    if (v === undefined) {
      erreurs.push(`${nom} est obligatoire`);
      return "";
    }
    return v;
  };
  const entier = (nom: string, defaut: number, min: number, max: number): number => {
    const v = lire(nom);
    if (v === undefined) return defaut;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      erreurs.push(`${nom} doit être un entier entre ${min} et ${max}`);
      return defaut;
    }
    return n;
  };
  const booleen = (nom: string, defaut: boolean): boolean => {
    const v = lire(nom)?.toLowerCase();
    if (v === undefined) return defaut;
    if (["true", "1", "oui"].includes(v)) return true;
    if (["false", "0", "non"].includes(v)) return false;
    erreurs.push(`${nom} doit valoir true ou false`);
    return defaut;
  };
  const secretTexte = (nom: string, minCaracteres: number): string => {
    const v = requis(nom);
    if (v !== "" && v.length < minCaracteres) {
      erreurs.push(`${nom} doit faire au moins ${minCaracteres} caractères`);
    }
    return v;
  };
  const cleBinaire = (nom: string, octets: number, valeur = requis(nom)): Buffer => {
    if (valeur === "") return Buffer.alloc(0);
    const buf = decoderBase64(valeur);
    if (!buf || buf.length < octets) {
      erreurs.push(`${nom} doit être une clé en base64 d'au moins ${octets} octets`);
      return Buffer.alloc(0);
    }
    return buf;
  };

  const envNom = lire("NODE_ENV") ?? "development";
  if (!["development", "test", "production"].includes(envNom)) {
    erreurs.push("NODE_ENV doit valoir development, test ou production");
  }
  const enProduction = envNom === "production";

  const databaseUrl = requis("DATABASE_URL");
  if (databaseUrl !== "" && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    erreurs.push("DATABASE_URL doit commencer par postgresql://");
  }

  const secretsAVerifier: Array<[string, string]> = [];
  const jwtSecret = secretTexte("JWT_SECRET", 32);
  secretsAVerifier.push(["JWT_SECRET", jwtSecret]);
  const auditBrut = secretTexte("AUDIT_HMAC_KEY", 32);
  secretsAVerifier.push(["AUDIT_HMAC_KEY", auditBrut]);
  const poivreBrut = secretTexte("AUTH_PEPPER", 32);
  secretsAVerifier.push(["AUTH_PEPPER", poivreBrut]);

  const cleActiveBrute = requis("ENCRYPTION_KEY");
  secretsAVerifier.push(["ENCRYPTION_KEY", cleActiveBrute]);
  const cleActive = cleBinaire("ENCRYPTION_KEY", 32, cleActiveBrute);
  if (cleActive.length > 32) erreurs.push("ENCRYPTION_KEY doit faire exactement 32 octets");
  const idCle = lire("ENCRYPTION_KEY_ID") ?? "k1";
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(idCle)) {
    erreurs.push("ENCRYPTION_KEY_ID : 1 à 16 caractères alphanumériques, _ ou -");
  }

  const indexBrut = requis("BLIND_INDEX_KEY");
  secretsAVerifier.push(["BLIND_INDEX_KEY", indexBrut]);
  const cleIndexAveugle = cleBinaire("BLIND_INDEX_KEY", 32, indexBrut);

  // Anciennes clés (rotation) : « id:base64,id2:base64 ». Elles ne servent qu'à déchiffrer.
  const anciennes: CleChiffrement[] = [];
  for (const morceau of (lire("ENCRYPTION_PREVIOUS_KEYS") ?? "").split(",").filter(Boolean)) {
    const [id, valeur] = morceau.split(":");
    if (!id || !valeur || !/^[A-Za-z0-9_-]{1,16}$/.test(id) || id === idCle) {
      erreurs.push(
        "ENCRYPTION_PREVIOUS_KEYS : format « id:base64,id:base64 » (identifiants distincts)",
      );
      continue;
    }
    const cle = cleBinaire(`ENCRYPTION_PREVIOUS_KEYS[${id}]`, 32, valeur);
    if (cle.length === 32) anciennes.push({ id, cle });
  }

  if (enProduction) {
    for (const [nom, valeur] of secretsAVerifier) {
      if (valeur !== "" && estValeurDeDev(valeur)) {
        erreurs.push(
          `${nom} porte une valeur d'exemple (« ${MARQUEUR_VALEUR_DE_DEV} ») : interdit en production`,
        );
      }
    }
  }

  const driver = lire("SMS_DRIVER") ?? "mock";
  if (driver !== "mock")
    erreurs.push("SMS_DRIVER : seule la valeur « mock » existe pour l'instant");

  const trustBrut = lire("TRUST_PROXY") ?? "false";
  const trustProxy: boolean | number = /^\d+$/.test(trustBrut)
    ? Number(trustBrut)
    : booleen("TRUST_PROXY", false);

  const config: AppConfig = {
    env: envNom as Environnement,
    port: entier("PORT", 3000, 1, 65535),
    host: lire("HOST") ?? "0.0.0.0",
    databaseUrl,
    jwt: {
      secret: jwtSecret,
      ttlSeconds: entier("JWT_TTL_SECONDS", 3600, 60, 86_400),
      issuer: lire("JWT_ISSUER") ?? "afrimove-api",
      audience: lire("JWT_AUDIENCE") ?? "afrimove",
    },
    chiffrement: { active: { id: idCle, cle: cleActive }, anciennes },
    cleIndexAveugle,
    cleAudit: Buffer.from(auditBrut, "utf8"),
    poivre: Buffer.from(poivreBrut, "utf8"),
    otp: {
      ttlSeconds: entier("OTP_TTL_SECONDS", 300, 30, 1800),
      essaisMax: entier("OTP_MAX_ESSAIS", 5, 1, 10),
      demandesParQuartHeure: entier("OTP_MAX_DEMANDES_15MIN", 3, 1, 20),
    },
    sms: { driver: "mock", journaliserCodes: booleen("SMS_MOCK_LOG_CODES", false) },
    corsOrigins: (lire("CORS_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    openapi: booleen("OPENAPI_ENABLED", true),
    limitationDebit: booleen("RATE_LIMIT_ENABLED", true),
    trustProxy,
  };

  if (enProduction && config.sms.journaliserCodes) {
    erreurs.push(
      "SMS_MOCK_LOG_CODES est interdit en production (les codes SMS apparaîtraient dans les journaux)",
    );
  }
  if (erreurs.length > 0) throw new ConfigInvalide(erreurs);
  return config;
}
