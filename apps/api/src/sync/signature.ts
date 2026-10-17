import { webcrypto } from "node:crypto";

/** Clé publique au format JWK (le type DOM `JsonWebKey` n'existe pas dans la config TypeScript de l'API). */
export type CleJwk = webcrypto.JsonWebKey;

/**
 * Vérification des événements signés par l'appareil (ECDSA P-256 / SHA-256 sur le JSON canonique).
 * Même procédé que `packages/sync/src/signature.ts` (non importable à l'exécution, voir README) ;
 * `sync.parite.test.ts` signe avec le paquet et vérifie ici.
 */

/** JSON canonique : clés triées à tous les niveaux, `undefined` ignoré. */
export function canonique(valeur: unknown): string {
  return JSON.stringify(trier(valeur));
}

function trier(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(trier);
  if (valeur !== null && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const cle of Object.keys(valeur as Record<string, unknown>).sort()) {
      const v = (valeur as Record<string, unknown>)[cle];
      if (v !== undefined) sortie[cle] = trier(v);
    }
    return sortie;
  }
  return valeur;
}

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNATURE = { name: "ECDSA", hash: "SHA-256" } as const;

function depuisHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex))
    throw new RangeError("Hexadécimal invalide");
  const sortie = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < sortie.length; i++) sortie[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return sortie;
}

/** Une clé publique JWK est-elle une clé ECDSA P-256 utilisable pour vérifier ? */
export async function cleValide(publique: unknown): Promise<CleJwk | null> {
  if (publique === null || typeof publique !== "object") return null;
  const jwk = publique as CleJwk;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string"
  ) {
    return null;
  }
  // On ne garde que la partie publique : jamais de `d` (clé privée) sur le serveur.
  const propre: CleJwk = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
  try {
    await webcrypto.subtle.importKey("jwk", propre, ALGO, false, ["verify"]);
  } catch {
    return null;
  }
  return propre;
}

export async function verifierSignature(
  publique: CleJwk,
  contenu: unknown,
  signatureHex: string,
): Promise<boolean> {
  try {
    const cle = await webcrypto.subtle.importKey("jwk", publique, ALGO, false, ["verify"]);
    const donnees = new TextEncoder().encode(canonique(contenu));
    return await webcrypto.subtle.verify(SIGNATURE, cle, depuisHex(signatureHex), donnees);
  } catch {
    return false;
  }
}
