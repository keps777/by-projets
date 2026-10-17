import type { patron } from "@afrimove/api-client";

/** Ce que `patron.useEquipe` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type ListeEquipe = NonNullable<ReturnType<typeof patron.useEquipe>["data"]>;
export type Personne = ListeEquipe["personnes"][number];
export type Role = Personne["role"];
export type EtatPersonne = Personne["etat"];

export type EtatListe = "chargement" | "erreur" | "pret";
