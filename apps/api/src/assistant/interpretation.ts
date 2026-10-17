import type { LigneRef } from "../analyses/modele";
import { jourSemaine } from "../analyses/periodes";
import { decalerJour } from "../rapport/temps";
import type { Intention } from "./modele";
import type { ChoixInterpretation } from "./ports";

/**
 * Comprendre une question en français : des règles lisibles, pas un modèle. Une question est rangée dans
 * une intention parmi un petit nombre ; ce qui n'y entre pas est « inconnue » (le modèle de langage
 * peut alors proposer un rangement, que `depuisChoix` revérifie).
 */

export interface Interpretation {
  intention: Intention;
  /** Lignes reconnues dans la question : aucune, une, ou plusieurs (question ambiguë). */
  ligneIds: string[];
  heure: string | null;
  /** 0 = dimanche … 6 = samedi. */
  jourSemaine: number | null;
  prix: number | null;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Minuscules, sans accents ni ponctuation : « Pourquoi Bafoussam baisse ? » → « pourquoi bafoussam baisse ». */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[→>\-–—]/g, " ")
    .replace(/[^a-z0-9:]+/g, " ")
    .trim();
}

const contient = (texte: string, mot: string): boolean => ` ${texte} `.includes(` ${mot} `);
const motif = (texte: string, re: RegExp): boolean => re.test(texte);

/** Les lignes dont la question parle : celles qui ont le meilleur score (nom complet > destination > origine). */
export function lignesCitees(texte: string, lignes: readonly LigneRef[]): string[] {
  const scores = lignes.map((l) => {
    const origine = contient(texte, normaliser(l.origine));
    const destination = contient(texte, normaliser(l.destination));
    const code = contient(texte, normaliser(l.code));
    const score = code ? 5 : origine && destination ? 4 : destination ? 2 : origine ? 1 : 0;
    return { id: l.id, score };
  });
  const meilleur = Math.max(0, ...scores.map((s) => s.score));
  return meilleur === 0 ? [] : scores.filter((s) => s.score === meilleur).map((s) => s.id);
}

/** « 10h », « 10h30 », « 10:00 » → `10:00`. */
export function heureCitee(texte: string): string | null {
  const m = /(?<![\d:])([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?![\d])/.exec(texte);
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2] ?? "00"}`;
}

/** « à 3 500 », « 3500 f », « 4 000 francs » → 3500, 3500, 4000 (au moins 100). */
export function prixCite(texte: string): number | null {
  const sansHeure = texte.replace(
    /(?<![\d:])([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?![\d])/g,
    " ",
  );
  const m = /(?<![\d])(\d{1,3}(?: \d{3})+|\d{3,6})(?![\d])/.exec(sansHeure);
  if (!m) return null;
  const n = Number(m[1]!.replace(/ /g, ""));
  return n >= 100 ? n : null;
}

/** Le jour de la semaine cité (« samedi », « demain »), 0 = dimanche. */
export function jourCite(texte: string, aujourdhui: string): number | null {
  for (let i = 0; i < JOURS.length; i++) {
    if (motif(texte, new RegExp(`\\b${JOURS[i]}s?\\b`))) return i;
  }
  if (motif(texte, /\bdemain\b/)) return jourSemaine(decalerJour(aujourdhui, 1));
  if (motif(texte, /\baujourd hui\b/)) return jourSemaine(aujourdhui);
  return null;
}

export function interpreter(
  question: string,
  lignes: readonly LigneRef[],
  aujourdhui: string,
): Interpretation {
  const t = normaliser(question);
  const ligneIds = lignesCitees(t, lignes);
  const heure = heureCitee(t);
  const prix = prixCite(t);
  const jour = jourCite(t, aujourdhui);
  const base = { ligneIds, heure, jourSemaine: jour, prix };

  if (
    prix !== null &&
    motif(t, /\b(baiss\w*|monte\w*|augment\w*|reduir\w*|reduit\w*|passe\w*|et si|prix|tarif\w*)\b/)
  ) {
    return { ...base, intention: "et_si_prix" };
  }
  if (
    motif(t, /\b(bus|cars?|vehicules?)\b/) &&
    motif(t, /\b(cout\w*|cher|depens\w*|reviens?|revient)\b/)
  ) {
    return { ...base, intention: "cout_bus" };
  }
  if (
    jour !== null &&
    motif(t, /\b(prevision\w*|prevoir|prevu\w*|previs\w*|attendre|attends|combien)\b/)
  ) {
    return { ...base, intention: "prevision_jour" };
  }
  if (motif(t, /\b(pourquoi|baisse\w*|chute\w*|recul\w*|diminu\w*)\b/) && ligneIds.length > 0) {
    return { ...base, intention: ligneIds.length > 1 ? "ambigue" : "pourquoi_ligne" };
  }
  if (
    motif(
      t,
      /\b(argent|fuites?|perd\w*|perte\w*|ecarts?|manque\w*|anomalies?|disparait\w*|disparu\w*)\b/,
    )
  ) {
    return { ...base, intention: "ou_part_argent" };
  }
  return { ...base, intention: "inconnue" };
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Ce que le modèle a compris, revérifié : une intention de la liste, une ligne qui existe, une heure
 * valide, un prix plausible. Tout ce qui ne tient pas est ignoré (un choix douteux ne devient jamais une action).
 */
export function depuisChoix(
  choix: ChoixInterpretation,
  lignes: readonly LigneRef[],
): Interpretation | null {
  const intentions: Intention[] = [
    "pourquoi_ligne",
    "cout_bus",
    "prevision_jour",
    "et_si_prix",
    "ou_part_argent",
  ];
  if (!intentions.includes(choix.intention)) return null;
  const cible = choix.ligne ? normaliser(choix.ligne) : null;
  const ligne = cible ? lignes.find((l) => normaliser(l.nom) === cible) : undefined;
  const heure = choix.heure !== null && HEURE.test(choix.heure) ? choix.heure : null;
  const jour =
    Number.isInteger(choix.jourSemaine) && choix.jourSemaine! >= 0 && choix.jourSemaine! <= 6
      ? choix.jourSemaine
      : null;
  const prix =
    Number.isInteger(choix.prix) && choix.prix! >= 100 && choix.prix! <= 1_000_000
      ? choix.prix
      : null;
  const resultat: Interpretation = {
    intention: choix.intention,
    ligneIds: ligne ? [ligne.id] : [],
    heure,
    jourSemaine: jour,
    prix,
  };
  // Une intention sans ce qu'il lui faut n'est pas comprise.
  if (resultat.intention === "pourquoi_ligne" && resultat.ligneIds.length === 0) return null;
  if (resultat.intention === "prevision_jour" && resultat.jourSemaine === null) return null;
  if (resultat.intention === "et_si_prix" && resultat.prix === null) return null;
  return resultat;
}
