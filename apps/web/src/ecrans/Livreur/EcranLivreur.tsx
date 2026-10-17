import { ErreurHttp, colis as api } from "@afrimove/api-client";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { LivreurVue } from "./LivreurVue";

/** Pas d'espace livreur : le compte n'est pas (encore) livreur (404, 403). */
function sansEspace(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « Livreur » (39 · App du livreur moto). L'espace vient de `useEspaceLivreur` ; les missions proposées en
 * direct (`useMissionsEnDirect`) et les écritures (disponibilité, accepter, passer, retirer) sont dans la vue.
 */
export function EcranLivreur() {
  const requete = api.useEspaceLivreur();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    return sansEspace(requete.error) ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <LivreurVue espace={requete.data} recharger={() => void requete.refetch()} />;
}
