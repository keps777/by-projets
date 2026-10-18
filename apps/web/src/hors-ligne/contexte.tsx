import { useQueryClient } from "@tanstack/react-query";
import type { EtatSync, MoteurSync } from "@afrimove/sync";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

const ContexteMoteur = createContext<MoteurSync | null>(null);

interface Props {
  moteur: MoteurSync;
  children?: ReactNode;
}

/**
 * Le moteur hors ligne de l'appareil, pour les écrans qui montrent son état (pastille SYNC / HORS LIGNE). À placer
 * sous `<FournisseurApi>` : quand le serveur a reçu des ventes mises en file (la file se vide), les lectures de
 * l'agence sont rechargées pour que la caisse, l'accueil et la cadence montrent ce que le serveur a maintenant.
 */
export function FournisseurHorsLigne({ moteur, children }: Props) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let avant = moteur.instantane();
    return moteur.abonner(() => {
      const maintenant = moteur.instantane();
      if (avant && maintenant && maintenant.evenementsEnAttente < avant.evenementsEnAttente) {
        void queryClient.invalidateQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith("agence."),
        });
      }
      avant = maintenant;
    });
  }, [moteur, queryClient]);
  return <ContexteMoteur.Provider value={moteur}>{children}</ContexteMoteur.Provider>;
}

/** Le moteur de l'appareil ; `null` avec le mock, ou si aucun appareil n'est installé. */
export function useMoteurHorsLigne(): MoteurSync | null {
  return useContext(ContexteMoteur);
}

const jamais = (): (() => void) => () => undefined;

/** L'état réel du moteur (en ligne, événements en attente…) ; `null` sans moteur. Se met à jour tout seul. */
export function useEtatMoteur(): EtatSync | null {
  const moteur = useContext(ContexteMoteur);
  return useSyncExternalStore(
    moteur ? (rappel) => moteur.abonner(rappel) : jamais,
    () => moteur?.instantane() ?? null,
    () => null,
  );
}
