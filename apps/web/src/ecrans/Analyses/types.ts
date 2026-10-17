import type { patron } from "@afrimove/api-client";

/** Ce que les hooks du patron renvoient (@afrimove/contrats n'est pas une dépendance de l'application). */
export type Analyses = NonNullable<ReturnType<typeof patron.useAnalyses>["data"]>;
export type LigneAnalysee = Analyses["lignes"][number];
export type BusAnalyse = Analyses["bus"][number];
export type PointRecette = Analyses["recette"]["serie"][number];

/** Période demandée à l'API : le sélecteur de l'en-tête. */
export type Periode = NonNullable<Parameters<typeof patron.useAnalyses>[0]>;

/** Dans l'ordre du sélecteur de la planche. */
export const PERIODES = [
  "semaine",
  "mois",
  "trimestre",
  "annee",
] as const satisfies readonly Periode[];

export type EtatBloc = "chargement" | "erreur" | "vide" | "pret";

/** Identifiant de la ligne « Colis · toutes lignes » : ce n'est pas une ligne de transport, elle ouvre le même détail. */
export const LIGNE_COLIS = "colis";
