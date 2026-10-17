import { GARDE_COLIS_JOURS, TARIFS, formaterFcfa } from "../colis/regles";
import { aMinutesDuJour, enMs, jourSemaine, minutesDuJour, type Instant } from "./temps";

/**
 * Règles métier des points relais, reprises des contrats (`@afrimove/contrats`, colis) et du domaine
 * (`TARIFS`, `repartitionRelais`). Fonctions pures : aucune lecture d'horloge, aucun accès extérieur.
 */

/* ------------------------------------------------------------------ gains et délais */

/** Gain du relais à chaque colis remis : 200 F (les 300 F du supplément moins la part d'AfriMove). */
export const GAIN_REMISE_RELAIS = TARIFS.relais.partRelais;

/** Gain du relais pour un colis repris faute d'avoir été retiré (« 100 F si repris »). */
export const GAIN_REPRISE_RELAIS = 100;

/** Garde d'un colis chez le relais : 7 jours, puis le colis est repris. */
export const GARDE_RELAIS_JOURS = GARDE_COLIS_JOURS;

/** Un rappel part au destinataire à partir du 5e jour de garde. */
export const RAPPEL_APRES_JOURS = 5;

/** Nombre de colis qu'un relais peut garder en même temps (« 7 sur 30 »), sauf réglage contraire. */
export const CAPACITE_PAR_DEFAUT = 30;

/** Note d'un relais ou d'un livreur avant son premier avis. */
export const NOTE_INITIALE = 5;

/** « ferme à 19 h » s'affiche quand la fermeture est dans les 6 heures. */
export const FERME_BIENTOT_MINUTES = 6 * 60;

/** Un agent AfriMove passe sous 72 h après le dépôt de la fiche. */
export const DELAI_VISITE_HEURES = 72;

/** Le relais est payé chaque lundi, à partir de 8 h (heure de Douala). */
export const MINUTE_VERSEMENT_RELAIS = 8 * 60;

/** Le versement est annoncé aux relais comme « lundi » (« 42 remis · lundi MoMo »). */
export const LIBELLE_VERSEMENT_RELAIS = "lundi";

export { formaterFcfa };

/* ------------------------------------------------------------------ textes */

/** « Bafoussam » → « BAF » : le préfixe des codes R-BAF-0215 et L-BAF-0087. */
export function codeVille(ville: string): string {
  const lettres = ville
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return lettres.length === 3 ? lettres : lettres.padEnd(3, "X");
}

/** Minuscules sans accents ni ponctuation : pour comparer des noms de quartier ou de boutique. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function codeDossier(prefixe: string, numero: number): string {
  return `${prefixe}-${String(numero).padStart(4, "0")}`;
}

/** « Éric T. » → « ÉT » (les initiales des deux premiers mots). */
export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter((m) => m.length > 0)
    .slice(0, 2)
    .map((m) => m.charAt(0).toLocaleUpperCase("fr"))
    .join("");
}

/** « +237699401822 » → « 6 99 •• •• 22 » : le numéro MoMo tel que l'écran le montre. */
export function masquerMomo(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  const national = chiffres.slice(-9);
  if (national.length < 9) return "•• •• ••";
  return `${national.charAt(0)} ${national.slice(1, 3)} •• •• ${national.slice(-2)}`;
}

export type OperateurMobile = "mtn" | "orange";

/** L'opérateur d'un numéro camerounais d'après son préfixe, pour préremplir la fiche. */
export function operateurProbable(telephone: string): OperateurMobile | null {
  const national = telephone.replace(/\D/g, "").slice(-9);
  if (/^(69|65[5-9]|640)/.test(national)) return "orange";
  if (/^(67|68|65[0-4])/.test(national)) return "mtn";
  return null;
}

export function libelleOperateur(operateur: OperateurMobile): string {
  return operateur === "mtn" ? "MTN" : "Orange";
}

/** Le moyen de versement tel que l'écran l'écrit : « MoMo » ou « Orange Money ». */
export function libelleMoyen(operateur: OperateurMobile): string {
  return operateur === "mtn" ? "MoMo" : "Orange Money";
}

/* ------------------------------------------------------------------ horaires */

export interface HorairesRelais {
  /** Minutes depuis minuit. */
  ouvreMin: number;
  fermeMin: number;
  /** 0 dimanche … 6 samedi. */
  jours: number[];
  /** « 7 h–20 h », « 7 h 30–22 h ». */
  libelle: string;
  /** « lun.–sam. », « 7 j/7 ». */
  libelleJours: string;
}

const NOMS_JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"] as const;

const heureTexte = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};

const RE_HORAIRES = /^(\d{1,2}) ?h(?: ?(\d{2}))? ?[–-] ?(\d{1,2}) ?h(?: ?(\d{2}))? ?· ?(.+)$/u;

/**
 * Lit « 7 h – 20 h · lun.–sam. », « 7 h 30 – 22 h · 7 j / 7 » ou « 8 h – 18 h · lun.–ven. ».
 * Renvoie `null` si le texte n'a pas ce format ou si l'heure d'ouverture n'est pas avant la fermeture.
 */
export function lireHoraires(texte: string): HorairesRelais | null {
  const m = RE_HORAIRES.exec(texte.trim());
  if (!m) return null;
  const ouvreMin = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const fermeMin = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (!(ouvreMin >= 0 && fermeMin <= 24 * 60 && ouvreMin < fermeMin)) return null;
  const jours = lireJours(m[5] ?? "");
  if (!jours) return null;
  return {
    ouvreMin,
    fermeMin,
    jours: jours.liste,
    libelle: `${heureTexte(ouvreMin)}–${heureTexte(fermeMin)}`,
    libelleJours: jours.libelle,
  };
}

function lireJours(texte: string): { liste: number[]; libelle: string } | null {
  const brut = texte.trim().toLowerCase();
  if (/^7 ?j ?\/ ?7$/.test(brut)) return { liste: [0, 1, 2, 3, 4, 5, 6], libelle: "7 j/7" };
  const m = /^(lun|mar|mer|jeu|ven|sam|dim)\.? ?[–-] ?(lun|mar|mer|jeu|ven|sam|dim)\.?$/.exec(brut);
  if (!m) return null;
  const debut = NOMS_JOURS.indexOf(m[1] as (typeof NOMS_JOURS)[number]);
  const fin = NOMS_JOURS.indexOf(m[2] as (typeof NOMS_JOURS)[number]);
  const liste: number[] = [];
  for (let j = debut; ; j = (j + 1) % 7) {
    liste.push(j);
    if (j === fin) break;
  }
  return { liste, libelle: `${m[1]}.–${m[2]}.` };
}

export function estOuvert(h: HorairesRelais, instant: Instant): boolean {
  const minutes = minutesDuJour(instant);
  return h.jours.includes(jourSemaine(instant)) && minutes >= h.ouvreMin && minutes < h.fermeMin;
}

/** L'heure de fermeture d'aujourd'hui quand elle approche (dans les 6 heures), sinon `null`. */
export function fermeBientot(h: HorairesRelais, instant: Instant): string | null {
  if (!estOuvert(h, instant)) return null;
  return h.fermeMin - minutesDuJour(instant) <= FERME_BIENTOT_MINUTES
    ? aMinutesDuJour(instant, h.fermeMin)
    : null;
}

/** « Petits et moyens (≤ 10 kg) » → 10. */
export function lireTailleMaxKg(texte: string): number | null {
  const m = /≤ ?(\d+) ?kg/.exec(texte);
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ distances */

export interface Point {
  lat: number;
  lon: number;
}

const RAYON_TERRE_M = 6_371_000;

/** Distance à vol d'oiseau, en mètres entiers (formule de haversine). */
export function distanceM(a: Point, b: Point): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/* ------------------------------------------------------------------ versement hebdomadaire */

/** Vrai quand le versement du lundi est dû : la semaine a commencé depuis au moins 8 h. */
export function versementRelaisDu(instant: Instant, debutSemaine: Instant): boolean {
  return enMs(instant) - enMs(debutSemaine) >= MINUTE_VERSEMENT_RELAIS * 60_000;
}
