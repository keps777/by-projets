import { CLES, ecrire, lire, retirer } from "@/coquille/stockage";
import type { CommandeAppareil, RapportEffacement } from "./canal";

/** Clé du « repère d'effacement » : ce qui reste sur l'appareil, et le garde verrouillé, après un effacement. */
export const CLE_EFFACE = "afrimove.kiosque.efface";
/** Clé du drapeau « cet appareil est un kiosque ». */
export const CLE_KIOSQUE = "afrimove.kiosque.actif";

/** Valeurs qui survivent à l'effacement : la langue d'affichage et le fait d'être un kiosque. Rien de personnel. */
export const CLES_CONSERVEES = [CLES.langue, CLE_KIOSQUE] as const;

/**
 * Repère laissé sur l'appareil.
 * - `en_cours` : un ordre d'effacement est reçu et l'effacement n'est pas fini (l'application a été fermée
 *   en route) : au prochain démarrage on le termine avant de rendre la main à l'application.
 * - `efface` : l'appareil est effacé et verrouillé jusqu'à sa remise en service par un superviseur.
 */
export interface RepereEffacement {
  phase: "en_cours" | "efface";
  commande: CommandeAppareil;
  /** Rapport de l'effacement, une fois fait. */
  rapport?: RapportEffacement;
  /** Vrai quand le serveur a confirmé avoir reçu l'accusé. */
  acquitte: boolean;
}

export function lireRepere(): RepereEffacement | null {
  const brut = lire(CLE_EFFACE);
  if (brut === null) return null;
  try {
    const valeur = JSON.parse(brut) as Partial<RepereEffacement> | null;
    if (
      valeur &&
      (valeur.phase === "en_cours" || valeur.phase === "efface") &&
      typeof valeur.commande?.id === "string" &&
      typeof valeur.acquitte === "boolean"
    ) {
      return valeur as RepereEffacement;
    }
  } catch {
    // Repère illisible : voir ci-dessous.
  }
  // Un repère abîmé ne doit pas rendre l'appareil à son utilisateur : on le traite comme un appareil
  // effacé et déjà acquitté (rien ne sera renvoyé au serveur sans l'ordre d'origine).
  return {
    phase: "efface",
    commande: {
      id: "inconnu",
      type: "effacer",
      emiseA: new Date(0).toISOString(),
      secretAcquittement: "x",
    },
    acquitte: true,
  };
}

export function ecrireRepere(repere: RepereEffacement): void {
  ecrire(CLE_EFFACE, JSON.stringify(repere));
}

/** Remise en service par un superviseur (futur parcours d'enrôlement) : lève le verrou. */
export function leverVerrouEffacement(): void {
  retirer(CLE_EFFACE);
}

/** Relit les valeurs à conserver avant l'effacement, pour les remettre après. */
export function memoriserConservees(): Record<string, string> {
  const gardees: Record<string, string> = {};
  for (const cle of CLES_CONSERVEES) {
    const valeur = lire(cle);
    if (valeur !== null) gardees[cle] = valeur;
  }
  return gardees;
}

export function restaurerConservees(gardees: Record<string, string>): void {
  for (const [cle, valeur] of Object.entries(gardees)) ecrire(cle, valeur);
}
