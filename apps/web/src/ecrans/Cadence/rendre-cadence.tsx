import {
  ErreurHttp,
  agence,
  creerClientMock,
  horlogeGelee,
  patron,
  type ClientMock,
  type ImplementationMock,
} from "@afrimove/api-client";
import type { DataRouter } from "react-router";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { rendreApp } from "@/test/rendre";

/** Outils des tests des écrans Cadence et CadenceBillet (pas un test : le nom ne suit pas `*.test.tsx`). */

/** L'instant des planches : 05:14 (Cadence) ; CadenceBillet est à 05:14:52. */
export const HORLOGE_CADENCE = "2027-01-05T05:14:00+01:00";
export const HORLOGE_BILLET = "2027-01-05T05:14:52+01:00";

/** Identifiant du billet 0232 de la planche CadenceBillet (billet-<numéro en minuscules>). */
export const BILLET_0232 = "billet-alp-dla-270105-0232";

export type Panne =
  | "etat-vide"
  | "etat-erreur"
  | "billet-vide"
  | "billet-erreur"
  | "vente"
  | "telephone"
  | "annulation"
  | "impression"
  | "imprimante-hors-service";

export interface Ecriture {
  type: string;
  donnees: Record<string, unknown>;
  numeroPlage: number | null;
}

export interface OptionsRenduCadence {
  scenario?: "Cadence" | "CadenceBillet";
  url?: string;
  horloge?: string;
  panne?: Panne;
  /** Réglage « numéro obligatoire en cadence » du patron. */
  numeroObligatoire?: boolean;
  conception?: boolean;
  latenceMs?: number;
}

function remplacer(
  operations: readonly ImplementationMock[],
  cible: unknown,
  fabrique: (origine: ImplementationMock) => (params: never, ctx: never) => unknown,
): ImplementationMock[] {
  return operations.map((implementation) =>
    implementation.operation === cible
      ? ({
          operation: implementation.operation,
          repondre: fabrique(implementation),
        } as ImplementationMock)
      : implementation,
  );
}

const lever = (erreur: ErreurHttp) => () => {
  throw erreur;
};
const introuvable = new ErreurHttp(404, "Introuvable", "INTROUVABLE");
const panneServeur = new ErreurHttp(500, "Panne simulée", "PANNE");

/**
 * Monte l'application sur `url` avec le mock du scénario, des pannes ou un réglage injectés, et note chaque
 * écriture (événement) reçue par le serveur simulé.
 */
export function rendreCadence(options: OptionsRenduCadence = {}): {
  routeur: DataRouter;
  client: ClientMock;
  ecritures: Ecriture[];
  /** Résolue quand le serveur simulé a répondu au réglage « numéro obligatoire en cadence ». */
  reglesLues: Promise<void>;
} {
  const {
    scenario = "Cadence",
    url = scenario === "Cadence"
      ? "/guichet/cadence"
      : `/guichet/cadence/vendu?billet=${BILLET_0232}`,
    horloge = scenario === "Cadence" ? HORLOGE_CADENCE : HORLOGE_BILLET,
    panne,
    numeroObligatoire = false,
    conception = false,
    latenceMs = 0,
  } = options;
  const ecritures: Ecriture[] = [];
  let reglesRepondues: () => void = () => {};
  const reglesLues = new Promise<void>((resolve) => {
    reglesRepondues = resolve;
  });
  const base = sourceScenariosFixtures();
  const ecrituresSuivies: readonly unknown[] = Object.values(agence.ECRITURES).map(
    (e) => e.operation,
  );

  const client = creerClientMock({
    source: {
      ...base,
      async charger(nom) {
        const brut = await base.charger(nom);
        let operations: ImplementationMock[] = [...brut.operations];
        operations = remplacer(operations, patron.OP_REGLES, (origine) => async (params, ctx) => {
          // `repondre` rend une promesse : la source de scénarios replie les implémentations sur 404.
          const regles = (await origine.repondre(params, ctx)) as {
            cadence: { numeroObligatoire: boolean };
          };
          reglesRepondues();
          return { ...regles, cadence: { numeroObligatoire } };
        });
        operations = operations.map((implementation) =>
          ecrituresSuivies.includes(implementation.operation)
            ? ({
                operation: implementation.operation,
                repondre: (params: never, ctx: never) => {
                  const evenement = params as unknown as Ecriture;
                  ecritures.push({
                    type: evenement.type,
                    donnees: evenement.donnees,
                    numeroPlage: evenement.numeroPlage,
                  });
                  return implementation.repondre(params, ctx);
                },
              } as ImplementationMock)
            : implementation,
        );
        const pannes: Partial<Record<Panne, [unknown, () => unknown]>> = {
          "etat-vide": [agence.OP_CADENCE_ETAT, lever(introuvable)],
          "etat-erreur": [agence.OP_CADENCE_ETAT, lever(panneServeur)],
          "billet-vide": [agence.OP_CADENCE_BILLET, lever(introuvable)],
          "billet-erreur": [agence.OP_CADENCE_BILLET, lever(panneServeur)],
          vente: [agence.ECRITURES.billetVenduCadence.operation, lever(panneServeur)],
          telephone: [agence.ECRITURES.billetTelephoneAjoute.operation, lever(panneServeur)],
          annulation: [agence.ECRITURES.annulationDemandee.operation, lever(panneServeur)],
          impression: [agence.ECRITURES.impressionDemandee.operation, lever(panneServeur)],
          "imprimante-hors-service": [
            agence.OP_IMPRESSION_ETAT,
            () => ({ imprimante: { etat: "hors_service", nom: null } }),
          ],
        };
        const choisie = panne ? pannes[panne] : undefined;
        if (choisie) operations = remplacer(operations, choisie[0], () => choisie[1] as never);
        if (panne === "imprimante-hors-service") {
          operations = remplacer(
            operations,
            agence.ECRITURES.impressionDemandee.operation,
            () => () => ({ statut: "en_attente_imprimante" }),
          );
        }
        return { ...brut, operations };
      },
    },
    scenario,
    latenceMs,
    horloge: horlogeGelee(horloge),
  });

  const { routeur } = rendreApp({
    clientApi: client,
    scenario,
    url,
    conception,
    horloge: { maintenant: () => new Date(horloge) },
  });
  return { routeur, client, ecritures, reglesLues };
}
