/**
 * Règles de la caisse, recopiées de `@afrimove/domain` (non compilé : voir le README de l'API).
 * `parite.test.ts` compare chaque valeur et chaque fonction à la source.
 */
import { enMs, minuitSuivantDoualaMs, versIsoDouala, type Instant } from "./temps";

/** Tolérance d'écart de caisse par défaut (FCFA, valeur absolue) : `REGLES_PAR_DEFAUT.toleranceEcart`. */
export const TOLERANCE_ECART_DEFAUT = 1000;
export const ESSAIS_PIN_MAX = 3;
export const BLOCAGE_PIN_MINUTES = 15;
/** Durée de validité d'un PIN provisoire envoyé par SMS. */
export const PIN_PROVISOIRE_MINUTES = 60;
/** Longueur d'un PIN. */
export const LONGUEUR_PIN = 6;

export const COUPURES: readonly number[] = [10_000, 5_000, 2_000, 1_000, 500];

export interface Coupure {
  valeur: number;
  nombre: number;
}

/** Total compté : coupures plus un total de pièces. Lève `RangeError` sur une coupure inconnue. */
export function totalCoupures(coupures: readonly Coupure[], pieces = 0): number {
  if (!Number.isInteger(pieces) || pieces < 0) throw new RangeError(`Pièces invalides : ${pieces}`);
  let total = pieces;
  const vues = new Set<number>();
  for (const { valeur, nombre } of coupures) {
    if (!COUPURES.includes(valeur)) throw new RangeError(`Coupure inconnue : ${valeur}`);
    if (vues.has(valeur)) throw new RangeError(`Coupure répétée : ${valeur}`);
    vues.add(valeur);
    if (!Number.isInteger(nombre) || nombre < 0)
      throw new RangeError(`Nombre invalide : ${nombre}`);
    total += valeur * nombre;
  }
  return total;
}

/** Les cinq coupures dans l'ordre décroissant, avec 0 pour celles qui manquent. */
export function coupuresCompletes(coupures: readonly Coupure[]): Coupure[] {
  return COUPURES.map((valeur) => ({
    valeur,
    nombre: coupures.find((c) => c.valeur === valeur)?.nombre ?? 0,
  }));
}

export interface ParamsCashAttendu {
  fondDeCaisse: number;
  billetsCash: number;
  colisCash: number;
  /** Montant total des annulations validées par PIN (positif, il est retranché). */
  annulationsValidees: number;
}

/** Cash attendu en caisse. Le MoMo n'entre pas dans la caisse. */
export function cashAttendu(p: ParamsCashAttendu): number {
  for (const m of [p.fondDeCaisse, p.billetsCash, p.colisCash, p.annulationsValidees]) {
    if (!Number.isInteger(m) || m < 0) {
      throw new RangeError("Montants de caisse entiers et positifs attendus");
    }
  }
  return p.fondDeCaisse + p.billetsCash + p.colisCash - p.annulationsValidees;
}

export type StatutEcart = "exact" | "dans_tolerance" | "hors_tolerance";

export interface EvaluationEcart {
  /** compté − attendu : négatif = il manque de l'argent. */
  ecart: number;
  statut: StatutEcart;
}

/** L'écart est dans la tolérance quand sa valeur absolue ne la dépasse pas. Au franc près. */
export function evaluerEcart(
  attendu: number,
  compte: number,
  tolerance = TOLERANCE_ECART_DEFAUT,
): EvaluationEcart {
  for (const m of [attendu, compte, tolerance]) {
    if (!Number.isInteger(m)) throw new RangeError(`Montant en FCFA entier attendu : ${m}`);
  }
  if (tolerance < 0) throw new RangeError("Tolérance négative");
  const ecart = compte - attendu;
  if (ecart === 0) return { ecart, statut: "exact" };
  return { ecart, statut: Math.abs(ecart) <= tolerance ? "dans_tolerance" : "hors_tolerance" };
}

/** Une session ouverte un jour doit être clôturée automatiquement à minuit (Africa/Douala). */
export function doitCloturerAuto(ouverteA: Instant, maintenant: Instant): boolean {
  return enMs(maintenant) >= minuitSuivantDoualaMs(ouverteA);
}

/** Instant de la clôture automatique d'une session ouverte à `ouverteA`. */
export function heureClotureAuto(ouverteA: Instant): string {
  return versIsoDouala(minuitSuivantDoualaMs(ouverteA));
}

/* ------------------------------------------------------------------ annulation (`decisionAnnulation`) */

export type EtatBillet =
  | "reserve"
  | "paye"
  | "embarque"
  | "voyage"
  | "annule"
  | "non_presente"
  | "reporte";

export const ETATS_BILLET: readonly EtatBillet[] = [
  "reserve",
  "paye",
  "embarque",
  "voyage",
  "annule",
  "non_presente",
  "reporte",
];

/** États d'où un billet peut être annulé (`MACHINE_BILLET`) : jamais après l'embarquement. */
export const ETATS_ANNULABLES: readonly EtatBillet[] = ["reserve", "paye", "reporte"];
/** États d'où un billet peut être reporté à demain. */
export const ETATS_REPORTABLES: readonly EtatBillet[] = ["paye", "non_presente"];

export const ANNULATION_GRATUITE_MINUTES = 60;
export const RETENUE_APRES_DELAI_PCT = { classique: 25, vip: 50 } as const;

export interface DecisionAnnulation {
  autorise: boolean;
  gratuite: boolean;
  retenue: number;
  remboursement: number;
}

/**
 * Remboursement proposé pour un billet annulé maintenant : gratuit jusqu'à une heure avant le départ,
 * puis une retenue selon la classe, tout est retenu après l'heure du départ.
 */
export function decisionAnnulation(p: {
  etat: EtatBillet;
  prix: number;
  classe: "classique" | "vip";
  heureDepart: Instant;
  maintenant: Instant;
}): DecisionAnnulation {
  if (!ETATS_ANNULABLES.includes(p.etat)) {
    return { autorise: false, gratuite: false, retenue: 0, remboursement: 0 };
  }
  const minutesAvantDepart = Math.round((enMs(p.heureDepart) - enMs(p.maintenant)) / 60_000);
  if (minutesAvantDepart <= 0) {
    return { autorise: true, gratuite: false, retenue: p.prix, remboursement: 0 };
  }
  if (minutesAvantDepart >= ANNULATION_GRATUITE_MINUTES) {
    return { autorise: true, gratuite: true, retenue: 0, remboursement: p.prix };
  }
  const retenue = Math.min(p.prix, Math.ceil((p.prix * RETENUE_APRES_DELAI_PCT[p.classe]) / 100));
  return { autorise: true, gratuite: false, retenue, remboursement: p.prix - retenue };
}
