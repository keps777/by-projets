import { ErreurHttp } from "@afrimove/api-client";
import { ecrire, lire, retirer } from "@/coquille/stockage";

/**
 * Preuve du superviseur pour `caisse.validee` / `caisse.refusee` (`ValidationSuperviseur` du contrat).
 *
 * Le PIN n'est jamais gardé : à la sixième touche il sert à dériver (PBKDF2-SHA-256) une clé HMAC non
 * exportable, gardée en mémoire jusqu'au geste (Valider ou Refuser). La signature hexadécimale couvre le contenu
 * canonique de la décision. Le PIN ne voyage donc pas, seule la signature part avec l'événement.
 * Le schéma exact de vérification côté serveur (AM-164) reste à confirmer : voir le rapport du ticket.
 */

export type MethodeValidation = "pin" | "empreinte";

export interface PreuveSuperviseur {
  methode: MethodeValidation;
  cle: CryptoKey;
}

const ITERATIONS = 100_000;
const encodeur = new TextEncoder();

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto indisponible : signature impossible");
  return c;
}

function octets(texte: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encodeur.encode(texte));
}

function hex(tampon: ArrayBuffer): string {
  return Array.from(new Uint8Array(tampon), (o) => o.toString(16).padStart(2, "0")).join("");
}

/** JSON canonique (clés triées à tous les niveaux) : même texte chez celui qui signe et chez celui qui vérifie. */
export function canonique(valeur: unknown): string {
  const trier = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(trier);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, trier(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(trier(valeur));
}

/** Clé de signature dérivée d'un secret (le PIN tapé, ou l'identifiant de la clé d'empreinte), propre au superviseur. */
export async function deriverCle(
  secret: string | Uint8Array<ArrayBuffer>,
  superviseurId: string,
): Promise<CryptoKey> {
  const { subtle } = webCrypto();
  const matiere = await subtle.importKey(
    "raw",
    typeof secret === "string" ? octets(secret) : secret,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: octets(`afrimove:validation:${superviseurId}`),
      iterations: ITERATIONS,
    },
    matiere,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

/** Signature hexadécimale (HMAC-SHA-256, 64 caractères) du contenu canonique de la décision. */
export async function signer(cle: CryptoKey, contenu: unknown): Promise<string> {
  return hex(await webCrypto().subtle.sign("HMAC", cle, octets(canonique(contenu))));
}

/** Le serveur a refusé le PIN (ou la preuve) : un essai de perdu. */
export function pinRefuse(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 401 || erreur.code === "PIN_INCORRECT");
}

/** Le serveur a bloqué le compte (trop d'essais) : le clavier se bloque aussi. */
export function compteBloque(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 423 || erreur.code === "PIN_BLOQUE");
}

/* ------------------------------------------------------------------ blocage qui survit à un rechargement */

const cleBlocage = (superviseurId: string) => `afrimove.pin.bloque.${superviseurId}`;

/** Instant (ms) de réouverture du clavier, s'il est encore bloqué. */
export function blocageEnCours(superviseurId: string, maintenant = Date.now()): number | null {
  const valeur = Number(lire(cleBlocage(superviseurId)));
  return Number.isFinite(valeur) && valeur > maintenant ? valeur : null;
}

export function enregistrerBlocage(superviseurId: string, jusqua: number): void {
  ecrire(cleBlocage(superviseurId), String(jusqua));
}

export function leverBlocage(superviseurId: string): void {
  retirer(cleBlocage(superviseurId));
}
