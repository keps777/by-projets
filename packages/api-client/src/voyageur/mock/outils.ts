import { ajouterMinutes, ecartMinutes, versIsoDouala } from "@afrimove/domain";
import type { ecrans } from "@afrimove/fixtures";

/**
 * Ce que le mock voyageur lit d'un scénario de `@afrimove/fixtures` (type `Ecran`). Le client ne
 * dépend pas de l'implémentation des fixtures : le composeur central lui passe l'objet, et les
 * types ci-dessous (`typeof ecrans`) ne servent qu'à relire les `donnees` sans `any`.
 */
export interface EcranSource {
  /** Nom de la planche (`Main`, `SiegePay`…), identique au nom du scénario. */
  readonly planche: string;
  /** Horloge figée du monde (ISO Douala). */
  readonly horloge: string;
  /** L'instant que montre la planche (ISO Douala) : « maintenant » du mock. */
  readonly maintenant: string;
  readonly donnees: unknown;
  readonly entites?: unknown;
}

type Planches = typeof ecrans;
/** Les `donnees` typées d'une planche voyageur. */
export type DonneesDe<K extends keyof Planches> = Planches[K]["donnees"];
export type EntitesDe<K extends keyof Planches> = Planches[K]["entites"];

/** Relit les `donnees` d'une planche avec leur type d'origine. */
export function donneesDe<K extends keyof Planches>(source: EcranSource, planche: K): DonneesDe<K> {
  if (source.planche !== planche) {
    throw new Error(`Scénario « ${source.planche} » reçu à la place de « ${planche} »`);
  }
  return source.donnees as DonneesDe<K>;
}

export function entitesDe<K extends keyof Planches>(source: EcranSource, planche: K): EntitesDe<K> {
  return (source.entites ?? {}) as EntitesDe<K>;
}

/* ------------------------------------------------------------------ temps */

/** Jour (AAAA-MM-JJ) d'un instant ISO Douala. */
export const jourDe = (iso: string): string => iso.slice(0, 10);

/** « 08:00 » un jour donné → ISO Douala. */
export function isoA(jour: string, hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new RangeError(`Heure HH:MM attendue : « ${hhmm} »`);
  return `${jour}T${m[1]}:${m[2]}:00.000+01:00`;
}

/** Jour + n jours (AAAA-MM-JJ). */
export function jourPlus(jour: string, n: number): string {
  return versIsoDouala(Date.parse(`${jour}T12:00:00+01:00`) + n * 86_400_000).slice(0, 10);
}

export const plusMinutes = (iso: string, minutes: number): string => ajouterMinutes(iso, minutes);

export const minutesEntre = (a: string, b: string): number => Math.round(ecartMinutes(a, b));

/** « 3 h 30 » ou « 2 h 30 » ou « 25 min » → minutes. */
export function dureeEnMinutes(texte: string): number {
  const h = /(\d+)\s*h(?:\s*(\d+))?/.exec(texte);
  if (h) return Number(h[1]) * 60 + Number(h[2] ?? 0);
  const m = /(\d+)\s*min/.exec(texte);
  if (m) return Number(m[1]);
  throw new RangeError(`Durée illisible : « ${texte} »`);
}

const MOIS: Readonly<Record<string, number>> = {
  janv: 1,
  févr: 2,
  fevr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8,
  aout: 8,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
  dec: 12,
};

/**
 * « 28 déc. », « sam. 10 janv. · 08:00 » → jour AAAA-MM-JJ (l'année est la plus proche de
 * `maintenant`, dans les 6 mois qui précèdent ou suivent) et heure éventuelle.
 */
export function dateFr(
  texte: string,
  maintenant: string,
): { jour: string; hhmm: string | undefined } | undefined {
  const m =
    /(\d{1,2})\s+(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)\.?/i.exec(
      texte,
    );
  if (!m) return undefined;
  const mois = MOIS[(m[2] ?? "").toLowerCase()];
  if (!mois) return undefined;
  const annee = Number(maintenant.slice(0, 4));
  const essai = (a: number): string =>
    `${a}-${String(mois).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  const ecart = (j: string): number =>
    Date.parse(`${j}T12:00:00Z`) - Date.parse(`${jourDe(maintenant)}T12:00:00Z`);
  const demi = 183 * 86_400_000;
  let jour = essai(annee);
  if (ecart(jour) > demi) jour = essai(annee - 1);
  else if (ecart(jour) < -demi) jour = essai(annee + 1);
  return { jour, hhmm: /(\d{2}:\d{2})/.exec(texte)?.[1] };
}

const JOURS_SEMAINE = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/** « sam. » → prochain samedi à partir de `maintenant` (aujourd'hui compte si c'est le même jour). */
export function prochainJourSemaine(texte: string, maintenant: string): string | undefined {
  const m = /^(dim|lun|mar|mer|jeu|ven|sam)/i.exec(texte.trim());
  if (!m) return undefined;
  const cible = JOURS_SEMAINE.indexOf((m[1] ?? "").toLowerCase());
  const actuel = new Date(`${jourDe(maintenant)}T12:00:00Z`).getUTCDay();
  return jourPlus(jourDe(maintenant), (cible - actuel + 7) % 7);
}

/* ------------------------------------------------------------------ textes */

/** Premier entier d'un texte (« 9 places » → 9, « plus que 3 » → 3). Les espaces de milliers sont ignorés. */
export function entier(texte: string): number {
  const m = /\d[\d   ]*\d|\d/.exec(texte);
  if (!m) throw new RangeError(`Aucun nombre dans « ${texte} »`);
  return Number(m[0].replace(/[   ]/g, ""));
}

/** « +237 6 91 22 10 08 » ou « 6 91 22 10 08 » → « +237691221008 ». */
export function telephone(texte: string, indicatif = "+237"): string {
  const chiffres = texte.replace(/[^\d+]/g, "");
  return chiffres.startsWith("+") ? chiffres : `${indicatif}${chiffres}`;
}

export function initiales(nom: string): string {
  const mots = nom
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const [premier, dernier] = [mots[0], mots[mots.length - 1]];
  if (!premier) return "?";
  return (premier.charAt(0) + (mots.length > 1 && dernier ? dernier.charAt(0) : "")).toUpperCase();
}

/** Identifiant de compagnie du monde commun (`cie-alp`…) d'après son nom affiché. */
const COMPAGNIES: Readonly<Record<string, string>> = {
  alpha: "cie-alp",
  bêta: "cie-bex",
  beta: "cie-bex",
  oméga: "cie-ome",
  omega: "cie-ome",
  général: "cie-gex",
  general: "cie-gex",
  touristique: "cie-tex",
};

export function idCompagnie(nom: string): string {
  const mot = nom.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return COMPAGNIES[mot] ?? `cie-${mot.replace(/[^a-z0-9]/g, "")}`;
}

const NOMS_COMPAGNIES: Readonly<Record<string, string>> = {
  "cie-alp": "Alpha Voyages",
  "cie-bex": "Bêta Express",
  "cie-ome": "Oméga Transports",
  "cie-gex": "Général Express",
  "cie-tex": "Touristique Express",
};

/** Nom complet d'une compagnie d'après un nom abrégé des planches (« Alpha » → « Alpha Voyages »). */
export function nomCompagnie(nom: string): string {
  return NOMS_COMPAGNIES[idCompagnie(nom)] ?? nom;
}

export function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Codes des villes des maquettes. */
export const CODES_VILLES: Readonly<Record<string, string>> = {
  Douala: "DLA",
  Yaoundé: "YDE",
  Bafoussam: "BAF",
  Bamenda: "BAM",
  Kribi: "KRI",
  Ngaoundéré: "NGA",
};

export const ville = (nom: string): { code?: string; nom: string } => {
  const code = CODES_VILLES[nom];
  return code ? { code, nom } : { nom };
};

/** Aïcha Ngo, la voyageuse des maquettes (monde commun de `@afrimove/fixtures`). */
export const AICHA = {
  id: "pers-aicha",
  prenom: "Aïcha",
  nom: "Ngo",
  initiales: "AN",
  telephone: "+237691221008",
  pieceQuatreDerniers: "4471",
} as const;
