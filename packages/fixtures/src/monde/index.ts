import type { Entites } from "../validation";
import {
  BILLET_AICHA,
  COLIS_MAMAN,
  DEPART_ALPHA_0830,
  DEPART_ALPHA_BAF_0815,
  DEPART_BETA_0800,
  DEPART_OMEGA_0930,
  PLAN_BETA_0800,
  SESSION_JOSEPH,
} from "./documents";
import { APPAREIL_GU2_DLA, APPAREIL_GU3_DLA, MODULES, PERSONNES } from "./personnes";
import { BUS, COMPAGNIES, GARES, GUICHETS, LIGNES } from "./reseau";

export * from "./construire";
export * from "./documents";
export * from "./personnes";
export * from "./reseau";

/** Tout le monde commun, tel que le valide `problemes(MONDE)` et que le consomme le client mock. */
export const MONDE = {
  compagnies: COMPAGNIES,
  gares: GARES,
  guichets: GUICHETS,
  lignes: LIGNES,
  bus: BUS,
  departs: [DEPART_BETA_0800, DEPART_ALPHA_0830, DEPART_OMEGA_0930, DEPART_ALPHA_BAF_0815],
  billets: [BILLET_AICHA],
  colis: [COLIS_MAMAN],
  sessions: [SESSION_JOSEPH],
  plans: { [DEPART_BETA_0800.id]: PLAN_BETA_0800 },
  personnes: PERSONNES,
  appareils: [APPAREIL_GU2_DLA, APPAREIL_GU3_DLA],
  modules: MODULES,
} as const satisfies Entites;
