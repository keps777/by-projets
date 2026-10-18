import type { patron as c } from "@afrimove/contrats";
import { FRAIS_VOYAGEUR_EN_LIGNE, prixProrata } from "../billetterie/regles";
import { francs } from "../caisse/format";
import { BLOCAGE_PIN_MINUTES, ESSAIS_PIN_MAX, TOLERANCE_ECART_DEFAUT } from "../caisse/regles";
import { arrondir1, pluriel } from "../rapport/regles";
import { decalerJour, heureDouala, jourDouala, MS_PAR_MINUTE } from "../rapport/temps";
import type { ArretLigne, EtatPersonne, MembrePatron, ReglesLues, RoleEquipe } from "./modele";

/**
 * Les calculs du module patron : fonctions pures, sans accès aux ports ni à l'horloge, donc testées
 * une à une (`calculs.test.ts`). Les phrases que l'API formule elle-même (indicateur d'une personne,
 * lecture des écarts, lecture des ventes par heure) sont ici, au même endroit.
 */

/* ------------------------------------------------------------------ formats */

/** « 6 77 •• •• 02 » : le numéro sans l'indicatif, les quatre chiffres du milieu masqués. */
export function masquerNumero(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  const national =
    chiffres.startsWith("237") && chiffres.length === 12 ? chiffres.slice(3) : chiffres;
  if (national.length === 9) {
    return `${national.slice(0, 1)} ${national.slice(1, 3)} •• •• ${national.slice(-2)}`;
  }
  return `${national.slice(0, 3)} •• •• ${national.slice(-2)}`;
}

/** « 2,61 M » à partir de 1 000 000 F, sinon « 740 000 F ». */
export function montantCourt(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const millions = `${(Math.abs(n) / 1_000_000).toFixed(1).replace(".", ",")} M`;
    return n < 0 ? `− ${millions}` : millions;
  }
  return francs(n);
}

/** « Douala → Yaoundé ». */
export const nomLigne = (origineVille: string, destinationVille: string): string =>
  `${origineVille} → ${destinationVille}`;

/** Minuscules sans accents, pour chercher « Éric » en tapant « eric ». */
export const sansAccents = (texte: string): string =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ------------------------------------------------------------------ personnes */

/** L'état d'une personne : compte désactivé, bloqué après trois PIN faux, ou ce qu'elle fait. */
export function etatDe(m: MembrePatron, maintenant: Date): EtatPersonne {
  if (!m.actif) return "hors_service";
  if (m.bloqueJusqua !== null && m.bloqueJusqua.getTime() > maintenant.getTime()) return "bloquee";
  return m.situation;
}

export const enActivite = (etat: EtatPersonne): boolean =>
  etat === "en_service" || etat === "a_bord" || etat === "en_route";

/** « Akwa guichet 2 », « LT 412 AB », « Mvan » : où la personne travaille. */
export function lieuDe(m: Pick<MembrePatron, "role" | "gareNom" | "guichetRang" | "bus">): string {
  const gare = m.gareNom ?? "";
  if (m.role === "guichetier" && m.guichetRang !== null) {
    return gare === "" ? `guichet ${m.guichetRang}` : `${gare} guichet ${m.guichetRang}`;
  }
  if ((m.role === "chauffeur" || m.role === "convoyeur") && m.bus !== null) return m.bus;
  return gare;
}

export interface ContexteIndicateur {
  /** Caisses clôturées avec un écart non nul sur les 10 derniers jours. */
  ecarts10: number;
  /** Caisses de la gare clôturées et pas encore validées (superviseur). */
  validationsEnAttente: number;
}

/**
 * La phrase sous le nom, dans la forme des maquettes : « bloquée · 3 PIN faux 09:40 »,
 * « 3 écarts · PIN à renouveler », « 1 204 billets · 0 écart ».
 */
export function indicateurDe(m: MembrePatron, etat: EtatPersonne, ctx: ContexteIndicateur): string {
  if (etat === "bloquee" && m.bloqueJusqua !== null) {
    const bloqueA = new Date(m.bloqueJusqua.getTime() - BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE);
    return `bloquée · ${ESSAIS_PIN_MAX} PIN faux ${heureDouala(bloqueA)}`;
  }
  const phrases: string[] = [];
  if (ctx.ecarts10 > 0) phrases.push(pluriel(ctx.ecarts10, "écart", "écarts"));
  if (m.pinProvisoireJusqua !== null) phrases.push("PIN à renouveler");
  if (phrases.length > 0) return phrases.join(" · ");
  switch (m.role) {
    case "guichetier":
      return `${pluriel(m.billets90, "billet", "billets")} · 0 écart`;
    case "convoyeur":
      return pluriel(m.billets90, "billet vendu", "billets vendus");
    case "superviseur":
      return ctx.validationsEnAttente > 0
        ? `${pluriel(ctx.validationsEnAttente, "validation", "validations")} en attente`
        : "rien en attente";
    default:
      return "";
  }
}

/** Ordre d'attention : les comptes bloqués d'abord, puis ceux qui ont des écarts ou un PIN à renouveler. */
export function prioriteDeSuivi(etat: EtatPersonne, m: MembrePatron, ecarts10: number): number {
  if (etat === "bloquee") return 0;
  if (ecarts10 >= 3) return 1;
  if (ecarts10 > 0 || m.pinProvisoireJusqua !== null) return 2;
  return 3;
}

export const ordreRole = (role: RoleEquipe, ordre: readonly RoleEquipe[]): number =>
  ordre.indexOf(role);

/* ------------------------------------------------------------------ écarts de caisse */

export interface EcartDeSession {
  /** Instant de la clôture. */
  at: string;
  ecart: number;
}

/** Un point par jour, du plus ancien au plus récent ; 0 là où il n'y a pas d'écart. */
export function ecartsParJour(
  sessions: readonly EcartDeSession[],
  jourFinal: string,
  nbJours: number,
): Array<{ jour: string; ecart: number }> {
  const parJour = new Map<string, number>();
  for (const s of sessions) {
    const jour = jourDouala(s.at);
    parJour.set(jour, (parJour.get(jour) ?? 0) + s.ecart);
  }
  const jours: Array<{ jour: string; ecart: number }> = [];
  for (let i = nbJours - 1; i >= 0; i--) {
    const jour = decalerJour(jourFinal, -i);
    jours.push({ jour, ecart: parJour.get(jour) ?? 0 });
  }
  return jours;
}

/**
 * La lecture des écarts d'une personne, en une ou deux phrases chiffrées par l'API :
 * « 3 écarts en 10 jours, − 3 500 F au total. Toujours en négatif. Toujours un multiple de 500. »
 */
export function lectureEcarts(
  ecarts: readonly number[],
  nbJours: number,
  tolerance: number,
): string {
  const nonNuls = ecarts.filter((e) => e !== 0);
  if (nonNuls.length === 0) return `Aucun écart de caisse sur les ${nbJours} derniers jours.`;
  const total = nonNuls.reduce((a, b) => a + b, 0);
  const phrases = [
    `${pluriel(nonNuls.length, "écart", "écarts")} en ${nbJours} jours, ${francs(total)} au total.`,
  ];
  if (nonNuls.length >= 2 && nonNuls.every((e) => e < 0)) phrases.push("Toujours en négatif.");
  if (nonNuls.length >= 2 && nonNuls.every((e) => e % 500 === 0)) {
    phrases.push("Toujours un multiple de 500.");
  }
  const horsTolerance = nonNuls.filter((e) => Math.abs(e) > tolerance).length;
  if (horsTolerance > 0) {
    phrases.push(
      `${pluriel(horsTolerance, "écart dépasse", "écarts dépassent")} la tolérance de ${francs(tolerance)}.`,
    );
  }
  return phrases.join(" ");
}

/* ------------------------------------------------------------------ lignes */

/** Le prix du tronçon depuis l'origine jusqu'à l'arrêt, au prorata des kilomètres (0 si les distances manquent). */
export function prorataArret(
  arrets: readonly ArretLigne[],
  rang: number,
  prixComplet: number,
): number {
  const points = arrets.map((a, i) => ({ id: String(i), kmDepuisOrigine: a.km }));
  try {
    return prixProrata({
      arrets: points,
      prixTrajetComplet: prixComplet,
      depuisArretId: "0",
      versArretId: String(rang),
    });
  } catch {
    return 0;
  }
}

/**
 * Les arrêts d'une ligne après modification : l'origine et le terminus restent, les arrêts en route
 * sont ceux de la liste. Un arrêt déjà connu (même nom) garde ses kilomètres ; un nouvel arrêt est placé
 * entre ses voisins, à égale distance. Si les kilomètres ne croissent plus (arrêts réordonnés), tous
 * les arrêts en route sont répartis à égale distance. Sans distance de ligne, 100 km par tronçon.
 */
export function arretsApresModification(
  actuels: readonly ArretLigne[],
  enRoute: ReadonlyArray<{ nom: string; montee: boolean }>,
): ArretLigne[] {
  const origine = actuels[0] ?? { nom: "", km: 0, montee: true };
  const terminus =
    actuels.length > 1 ? actuels[actuels.length - 1]! : { nom: "", km: 100, montee: false };
  const total = terminus.km > origine.km ? terminus.km : (enRoute.length + 1) * 100;
  const connus = new Map(actuels.slice(1, -1).map((a) => [a.nom.toLowerCase(), a.km]));
  const km: Array<number | null> = enRoute.map((a) => connus.get(a.nom.toLowerCase()) ?? null);

  const croissant = (valeurs: Array<number | null>): boolean => {
    let precedent = origine.km;
    for (const v of valeurs) {
      if (v === null) continue;
      if (v <= precedent || v >= total) return false;
      precedent = v;
    }
    return true;
  };
  let resolus: number[];
  if (croissant(km)) {
    resolus = km.map((v) => v ?? 0);
    for (let i = 0; i < km.length; i++) {
      if (km[i] !== null) continue;
      let avant = i - 1;
      while (avant >= 0 && km[avant] === null) avant--;
      let apres = i + 1;
      while (apres < km.length && km[apres] === null) apres++;
      const kmAvant = avant >= 0 ? km[avant]! : origine.km;
      const kmApres = apres < km.length ? km[apres]! : total;
      const trous = apres - avant;
      resolus[i] = Math.round(kmAvant + ((kmApres - kmAvant) * (i - avant)) / trous);
    }
  } else {
    resolus = enRoute.map((_a, i) =>
      Math.round(origine.km + ((total - origine.km) * (i + 1)) / (enRoute.length + 1)),
    );
  }
  return [
    origine,
    ...enRoute.map((a, i) => ({ nom: a.nom, km: resolus[i]!, montee: a.montee })),
    { ...terminus, km: total },
  ];
}

/** Les kilomètres d'une ligne neuve : 100 km par tronçon (la distance réelle se renseignera plus tard). */
export function arretsDeLigneNeuve(
  origine: string,
  enRoute: readonly string[],
  terminus: string,
): ArretLigne[] {
  return [
    { nom: origine, km: 0, montee: true },
    ...enRoute.map((nom, i) => ({ nom, km: (i + 1) * 100, montee: true })),
    { nom: terminus, km: (enRoute.length + 1) * 100, montee: false },
  ];
}

/** Rangées d'un plan de sièges : `2+2` sur 40 places = 10 rangées. */
export function rangeesDe(capacite: number, disposition: string): number {
  const parRangee = disposition.split("+").reduce((a, b) => a + Number(b), 0);
  return parRangee > 0 ? Math.ceil(capacite / parRangee) : 1;
}

/* ------------------------------------------------------------------ ventes par heure (salle de contrôle) */

export interface VenteDatee {
  at: string;
  montant: number;
}

export const PREMIERE_HEURE = 5;
export const DERNIERE_HEURE = 21;

export function heureLocale(instant: string | Date): number {
  return Number(heureDouala(instant).slice(0, 2));
}

/**
 * Les ventes de la journée heure par heure. Les heures déjà passées sont les ventes réelles ; l'heure en
 * cours et les suivantes sont prévues : la moyenne de la même heure sur les mêmes jours de la semaine
 * précédents. La prévision de clôture est ce qui est vendu plus ce qui reste prévu.
 */
export function ventesParHeure(
  ventes: readonly VenteDatee[],
  historique: ReadonlyArray<readonly VenteDatee[]>,
  maintenant: Date,
): c.SalleDeControle["ventesParHeure"] {
  const heureActuelle = heureLocale(maintenant);
  const reel = new Array<number>(24).fill(0);
  for (const v of ventes) reel[heureLocale(v.at)]! += v.montant;
  const moyenne = new Array<number>(24).fill(0);
  if (historique.length > 0) {
    for (const jour of historique) for (const v of jour) moyenne[heureLocale(v.at)]! += v.montant;
    for (let h = 0; h < 24; h++) moyenne[h] = Math.round(moyenne[h]! / historique.length);
  }
  const heuresVendues = ventes.map((v) => heureLocale(v.at));
  const premiere = Math.min(PREMIERE_HEURE, ...heuresVendues);
  const derniere = Math.max(DERNIERE_HEURE, ...heuresVendues);

  const heures: c.SalleDeControle["ventesParHeure"]["heures"] = [];
  for (let h = premiere; h <= derniere; h++) {
    const prevu = h >= heureActuelle;
    heures.push({ heure: h, montant: prevu ? moyenne[h]! : reel[h]!, prevu });
  }
  const previsionCloture = heures.reduce((somme, b) => somme + b.montant, 0);
  return { heures, previsionCloture, lecture: lectureVentes(heures, previsionCloture) };
}

/** « Le pic de 06 h à 08 h fait 42 % de la journée. Prévision de clôture : 4,4 M. » */
export function lectureVentes(
  heures: ReadonlyArray<{ heure: number; montant: number }>,
  previsionCloture: number,
): string {
  if (previsionCloture <= 0) return "Pas encore de vente aujourd'hui.";
  let meilleure = { debut: heures[0]?.heure ?? 0, somme: -1 };
  for (let i = 0; i < heures.length; i++) {
    const somme = heures.slice(i, i + 3).reduce((a, b) => a + b.montant, 0);
    if (somme > meilleure.somme) meilleure = { debut: heures[i]!.heure, somme };
  }
  const fin = Math.min(meilleure.debut + 2, heures[heures.length - 1]?.heure ?? meilleure.debut);
  const pct = Math.round((meilleure.somme * 100) / previsionCloture);
  const h2 = (h: number): string => String(h).padStart(2, "0");
  return (
    `Le pic de ${h2(meilleure.debut)} h à ${h2(fin)} h fait ${pct} % de la journée. ` +
    `Prévision de clôture : ${montantCourt(previsionCloture)}.`
  );
}

/* ------------------------------------------------------------------ divers */

/** Le jour de la semaine en toutes lettres, pour « vs mardi dernier ». */
export function jourDeSemaine(jour: string): string {
  const noms = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const d = new Date(`${jour}T12:00:00.000+01:00`);
  return noms[d.getUTCDay()] ?? "";
}

/** Part d'un total en pourcentage à une décimale. */
export const partPct = (part: number, total: number): number =>
  total > 0 ? arrondir1((part * 100) / total) : 0;

export const PERIODE_FICHE_JOURS = 90;

/* ------------------------------------------------------------------ appareils */

/** Un téléphone de guichet qui s'est annoncé depuis moins de ce délai est « synchronisé ». */
export const SYNCHRO_RECENTE_MINUTES = 15;

/** Le résumé des téléphones d'une gare à partir de leur dernière synchronisation. */
export function resumerAppareils(
  appareils: ReadonlyArray<{ rang: number; derniereSyncA: Date | null }>,
  maintenant: Date,
): {
  total: number;
  synchronises: number;
  derniereSyncA: Date | null;
  parRang: Array<{ rang: number; derniereSyncA: Date | null }>;
} {
  const limite = maintenant.getTime() - SYNCHRO_RECENTE_MINUTES * MS_PAR_MINUTE;
  const dates = appareils.flatMap((a) => (a.derniereSyncA ? [a.derniereSyncA.getTime()] : []));
  return {
    total: appareils.length,
    synchronises: appareils.filter((a) => a.derniereSyncA && a.derniereSyncA.getTime() >= limite)
      .length,
    derniereSyncA: dates.length === 0 ? null : new Date(Math.max(...dates)),
    parRang: appareils.map((a) => ({ rang: a.rang, derniereSyncA: a.derniereSyncA })),
  };
}

/* ------------------------------------------------------------------ règles par défaut */

/**
 * Les règles d'une compagnie qui n'a rien réglé. Provisoire (à confirmer) : annulation gratuite jusqu'à
 * 1 h avant le départ puis retenue de 25 % (classique) ou 50 % (VIP), comme `REGLES_PAR_DEFAUT` de la
 * billetterie ; tolérance de caisse de la caisse (1 000 F) ; le dépassement demande le PIN du superviseur
 * puis celui du patron ; numéro non obligatoire en cadence ; frais de service du voyageur en ligne (250 F),
 * à sa charge.
 */
export const REGLES_PAR_DEFAUT: ReglesLues = {
  annulation: {
    gratuiteJusqua: "1h_avant",
    retenue: "selon_classe",
    retenueParClassePct: { classique: 25, vip: 50 },
  },
  caisse: { toleranceEcart: TOLERANCE_ECART_DEFAUT, auDela: "pin_superviseur_et_patron" },
  cadence: { numeroObligatoire: false },
  fraisService: { montant: FRAIS_VOYAGEUR_EN_LIGNE, priseEnChargeParAgence: false },
};
