/**
 * Les trois langues de la conversation : français, anglais et pidgin du Cameroun (« pcm »). La
 * langue se lit dans les mots du voyageur ; sans indice, la conversation garde sa langue, puis la
 * langue par défaut (français).
 */

export const LANGUES = ["fr", "en", "pcm"] as const;
export type Langue = (typeof LANGUES)[number];

export const estLangue = (v: unknown): v is Langue =>
  typeof v === "string" && (LANGUES as readonly string[]).includes(v);

/** Passe un message à une forme comparable : minuscules, sans accent, ponctuation en espaces. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mots qui trahissent une langue (formes normalisées). Un mot ambigu (« billet », « ticket » se
 * disent dans plusieurs langues) n'est compté que pour la langue qui l'utilise le plus. Le pidgin
 * se reconnaît à ses mots propres : « wan », « dey », « abeg », « wetin », « tumara »…
 */
const MOTS: Readonly<Record<Langue, readonly string[]>> = {
  fr: [
    "bonjour",
    "bonsoir",
    "salut",
    "billet",
    "billets",
    "demain",
    "aujourd",
    "hui",
    "apres",
    "matin",
    "soir",
    "nuit",
    "je",
    "veux",
    "voudrais",
    "aller",
    "pour",
    "vers",
    "depuis",
    "merci",
    "oui",
    "non",
    "changer",
    "siege",
    "annuler",
    "annule",
    "svp",
    "stp",
    "voyage",
    "voyager",
    "reserver",
    "acheter",
    "aide",
    "d",
    "accord",
    "s",
    "il",
    "vous",
    "plait",
    "avec",
    "une",
    "un",
    "deux",
    "trois",
  ],
  en: [
    "hello",
    "hi",
    "hey",
    "ticket",
    "tickets",
    "tomorrow",
    "today",
    "morning",
    "afternoon",
    "evening",
    "night",
    "want",
    "need",
    "would",
    "like",
    "go",
    "going",
    "to",
    "from",
    "thanks",
    "thank",
    "please",
    "yes",
    "no",
    "change",
    "seat",
    "cancel",
    "buy",
    "book",
    "travel",
    "trip",
    "help",
    "the",
    "and",
    "me",
    "my",
    "i",
    "one",
    "two",
    "three",
  ],
  pcm: [
    "wan",
    "dey",
    "abeg",
    "wetin",
    "tumara",
    "tumaro",
    "tumoro",
    "tomoro",
    "morni",
    "mornin",
    "evenin",
    "una",
    "wuna",
    "sabi",
    "oga",
    "dem",
    "na",
    "fit",
    "fo",
    "wen",
    "make",
    "ansa",
    "pay",
    "don",
    "bilet",
    "tude",
    "bifor",
    "afta",
    "kam",
    "chop",
  ],
};

/** Mots du pidgin qui ne se disent pas en anglais courant : un seul suffit à trancher. */
const MOTS_FORTS_PIDGIN: readonly string[] = [
  "wan",
  "dey",
  "abeg",
  "wetin",
  "tumara",
  "tumaro",
  "tumoro",
  "tomoro",
  "morni",
  "mornin",
  "evenin",
  "wuna",
  "sabi",
  "oga",
  "bilet",
  "tude",
  "ansa",
];

const ENSEMBLES: Readonly<Record<Langue, ReadonlySet<string>>> = {
  fr: new Set(MOTS.fr),
  en: new Set(MOTS.en),
  pcm: new Set(MOTS.pcm),
};

/** Commandes qui changent la langue de la conversation (message d'un seul mot). */
const CHOIX_LANGUE: Readonly<Record<string, Langue>> = {
  francais: "fr",
  french: "fr",
  english: "en",
  anglais: "en",
  pidgin: "pcm",
  pcm: "pcm",
  kamtok: "pcm",
  "pidgin english": "pcm",
};

export function choixDeLangue(texte: string): Langue | null {
  return CHOIX_LANGUE[normaliser(texte)] ?? null;
}

/**
 * La langue d'un message, ou `null` s'il n'y a pas d'indice (un chiffre, « ok », un nom de ville).
 * Le pidgin l'emporte dès qu'un de ses mots propres apparaît ; entre le français et l'anglais, le
 * plus de mots gagne, l'égalité ne tranche pas.
 */
export function detecterLangue(texte: string): Langue | null {
  const mots = normaliser(texte).split(" ").filter(Boolean);
  if (mots.length === 0) return null;
  if (mots.some((m) => MOTS_FORTS_PIDGIN.includes(m))) return "pcm";
  // « how far » : la salutation du pidgin (en anglais, « how » et « far » ne se suivent pas ainsi)
  if (/\bhow far\b/.test(mots.join(" "))) return "pcm";
  const score = (langue: Langue): number => mots.filter((m) => ENSEMBLES[langue].has(m)).length;
  const fr = score("fr");
  const en = score("en");
  const pcm = score("pcm");
  if (pcm > fr && pcm > en) return "pcm";
  if (fr === 0 && en === 0) return null;
  if (fr === en) return null;
  return fr > en ? "fr" : "en";
}
