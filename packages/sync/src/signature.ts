/**
 * Signature des événements par l'appareil.
 *
 * Chaque appareil fabrique une paire de clés ECDSA P-256 à son installation. La clé privée est
 * gardée dans IndexedDB sous forme de `CryptoKey` **non exportable** : elle ne quitte jamais
 * l'appareil. La clé publique est enregistrée sur le serveur (`PUT /sync/appareils/:id/cle`) et
 * sert à vérifier chaque événement reçu. Le serveur ne détient donc aucun secret d'appareil.
 *
 * Ce qui est signé : l'événement en JSON canonique (clés triées), voir `canonique`.
 */

/** JSON canonique : clés triées à tous les niveaux, `undefined` ignoré. Même texte des deux côtés. */
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

export function versHex(octets: ArrayBuffer | Uint8Array): string {
  const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  return Array.from(u8, (o) => o.toString(16).padStart(2, "0")).join("");
}

export function depuisHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex))
    throw new RangeError("Hexadécimal invalide");
  const sortie = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < sortie.length; i++) sortie[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return sortie;
}

/**
 * Types Web Crypto minimaux. Le paquet doit se typer aussi sans la bibliothèque DOM (l'API Nest
 * l'importe pour ses tests d'intégration) : on n'emploie donc ni `CryptoKey` ni `JsonWebKey`.
 */
export interface CleJwk {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  ext?: boolean;
  key_ops?: string[];
}

/** Clé opaque de Web Crypto (privée ou publique). */
export interface CleOpaque {
  readonly extractable: boolean;
}

interface WebCrypto {
  getRandomValues<T extends Uint8Array>(tableau: T): T;
  subtle: {
    generateKey(
      algo: object,
      extractable: boolean,
      usages: string[],
    ): Promise<{ publicKey: CleOpaque; privateKey: CleOpaque }>;
    exportKey(format: "jwk", cle: CleOpaque): Promise<CleJwk>;
    importKey(
      format: "jwk" | "raw",
      cle: CleJwk | Uint8Array<ArrayBuffer>,
      algo: object | string,
      extractable: boolean,
      usages: string[],
    ): Promise<CleOpaque>;
    sign(algo: object, cle: CleOpaque, donnees: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
    verify(
      algo: object,
      cle: CleOpaque,
      signature: Uint8Array<ArrayBuffer>,
      donnees: Uint8Array<ArrayBuffer>,
    ): Promise<boolean>;
    deriveBits(algo: object, cle: CleOpaque, longueur: number): Promise<ArrayBuffer>;
  };
}

function crypto(): WebCrypto {
  const c = (globalThis as unknown as { crypto?: WebCrypto }).crypto;
  if (!c?.subtle) throw new Error("Web Crypto indisponible : signature impossible");
  return c;
}

function encoder(texte: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(texte) as Uint8Array<ArrayBuffer>;
}

export interface CleAppareil {
  /** Non exportable. */
  privee: CleOpaque;
  /** À enregistrer sur le serveur. */
  publique: CleJwk;
}

export async function genererCleAppareil(): Promise<CleAppareil> {
  const paire = await crypto().subtle.generateKey(ALGO, false, ["sign", "verify"]);
  const publique = await crypto().subtle.exportKey("jwk", paire.publicKey);
  return { privee: paire.privateKey, publique };
}

/** Signature ECDSA (r‖s, 64 octets) du contenu canonique, en hexadécimal (128 caractères). */
export async function signer(privee: CleOpaque, contenu: unknown): Promise<string> {
  const donnees = encoder(canonique(contenu));
  return versHex(await crypto().subtle.sign(SIGNATURE, privee, donnees));
}

export async function verifierSignature(
  publique: CleJwk,
  contenu: unknown,
  signatureHex: string,
): Promise<boolean> {
  try {
    const cle = await crypto().subtle.importKey("jwk", publique, ALGO, false, ["verify"]);
    const donnees = encoder(canonique(contenu));
    return await crypto().subtle.verify(SIGNATURE, cle, depuisHex(signatureHex), donnees);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ PIN superviseur hors ligne */

export const ITERATIONS_PIN = 100_000;

/**
 * Vérificateur d'un PIN : PBKDF2-SHA-256 salé. Il permet à l'appareil de contrôler un PIN
 * superviseur **sans réseau** (déblocage sur place) sans jamais détenir le PIN. À créer au moment
 * où le superviseur choisit son PIN, puis à distribuer aux appareils de sa gare.
 *
 * Un PIN à 6 chiffres n'a que 10^6 valeurs : ce vérificateur ne tient pas face à une attaque
 * hors ligne. C'est pourquoi l'appareil limite les essais (3 faux, blocage de 15 minutes) et que ce
 * déblocage ne donne que 4 heures.
 */
export async function creerVerificateurPin(
  superviseurId: string,
  pin: string,
  options: { sel?: string; iterations?: number } = {},
): Promise<{ superviseurId: string; sel: string; iterations: number; hache: string }> {
  const sel = options.sel ?? versHex(crypto().getRandomValues(new Uint8Array(16)));
  const iterations = options.iterations ?? ITERATIONS_PIN;
  return { superviseurId, sel, iterations, hache: await deriverPin(pin, sel, iterations) };
}

async function deriverPin(pin: string, selHex: string, iterations: number): Promise<string> {
  const matiere = await crypto().subtle.importKey("raw", encoder(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto().subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: depuisHex(selHex), iterations },
    matiere,
    256,
  );
  return versHex(bits);
}

export async function pinCorrespond(
  verificateur: { sel: string; iterations: number; hache: string },
  pin: string,
): Promise<boolean> {
  const calcule = await deriverPin(pin, verificateur.sel, verificateur.iterations);
  // Comparaison sans court-circuit.
  let ecart = calcule.length ^ verificateur.hache.length;
  for (let i = 0; i < calcule.length; i++) {
    ecart |= calcule.charCodeAt(i) ^ (verificateur.hache.charCodeAt(i) || 0);
  }
  return ecart === 0;
}
