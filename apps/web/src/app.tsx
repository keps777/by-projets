import type { ClientApi } from "@afrimove/api-client";
import { ConceptionProvider } from "@afrimove/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType } from "react";
import { I18nextProvider } from "react-i18next";
import { RouterProvider, createBrowserRouter, type DataRouter } from "react-router";
import { FournisseurApiApplication } from "@/api/fournisseur";
import { BandeauMiseAJour } from "@/coquille/bandeau-mise-a-jour";
import { construireRoutes, type SourcesRoutes } from "@/coquille/arbre-routes";
import { HorlogeProvider, creerHorloge, type Horloge } from "@/coquille/horloge";
import { ModulesProvider } from "@/coquille/modules";
import { ParametresProvider, lireParametresDemo, type ParametresDemo } from "@/coquille/parametres";
import { SessionProvider, type Session } from "@/coquille/session";
import { creerI18n, type Langue } from "@/i18n";

type Module = { default: ComponentType };

/**
 * Les routes sont les fichiers de `src/routes/` : `(groupe)/page.tsx` pour une page d'un espace,
 * `layout.tsx` pour le layout d'un dossier. Ajouter un fichier suffit, ce module n'a pas à changer.
 */
export const sourcesRoutes: SourcesRoutes = {
  pages: import.meta.glob<Module>(["./routes/**/*.tsx", "!./routes/**/layout.tsx"]),
  layouts: import.meta.glob<Module>("./routes/**/layout.tsx"),
};

export interface PropsApp {
  /** Horloge injectée (tests, banc). Sinon le paramètre d'URL `?horloge=<date ISO>`, sinon l'heure du système. */
  horloge?: Horloge;
  /** Paramètres de démonstration imposés (tests). Sinon lus dans l'URL au démarrage. */
  parametres?: ParametresDemo;
  /** Session de départ imposée (tests) ; `null` = personne de connecté. Sinon celle du localStorage. */
  session?: Session | null;
  langue?: Langue;
  /** Routeur imposé (tests : routeur en mémoire). Sinon un routeur de navigateur sur les routes de `src/routes/`. */
  routeur?: DataRouter;
  queryClient?: QueryClient;
  /** Client d'API imposé (tests). Sinon mock ou HTTP selon `VITE_API_MODE`. */
  clientApi?: ClientApi;
}

export function App(props: PropsApp) {
  const [parametres] = useState(
    () => props.parametres ?? lireParametresDemo(window.location.search),
  );
  const [horloge] = useState(() => props.horloge ?? creerHorloge(parametres.horloge));
  const [i18n] = useState(() => creerI18n(props.langue));
  const [queryClient] = useState(
    () =>
      props.queryClient ??
      new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const [routeur] = useState(
    () =>
      props.routeur ??
      createBrowserRouter(construireRoutes(sourcesRoutes, parametres.modulesMasques)),
  );

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <ParametresProvider valeur={parametres}>
      <HorlogeProvider horloge={horloge}>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <FournisseurApiApplication {...(props.clientApi ? { client: props.clientApi } : {})}>
              <SessionProvider
                {...(props.session !== undefined ? { initiale: props.session } : {})}
              >
                <ModulesProvider masques={parametres.modulesMasques}>
                  <ConceptionProvider actif={parametres.conception}>
                    <BandeauMiseAJour />
                    <RouterProvider router={routeur} />
                  </ConceptionProvider>
                </ModulesProvider>
              </SessionProvider>
            </FournisseurApiApplication>
          </QueryClientProvider>
        </I18nextProvider>
      </HorlogeProvider>
    </ParametresProvider>
  );
}
