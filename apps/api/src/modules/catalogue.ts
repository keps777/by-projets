/**
 * Les 12 modules de la planche « Modules » (`/(patron)/reglages/modules`).
 *
 * Les codes et les noms reprennent `MODULES` de `@afrimove/fixtures` ; `parite.test.ts` compare ce
 * catalogue à celui du client d'API (`packages/api-client/src/modules/catalogue.ts`). L'API ne peut
 * pas importer ces paquets à l'exécution (TypeScript non compilé, API en CommonJS).
 */

export interface ModuleCatalogue {
  code: string;
  nom: string;
  /** Le socle ne s'éteint jamais, à aucune portée. */
  socle: boolean;
  /** État d'une agence qui n'a encore rien réglé. */
  actifParDefaut: boolean;
}

export const CATALOGUE_MODULES: readonly ModuleCatalogue[] = [
  { code: "guichet_caisse", nom: "Guichet et caisse", socle: true, actifParDefaut: true },
  { code: "colis", nom: "Colis", socle: false, actifParDefaut: true },
  { code: "quai_bus", nom: "Quai, convoyeur, chauffeur", socle: false, actifParDefaut: true },
  {
    code: "supervision",
    nom: "Supervision, rapport, assistant",
    socle: false,
    actifParDefaut: true,
  },
  { code: "voyageur", nom: "Voyageur · app, web, WhatsApp", socle: false, actifParDefaut: true },
  { code: "ussd", nom: "USSD *123#", socle: false, actifParDefaut: true },
  { code: "relais", nom: "Points relais", socle: false, actifParDefaut: true },
  { code: "livraison_moto", nom: "Livraison moto", socle: false, actifParDefaut: true },
  { code: "inter_agences", nom: "Inter-agences et réseau", socle: false, actifParDefaut: true },
  {
    code: "covoit_vendeurs",
    nom: "Covoiturage et vendeurs ambulants",
    socle: false,
    actifParDefaut: false,
  },
  { code: "financement", nom: "Financement et crédit", socle: false, actifParDefaut: false },
  { code: "fidelite", nom: "Fidélité et parrainage", socle: false, actifParDefaut: true },
];

export const CODES_MODULES: readonly string[] = CATALOGUE_MODULES.map((m) => m.code);

export function moduleDuCatalogue(code: string): ModuleCatalogue | undefined {
  return CATALOGUE_MODULES.find((m) => m.code === code);
}
