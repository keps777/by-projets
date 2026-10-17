import type { patron } from "@afrimove/contrats";
import { normaliserNumero } from "./formats";

/**
 * Le brouillon des règles : ce que le patron a changé sur l'écran et qui n'est pas encore signé. Rien n'en sort avant
 * le PIN : les guichets et l'app voyageur continuent de lire les règles enregistrées. Fonctions pures, l'écran ne
 * fait que les appeler.
 */

export type Regles = patron.ReglesAgence;
export type Operateur = patron.OperateurMomo;
export type GratuiteAnnulation = Regles["annulation"]["gratuiteJusqua"];
export type RetenueAnnulation = Regles["annulation"]["retenue"];
export type AuDelaTolerance = Regles["caisse"]["auDela"];

export const OPERATEURS: readonly Operateur[] = ["mtn", "orange"];
export const CHOIX_GRATUITE: readonly GratuiteAnnulation[] = [
  "1h_avant",
  "2h_avant",
  "veille_20h",
  "jamais",
];
export const CHOIX_RETENUE: readonly RetenueAnnulation[] = [
  "selon_classe",
  "dix_pct",
  "cinquante_pct",
  "aucun_remboursement",
];
export const CHOIX_AU_DELA: readonly AuDelaTolerance[] = [
  "pin_superviseur_et_patron",
  "pin_superviseur",
  "bloque_guichet",
];

export type ChampRegle = "gratuiteJusqua" | "retenue" | "toleranceEcart" | "auDela";

export interface Brouillon {
  gratuiteJusqua: GratuiteAnnulation;
  retenue: RetenueAnnulation;
  /** Ce qui est tapé dans le champ, lu en FCFA ; `null` si le champ est vide. */
  toleranceEcart: number | null;
  auDela: AuDelaTolerance;
  /** Ce qui est tapé dans chaque champ de compte : le numéro masqué de l'API tant que rien n'a changé. */
  comptes: Record<Operateur, string>;
}

/** Le brouillon de départ : les règles telles que l'API les renvoie. */
export function brouillonDepuis(regles: Regles): Brouillon {
  return {
    gratuiteJusqua: regles.annulation.gratuiteJusqua,
    retenue: regles.annulation.retenue,
    toleranceEcart: regles.caisse.toleranceEcart,
    auDela: regles.caisse.auDela,
    comptes: {
      mtn: regles.comptesMomo.mtn.numeroMasque,
      orange: regles.comptesMomo.orange.numeroMasque,
    },
  };
}

/** Les règles (hors comptes MoMo) que le brouillon a changées. */
export function reglesModifiees(brouillon: Brouillon, base: Regles): ChampRegle[] {
  const champs: ChampRegle[] = [];
  if (brouillon.gratuiteJusqua !== base.annulation.gratuiteJusqua) champs.push("gratuiteJusqua");
  if (brouillon.retenue !== base.annulation.retenue) champs.push("retenue");
  if (brouillon.toleranceEcart !== base.caisse.toleranceEcart) champs.push("toleranceEcart");
  if (brouillon.auDela !== base.caisse.auDela) champs.push("auDela");
  return champs;
}

/** Les comptes MoMo dont le numéro a été retapé : chacun passe par le PIN et le SMS de confirmation. */
export function comptesModifies(brouillon: Brouillon, base: Regles): Operateur[] {
  return OPERATEURS.filter(
    (operateur) => brouillon.comptes[operateur].trim() !== base.comptesMomo[operateur].numeroMasque,
  );
}

export function nombreChangements(brouillon: Brouillon, base: Regles): number {
  return reglesModifiees(brouillon, base).length + comptesModifies(brouillon, base).length;
}

export interface ErreursBrouillon {
  /** La tolérance d'écart est vide. */
  tolerance: boolean;
  /** Les comptes dont le numéro retapé n'est pas un numéro. */
  comptes: Operateur[];
}

export function erreursDuBrouillon(brouillon: Brouillon, base: Regles): ErreursBrouillon {
  return {
    tolerance: brouillon.toleranceEcart === null,
    comptes: comptesModifies(brouillon, base).filter(
      (operateur) => normaliserNumero(brouillon.comptes[operateur]) === null,
    ),
  };
}

export function estEnregistrable(erreurs: ErreursBrouillon): boolean {
  return !erreurs.tolerance && erreurs.comptes.length === 0;
}

/**
 * Le corps de `useEnregistrerRegles` : toutes les règles modifiables d'un coup (l'API remplace l'ensemble), les
 * comptes MoMo en sont exclus (leur commande est plus stricte). Ce que l'écran ne montre pas (retenue par classe,
 * cadence, frais de service) reste tel que l'API l'a renvoyé.
 */
export function versReglesModifiables(
  brouillon: Brouillon,
  base: Regles,
): patron.ReglesModifiables {
  return {
    annulation: {
      gratuiteJusqua: brouillon.gratuiteJusqua,
      retenue: brouillon.retenue,
      retenueParClassePct: base.annulation.retenueParClassePct,
    },
    caisse: {
      toleranceEcart: brouillon.toleranceEcart ?? base.caisse.toleranceEcart,
      auDela: brouillon.auDela,
    },
    cadence: base.cadence,
    fraisService: base.fraisService,
  };
}
