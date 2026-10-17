import { voyageur } from "@afrimove/api-client";
import { useDemandeMontee } from "./lieu";
import { VueArret, type EtatArret } from "./vue";

/** Les bus qui passent se relisent seuls toutes les 30 secondes : le délai « dans 14 min » et les places bougent. */
export const RAFRAICHISSEMENT_MS = 30_000;

/**
 * Écran Arret (AM-041, planche Arret.dc.html) : « Tu es à Pouma », la ligne avec la position du voyageur et les bus
 * qui passent avec des places.
 *
 * Données : `useOffresMonteeEnRoute`. Le lieu est l'arrêt de l'adresse (`?arretId=`), sinon la position GPS du
 * téléphone ; le serveur attend l'un ou l'autre. Chaque bus mène au siège et au paiement de son départ.
 */
export function EcranArret() {
  const demande = useDemandeMontee();
  const requete = voyageur.useOffresMonteeEnRoute(demande ?? {}, {
    enabled: demande !== undefined,
    refetchInterval: RAFRAICHISSEMENT_MS,
  });
  const offres = requete.data;

  let etat: EtatArret;
  if (offres) etat = offres.bus.length === 0 ? "vide" : "pret";
  else if (requete.isError) etat = "erreur";
  else etat = "chargement";

  return <VueArret etat={etat} offres={offres} onReessayer={() => void requete.refetch()} />;
}

export default EcranArret;
