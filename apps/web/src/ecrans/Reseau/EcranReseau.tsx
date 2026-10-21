import { voyageur } from "@afrimove/api-client";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { VueReseau, type EtatReseau } from "./vue";

/** L'aperçu se rafraîchit seul toutes les 30 secondes : l'heure de la pastille, les départs, les prix. */
export const RAFRAICHISSEMENT_MS = 30_000;

/**
 * Écran Reseau (AM-036, planche Reseau.dc.html) : le réseau en direct, toutes les compagnies.
 *
 * Données : `useReseau` (résumé, filtres, villes, lignes). Le filtre touché est envoyé au serveur ; en attendant
 * la réponse, l'écran garde l'aperçu précédent. Chaque ligne de bus cherche l'identifiant de son prochain départ
 * (voir `ligne.tsx`).
 */
export function EcranReseau() {
  const [filtre, setFiltre] = useState<string | undefined>(undefined);
  const requete = voyageur.useReseau(filtre !== undefined ? { filtre } : {}, {
    refetchInterval: RAFRAICHISSEMENT_MS,
    placeholderData: keepPreviousData,
  });
  const apercu = requete.data;

  let etat: EtatReseau;
  if (apercu) etat = apercu.lignes.length === 0 ? "vide" : "pret";
  else if (requete.isError) etat = "erreur";
  else etat = "chargement";

  return (
    <VueReseau
      etat={etat}
      apercu={apercu}
      filtreActif={filtre ?? apercu?.filtreActif}
      onFiltre={setFiltre}
      onReessayer={() => void requete.refetch()}
    />
  );
}

export default EcranReseau;
