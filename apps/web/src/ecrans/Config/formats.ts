import type { patron } from "@afrimove/api-client";

/** Formats d'affichage de l'écran Réglages (valeurs de la maquette : « 4 000 », « ···· 02 »). */

/** Montant FCFA tel que la planche l'écrit : `4000` -> `4 000` (espace simple, sans signe). */
export function montant(fcfa: number): string {
  return String(Math.abs(Math.trunc(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Numéro masqué de l'API (`6 77 •• •• 02`) -> fin de numéro de la planche (`···· 02`). */
export function finDeNumero(masque: string): string {
  const fin = /(\d{2})\D*$/.exec(masque)?.[1];
  return fin ? `···· ${fin}` : "····";
}

/** Ce que `useReglages` et `useEquipe` renvoient (@afrimove/contrats n'est pas une dépendance de l'application). */
export type Reglages = NonNullable<ReturnType<typeof patron.useReglages>["data"]>;
export type Regles = Reglages["regles"];
export type LigneReglage = Reglages["lignes"][number];
export type Personne = NonNullable<
  ReturnType<typeof patron.useEquipe>["data"]
>["personnes"][number];
export type Role = Personne["role"];
export type EtatPersonne = Personne["etat"];

export type TonIndicateur = "rouge" | "ambre" | "neutre";

/**
 * Couleur de la synthèse sous le nom (« bloquée · 3 PIN faux » en rouge, « PIN à renouveler · 3 écarts » et
 * « hors ligne 40 min » en ambre). Le contrat ne porte pas de niveau d'alerte : la personne bloquée vient de
 * `etat`, le reste est lu dans le texte formulé par l'API (point à confirmer, voir le rapport).
 */
export function tonIndicateur(personne: Pick<Personne, "etat" | "indicateur">): TonIndicateur {
  if (personne.etat === "bloquee") return "rouge";
  if (/renouveler|hors ligne/i.test(personne.indicateur)) return "ambre";
  return "neutre";
}

export type CouleurInitiales = "ambre" | "bleu" | "vert" | "craie2";

const ETATS_INACTIFS: readonly EtatPersonne[] = [
  "bloquee",
  "repos",
  "indisponible",
  "hors_service",
];

/**
 * Couleur des initiales dans la pastille ronde. Ni le contrat ni la planche n'en donnent la règle (la même
 * personne garde la même couleur d'une planche à l'autre) : gris pour une personne bloquée ou à l'arrêt, ambre
 * quand la synthèse alerte, sinon bleu ou vert, choisi de façon stable à partir de l'identifiant.
 */
export function couleurInitiales(
  personne: Pick<Personne, "id" | "etat" | "indicateur">,
): CouleurInitiales {
  if (ETATS_INACTIFS.includes(personne.etat)) return "craie2";
  if (tonIndicateur(personne) === "ambre") return "ambre";
  let somme = 0;
  for (const c of personne.id) somme += c.charCodeAt(0);
  return somme % 2 === 0 ? "bleu" : "vert";
}

/** Nombre de lignes que montre la liste glissable sans défiler (120 px de haut, lignes de 40 px). */
export const LIGNES_VISIBLES = 3;
