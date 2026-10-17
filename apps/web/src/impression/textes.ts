import type { EtatLiaison } from "@afrimove/impression";

/**
 * Textes de l'indicateur d'imprimante. « imprimante OK » est celui de l'en-tête des aperçus de la maquette
 * (GuichetColis, Vente) ; les autres états reprennent le vocabulaire du contrat d'API (absente, hors service).
 */
export const LIBELLE_ETAT: Record<EtatLiaison, string> = {
  ok: "imprimante OK",
  deconnectee: "imprimante absente",
  non_appairee: "aucune imprimante",
  connexion: "connexion à l'imprimante",
  erreur: "imprimante en erreur",
  indisponible: "impression indisponible",
};

export const TEXTES = {
  appairer: "Appairer l'imprimante",
  reessayer: "Relancer l'impression",
  /** Safari iOS n'a pas Web Bluetooth ; les guichets tournent sur Android (AM-075). */
  indisponible:
    "Ce navigateur ne peut pas imprimer en Bluetooth. Ouvrez AfriMove dans Chrome sur Android.",
  enAttente: (n: number) => (n === 1 ? "1 en attente" : `${n} en attente`),
  relanceAuto: "relance automatique",
};
