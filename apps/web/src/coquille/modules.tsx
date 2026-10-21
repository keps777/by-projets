import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Les 12 modules de la planche Modules. Un module masqué retire ses routes et ses entrées (onglets) au
 * prochain chargement : pas de bouton grisé, pas de « bientôt ». Ici c'est un MOCK : la liste des modules
 * masqués vient du paramètre `?modules-masques=` (mode démo) ou du fournisseur ; elle sera lue sur le moteur
 * des modules (AM-126, hook `useModule()` du client d'API) sans changer ces signatures.
 */
export const MODULES = [
  "guichet",
  "colis",
  "quai",
  "supervision",
  "voyageur",
  "ussd",
  "relais",
  "livraison",
  "inter-agences",
  "covoit",
  "financement",
  "fidelite",
] as const;

export type ModuleId = (typeof MODULES)[number];

/** « Guichet et caisse » est le socle : il ne peut pas être masqué. */
export const MODULES_TOUJOURS_ACTIFS: readonly ModuleId[] = ["guichet"];

export function estModule(valeur: string): valeur is ModuleId {
  return (MODULES as readonly string[]).includes(valeur);
}

/** Retire les identifiants inconnus et les modules qu'on ne peut pas masquer. */
export function modulesMasquesValides(ids: readonly string[]): ModuleId[] {
  return ids.filter(estModule).filter((id) => !MODULES_TOUJOURS_ACTIFS.includes(id));
}

/**
 * Module qui porte chaque URL (motif sur l'URL finale, groupes déjà retirés). Une URL absente de la liste
 * appartient au socle et ne disparaît jamais.
 */
const ROUTES_DES_MODULES: ReadonlyArray<readonly [ModuleId, RegExp]> = [
  // Les motifs précis passent avant `/colis/...` : la première règle qui correspond l'emporte.
  ["relais", /^\/relais(\/|$)/],
  ["relais", /^\/colis\/[^/]+\/relais$/],
  ["relais", /^\/moi\/devenir-relais(\/|$)/],
  ["livraison", /^\/livreur(\/|$)/],
  ["livraison", /^\/colis\/[^/]+\/livraison$/],
  ["livraison", /^\/moi\/devenir-livreur(\/|$)/],
  ["colis", /^\/colis(\/|$)/],
  ["colis", /^\/guichet\/(colis|depot)(\/|$)/],
  ["quai", /^\/(embarquement|completer|convoyeur|chauffeur)$/],
  ["supervision", /^\/(gare|cloture|annulation|equipe|debloquer|rapport|assistant)(\/|$)/],
  ["ussd", /^\/sans-internet$/],
  ["inter-agences", /^\/inter-agences(\/|$)/],
  ["covoit", /^\/covoit(\/|$)/],
  ["covoit", /^\/vendeur(\/|$)/],
  ["financement", /^\/financement(\/|$)/],
];

/**
 * Module dont dépend une URL, ou `null` pour le socle. `url` est une URL réelle (`/colis/c1/relais`) ou un
 * motif de route (`/colis/:colisId/relais`).
 */
export function moduleDeLUrl(url: string): ModuleId | null {
  return ROUTES_DES_MODULES.find(([, motif]) => motif.test(url))?.[0] ?? null;
}

export interface ContexteModules {
  masques: ReadonlySet<ModuleId>;
  /** Vrai si le module est actif (donc visible). */
  moduleActif: (id: ModuleId) => boolean;
}

const ModulesContexte = createContext<ContexteModules>({
  masques: new Set(),
  moduleActif: () => true,
});

export function ModulesProvider({
  masques,
  children,
}: {
  masques: readonly string[];
  children: ReactNode;
}) {
  const valeur = useMemo<ContexteModules>(() => {
    const ensemble = new Set(modulesMasquesValides(masques));
    return { masques: ensemble, moduleActif: (id) => !ensemble.has(id) };
  }, [masques]);
  return <ModulesContexte.Provider value={valeur}>{children}</ModulesContexte.Provider>;
}

export function useModules(): ContexteModules {
  return useContext(ModulesContexte);
}

/** Même forme que le futur hook du client d'API (AM-126) : vrai si le module est actif. */
export function useModule(id: ModuleId): boolean {
  return useModules().moduleActif(id);
}
