import type { patron } from "@afrimove/api-client";

/** Ce que le hook du patron renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type AnalyseLigne = NonNullable<ReturnType<typeof patron.useAnalyseLigne>["data"]>;
export type DepartAnalyse = AnalyseLigne["departs"][number];
export type PointRecette = AnalyseLigne["parJour"]["serie"][number];

/** Période demandée à l'API : le sélecteur de l'en-tête. */
export type Periode = NonNullable<Parameters<typeof patron.useAnalyseLigne>[1]>;

/** Dans l'ordre du sélecteur de la planche (Semaine, Mois, Trimestre). */
export const PERIODES = ["semaine", "mois", "trimestre"] as const satisfies readonly Periode[];

export type EtatLigne = "chargement" | "erreur" | "introuvable" | "pret";
