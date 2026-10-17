import type { patron } from "@afrimove/api-client";

/** Ce que `useAnalyseBus` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type AnalyseBus = NonNullable<ReturnType<typeof patron.useAnalyseBus>["data"]>;
export type TrajetBus = AnalyseBus["trajets"][number];
export type PointNet = AnalyseBus["netParSemaine"]["serie"][number];

/** `introuvable` : l'API ne connaît pas ce bus (404). `vide` : le bus n'a pas roulé cette semaine. */
export type EtatBus = "chargement" | "erreur" | "introuvable" | "vide" | "pret";
