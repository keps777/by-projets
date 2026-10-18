import {
  ErreurHttp,
  colis,
  creerClientMock,
  horlogeGelee,
  implementer,
  type ClientMock,
  type FluxMock,
  type ImplementationMock,
  type SourceScenarios,
} from "@afrimove/api-client";
import { render } from "@testing-library/react";
import { createMemoryRouter, type DataRouter } from "react-router";
import { App, sourcesRoutes } from "@/app";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { construireRoutes } from "@/coquille/arbre-routes";
import { horlogeFigee } from "@/coquille/horloge";

/** Outils des tests de l'écran Livraison (pas un test : le nom ne suit pas `*.test.tsx`). */

export const HORLOGE_PLANCHE = "2027-01-05T07:38:00+01:00";
/** Identifiant du colis de Maman dans le monde de démonstration (celui de l'écran ColisCode). */
export const COLIS_ID = "colis-c-dla-270105-0017";

/** Opération d'un scénario, retrouvée par son nom pour être appelée avant une réponse modifiée. */
export type Originale = (nom: string) => ImplementationMock;

export interface OptionsRenduLivraison {
  /**
   * Implémentations qui passent devant celles du scénario « Livraison » (le client prend la première trouvée).
   * `originale(nom)` rend celle du scénario (ou, pour `colis.lire`, celle du scénario « ColisCode »).
   */
  operations?: (originale: Originale) => ImplementationMock[];
  /** Flux qui passent devant ceux du scénario. */
  flux?: () => FluxMock[];
  /** Ajoute la lecture du colis (`colis.lire`) du scénario « ColisCode » : surnom et numéro du destinataire. */
  avecColis?: boolean;
  conception?: boolean;
  latenceMs?: number;
  /** Identifiant du colis dans l'adresse (par défaut celui de Maman). */
  colisId?: string;
}

function sourceModifiee(options: OptionsRenduLivraison): SourceScenarios {
  const base = sourceScenariosFixtures();
  return {
    ...base,
    async charger(nom) {
      const scenario = await base.charger(nom);
      const colisCode = await base.charger("ColisCode");
      const originale: Originale = (nomOperation) => {
        const trouvee = [...scenario.operations, ...colisCode.operations].find(
          (o) => o.operation.nom === nomOperation,
        );
        if (!trouvee) throw new Error(`Opération absente des scénarios : ${nomOperation}`);
        return trouvee;
      };
      // La lecture du colis de la planche ColisCode (celle du scénario « Livraison » ne connaît que les colis créés).
      const lectureColis = colisCode.operations.filter(
        (o) => o.operation.nom === colis.OP_COLIS.nom,
      );
      // Sans `avecColis`, le colis ne se lit pas : la source de scénarios fait répondre toutes les planches, dont
      // ColisCode (qui connaît le colis de Maman), donc l'absence de lecture se dit explicitement par un 404.
      const colisIntrouvable = implementer(colis.OP_COLIS, () => {
        throw new ErreurHttp(404, "colis introuvable", "colis_introuvable");
      });
      return {
        ...scenario,
        operations: [
          ...(options.operations?.(originale) ?? []),
          ...(options.avecColis ? lectureColis : [colisIntrouvable]),
          ...scenario.operations,
        ],
        flux: [...(options.flux?.() ?? []), ...(scenario.flux ?? [])],
      };
    },
  };
}

/** Monte l'application complète sur /colis/<colisId>/livraison, avec le mock du scénario « Livraison ». */
export function rendreLivraison(options: OptionsRenduLivraison = {}): {
  routeur: DataRouter;
  client: ClientMock;
} {
  const { conception = false, latenceMs = 0, colisId = COLIS_ID } = options;
  const client = creerClientMock({
    source: sourceModifiee(options),
    scenario: "Livraison",
    latenceMs,
    horloge: horlogeGelee(HORLOGE_PLANCHE),
  });
  const routeur = createMemoryRouter(construireRoutes(sourcesRoutes, []), {
    initialEntries: [`/colis/${colisId}/livraison`],
  });
  render(
    <App
      routeur={routeur}
      clientApi={client}
      parametres={{
        demo: true,
        conception,
        horloge: null,
        scenario: "Livraison",
        modulesMasques: [],
      }}
      session={null}
      horloge={horlogeFigee(HORLOGE_PLANCHE)}
      langue="fr"
    />,
  );
  return { routeur, client };
}
