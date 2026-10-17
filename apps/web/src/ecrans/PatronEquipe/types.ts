import type { patron } from "@afrimove/api-client";

/** Ce que `patron.useGares` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type VueGares = NonNullable<ReturnType<typeof patron.useGares>["data"]>;
export type Gare = VueGares["gares"][number];
export type Effectif = VueGares["effectifs"][number];
export type Personne = VueGares["personnes"][number];
export type Repere = VueGares["reperes"][number];
export type Role = Personne["role"];
export type EtatPersonne = Personne["etat"];

export type EtatBloc = "chargement" | "erreur" | "vide" | "pret";
