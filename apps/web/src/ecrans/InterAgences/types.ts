import type { patron } from "@afrimove/api-client";

/** Ce que `patron.useInterAgences` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type VueInterAgences = NonNullable<ReturnType<typeof patron.useInterAgences>["data"]>;
export type ColisEnCorrespondance = VueInterAgences["colisEnCorrespondance"];
export type Troncon = ColisEnCorrespondance["troncons"][number];
export type Reglement = VueInterAgences["reglement"];
export type Convention = VueInterAgences["conventions"][number];

export type EtatBloc = "chargement" | "erreur" | "vide" | "pret";
