import type { agence } from "@afrimove/contrats";

/** Calculs de la planche « Controleur » : le tour des sièges, les têtes comptées, l'écart avec la liste. */

export type Constat = agence.ConstatSiege;

export interface SiegeConstate {
  numero: number;
  constat: Constat;
}

/**
 * Un toucher sur un siège change son constat : billet scanné -> occupé sans billet -> libre -> billet scanné.
 * C'est ainsi que le contrôleur saisit les têtes : un siège qu'il voit vide passe à « libre », un siège occupé par
 * quelqu'un sans billet passe à « occupé sans billet ».
 */
export function constatSuivant(constat: Constat): Constat {
  if (constat === "scanne") return "sans_billet";
  if (constat === "sans_billet") return "libre";
  return "scanne";
}

/** Le plan du kit écrit « sans-billet » (état d'affichage), le contrat « sans_billet ». */
export type EtatPlan = "scanne" | "sans-billet" | "libre";

export function constatDepuisPlan(etat: EtatPlan): Constat {
  return etat === "sans-billet" ? "sans_billet" : etat;
}

/** Sièges occupés : tous ceux qui ne sont pas libres (billet scanné ou non). */
export function siegesOccupes(sieges: readonly SiegeConstate[]): number {
  return sieges.filter((siege) => siege.constat !== "libre").length;
}

/** Les têtes comptées à l'ouverture du contrôle et les sièges occupés qui allaient avec. */
export interface BaseComptage {
  tetes: number;
  occupes: number;
}

export interface Comptes {
  liste: number;
  tetes: number;
  ecart: number;
}

/**
 * Les trois compteurs de la planche. Les têtes de départ viennent du contrôle (`comptes.tetes`) ; chaque siège
 * que le contrôleur fait passer de libre à occupé (ou l'inverse) ajoute (ou retire) une tête. L'écart est
 * toujours `têtes − liste` : positif = voyageurs sans billet, négatif = billets sans voyageur.
 */
export function calculerComptes(
  base: BaseComptage,
  liste: number,
  sieges: readonly SiegeConstate[],
): Comptes {
  const tetes = Math.max(0, base.tetes + siegesOccupes(sieges) - base.occupes);
  return { liste, tetes, ecart: tetes - liste };
}

/** `+1`, `0`, `−1` (vrai signe moins) : l'écart tel que la planche l'écrit. */
export function ecritEcart(ecart: number): string {
  if (ecart > 0) return `+${ecart}`;
  if (ecart < 0) return `−${Math.abs(ecart)}`;
  return "0";
}

export type TonEcart = "alerte" | "ok" | "manque";

export function tonEcart(ecart: number): TonEcart {
  return ecart > 0 ? "alerte" : ecart < 0 ? "manque" : "ok";
}

/**
 * Le contrat ne dit pas qui est le convoyeur du bus contrôlé : le signalement le désigne par son départ, et le
 * serveur retrouve la personne à bord (point signalé dans le rapport du ticket).
 */
export function convoyeurDuDepart(departId: string): string {
  return `convoyeur-du-depart-${departId}`;
}

/** « Mme Fouda » -> contrôleuse ; sinon contrôleur. Le contrat ne porte pas le genre (point signalé). */
export function estFeminin(nom: string): boolean {
  return /^(mme|mlle|madame|mademoiselle)\b/i.test(nom.trim());
}
