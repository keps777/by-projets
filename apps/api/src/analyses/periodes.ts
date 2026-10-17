import { decalerJour, debutDeJour, joursEntre } from "../rapport/temps";

/** Périodes de l'écran Analyses : les derniers jours **complets**, la période d'avant pour comparer. */

export type Periode = "semaine" | "mois" | "trimestre" | "annee";
export const PERIODES: readonly Periode[] = ["semaine", "mois", "trimestre", "annee"];

/**
 * Longueur de chaque période en jours : des semaines entières, pour que les séries tombent juste.
 * À confirmer : un « mois » fait 28 jours, un « trimestre » 91, une « année » 364.
 */
export const JOURS_PAR_PERIODE: Record<Periode, number> = {
  semaine: 7,
  mois: 28,
  trimestre: 91,
  annee: 364,
};

const NOM_PERIODE: Record<Periode, string> = {
  semaine: "Semaine",
  mois: "Mois",
  trimestre: "Trimestre",
  annee: "Année",
};

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

export const JOURS_NOMS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;
export const INITIALES = ["D", "L", "M", "M", "J", "V", "S"] as const;
const ABREGES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"] as const;

export type JourAbrege = "lun" | "mar" | "mer" | "jeu" | "ven" | "sam" | "dim";

/** 0 = dimanche … 6 = samedi, pour un jour `AAAA-MM-JJ` (le calendrier est le même à Douala qu'ailleurs). */
export function jourSemaine(jour: string): number {
  const d = debutDeJour(jour);
  if (!d) throw new RangeError(`Jour invalide : ${jour}`);
  return new Date(`${jour}T12:00:00.000Z`).getUTCDay();
}

export const initialeDuJour = (jour: string): string => INITIALES[jourSemaine(jour)]!;
export const abregeDuJour = (jour: string): JourAbrege => ABREGES[jourSemaine(jour)] as JourAbrege;
export const nomDuJour = (jour: string): string => JOURS_NOMS[jourSemaine(jour)]!;

/** `29 déc.` */
export function dateCourte(jour: string): string {
  const mois = Number(jour.slice(5, 7));
  return `${Number(jour.slice(8, 10))} ${MOIS_COURTS[mois - 1]}`;
}

/** Numéro de semaine ISO 8601 (S41). */
export function semaineIso(jour: string): number {
  const d = new Date(`${jour}T12:00:00.000Z`);
  const jourIso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - jourIso);
  const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1, 12);
  return Math.ceil(((d.getTime() - debutAnnee) / 86_400_000 + 1) / 7);
}

export interface Fenetre {
  periode: Periode;
  jours: number;
  /** Premier et dernier jour (inclus) : la période se termine **hier**, jamais sur un jour entamé. */
  du: string;
  au: string;
  /** La période d'avant, de même longueur, pour la variation. */
  precedentDu: string;
  precedentAu: string;
  /** « Semaine du 29 déc. au 4 janv. » */
  libelle: string;
}

export function fenetre(periode: Periode, aujourdhui: string): Fenetre {
  const jours = JOURS_PAR_PERIODE[periode];
  const au = decalerJour(aujourdhui, -1);
  const du = decalerJour(au, -(jours - 1));
  const precedentAu = decalerJour(du, -1);
  const precedentDu = decalerJour(precedentAu, -(jours - 1));
  return {
    periode,
    jours,
    du,
    au,
    precedentDu,
    precedentAu,
    libelle: `${NOM_PERIODE[periode]} du ${dateCourte(du)} au ${dateCourte(au)}`,
  };
}

export interface Tranche {
  libelle: string;
  du: string;
  au: string;
}

/**
 * Les points de la série de recette : un par jour (semaine), par semaine (mois, trimestre, libellé
 * « S41 »), par bloc de quatre semaines (année, libellé du mois où il se termine). Les tranches
 * couvrent la période exactement, sans trou ni recouvrement.
 */
export function tranches(f: Fenetre): Tranche[] {
  const taille = f.periode === "semaine" ? 1 : f.periode === "annee" ? 28 : 7;
  const sortie: Tranche[] = [];
  for (let debut = 0; debut < f.jours; debut += taille) {
    const du = decalerJour(f.du, debut);
    const au = decalerJour(du, taille - 1);
    const libelle =
      f.periode === "semaine"
        ? initialeDuJour(du)
        : f.periode === "annee"
          ? MOIS_COURTS[Number(au.slice(5, 7)) - 1]!
          : `S${semaineIso(au)}`;
    sortie.push({ libelle, du, au });
  }
  return sortie;
}

/** Rang du jour dans la période : 1 = le plus ancien (`joursConcernes` des contrats). */
export const rangDansPeriode = (jour: string, du: string): number => joursEntre(du, jour) + 1;

/** Les jours `AAAA-MM-JJ` de `du` à `au` inclus. */
export function jourParJour(du: string, au: string): string[] {
  const sortie: string[] = [];
  for (let j = du; j <= au; j = decalerJour(j, 1)) sortie.push(j);
  return sortie;
}

/** Les `n` dernières semaines de 7 jours qui se terminent à `au`, de la plus ancienne à la plus récente (libellé « S41 »). */
export function semaines(au: string, n: number): Tranche[] {
  const sortie: Tranche[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const fin = decalerJour(au, -7 * i);
    sortie.push({ libelle: `S${semaineIso(fin)}`, du: decalerJour(fin, -6), au: fin });
  }
  return sortie;
}
