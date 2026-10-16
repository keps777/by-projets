/**
 * Codes courts : code du billet (4 chiffres, pour embarquer sans scanner) et code de retrait du
 * colis (6 chiffres, envoyé au destinataire seul, conservé haché).
 *
 * Le domaine ne choisit pas la source d'aléa : on lui passe un générateur `() => [0, 1)`.
 * En production, utiliser `aleaCrypto()`. Les tests passent un générateur à graine.
 */
export type Alea = () => number;

/** Aléa cryptographique (Web Crypto, disponible dans les navigateurs et Node ≥ 19). */
export function aleaCrypto(): Alea {
  return () => {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0]! / 0x1_0000_0000;
  };
}

function chiffres(alea: Alea, nombre: number): string {
  let code = "";
  for (let i = 0; i < nombre; i++) {
    const x = alea();
    if (!(x >= 0 && x < 1))
      throw new RangeError("Le générateur doit renvoyer un nombre dans [0, 1)");
    code += String(Math.floor(x * 10));
  }
  return code;
}

export const LONGUEUR_CODE_BILLET = 4;
export const LONGUEUR_CODE_RETRAIT = 6;

export function genererCodeBillet(alea: Alea): string {
  return chiffres(alea, LONGUEUR_CODE_BILLET);
}

/**
 * Code de billet unique parmi ceux du même départ (`dejaPris`). Lève une erreur si l'espace des
 * 10 000 codes est saturé.
 */
export function genererCodeBilletUnique(alea: Alea, dejaPris: ReadonlySet<string>): string {
  if (dejaPris.size >= 10 ** LONGUEUR_CODE_BILLET) throw new Error("Tous les codes sont pris");
  for (let essai = 0; essai < 1000; essai++) {
    const code = genererCodeBillet(alea);
    if (!dejaPris.has(code)) return code;
  }
  for (let n = 0; n < 10 ** LONGUEUR_CODE_BILLET; n++) {
    const code = String(n).padStart(LONGUEUR_CODE_BILLET, "0");
    if (!dejaPris.has(code)) return code;
  }
  throw new Error("Tous les codes sont pris");
}

export function genererCodeRetrait(alea: Alea): string {
  return chiffres(alea, LONGUEUR_CODE_RETRAIT);
}

export function estCodeBillet(code: string): boolean {
  return /^\d{4}$/.test(code);
}

export function estCodeRetrait(code: string): boolean {
  return /^\d{6}$/.test(code);
}

function enHex(octets: Uint8Array): string {
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Sel aléatoire (16 octets en hexadécimal) propre à un colis. */
export function genererSel(alea: Alea): string {
  const octets = new Uint8Array(16);
  for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(alea() * 256);
  return enHex(octets);
}

/**
 * Haché SHA-256 de `sel:code`. Un code à 6 chiffres n'a que 10⁶ valeurs : le haché protège contre
 * la lecture du code dans une sauvegarde ou un journal, pas contre une attaque hors ligne. Le serveur
 * doit donc aussi limiter les essais (3 essais) et peut ajouter un secret (`poivre`) absent de la base.
 */
export async function hacherCodeRetrait(code: string, sel: string, poivre = ""): Promise<string> {
  if (!estCodeRetrait(code)) throw new RangeError("Le code de retrait doit avoir 6 chiffres");
  const donnees = new TextEncoder().encode(`${poivre}:${sel}:${code}`);
  const condense = await globalThis.crypto.subtle.digest("SHA-256", donnees);
  return enHex(new Uint8Array(condense));
}

/** Tire un code de retrait : `code` part au destinataire seul, `hache` et `sel` sont stockés. */
export async function emettreCodeRetrait(
  alea: Alea,
  poivre = "",
): Promise<{ code: string; hache: string; sel: string }> {
  const code = genererCodeRetrait(alea);
  const sel = genererSel(alea);
  return { code, sel, hache: await hacherCodeRetrait(code, sel, poivre) };
}

export async function verifierCodeRetrait(
  saisi: string,
  hache: string,
  sel: string,
  poivre = "",
): Promise<boolean> {
  if (!estCodeRetrait(saisi)) return false;
  const calcule = await hacherCodeRetrait(saisi, sel, poivre);
  if (calcule.length !== hache.length) return false;
  let diff = 0;
  for (let i = 0; i < calcule.length; i++) diff |= calcule.charCodeAt(i) ^ hache.charCodeAt(i);
  return diff === 0;
}
