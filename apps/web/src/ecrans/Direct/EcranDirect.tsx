import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { DirectVue } from "./DirectVue";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { PERIODE_SUIVI_MS, appliquerPosition } from "./suivi";

/** Le serveur dit que ce billet n'existe pas ou n'est pas à cette personne : il n'y a pas de bus à suivre. */
function billetRefuse(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « Direct » (4 · Mon bus en direct). Le suivi vient de `useSuiviBus`, relu toutes les 30 s ; entre deux
 * lectures, les messages du canal de position (`usePositionBus`) mettent à jour la vitesse, l'heure estimée et le
 * prochain arrêt. Une lecture plus récente remplace ces messages.
 */
export function EcranDirect() {
  const { billetId = "" } = useParams();
  const actif = billetId !== "";
  const requete = voyageur.useSuiviBus(
    { billetId },
    { enabled: actif, refetchInterval: PERIODE_SUIVI_MS },
  );
  const flux = voyageur.usePositionBus({ billetId }, actif);

  // Dernier message de position, avec la lecture du serveur à laquelle il s'ajoute : une lecture plus récente
  // (`dataUpdatedAt` change) le rend caduc.
  const [recu, setRecu] = useState<{ message: c.MessagePositionBus; lecture: number } | undefined>(
    undefined,
  );
  const message = flux.dernier;
  const lecture = requete.dataUpdatedAt;
  useEffect(() => {
    if (message !== undefined) setRecu({ message, lecture });
    // Seul un nouveau message compte : la lecture retenue est celle du moment où il arrive.
  }, [message]);

  const donnees = requete.data;
  const suivi = useMemo(
    () =>
      donnees === undefined
        ? undefined
        : appliquerPosition(
            donnees,
            recu !== undefined &&
              recu.lecture === lecture &&
              recu.message.billetId === donnees.billetId
              ? recu.message
              : undefined,
          ),
    [donnees, recu, lecture],
  );

  if (!actif || billetRefuse(requete.error)) return <EtatVide billetId={billetId} />;
  if (suivi !== undefined) return <DirectVue billetId={billetId} suivi={suivi} />;
  if (requete.isError) {
    return <EtatErreur billetId={billetId} onReessayer={() => void requete.refetch()} />;
  }
  return <EtatChargement billetId={billetId} />;
}
