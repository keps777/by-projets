import { ErreurHttp, patron } from "@afrimove/api-client";
import { EditeurRegles } from "./EditeurRegles";
import { EtatRegles } from "./etats";

/**
 * Écran ConfigRegles (AM-124, planche ConfigRegles.dc.html) : modifier les règles de l'agence, de la route
 * `/(patron)/reglages/regles`.
 *
 * Les règles viennent de `useRegles` ; le nombre de gares du badge « 3 GARES » vient de `useGares` : sans lui, la
 * planche perd seulement ce badge et la mention « · 3 gares » du bouton, elle reste utilisable.
 */
export function EcranConfigRegles() {
  const requete = patron.useRegles();
  const gares = patron.useGares();

  if (requete.data) {
    return <EditeurRegles regles={requete.data} gares={gares.data?.gares.length ?? null} />;
  }
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatRegles etat="vide" />
    ) : (
      <EtatRegles etat="erreur" onReessayer={() => void requete.refetch()} />
    );
  }
  return <EtatRegles etat="chargement" />;
}
