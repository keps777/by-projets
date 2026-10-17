import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Code de retrait d'un colis : 6 chiffres tirés au hasard, envoyés au destinataire seul.
 *
 * Recopie de `codes.ts` du domaine (voir `parite.test.ts`) : même format de haché
 * (SHA-256 de `poivre:sel:code`), donc un colis écrit par le domaine se vérifie ici et inversement.
 * Un code à 6 chiffres n'a que 10⁶ valeurs : le haché protège d'une lecture de la base, pas d'une
 * attaque hors ligne. C'est pourquoi le serveur compte les essais (3, puis le colis est bloqué) et
 * ajoute un poivre absent de la base.
 */

export const LONGUEUR_CODE_RETRAIT = 6;

/** Source d'aléa dans [0, 1), remplaçable dans les tests. Par défaut : aléa cryptographique. */
export type Alea = () => number;

export function estCodeRetrait(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function genererCodeRetrait(alea?: Alea): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE_RETRAIT; i++) {
    if (alea === undefined) {
      code += String(randomInt(0, 10));
    } else {
      const x = alea();
      if (!(x >= 0 && x < 1)) {
        throw new RangeError("Le générateur doit renvoyer un nombre dans [0, 1)");
      }
      code += String(Math.floor(x * 10));
    }
  }
  return code;
}

/** Sel de 16 octets en hexadécimal, propre à un colis. */
export function genererSel(alea?: Alea): string {
  if (alea === undefined) return randomBytes(16).toString("hex");
  const octets = Buffer.alloc(16);
  for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(alea() * 256);
  return octets.toString("hex");
}

export function hacherCodeRetrait(code: string, sel: string, poivre = ""): string {
  if (!estCodeRetrait(code)) throw new RangeError("Le code de retrait doit avoir 6 chiffres");
  return createHash("sha256").update(`${poivre}:${sel}:${code}`, "utf8").digest("hex");
}

export interface CodeEmis {
  /** À envoyer au destinataire, puis à oublier : ne jamais le journaliser. */
  code: string;
  hache: string;
  sel: string;
}

export function emettreCodeRetrait(poivre = "", alea?: Alea): CodeEmis {
  const code = genererCodeRetrait(alea);
  const sel = genererSel(alea);
  return { code, sel, hache: hacherCodeRetrait(code, sel, poivre) };
}

/** Comparaison à temps constant du haché du code saisi. */
export function verifierCodeRetrait(
  saisi: string,
  hache: string,
  sel: string,
  poivre = "",
): boolean {
  if (!estCodeRetrait(saisi)) return false;
  const calcule = Buffer.from(hacherCodeRetrait(saisi, sel, poivre), "utf8");
  const attendu = Buffer.from(hache, "utf8");
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

/** Poivre propre au code de retrait, dérivé du poivre du serveur (séparation des usages). */
export function poivreCodeRetrait(poivreServeur: Buffer): string {
  return createHmac("sha256", poivreServeur).update("colis.code_retrait").digest("hex");
}
