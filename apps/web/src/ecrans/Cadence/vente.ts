import type { agence as c } from "@afrimove/contrats";

/** Ce que l'écran « Cadence » sait d'une vente qu'il vient de faire : de quoi afficher « Vendu » sans relire le serveur. */
export interface VenteFaite {
  billet: c.BilletImprimable;
  /** De la touche à la fin de l'impression, en millisecondes (« Vendu · 1,8 s »). */
  dureeMs: number;
  paiement: { mode: c.ModePaiementAgence; recu: number; rendu: number };
  placesRestantes: number;
  /** Faux quand l'imprimante n'a pas répondu : le billet reste à imprimer. */
  imprime: boolean;
  /** Numéro saisi pour le SMS (aussi celui du push MoMo), null sinon. */
  telephone: string | null;
  synchro: "faite" | "au_retour_du_reseau";
  /** Le billet suivant : siège et prix. */
  suivant: { siege: number; prix: number };
}

export type ModeCadence = "cash" | "momo";

/**
 * Paiement d'une vente de cadence. En une touche l'agent ne saisit pas de somme reçue : le client paie le prix exact
 * (rendu 0). Pour MoMo la référence de la transaction n'existe pas encore au guichet (null).
 */
export function paiementCadence(mode: ModeCadence, prix: number): c.PaiementAgence {
  return { mode, recu: prix, rendu: 0, reference: null };
}

/** Paramètre d'URL de l'écran « Vendu » : le billet à montrer, relu par son identifiant quand l'état de la vente manque. */
export const PARAM_BILLET = "billet";
