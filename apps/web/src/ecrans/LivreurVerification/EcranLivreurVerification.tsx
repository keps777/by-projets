import { ErreurHttp, colis as api } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { VerificationVue } from "./verification-vue";

/** Pas de demande de livreur pour ce compte : rien n'a été déposé (404, 403). */
function sansDemande(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « LivreurVerification » (23c · Devenir livreur : vérification et première course). Le suivi de la demande
 * vient de `useSuiviDemandeLivreur` : dossier, frise des vérifications, badge réservé, démo de l'app livreur, récit de la
 * première soirée et particularités.
 */
export function EcranLivreurVerification() {
  const requete = api.useSuiviDemandeLivreur();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    return sansDemande(requete.error) ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <VerificationVue suivi={requete.data} />;
}

export default EcranLivreurVerification;
