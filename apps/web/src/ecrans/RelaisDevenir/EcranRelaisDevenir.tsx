import { ErreurHttp, colis } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { ProgrammeVue } from "./programme-vue";

/**
 * Écran « Deviens point de relais » (AM-141, planche RelaisDevenir.dc.html) : ce que gagne le commerçant, ce qu'il lui
 * faut et les trois étapes. Le programme vient de `useProgrammeRelais` ; « Je m'inscris » mène à la fiche
 * (RelaisInscription), « Retour » et « Plus tard » à Moi.
 */
export function EcranRelaisDevenir() {
  const requete = colis.useProgrammeRelais();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    // Un programme qui n'existe pas (404) n'est pas une panne : rien à présenter, pas de bouton « Réessayer ».
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <ProgrammeVue programme={requete.data} />;
}

export default EcranRelaisDevenir;
