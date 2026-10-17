/**
 * Encodage du texte pour l'imprimante : page de code PC850 (ESC t 2), la page « latin multilingue » que
 * toutes les imprimantes compatibles ESC/POS connaissent. Elle couvre les accents du français (é è ê à ç
 * ï ô È É…) et la virgule médiane « · » des maquettes. Ce qui n'y est pas (flèche →, tirets longs,
 * guillemets typographiques…) est remplacé par un équivalent ASCII plutôt que par un caractère faux.
 */

/** Numéro de page de code envoyé à ESC t pour PC850. */
export const PAGE_DE_CODE_PC850 = 2;

/** Moitié haute de PC850 (0x80 à 0xFF), dans l'ordre. */
const PC850_HAUT =
  "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" +
  "áíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" +
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" +
  "­±‗¾¶§÷¸°¨·¹³²■ ";

const VERS_PC850 = new Map<string, number>();
Array.from(PC850_HAUT).forEach((caractere, i) => {
  VERS_PC850.set(caractere, 0x80 + i);
});

/** Remplacements ASCII des caractères que PC850 ne sait pas dessiner. */
const REMPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "–": "-",
  "—": "-",
  "‑": "-",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "€": "EUR",
  œ: "oe",
  Œ: "OE",
  " ": " ",
  " ": " ",
  " ": " ",
};

/** Texte -> octets PC850. Les sauts de ligne et caractères de commande sont retirés (la mise en page les gère). */
export function encoderTexte(texte: string): number[] {
  const octets: number[] = [];
  for (const caractere of texte) {
    const remplace = REMPLACEMENTS[caractere];
    if (remplace !== undefined) {
      for (const c of remplace) octets.push(c.charCodeAt(0));
      continue;
    }
    const code = caractere.codePointAt(0) ?? 0x3f;
    if (code >= 0x20 && code <= 0x7e) {
      octets.push(code);
      continue;
    }
    const haut = VERS_PC850.get(caractere);
    if (haut !== undefined) {
      octets.push(haut);
      continue;
    }
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      octets.push(0x20);
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    octets.push(0x3f);
  }
  return octets;
}

/** Octets PC850 -> texte (relecture des tickets dans les tests et les journaux). */
export function decoderPc850(octets: ArrayLike<number>): string {
  let texte = "";
  for (let i = 0; i < octets.length; i += 1) {
    const o = octets[i] ?? 0;
    texte += o >= 0x80 ? (Array.from(PC850_HAUT)[o - 0x80] ?? "?") : String.fromCharCode(o);
  }
  return texte;
}

/** Nombre de caractères que le texte occupera une fois encodé (les remplacements peuvent allonger). */
export function longueurImprimee(texte: string): number {
  return encoderTexte(texte).length;
}
