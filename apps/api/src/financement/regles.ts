import type { PiecesAgence, ReleveMomo, VentesCertifiees } from "./modele";
import { moisDouala, moisPrecedent, type Instant } from "./temps";

/**
 * Règles du financement : fonctions pures, sans accès à la base ni à l'horloge.
 *
 * Les seuils ci-dessous ne viennent pas de la maquette (qui ne montre que des exemples) : ce sont des
 * valeurs de départ à confirmer avec le partenaire financier (voir « Décisions à confirmer » du README).
 */

/** Part des ventes MoMo prélevée pour rembourser, en % (la maquette : « 8 % des ventes MoMo »). */
export const POURCENTAGE_REMBOURSEMENT = 8;
/** Longueur de l'historique de ventes qui fait le dossier. */
export const JOURS_HISTORIQUE = 90;
/** Le plafond vaut ce nombre de jours de ventes moyens (la maquette : « = 10 jours de ventes »). */
export const JOURS_DE_VENTES_PLAFOND = 10;
/** Les montants proposés et plafonnés sont arrondis à cette tranche, en FCFA. */
export const PAS_MONTANT = 100_000;
/** Plus petite avance demandable. */
export const MONTANT_MINIMUM = 100_000;
/** Part minimale des opérations MoMo rapprochées d'une vente pour que le dossier soit présentable. */
export const CORRESPONDANCE_MINIMUM_PCT = 95;
/** Délai de réponse promis par le partenaire (la maquette : « versé sur ton compte en 24 h »). */
export const REPONSE_SOUS_HEURES = 24;
/** Mois de relevés MoMo joints au dossier. */
export const MOIS_DE_RELEVES = 3;
/** Prix du billet VIP de l'exemple du paiement en 2 fois, quand l'agence n'en donne pas. */
export const PRIX_BILLET_EXEMPLE = 7500;
/** La première part du paiement en 2 fois est arrondie à cette tranche, en FCFA. */
export const PAS_DEUX_FOIS = 500;
/** Jour de versement des salaires quand l'agence n'a rien réglé. */
export const JOUR_DE_PAIE_PAR_DEFAUT = "vendredi";

/* ------------------------------------------------------------------ éligibilité */

export type RaisonNonEligible =
  | "convention_non_signee"
  | "historique_insuffisant"
  | "pas_de_ventes_momo"
  | "rapprochement_insuffisant"
  | "pieces_invalides"
  | "plafond_insuffisant";

export interface EntreeEligibilite {
  conventionSignee: boolean;
  ventes: VentesCertifiees;
  releve: ReleveMomo;
  pieces: PiecesAgence;
}

/** Les raisons pour lesquelles l'agence ne peut pas demander d'avance ; vide : elle le peut. */
export function raisonsNonEligible(e: EntreeEligibilite): RaisonNonEligible[] {
  const raisons: RaisonNonEligible[] = [];
  if (!e.conventionSignee) raisons.push("convention_non_signee");
  if (e.ventes.joursCouverts < JOURS_HISTORIQUE) raisons.push("historique_insuffisant");
  if (e.ventes.ventesMomo <= 0) raisons.push("pas_de_ventes_momo");
  if (e.releve.correspondancePct < CORRESPONDANCE_MINIMUM_PCT) {
    raisons.push("rapprochement_insuffisant");
  }
  if (!e.pieces.registreEtCarteValides) raisons.push("pieces_invalides");
  if (plafondAvance(e.ventes) < MONTANT_MINIMUM) raisons.push("plafond_insuffisant");
  return raisons;
}

/* ------------------------------------------------------------------ montants */

/** Plafond : `JOURS_DE_VENTES_PLAFOND` jours de ventes moyens, arrondis à la tranche inférieure. */
export function plafondAvance(ventes: VentesCertifiees): number {
  const brut = (ventes.total * JOURS_DE_VENTES_PLAFOND) / JOURS_HISTORIQUE;
  return Math.max(0, Math.floor(brut / PAS_MONTANT) * PAS_MONTANT);
}

/** Montant proposé d'office : la moitié du plafond, arrondie à la tranche inférieure. */
export function montantPropose(plafond: number): number {
  return Math.floor(plafond / 2 / PAS_MONTANT) * PAS_MONTANT;
}

/**
 * Durée estimée de remboursement, en semaines entières (au moins une) : le montant divisé par ce que
 * `pourcentage` % des ventes MoMo rapportent en moyenne chaque semaine.
 */
export function dureeEstimeeSemaines(
  montant: number,
  pourcentage: number,
  ventesMomo: number,
): number {
  const parSemaine = (ventesMomo / JOURS_HISTORIQUE) * 7 * (pourcentage / 100);
  if (!(parSemaine > 0) || montant <= 0) return 1;
  return Math.max(1, Math.ceil(montant / parSemaine));
}

/** Total à rembourser : le montant versé plus le coût fixé par le partenaire (en %). */
export function totalARembourser(montant: number, coutTotalPct: number): number {
  return montant + Math.round((montant * coutTotalPct) / 100);
}

/** Part d'une vente MoMo prélevée pour rembourser (jamais d'arrondi au-dessus). */
export function partDeLaVente(montantVente: number, pourcentage: number): number {
  return Math.floor((montantVente * pourcentage) / 100);
}

/* ------------------------------------------------------------------ paiement en 2 fois */

export interface DeuxFois {
  /** À la réservation : le siège est bloqué. */
  reservation: number;
  /** La veille du départ : le billet part au 2e paiement. */
  veille: number;
}

/**
 * Coupe un billet en deux paiements : la réservation vaut la moitié arrondie à 500 F au-dessus, la veille
 * le reste (7 500 donne 4 000 puis 3 500). `null` si le billet est trop petit pour être coupé.
 */
export function decouperEnDeuxFois(prix: number): DeuxFois | null {
  if (!Number.isInteger(prix) || prix <= 0) return null;
  const reservation = Math.ceil(prix / 2 / PAS_DEUX_FOIS) * PAS_DEUX_FOIS;
  const veille = prix - reservation;
  return veille > 0 ? { reservation, veille } : null;
}

/* ------------------------------------------------------------------ paie */

/** Le mois d'une paie est le mois en cours ou le précédent (on paie en fin de mois ou juste après). */
export function moisDePaieAutorise(mois: string, maintenant: Instant): boolean {
  const courant = moisDouala(maintenant);
  return mois === courant || mois === moisPrecedent(courant);
}

/** `AAAA-MM` avec un mois de 01 à 12. */
export function moisValide(mois: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
}

/* ------------------------------------------------------------------ dossier */

/** Le patron peut retirer la demande tant qu'elle n'est pas versée ni refusée. */
export function estRetirable(statut: "envoye" | "en_analyse" | "verse" | "refuse" | "retire") {
  return statut === "envoye" || statut === "en_analyse";
}

/** `AV-2027-0041` */
export function numeroDossier(annee: number, numero: number): string {
  return `AV-${String(annee).padStart(4, "0")}-${String(numero).padStart(4, "0")}`;
}

export const RE_NUMERO_DOSSIER = /^AV-\d{4}-\d{4}$/;
