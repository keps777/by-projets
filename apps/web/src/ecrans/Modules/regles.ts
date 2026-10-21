import type { patron } from "@afrimove/contrats";

type PorteeModule = patron.PorteeModule;

/**
 * Où le changement s'applique : `?gare=<id>` pour une gare, `?ville=<nom>` pour une ville, sinon toute l'agence.
 * (La planche n'a pas de sélecteur : la gare ou la ville vient de l'écran d'où le patron arrive.)
 */
export function porteeDepuisUrl(params: URLSearchParams): PorteeModule {
  const gare = params.get("gare")?.trim();
  if (gare) return { type: "gare", id: gare };
  const ville = params.get("ville")?.trim();
  if (ville) return { type: "ville", nom: ville };
  return { type: "agence" };
}

/** Le contexte de lecture de `useModulesActifs` pour cette portée (vide : l'agence). */
export function contexteDePortee(portee: PorteeModule): { gare?: string; ville?: string } {
  if (portee.type === "gare") return { gare: portee.id };
  if (portee.type === "ville") return { ville: portee.nom };
  return {};
}

/**
 * La planche écrit en ambre l'état d'un module qui attend quelqu'un (« Orange en attente », « partenaire financier
 * en cours »). Le contrat ne porte que la phrase d'état : on reconnaît ces deux formules.
 */
export function detailEnAttente(detail: string): boolean {
  return /\b(en attente|en cours)\b/i.test(detail);
}

/** « Alpha Voyages » -> « Alpha » : la planche dit « actifs chez Alpha ». */
export function nomCourtAgence(compagnie: string): string {
  return compagnie.trim().split(/\s+/)[0] ?? compagnie;
}
