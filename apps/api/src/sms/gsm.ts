import type { EncodageSms } from "./types";

/**
 * Encodage et découpage d'un SMS.
 *
 * Un SMS ne porte que 160 caractères en alphabet GSM (153 par morceau s'il y en a plusieurs), ou 70
 * (67 par morceau) dès qu'un seul caractère sort de cet alphabet : « ê », « ç » minuscule, « ï », « œ »,
 * les guillemets français, l'apostrophe courbe… Or l'opérateur facture le morceau. Le français courant
 * (é, è, à, ù) tient dans l'alphabet GSM ; pour le reste, `adapterGsm` remplace le caractère par son
 * équivalent sans accent plutôt que de payer le triple.
 */

// Table de base GSM 03.38 (le code 0x1B, qui annonce un caractère de la table étendue, est omis).
const BASE_GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const ETENDUE_GSM = "^{}\\[~]|€";

const BASE = new Set([...BASE_GSM]);
const ETENDUE = new Set([...ETENDUE_GSM]);

/** Remplacements typographiques qui ne se décomposent pas en « lettre + accent ». */
const REMPLACEMENTS: Readonly<Record<string, string>> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  "…": "...",
  " ": " ",
  " ": " ",
  " ": " ",
  "\t": " ",
  œ: "oe",
  Œ: "OE",
};

const dansAlphabetGsm = (c: string): boolean => BASE.has(c) || ETENDUE.has(c);

/** Remplace chaque caractère hors alphabet GSM par un équivalent GSM quand il en existe un. */
export function adapterGsm(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    if (dansAlphabetGsm(c)) {
      sortie += c;
      continue;
    }
    const remplace = REMPLACEMENTS[c];
    if (remplace !== undefined) {
      sortie += remplace;
      continue;
    }
    const sansAccent = c.normalize("NFD").replace(/\p{M}/gu, "");
    sortie += [...sansAccent].every(dansAlphabetGsm) ? sansAccent : c;
  }
  return sortie;
}

export interface AnalyseSms {
  encodage: EncodageSms;
  /** Caractères visibles (un caractère hors plan de base compte pour un). */
  caracteres: number;
  /** Unités facturables de longueur : septets GSM (un caractère étendu en vaut 2) ou unités UTF-16. */
  unites: number;
  /** Nombre de morceaux, donc de SMS facturés. */
  segments: number;
}

export function analyserTexte(texte: string): AnalyseSms {
  const caracteres = [...texte].length;
  const gsm = [...texte].every(dansAlphabetGsm);
  if (gsm) {
    const unites = [...texte].reduce((n, c) => n + (ETENDUE.has(c) ? 2 : 1), 0);
    const segments = unites === 0 ? 0 : unites <= 160 ? 1 : Math.ceil(unites / 153);
    return { encodage: "gsm7", caracteres, unites, segments };
  }
  const unites = texte.length;
  const segments = unites === 0 ? 0 : unites <= 70 ? 1 : Math.ceil(unites / 67);
  return { encodage: "ucs2", caracteres, unites, segments };
}

/** `+237655012345` → `+237 ••••• 345` : de quoi reconnaître le numéro à l'écran sans l'exposer. */
export function masquerTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  if (chiffres.length < 8) return "••••";
  const indicatif = chiffres.length > 9 ? chiffres.slice(0, chiffres.length - 9) : "";
  const fin = chiffres.slice(-3);
  return `${indicatif ? `+${indicatif} ` : ""}••••• ${fin}`;
}
