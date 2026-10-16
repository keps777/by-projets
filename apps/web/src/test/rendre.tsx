import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter, type RouteObject } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { construireRoutes } from "@/coquille/arbre-routes";
import type { Horloge } from "@/coquille/horloge";
import type { ParametresDemo } from "@/coquille/parametres";
import type { Session } from "@/coquille/session";
import type { Langue } from "@/i18n";

export interface OptionsRendu {
  /** Adresse de départ. */
  url?: string;
  /** Mode démo (par défaut : vrai, comme en développement). */
  demo?: boolean;
  /** Session de départ ; `null` : personne de connecté. */
  session?: Session | null;
  masques?: string[];
  conception?: boolean;
  scenario?: string;
  horloge?: Horloge;
  langue?: Langue;
  /** Routes de remplacement (tests de la coquille elle-même) ; sinon les vraies routes de `src/routes/`. */
  routes?: RouteObject[];
}

/** Monte l'application complète sur un routeur en mémoire. */
export function rendreApp(options: OptionsRendu = {}): { routeur: DataRouter } {
  const {
    url = "/",
    demo = true,
    session = null,
    masques = [],
    conception = false,
    scenario,
    horloge,
    langue,
    routes,
  } = options;
  const parametres: ParametresDemo = {
    demo,
    conception,
    horloge: null,
    scenario: scenario ?? null,
    modulesMasques: masques,
  };
  const routeur = createMemoryRouter(routes ?? construireRoutes(sourcesRoutes, masques), {
    initialEntries: [url],
  });
  render(
    <App
      routeur={routeur}
      parametres={parametres}
      session={session}
      {...(horloge ? { horloge } : {})}
      {...(langue ? { langue } : {})}
    />,
  );
  return { routeur };
}
