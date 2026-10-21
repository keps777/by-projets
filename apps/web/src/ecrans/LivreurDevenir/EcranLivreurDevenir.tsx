import { ErreurHttp, colis } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { LivreurDevenirVue } from "./LivreurDevenirVue";

/** Le programme n'est pas ouvert : le serveur répond « introuvable » ou « interdit ». */
function sansProgramme(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « LivreurDevenir » (23b · Devenir livreur : programme et particularités). Le programme vient de
 * `useProgrammeLivreur` ; « Je m'inscris » dépose la demande (`useDeposerDemandeLivreur`) puis ouvre le suivi
 * (LivreurVerification).
 */
export function EcranLivreurDevenir() {
  const requete = colis.useProgrammeLivreur();
  if (requete.data !== undefined) return <LivreurDevenirVue programme={requete.data} />;
  if (sansProgramme(requete.error)) return <EtatVide />;
  if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
  return <EtatChargement />;
}

export default EcranLivreurDevenir;
