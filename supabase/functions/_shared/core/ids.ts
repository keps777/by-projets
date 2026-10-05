// Identifiants déterministes : le client et le serveur produisent le MÊME identifiant pour la même occurrence ou le même
// rappel, donc créer deux fois ne crée jamais de doublon (spec §13).

function cyrb53(s: string, graine: number): number {
  let h1 = 0xdeadbeef ^ graine, h2 = 0x41c6ce57 ^ graine;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const hex = (n: number, len: number) => Math.floor(n).toString(16).padStart(len, '0').slice(-len);

/** UUID (forme v4) dérivé d'un texte : même texte, même identifiant. */
export function uuidDeterministe(texte: string): string {
  const a = cyrb53(texte, 1), b = cyrb53(texte, 2), c = cyrb53(texte, 3);
  const h = hex(a, 13) + hex(b, 13) + hex(c, 6);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const idOccurrence = (tacheId: string, jour: string) => uuidDeterministe(`occ:${tacheId}:${jour}`);
export const idRappel = (cleUnique: string) => uuidDeterministe(`rappel:${cleUnique}`);
export const cleRappelBloc = (occurrenceId: string, delaiMin: number) => `${occurrenceId}:${delaiMin}`;

/** UUID aléatoire (navigateur, Deno et Node récents). */
export const nouvelId = (): string => crypto.randomUUID();

export const idSaisie = (occurrenceId: string) => uuidDeterministe(`saisie:${occurrenceId}`);
export const idSaisieValeur = (saisieId: string, cle: string) => uuidDeterministe(`sv:${saisieId}:${cle}`);
