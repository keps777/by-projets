/**
 * Les 12 modules de la planche « Modules ». Fichier sans dépendance : il sert au client, au mock et
 * aux tests de parité de l'API.
 *
 * Deux écritures coexistent :
 * - le **code** de l'API et des contrats patron (`quai_bus`, `livraison_moto`…), celui que lit le
 *   moteur des modules ;
 * - l'**identifiant** de la coquille web (`quai`, `livraison`, `covoit`…), celui de
 *   `apps/web/src/coquille/modules.tsx` (`ModuleId`).
 * `codeDuModule` accepte les deux.
 */

export interface ModuleCatalogue {
  readonly code: string;
  readonly idWeb: string;
  readonly nom: string;
  /** Le socle ne s'éteint jamais, à aucune portée. */
  readonly socle: boolean;
  /** État d'une agence qui n'a encore rien réglé. */
  readonly actifParDefaut: boolean;
}

export const CATALOGUE_MODULES = [
  {
    code: "guichet_caisse",
    idWeb: "guichet",
    nom: "Guichet et caisse",
    socle: true,
    actifParDefaut: true,
  },
  { code: "colis", idWeb: "colis", nom: "Colis", socle: false, actifParDefaut: true },
  {
    code: "quai_bus",
    idWeb: "quai",
    nom: "Quai, convoyeur, chauffeur",
    socle: false,
    actifParDefaut: true,
  },
  {
    code: "supervision",
    idWeb: "supervision",
    nom: "Supervision, rapport, assistant",
    socle: false,
    actifParDefaut: true,
  },
  {
    code: "voyageur",
    idWeb: "voyageur",
    nom: "Voyageur · app, web, WhatsApp",
    socle: false,
    actifParDefaut: true,
  },
  { code: "ussd", idWeb: "ussd", nom: "USSD *123#", socle: false, actifParDefaut: true },
  { code: "relais", idWeb: "relais", nom: "Points relais", socle: false, actifParDefaut: true },
  {
    code: "livraison_moto",
    idWeb: "livraison",
    nom: "Livraison moto",
    socle: false,
    actifParDefaut: true,
  },
  {
    code: "inter_agences",
    idWeb: "inter-agences",
    nom: "Inter-agences et réseau",
    socle: false,
    actifParDefaut: true,
  },
  {
    code: "covoit_vendeurs",
    idWeb: "covoit",
    nom: "Covoiturage et vendeurs ambulants",
    socle: false,
    actifParDefaut: false,
  },
  {
    code: "financement",
    idWeb: "financement",
    nom: "Financement et crédit",
    socle: false,
    actifParDefaut: false,
  },
  {
    code: "fidelite",
    idWeb: "fidelite",
    nom: "Fidélité et parrainage",
    socle: false,
    actifParDefaut: true,
  },
] as const satisfies readonly ModuleCatalogue[];

export type CodeModule = (typeof CATALOGUE_MODULES)[number]["code"];
export type IdModuleWeb = (typeof CATALOGUE_MODULES)[number]["idWeb"];

export const CODES_MODULES: readonly CodeModule[] = CATALOGUE_MODULES.map((m) => m.code);

/** Le code API d'un module, depuis son code ou son identifiant web ; `undefined` s'il est inconnu. */
export function codeDuModule(idOuCode: string): CodeModule | undefined {
  return CATALOGUE_MODULES.find((m) => m.code === idOuCode || m.idWeb === idOuCode)?.code;
}

/** L'identifiant web d'un module (`ModuleId` de la coquille). */
export function idWebDuModule(code: CodeModule): IdModuleWeb {
  const module = CATALOGUE_MODULES.find((m) => m.code === code);
  if (!module) throw new Error(`Module inconnu : ${code}`);
  return module.idWeb;
}

export function moduleDuCatalogue(idOuCode: string): ModuleCatalogue | undefined {
  return CATALOGUE_MODULES.find((m) => m.code === idOuCode || m.idWeb === idOuCode);
}
