import { normaliser } from "./langues";
import type { Ville } from "./villes";

/**
 * Comprendre un message libre : « Billet Douala Yaoundé demain matin », « je veux aller à Yaoundé
 * demain » (vocal transcrit), « I wan go Bafoussam tumara », une réponse « 2 », « Oui », « Changer
 * de siège ». Fonctions pures, sans accès au réseau ni à la base : tout le vocabulaire est ici.
 *
 * Elles ne devinent pas : un mot qu'elles ne savent pas lire à la place d'une ville ou d'une date
 * est signalé (`villeInconnue`, `dateNonLue`) pour que la conversation le dise au voyageur, au lieu
 * de lui proposer un autre trajet ou un autre jour sans le prévenir.
 */

export type JourDemande = "aujourdhui" | "demain" | "apres_demain";
export type Periode = "matin" | "apres_midi" | "soir" | "nuit";
export type Intention = "achat" | "salutation" | "aide" | "annulation" | "autre";

export interface Lecture {
  intention: Intention;
  /** Code de la ville de départ citée, ou `null`. */
  origine: string | null;
  /** Code de la ville d'arrivée citée, ou `null`. */
  destination: string | null;
  /** Le voyageur a cité deux fois la même ville (« Douala Douala »). */
  memeVille: boolean;
  /** Mot inconnu juste après « pour », « à », « to »… : une ville que nous ne desservons pas. */
  villeInconnue: string | null;
  jour: JourDemande | null;
  periode: Periode | null;
  /** Heure demandée (« 8h », « 14:30 »), en minutes depuis minuit : on propose les départs à partir de là. */
  apres: number | null;
  /** Jour de la semaine, date ou « semaine prochaine » : pas lus, on le dit. */
  dateNonLue: boolean;
}

/* ------------------------------------------------------------------ vocabulaire */

const MARQUEURS_ARRIVEE = new Set([
  "a",
  "pour",
  "vers",
  "to",
  "for",
  "fo",
  "go",
  "jusqu",
  "jusqua",
  "destination",
]);
const MARQUEURS_DEPART = new Set(["de", "du", "depuis", "from", "quitte", "leave", "leaving"]);

const MOTS_ACHAT = new Set([
  "billet",
  "billets",
  "bilet",
  "ticket",
  "tickets",
  "voyage",
  "voyager",
  "voyagez",
  "reserver",
  "reservation",
  "acheter",
  "achat",
  "buy",
  "book",
  "booking",
  "travel",
  "trip",
]);

/** Mots qui peuvent suivre « pour », « de », « to »… sans être une ville inconnue. */
const MOTS_CONNUS = new Set([
  ...MOTS_ACHAT,
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "du",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "moi",
  "toi",
  "lui",
  "elle",
  "nous",
  "vous",
  "ce",
  "cette",
  "ca",
  "the",
  "a",
  "an",
  "my",
  "me",
  "you",
  "us",
  "this",
  "that",
  "i",
  "je",
  "tu",
  "il",
  "bus",
  "car",
  "autocar",
  "depart",
  "departs",
  "trajet",
  "place",
  "places",
  "siege",
  "seat",
  "demain",
  "aujourd",
  "hui",
  "ajd",
  "today",
  "tomorrow",
  "tumara",
  "tumaro",
  "tumoro",
  "tomoro",
  "tude",
  "matin",
  "soir",
  "nuit",
  "apres",
  "midi",
  "morning",
  "afternoon",
  "evening",
  "night",
  "morni",
  "mornin",
  "evenin",
  "svp",
  "stp",
  "please",
  "abeg",
  "merci",
  "thanks",
  "moins",
  "plus",
  "tot",
  "tard",
  "early",
  "late",
  "di",
  "dem",
  "dis",
  "wan",
  "una",
  "wuna",
  "aller",
  "partir",
  "rentrer",
  "rentre",
  "retourner",
  "go",
  "going",
  "leave",
  "travel",
]);

const MOTS_SALUTATION = new Set([
  "bonjour",
  "bonsoir",
  "salut",
  "coucou",
  "hello",
  "hi",
  "hey",
  "yo",
  "slt",
  "cc",
  "bjr",
  "bsr",
]);

const MOTS_AIDE = new Set(["aide", "help", "menu", "info", "infos", "aidez", "start", "demarrer"]);

const MOTS_ANNULATION = new Set([
  "annuler",
  "annule",
  "annulez",
  "annulation",
  "cancel",
  "abandon",
  "abandonner",
  "stop",
  "quitter",
]);

const JOURS_SEMAINE = new Set([
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "prochain",
  "prochaine",
  "next",
  "semaine",
  "week",
  "weekend",
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

/* ------------------------------------------------------------------ jour, période, heure */

const JOUR_APRES_DEMAIN =
  /(?:^| )(?:apres demain|day after tomorrow|after tomorrow|afta tumara|afta tumaro|afta tumoro|afta tomoro|apres demin)(?: |$)/;
const JOUR_DEMAIN =
  /(?:^| )(?:demain|tomorrow|tomorow|tumara|tumaro|tumoro|tomoro|2morrow|2moro)(?: |$)/;
const JOUR_AUJOURDHUI =
  /(?:^| )(?:aujourd hui|aujourdhui|ajd|today|tude|tonight|ce soir|ce matin|cette nuit|this morning|this evening|this afternoon)(?: |$)/;

const PERIODES: readonly [Periode, RegExp][] = [
  ["apres_midi", /(?:^| )(?:apres midi|apresmidi|afternoon|afta noon|aprem)(?: |$)/],
  ["matin", /(?:^| )(?:matin|morning|morni|mornin|matinee)(?: |$)/],
  ["soir", /(?:^| )(?:soir|evening|evenin|tonight|soiree)(?: |$)/],
  ["nuit", /(?:^| )(?:nuit|night|nite|cette nuit)(?: |$)/],
];

/** Heures du jour qui définissent chaque période (heure de Douala, borne haute exclue). */
export function dansLaPeriode(periode: Periode, heure: number): boolean {
  switch (periode) {
    case "matin":
      return heure >= 4 && heure < 12;
    case "apres_midi":
      return heure >= 12 && heure < 18;
    case "soir":
      return heure >= 17;
    case "nuit":
      return heure >= 20 || heure < 5;
  }
}

function lireJour(norm: string): JourDemande | null {
  if (JOUR_APRES_DEMAIN.test(norm)) return "apres_demain";
  if (JOUR_DEMAIN.test(norm)) return "demain";
  if (JOUR_AUJOURDHUI.test(norm)) return "aujourdhui";
  return null;
}

function lirePeriode(norm: string): Periode | null {
  for (const [periode, motif] of PERIODES) if (motif.test(norm)) return periode;
  return null;
}

/** « 8h », « 08:30 », « 14h30 », « 8am », « 2 pm » : minutes depuis minuit. */
function lireHeure(texte: string): number | null {
  const t = texte.toLowerCase();
  const am = /(?:^|\s)(\d{1,2})\s?(am|pm)(?:\s|$|[.,!?])/.exec(t);
  if (am) {
    const h = Number(am[1]);
    if (h < 1 || h > 12) return null;
    return ((h % 12) + (am[2] === "pm" ? 12 : 0)) * 60;
  }
  const m = /(?:^|\s)(\d{1,2})\s?(?:h|:)\s?(\d{2})?(?:\s|$|[.,!?])/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const DATE_CHIFFREE = /(?:^|\s)\d{1,2}\s?[/.-]\s?\d{1,2}(?:\s?[/.-]\s?\d{2,4})?(?:\s|$|[.,!?])/;

/* ------------------------------------------------------------------ villes */

interface Citee {
  code: string;
  role: "depart" | "arrivee" | null;
  debut: number;
  fin: number;
}

function reperer(tokens: readonly string[], villes: readonly Ville[]): Citee[] {
  const parAlias = new Map<string, string>();
  for (const v of villes) for (const a of v.alias) parAlias.set(a, v.code);
  const trouvees: Citee[] = [];
  let i = 0;
  while (i < tokens.length) {
    let code: string | undefined;
    let longueur = 0;
    if (i + 1 < tokens.length) {
      code = parAlias.get(`${tokens[i]} ${tokens[i + 1]}`);
      if (code !== undefined) longueur = 2;
    }
    if (code === undefined) {
      code = parAlias.get(tokens[i]!);
      if (code !== undefined) longueur = 1;
    }
    if (code === undefined) {
      i += 1;
      continue;
    }
    const avant = i > 0 ? tokens[i - 1]! : "";
    const role = MARQUEURS_DEPART.has(avant)
      ? "depart"
      : MARQUEURS_ARRIVEE.has(avant)
        ? "arrivee"
        : null;
    trouvees.push({ code, role, debut: i, fin: i + longueur });
    i += longueur;
  }
  return trouvees;
}

function attribuer(citees: readonly Citee[]): {
  origine: string | null;
  destination: string | null;
} {
  const distinctes: Citee[] = [];
  for (const c of citees) if (!distinctes.some((d) => d.code === c.code)) distinctes.push(c);
  if (distinctes.length === 0) return { origine: null, destination: null };
  const depart = distinctes.find((c) => c.role === "depart");
  const arrivee = distinctes.find((c) => c.role === "arrivee");
  if (distinctes.length === 1) {
    const seule = distinctes[0]!;
    // Sans indication, une seule ville est l'arrivée : « billet Yaoundé », « je veux aller à Yaoundé ».
    return seule.role === "depart"
      ? { origine: seule.code, destination: null }
      : { origine: null, destination: seule.code };
  }
  if (depart && arrivee && depart.code !== arrivee.code) {
    return { origine: depart.code, destination: arrivee.code };
  }
  if (depart) {
    return {
      origine: depart.code,
      destination: distinctes.find((c) => c.code !== depart.code)!.code,
    };
  }
  if (arrivee) {
    return {
      origine: distinctes.find((c) => c.code !== arrivee.code)!.code,
      destination: arrivee.code,
    };
  }
  return { origine: distinctes[0]!.code, destination: distinctes[1]!.code };
}

/* ------------------------------------------------------------------ lecture d'une demande */

export function lireDemande(texte: string, villes: readonly Ville[]): Lecture {
  const norm = normaliser(texte);
  const tokens = norm.split(" ").filter(Boolean);
  const citees = reperer(tokens, villes);
  const { origine, destination } = attribuer(citees);
  const codes = new Set(citees.map((c) => c.code));
  const memeVille = citees.length >= 2 && codes.size === 1;

  const consommes = new Set<number>();
  for (const c of citees) for (let k = c.debut; k < c.fin; k++) consommes.add(k);

  let villeInconnue: string | null = null;
  tokens.forEach((token, i) => {
    if (villeInconnue !== null) return;
    if (!MARQUEURS_ARRIVEE.has(token) && !MARQUEURS_DEPART.has(token)) return;
    const suivant = tokens[i + 1];
    if (suivant === undefined || consommes.has(i + 1)) return;
    if (/^\d/.test(suivant) || MOTS_CONNUS.has(suivant) || JOURS_SEMAINE.has(suivant)) return;
    if (MARQUEURS_ARRIVEE.has(suivant) || MARQUEURS_DEPART.has(suivant)) return;
    if (suivant.length < 3) return;
    villeInconnue = suivant;
  });

  const annulation = tokens.some((t) => MOTS_ANNULATION.has(t));
  const achat = tokens.some((t) => MOTS_ACHAT.has(t)) || citees.length > 0;
  let intention: Intention = "autre";
  if (annulation) intention = "annulation";
  else if (achat) intention = "achat";
  else if (tokens.some((t) => MOTS_AIDE.has(t))) intention = "aide";
  else if (tokens.some((t) => MOTS_SALUTATION.has(t)) || /^how far\b/.test(norm)) {
    intention = "salutation";
  }

  return {
    intention,
    origine,
    destination,
    memeVille,
    villeInconnue: intention === "achat" ? villeInconnue : null,
    jour: lireJour(norm),
    periode: lirePeriode(norm),
    apres: lireHeure(texte),
    dateNonLue:
      intention === "achat" &&
      (tokens.some((t) => JOURS_SEMAINE.has(t)) || DATE_CHIFFREE.test(texte)),
  };
}

/* ------------------------------------------------------------------ réponses courtes */

const NOMBRES_EN_MOTS: Readonly<Record<string, number>> = {
  un: 1,
  une: 1,
  one: 1,
  premier: 1,
  first: 1,
  deux: 2,
  two: 2,
  deuxieme: 2,
  second: 2,
  trois: 3,
  three: 3,
  troisieme: 3,
  third: 3,
  quatre: 4,
  four: 4,
  cinq: 5,
  five: 5,
};

const AVANT_NUMERO = new Set([
  "le",
  "la",
  "the",
  "numero",
  "option",
  "choix",
  "number",
  "no",
  "n",
  "num",
  "choice",
]);
const APRES_NUMERO = new Set([
  "svp",
  "stp",
  "please",
  "abeg",
  "merci",
  "thanks",
  "s",
  "il",
  "vous",
  "plait",
]);

/**
 * Le numéro d'une réponse courte (« 2 », « le 2 », « option 2 », « n°2 », « deux », « 2 svp »), ou
 * `null` si le message dit autre chose.
 */
export function lireRang(texte: string): number | null {
  const mots = normaliser(texte).split(" ").filter(Boolean);
  while (mots.length > 1 && AVANT_NUMERO.has(mots[0]!)) mots.shift();
  while (mots.length > 1 && APRES_NUMERO.has(mots[mots.length - 1]!)) mots.pop();
  if (mots.length !== 1) return null;
  const mot = mots[0]!;
  if (/^[1-9]$/.test(mot)) return Number(mot);
  return NOMBRES_EN_MOTS[mot] ?? null;
}

/** Numéro de siège : un ou deux chiffres, avec « siège », « seat » ou « n° » devant éventuellement. */
export function lireSiege(texte: string): number | null {
  const mots = normaliser(texte).split(" ").filter(Boolean);
  while (
    mots.length > 1 &&
    (AVANT_NUMERO.has(mots[0]!) || ["siege", "seat", "place"].includes(mots[0]!))
  ) {
    mots.shift();
  }
  while (
    mots.length > 1 &&
    (APRES_NUMERO.has(mots[mots.length - 1]!) ||
      ["fenetre", "couloir", "window", "aisle"].includes(mots[mots.length - 1]!))
  ) {
    mots.pop();
  }
  if (mots.length !== 1 || !/^\d{1,3}$/.test(mots[0]!)) return null;
  const n = Number(mots[0]);
  return n >= 1 ? n : null;
}

export type Reponse = "oui" | "non" | "changer";

const MOTS_OUI = new Set([
  "oui",
  "ouais",
  "ok",
  "okay",
  "okey",
  "yes",
  "yeah",
  "yep",
  "yup",
  "ya",
  "confirme",
  "confirmer",
  "confirm",
  "valide",
  "valider",
  "payer",
  "paye",
  "pay",
  "go",
  "daccord",
  "dacc",
  "dak",
]);
const MOTS_NON = new Set([
  "non",
  "no",
  "nope",
  "nan",
  "annuler",
  "annule",
  "cancel",
  "stop",
  "nah",
]);
const MOTS_CHANGER = new Set([
  "changer",
  "change",
  "changez",
  "autre",
  "other",
  "another",
  "different",
]);

/**
 * « Oui », « Changer de siège » ou « Non » : les deux boutons de la maquette, et leurs variantes.
 * « Changer » l'emporte sur « oui » (« oui mais change de siège ») et sur « non » (« non, un autre
 * siège »). `null` si le message n'est aucun des trois.
 */
export function lireReponse(texte: string): Reponse | null {
  const norm = normaliser(texte);
  const mots = norm.split(" ").filter(Boolean);
  if (mots.length === 0 || mots.length > 8) return null;
  if (mots.some((m) => MOTS_CHANGER.has(m))) return "changer";
  if (/\bd accord\b/.test(norm) || /\bna so\b/.test(norm) || /\bgo ahead\b/.test(norm))
    return "oui";
  if (/\blaisse tomber\b/.test(norm) || /\bno thanks\b/.test(norm)) return "non";
  if (mots.some((m) => MOTS_NON.has(m))) return "non";
  if (mots.some((m) => MOTS_OUI.has(m)) || mots[0] === "1") return "oui";
  return null;
}

/** Le message demande d'abandonner l'achat en cours. */
export function estAnnulation(texte: string): boolean {
  const norm = normaliser(texte);
  const mots = norm.split(" ").filter(Boolean);
  return (
    mots.some((m) => MOTS_ANNULATION.has(m)) ||
    /\blaisse tomber\b/.test(norm) ||
    (mots.length <= 3 && mots.some((m) => ["non", "no", "nope", "nan"].includes(m)))
  );
}

/** Retrouve un départ par l'heure (« 8h30 », « 08:30 ») ou le nom de la compagnie (« Alpha »). */
export function choisirParIndice(
  texte: string,
  departs: readonly { heure: string; nom: string }[],
): number | null {
  const minutes = lireHeure(texte);
  if (minutes !== null) {
    const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const rangs = departs.flatMap((d, i) => (d.heure === hhmm ? [i] : []));
    if (rangs.length === 1) return rangs[0]!;
  }
  const mots = new Set(normaliser(texte).split(" ").filter(Boolean));
  const rangs = departs.flatMap((d, i) => (mots.has(d.nom) ? [i] : []));
  return rangs.length === 1 ? rangs[0]! : null;
}
