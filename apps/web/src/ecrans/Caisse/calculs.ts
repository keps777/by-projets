import { totalComptage, type ComptageCoupures } from "@afrimove/ui";

/** Statut de l'écart : même vocabulaire que le contrat (`SchemaEcartCaisse`). */
export type StatutEcart = "exact" | "dans_tolerance" | "hors_tolerance";

export interface EvaluationEcart {
  /** compté − attendu : négatif = il manque de l'argent. */
  montant: number;
  statut: StatutEcart;
}

/**
 * Écart en direct (même règle que `evaluerEcart` du domaine, qui n'est pas une dépendance de l'application) :
 * exact à zéro, dans la tolérance quand sa valeur absolue ne la dépasse pas, hors tolérance au-delà.
 */
export function evaluerEcart(attendu: number, compte: number, tolerance: number): EvaluationEcart {
  const montant = compte - attendu;
  if (montant === 0) return { montant, statut: "exact" };
  return { montant, statut: Math.abs(montant) <= tolerance ? "dans_tolerance" : "hors_tolerance" };
}

/** « 694500 » -> « 694 500 » ; négatif : « − 1 000 » (signe moins et espace, comme dans la planche). */
export function formaterMontant(montant: number, avecPlus = false): string {
  const signe = montant < 0 ? "− " : avecPlus && montant > 0 ? "+ " : "";
  return signe + String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 2027-01-05T05:02:00.000+01:00 » -> « 05:02 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return iso.slice(11, 16);
}

/** Minuit (Africa/Douala, UTC+1 toute l'année) qui suit l'ouverture de la session, en millisecondes. */
export function minuitSuivant(ouverteA: string): number {
  const [annee = 0, mois = 1, jour = 1] = ouverteA.slice(0, 10).split("-").map(Number);
  return Date.UTC(annee, mois - 1, jour + 1, 0, 0, 0) - 60 * 60 * 1000;
}

/** Vrai quand une session ouverte à `ouverteA` doit être fermée seule (minuit passé). */
export function minuitPasse(ouverteA: string, maintenant: Date): boolean {
  return maintenant.getTime() >= minuitSuivant(ouverteA);
}

export interface CoupureComptee {
  valeur: number;
  nombre: number;
}

export interface DonneesComptage {
  coupures: CoupureComptee[];
  pieces: number;
  total: number;
}

/** Comptage affiché -> données de l'événement `caisse.comptee`. */
export function versDonneesComptage(
  comptage: ComptageCoupures,
  coupures: readonly number[],
): DonneesComptage {
  const total = totalComptage(comptage);
  // Le contrat n'a pas de champ « total tapé » : un total tapé à la main part comme montant des pièces, sans
  // coupures, pour que le total de l'événement reste égal à la somme de ses lignes.
  if (comptage.totalManuel !== null) return { coupures: [], pieces: total, total };
  return {
    coupures: coupures.map((valeur) => ({ valeur, nombre: comptage.quantites[valeur] ?? 0 })),
    pieces: comptage.pieces,
    total,
  };
}

/** Comptage enregistré dans la session -> état du compteur. */
export function depuisSession(
  coupures: readonly CoupureComptee[],
  pieces: number,
): ComptageCoupures {
  return {
    quantites: Object.fromEntries(coupures.map((c) => [c.valeur, c.nombre])),
    pieces,
    totalManuel: null,
  };
}
