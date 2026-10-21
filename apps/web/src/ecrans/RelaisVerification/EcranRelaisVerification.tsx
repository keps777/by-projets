import { ErreurHttp, colis } from "@afrimove/api-client";
import { useSearchParams } from "react-router";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { RelaisVerificationVue } from "./RelaisVerificationVue";

/** Aucune demande de point relais : le serveur répond « introuvable » (ou « interdit »). */
function sansDemande(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/** Le suivi se remet à jour tout seul : l'agent peut valider une étape pendant que l'écran est ouvert. */
export const RAFRAICHISSEMENT_MS = 30_000;

/**
 * Planche « RelaisVerification » (22d · Devenir point de relais : vérification et activation). Le suivi vient de
 * `useSuiviDemandeRelais` : sans `?dossier=`, la dernière demande du compte.
 */
export function EcranRelaisVerification() {
  const [recherche] = useSearchParams();
  const dossier = recherche.get("dossier") ?? undefined;
  const requete = colis.useSuiviDemandeRelais(dossier, { refetchInterval: RAFRAICHISSEMENT_MS });
  if (requete.data !== undefined) return <RelaisVerificationVue suivi={requete.data} />;
  if (sansDemande(requete.error)) return <EtatVide />;
  if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
  return <EtatChargement />;
}

export default EcranRelaisVerification;
