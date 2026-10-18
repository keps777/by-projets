import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Secrets des appareils : code d'enrôlement (saisi une fois sur le téléphone), secret de l'appareil (porté en
 * `Authorization: Bearer` pour lire ses ordres) et secret d'acquittement (donné avec un ordre, seule preuve que
 * l'appareil puisse présenter après l'effacement). Rien de tout cela n'est stocké en clair : la base ne garde que
 * des empreintes, et le secret d'acquittement se recalcule à partir de la clé serveur.
 */

/** Sans I, L, O, 0 et 1 : un code lu sur un écran ou dicté ne se confond pas. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LONGUEUR_CODE = 10;
export const PREFIXE_SECRET_APPAREIL = "apd_";

/** `XXXXX-XXXXX`. */
export function genererCode(): string {
  let brut = "";
  for (let i = 0; i < LONGUEUR_CODE; i += 1) brut += ALPHABET[randomInt(ALPHABET.length)];
  return `${brut.slice(0, 5)}-${brut.slice(5)}`;
}

/** Majuscules, sans espaces ni tirets ; `null` si ce ne peut pas être un code (mauvaise longueur ou lettres hors alphabet). */
export function normaliserCode(saisie: string): string | null {
  const brut = saisie.replace(/[\s-]/g, "").toLocaleUpperCase("fr");
  if (brut.length !== LONGUEUR_CODE) return null;
  return [...brut].every((c) => ALPHABET.includes(c)) ? brut : null;
}

/** Empreinte du code (HMAC avec la clé d'index : un code de 50 bits ne se retrouve pas depuis la base). */
export function hacherCode(cle: Buffer, codeNormalise: string): string {
  return createHmac("sha256", cle).update(`enrolement-appareil:${codeNormalise}`).digest("hex");
}

export function genererSecretAppareil(): string {
  return `${PREFIXE_SECRET_APPAREIL}${randomBytes(32).toString("base64url")}`;
}

/** Le secret est aléatoire sur 256 bits : un SHA-256 simple suffit (pas de mot de passe humain à protéger). */
export function hacherSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Secret d'acquittement d'un ordre : lié à l'appareil et à l'ordre, sans rien stocker de plus. */
export function secretAcquittement(cle: Buffer, appareilId: string, commandeId: string): string {
  return createHmac("sha256", cle)
    .update(`acquittement-appareil:${appareilId}:${commandeId}`)
    .digest("base64url");
}

/** Comparaison en temps constant de deux textes. */
export function egaux(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Le jeton d'un en-tête `Authorization: Bearer …`, ou `null`. */
export function jetonBearer(en: string | string[] | undefined): string | null {
  const valeur = Array.isArray(en) ? en[0] : en;
  const m = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(valeur ?? "");
  return m?.[1] ?? null;
}
