import { useSyncExternalStore } from "react";

/**
 * État « nouvelle version prête » : le service worker a installé une version et attend. Le bandeau
 * (`BandeauMiseAJour`) lit cet état ; `activer` demande au service worker en attente de prendre la main et
 * recharge la page.
 */
export interface EtatMiseAJour {
  prete: boolean;
  activer: (() => void) | null;
}

let etat: EtatMiseAJour = { prete: false, activer: null };
const abonnes = new Set<() => void>();

function publier(suivant: EtatMiseAJour) {
  etat = suivant;
  abonnes.forEach((abonne) => abonne());
}

export function signalerMiseAJourPrete(activer: () => void): void {
  publier({ prete: true, activer });
}

export function effacerMiseAJour(): void {
  publier({ prete: false, activer: null });
}

export function useMiseAJour(): EtatMiseAJour {
  return useSyncExternalStore(
    (abonne) => {
      abonnes.add(abonne);
      return () => abonnes.delete(abonne);
    },
    () => etat,
    () => etat,
  );
}
