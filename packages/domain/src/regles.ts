import type { ClasseBillet, Role } from "./entites";
import type { EtatBillet } from "./etats/billet";
import { MACHINE_BILLET } from "./etats/billet";
import type { Fcfa } from "./money";
import { fcfa, pourcentage } from "./money";
import { peutAppliquer } from "./machine";
import type { Instant, IsoDouala } from "./temps";
import {
  ajouterHeures,
  ajouterJours,
  ajouterMinutes,
  ecartMinutes,
  enMs,
  jourDouala,
  minuitSuivantDoualaMs,
  versIsoDouala,
} from "./temps";

/** Règles réglables par compagnie (écran « Règles » du patron). */
export interface ReglesCompagnie {
  /** Annulation gratuite jusqu'à N minutes avant le départ. */
  annulationGratuiteMinutes: number;
  /** Retenue (en %) après ce délai, selon la classe. */
  retenueApresDelaiPct: Readonly<Record<ClasseBillet, number>>;
  /** Tolérance d'écart de caisse (FCFA, en valeur absolue). */
  toleranceEcart: Fcfa;
  /** Un billet vendu en cadence doit-il recevoir son nom au quai ? */
  numeroObligatoireCadence: boolean;
}

/**
 * Valeurs par défaut. La maquette donne « gratuite jusqu'à 1 h avant, puis selon classe » et une
 * tolérance de 1 000 F (la planche de la personne affiche ± 500 : à trancher, voir tickets.md §6).
 * Les pourcentages de retenue sont des valeurs provisoires, à confirmer par le patron.
 */
export const REGLES_PAR_DEFAUT: ReglesCompagnie = {
  annulationGratuiteMinutes: 60,
  retenueApresDelaiPct: { classique: 25, vip: 50 },
  toleranceEcart: 1000,
  numeroObligatoireCadence: true,
};

export const BLOCAGE_SIEGE_MINUTES = 15;
export const GARDE_COLIS_JOURS = 7;
export const LIMITE_HORS_LIGNE_HEURES = 12;
export const DEBLOCAGE_TEMPORAIRE_HEURES = 4;
export const ESSAIS_PIN_MAX = 3;
export const BLOCAGE_PIN_MINUTES = 15;

/* ------------------------------------------------------------------ annulation */

export interface DecisionAnnulation {
  autorise: boolean;
  raison?: "etat_interdit" | "depart_passe";
  /** Vrai si l'annulation intervient dans le délai gratuit. */
  gratuite: boolean;
  retenue: Fcfa;
  remboursement: Fcfa;
}

export interface ParamsAnnulation {
  etat: EtatBillet;
  prix: Fcfa;
  classe: ClasseBillet;
  heureDepart: Instant;
  maintenant: Instant;
  regles?: ReglesCompagnie;
}

/**
 * Que devient un billet que l'on annule maintenant ? Autorisé tant que la machine d'états le permet
 * (jamais après l'embarquement). Gratuit jusqu'à `annulationGratuiteMinutes` avant le départ ;
 * ensuite une retenue selon la classe ; après l'heure du départ, tout est retenu.
 * Le billet annulé garde son numéro : c'est la machine d'états, pas cette fonction, qui le change.
 */
export function decisionAnnulation(p: ParamsAnnulation): DecisionAnnulation {
  const regles = p.regles ?? REGLES_PAR_DEFAUT;
  fcfa(p.prix);
  if (!peutAppliquer(MACHINE_BILLET, p.etat, "annuler")) {
    return {
      autorise: false,
      raison: "etat_interdit",
      gratuite: false,
      retenue: 0,
      remboursement: 0,
    };
  }
  const minutesAvantDepart = ecartMinutes(p.heureDepart, p.maintenant);
  if (minutesAvantDepart <= 0) {
    return {
      autorise: true,
      raison: "depart_passe",
      gratuite: false,
      retenue: p.prix,
      remboursement: 0,
    };
  }
  if (minutesAvantDepart >= regles.annulationGratuiteMinutes) {
    return { autorise: true, gratuite: true, retenue: 0, remboursement: p.prix };
  }
  const retenue = Math.min(
    p.prix,
    pourcentage(p.prix, regles.retenueApresDelaiPct[p.classe], "plafond"),
  );
  return { autorise: true, gratuite: false, retenue, remboursement: p.prix - retenue };
}

/** Limite de l'annulation gratuite, calculée depuis la règle de la compagnie (« gratuit jusqu'à 07:00 »). */
export function limiteAnnulationGratuite(
  heureDepart: Instant,
  regles: ReglesCompagnie = REGLES_PAR_DEFAUT,
): IsoDouala {
  return ajouterMinutes(heureDepart, -regles.annulationGratuiteMinutes);
}

/** Seul un superviseur valide une annulation faite au guichet (PIN superviseur). */
export function peutValiderAnnulation(role: Role): boolean {
  return role === "superviseur";
}

/** AfriMove ne vend jamais : seuls ces rôles émettent des billets. */
export function peutVendre(role: Role): boolean {
  return role === "guichetier" || role === "convoyeur" || role === "vendeur";
}

/* ------------------------------------------------------------------ caisse */

export const COUPURES: readonly number[] = [10_000, 5_000, 2_000, 1_000, 500];

/** Total compté : coupures (valeur → nombre) plus un total de pièces. */
export function totalCoupures(coupures: Readonly<Record<number, number>>, pieces: Fcfa = 0): Fcfa {
  fcfa(pieces);
  let total = pieces;
  for (const [valeur, nombre] of Object.entries(coupures)) {
    const v = Number(valeur);
    if (!COUPURES.includes(v)) throw new RangeError(`Coupure inconnue : ${valeur}`);
    if (!Number.isInteger(nombre) || nombre < 0)
      throw new RangeError(`Nombre invalide : ${nombre}`);
    total += v * nombre;
  }
  return total;
}

export interface ParamsCashAttendu {
  fondDeCaisse: Fcfa;
  billetsCash: Fcfa;
  colisCash: Fcfa;
  /** Montant total des annulations validées par PIN (positif, il est retranché). */
  annulationsValidees: Fcfa;
}

/** Cash attendu en caisse. Le MoMo n'entre pas dans la caisse. */
export function cashAttendu(p: ParamsCashAttendu): Fcfa {
  for (const m of [p.fondDeCaisse, p.billetsCash, p.colisCash, p.annulationsValidees]) {
    fcfa(m);
    if (m < 0) throw new RangeError("Montants de caisse positifs attendus");
  }
  return p.fondDeCaisse + p.billetsCash + p.colisCash - p.annulationsValidees;
}

export type StatutEcart = "exact" | "dans_tolerance" | "hors_tolerance";

export interface EvaluationEcart {
  /** compté − attendu : négatif = il manque de l'argent. */
  ecart: Fcfa;
  statut: StatutEcart;
}

/** L'écart est dans la tolérance quand sa valeur absolue ne la dépasse pas. */
export function evaluerEcart(
  attendu: Fcfa,
  compte: Fcfa,
  tolerance: Fcfa = REGLES_PAR_DEFAUT.toleranceEcart,
): EvaluationEcart {
  fcfa(attendu);
  fcfa(compte);
  fcfa(tolerance);
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
export function heureClotureAuto(ouverteA: Instant): IsoDouala {
  return versIsoDouala(minuitSuivantDoualaMs(ouverteA));
}

export function memeJourDouala(a: Instant, b: Instant): boolean {
  return jourDouala(a) === jourDouala(b);
}

/* ------------------------------------------------------------------ appareils hors ligne */

export interface ParamsAppareil {
  derniereSyncA: Instant;
  maintenant: Instant;
  /** Déblocage accordé par un superviseur avec son PIN. */
  debloqueJusqua?: Instant | undefined;
}

export interface StatutAppareil {
  horsLigneMinutes: number;
  /** Bloqué : plus de 12 h sans synchronisation et pas de déblocage en cours. */
  bloque: boolean;
  /** Instant à partir duquel l'appareil est (ou sera) bloqué sans synchronisation. */
  bloqueDepuis: IsoDouala;
}

/** Un appareil hors ligne depuis plus de 12 h (strictement) est bloqué jusqu'au PIN superviseur. */
export function statutAppareil(p: ParamsAppareil): StatutAppareil {
  const horsLigneMinutes = Math.max(0, ecartMinutes(p.maintenant, p.derniereSyncA));
  const depasse = horsLigneMinutes > LIMITE_HORS_LIGNE_HEURES * 60;
  const debloque = p.debloqueJusqua !== undefined && enMs(p.maintenant) < enMs(p.debloqueJusqua);
  return {
    horsLigneMinutes,
    bloque: depasse && !debloque,
    bloqueDepuis: ajouterHeures(p.derniereSyncA, LIMITE_HORS_LIGNE_HEURES),
  };
}

/** Déblocage de 4 h accordé à `maintenant` par un superviseur. */
export function debloquerTemporairement(maintenant: Instant): IsoDouala {
  return ajouterHeures(maintenant, DEBLOCAGE_TEMPORAIRE_HEURES);
}

/* ------------------------------------------------------------------ colis et sièges */

/** Fin de la garde d'un colis disponible : 7 jours. */
export function limiteRetraitColis(disponibleDepuis: Instant): IsoDouala {
  return ajouterJours(disponibleDepuis, GARDE_COLIS_JOURS);
}

/** Vrai quand le colis n'a pas été retiré dans les 7 jours (« non retiré J+7 »). */
export function colisNonRetire(disponibleDepuis: Instant, maintenant: Instant): boolean {
  return enMs(maintenant) >= enMs(limiteRetraitColis(disponibleDepuis));
}

/** Blocage d'un siège pendant une commande : 15 min. */
export function finBlocageSiege(debut: Instant): IsoDouala {
  return ajouterMinutes(debut, BLOCAGE_SIEGE_MINUTES);
}

/** Après 3 PIN faux, le compte est bloqué 15 min et le patron est alerté. */
export function pinBloque(essaisFaux: number): boolean {
  return essaisFaux >= ESSAIS_PIN_MAX;
}
