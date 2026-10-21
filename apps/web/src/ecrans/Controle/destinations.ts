import { urlPlanche, type Planche } from "@/coquille/planches";
import type { ATraiter } from "./direct";

/** Les cinq vues de la barre du haut, dans l'ordre de la planche. « Direct » est l'écran lui-même. */
export const ONGLETS = [
  { cle: "direct", planche: "Controle" },
  { cle: "analyses", planche: "Analyses" },
  { cle: "comptable", planche: "Comptable" },
  { cle: "reglages", planche: "Config" },
  { cle: "modules", planche: "Modules" },
] as const satisfies ReadonlyArray<{ cle: string; planche: Planche }>;

export type CleOnglet = (typeof ONGLETS)[number]["cle"];

/** La gare ouvre l'écran du superviseur (les trois lignes du tableau mènent au même écran dans la planche). */
export function destinationGare(): string {
  return urlPlanche("Superviseur");
}

/**
 * Écran qui permet d'agir sur un élément « à traiter » (navigation de la planche) : clôture -> Superviseur, bus arrêté
 * -> Chauffeur, colis en correspondance -> Entre compagnies, proposition -> Assistant.
 */
export function destinationATraiter(type: ATraiter["type"]): string {
  switch (type) {
    case "cloture_en_attente":
      return urlPlanche("Superviseur");
    case "bus_arrete":
      return urlPlanche("Chauffeur");
    case "correspondance":
      return urlPlanche("InterAgences");
    case "proposition_assistant":
      return urlPlanche("Assistant");
  }
}

export type TonPoint = "ambre" | "rouge" | "bleu" | "vert";

/** Couleur du point de chaque élément « à traiter », relevée dans la planche. */
export const TON_A_TRAITER: Record<ATraiter["type"], TonPoint> = {
  cloture_en_attente: "ambre",
  bus_arrete: "rouge",
  correspondance: "bleu",
  proposition_assistant: "vert",
};

export function destinationRapport(): string {
  return urlPlanche("RapportSoir");
}
