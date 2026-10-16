import { createContext, useContext, type ReactNode } from "react";
import { CLES, ecrire, lire, retirer } from "./stockage";

/**
 * Mode démo : sélecteur de rôle, garde de rôle relâchée, pages /dev/*, flag conception, horloge et scénario
 * pilotables par l'URL. Actif en développement et sur les environnements « dev » ; coupé en production.
 * `VITE_MODE_DEMO=1|0` force le choix, sinon `VITE_APP_ENV` (« dev » par défaut) décide.
 */
export function modeDemoActif(
  env: { VITE_MODE_DEMO?: string; VITE_APP_ENV?: string } = import.meta.env,
): boolean {
  if (env.VITE_MODE_DEMO !== undefined && env.VITE_MODE_DEMO !== "") {
    return env.VITE_MODE_DEMO === "1" || env.VITE_MODE_DEMO === "true";
  }
  const appEnv = (env.VITE_APP_ENV ?? "dev").toLowerCase();
  return appEnv !== "production" && appEnv !== "prod";
}

/** Paramètres d'URL de la démonstration (noms fixés par tools/fidelite/config.json). */
export interface ParametresDemo {
  demo: boolean;
  /** Badge « TOUCHE n » affiché. */
  conception: boolean;
  /** Date ISO à laquelle l'horloge est figée, si `?horloge=` est donné. */
  horloge: string | null;
  /** Scénario de démonstration (`fixtures/ecrans/<scénario>.ts`, AM-011). */
  scenario: string | null;
  /** Modules masqués (mock avant AM-126) : `?modules-masques=colis,covoit`. */
  modulesMasques: string[];
}

/**
 * Lit les paramètres au démarrage. `?conception=1` active le badge et s'en souvient (localStorage) ;
 * `?conception=0` l'éteint. Hors mode démo, tout est ignoré : un voyageur ne voit jamais « TOUCHE n ».
 */
export function lireParametresDemo(
  recherche: string,
  demo: boolean = modeDemoActif(),
): ParametresDemo {
  if (!demo) {
    return { demo, conception: false, horloge: null, scenario: null, modulesMasques: [] };
  }
  const params = new URLSearchParams(recherche);
  const drapeau = params.get("conception");
  if (drapeau === "1") ecrire(CLES.conception, "1");
  if (drapeau === "0") retirer(CLES.conception);
  const conception = drapeau === "1" || (drapeau !== "0" && lire(CLES.conception) === "1");
  const masques = params.get("modules-masques") ?? "";
  return {
    demo,
    conception,
    horloge: params.get("horloge") || null,
    scenario: params.get("scenario") || null,
    modulesMasques: masques
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  };
}

const PARAMETRES_PAR_DEFAUT: ParametresDemo = {
  demo: false,
  conception: false,
  horloge: null,
  scenario: null,
  modulesMasques: [],
};

const ParametresContexte = createContext<ParametresDemo>(PARAMETRES_PAR_DEFAUT);

export function ParametresProvider({
  valeur,
  children,
}: {
  valeur: ParametresDemo;
  children: ReactNode;
}) {
  return <ParametresContexte.Provider value={valeur}>{children}</ParametresContexte.Provider>;
}

export function useParametres(): ParametresDemo {
  return useContext(ParametresContexte);
}

/** Vrai en mode démo. */
export function useModeDemo(): boolean {
  return useParametres().demo;
}

/** Scénario de démonstration demandé par l'URL (`?scenario=Main`), pour les écrans et AM-011. */
export function useScenario(): string | null {
  return useParametres().scenario;
}
