import { agence } from "@afrimove/api-client";
import { AccueilVue, type EtatAccueil } from "./accueil-vue";
import { useEtatPastille } from "./etat-synchro";

/**
 * Écran Guichet (AM-070, planche Guichet.dc.html) : l'accueil de l'agent.
 *
 * Les données viennent de `useGuichetAccueil` seulement. Les lectures de l'agence sont rechargées après chaque
 * écriture (vente, colis, scan : `useEcritureAgence`), donc les compteurs suivent chaque vente ; `networkMode:
 * "always"` les laisse se recharger aussi hors ligne (la lecture est locale, l'envoi attend le réseau, AM-160).
 */
export function EcranGuichet() {
  const requete = agence.useGuichetAccueil({ networkMode: "always", refetchOnMount: "always" });
  const accueil = requete.data;
  const pastille = useEtatPastille(accueil?.synchro.etat);

  let etat: EtatAccueil;
  if (accueil) etat = "pret";
  else if (requete.isError) etat = "erreur";
  else if (requete.isPending) etat = "chargement";
  else etat = "vide";

  return (
    <AccueilVue
      etat={etat}
      accueil={accueil}
      pastille={pastille}
      onReessayer={() => void requete.refetch()}
    />
  );
}

export default EcranGuichet;
