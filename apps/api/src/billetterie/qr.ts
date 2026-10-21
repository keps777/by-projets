import { webcrypto } from "node:crypto";

/**
 * QR code d'un billet, signé : il ne peut pas être forgé.
 *
 *     AM1:<numéro>:<code>:<départ>:<signature>
 *
 * - `numéro` : AGENCE-GARE-AAMMJJ-NNNN ; `code` : les 4 chiffres du billet ; `départ` : l'identifiant
 *   du départ à l'émission ;
 * - `signature` : ECDSA P-256 / SHA-256 (format brut r‖s, 64 octets) en base64url, calculée par le
 *   serveur sur le texte `AM1:<numéro>:<code>:<départ>`.
 *
 * La clé privée reste sur le serveur. La clé publique (JWK) est publiée (`GET /billetterie/cle-publique`)
 * et embarquée dans les appareils du quai : ils vérifient un QR **sans réseau**. Un QR dont un seul
 * caractère change, ou qui porte la signature d'un autre billet, est refusé.
 */

export type CleJwk = webcrypto.JsonWebKey;

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNATURE = { name: "ECDSA", hash: "SHA-256" } as const;
export const PREFIXE_QR = "AM1";

export interface ContenuQr {
  numero: string;
  code: string;
  departId: string;
}

export interface PaireCles {
  /** JWK avec `d` : à garder secrète. */
  privee: CleJwk;
  publique: CleJwk;
}

export async function genererPaireQr(): Promise<PaireCles> {
  const paire = await webcrypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const privee = await webcrypto.subtle.exportKey("jwk", paire.privateKey);
  const publique = await webcrypto.subtle.exportKey("jwk", paire.publicKey);
  return { privee, publique: cleSansSecret(publique) };
}

/** Ne garde de la clé que ce qui sert à vérifier : jamais de `d`. */
export function cleSansSecret(jwk: CleJwk): CleJwk {
  return { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string };
}

/** La clé publique correspondant à une clé privée JWK. */
export function publiqueDe(privee: CleJwk): CleJwk {
  return cleSansSecret(privee);
}

function texteSigne(c: ContenuQr): string {
  return `${PREFIXE_QR}:${c.numero}:${c.code}:${c.departId}`;
}

const enBase64Url = (octets: ArrayBuffer): string => Buffer.from(octets).toString("base64url");

export async function signerQr(privee: CleJwk, contenu: ContenuQr): Promise<string> {
  const cle = await webcrypto.subtle.importKey("jwk", privee, ALGO, false, ["sign"]);
  const texte = texteSigne(contenu);
  const signature = await webcrypto.subtle.sign(SIGNATURE, cle, new TextEncoder().encode(texte));
  return `${texte}:${enBase64Url(signature)}`;
}

export interface QrLu {
  contenu: ContenuQr;
  signature: string;
}

/** Découpe un QR sans rien vérifier. `null` si la forme n'est pas celle d'un QR AfriMove signé. */
export function lireQr(qr: string): QrLu | null {
  const m =
    /^AM1:([A-Z0-9]{2,8}-[A-Z0-9]{2,8}-\d{6}-\d{4}):(\d{4}):([^:\s]{1,128}):([A-Za-z0-9_-]{86})$/.exec(
      qr.trim(),
    );
  if (!m) return null;
  return { contenu: { numero: m[1]!, code: m[2]!, departId: m[3]! }, signature: m[4]! };
}

/** Vérifie la signature d'un QR avec la clé publique. Renvoie son contenu, ou `null` s'il est forgé. */
export async function verifierQr(publique: CleJwk, qr: string): Promise<ContenuQr | null> {
  const lu = lireQr(qr);
  if (!lu) return null;
  // Une seule écriture par signature : les bits de bourrage de la fin du base64url doivent être nuls.
  const octets = Buffer.from(lu.signature, "base64url");
  if (octets.length !== 64 || octets.toString("base64url") !== lu.signature) return null;
  try {
    const cle = await webcrypto.subtle.importKey("jwk", cleSansSecret(publique), ALGO, false, [
      "verify",
    ]);
    const ok = await webcrypto.subtle.verify(
      SIGNATURE,
      cle,
      Buffer.from(lu.signature, "base64url"),
      new TextEncoder().encode(texteSigne(lu.contenu)),
    );
    return ok ? lu.contenu : null;
  } catch {
    return null;
  }
}
