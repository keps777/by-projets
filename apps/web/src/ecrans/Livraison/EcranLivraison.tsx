import { ErreurHttp, colis as api } from "@afrimove/api-client";
import { useMemo } from "react";
import { useParams } from "react-router";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { appliquerPosition, nomDestinataire } from "./formats";
import { chiffresNationaux } from "./feuilles";
import { LivraisonVue } from "./LivraisonVue";

/** Pas de livraison à suivre : colis inconnu ou pas à cette personne (404, 403), ou pas en livraison moto (409). */
function sansLivraison(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurHttp &&
    (erreur.statut === 404 || erreur.statut === 403 || erreur.statut === 409)
  );
}

/**
 * Planche « Livraison » (16 · Livraison moto en cours). La livraison vient de `useLivraisonColis` ; entre deux
 * lectures, les messages du canal de position (`usePositionLivreur`) mettent à jour les minutes restantes, l'heure
 * d'arrivée et la place du livreur sur la carte. Le colis, s'il se lit, apporte le surnom et le numéro du destinataire.
 */
export function EcranLivraison() {
  const { colisId = "" } = useParams();
  const actif = colisId !== "";
  const requete = api.useLivraisonColis(colisId, { enabled: actif });
  const livraison = requete.data;
  // Le direct ne s'ouvre qu'une fois la livraison lue : un colis sans livraison n'a pas de livreur à suivre.
  const flux = api.usePositionLivreur(colisId, { actif: actif && livraison !== undefined });
  const colis = api.useColis(colisId, { enabled: actif && livraison !== undefined });

  const position = useMemo(
    () => (livraison === undefined ? undefined : appliquerPosition(livraison, flux.dernier)),
    [livraison, flux.dernier],
  );

  if (!actif || sansLivraison(requete.error)) return <EtatVide colisId={colisId} />;
  if (livraison !== undefined && position !== undefined) {
    return (
      <LivraisonVue
        livraison={livraison}
        position={position}
        nomDestinataire={nomDestinataire(livraison, colis.data?.destinataire.surnom)}
        telephoneDestinataire={chiffresNationaux(colis.data?.destinataire.telephone)}
      />
    );
  }
  if (requete.isError) {
    return <EtatErreur colisId={colisId} onReessayer={() => void requete.refetch()} />;
  }
  return <EtatChargement colisId={colisId} />;
}
