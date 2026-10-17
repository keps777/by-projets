import type { BarreHistogramme } from "@afrimove/ui";
import { millions } from "./formats";
import type { BusAnalyse, PointRecette } from "./types";

export type TonBus = "neutre" | "ambre" | "rouge";

/**
 * Couleur de la mention d'un bus. L'API ne donne que le texte (« 0 incident », « carburant + 12 % », « 2 pannes »),
 * la planche le colore : gris sans incident, rouge pour une panne ou une visite technique (le bus ne roule plus
 * comme prévu), ambre pour le reste (à surveiller).
 */
export function tonIncident(incident: string): TonBus {
  if (/^\s*0\b/.test(incident)) return "neutre";
  if (/panne|visite technique|accident|immobilis/i.test(incident)) return "rouge";
  return "ambre";
}

/** Le net est rouge quand le bus a un incident grave, vert sinon (planche : LT 207 et LT 148 en rouge). */
export function tonNet(bus: Pick<BusAnalyse, "incident">): "vert" | "rouge" {
  return tonIncident(bus.incident) === "rouge" ? "rouge" : "vert";
}

/**
 * Les barres de la recette : les deux plus fortes sont en ambre (vendredi et samedi dans la planche), les autres en
 * trait. Avec moins de trois barres, aucune n'est mise en avant : il n'y a rien à comparer.
 */
export function barresRecette(serie: readonly PointRecette[]): BarreHistogramme[] {
  const meilleures = new Set(
    serie.length < 3
      ? []
      : serie
          .map((p, i) => ({ i, recette: p.recette }))
          .sort((a, b) => b.recette - a.recette || a.i - b.i)
          .slice(0, 2)
          .map((p) => p.i),
  );
  return serie.map((point, i) => ({
    etiquette: point.libelle,
    valeur: point.recette,
    valeurAffichee: millions(point.recette),
    ...(meilleures.has(i) ? { accent: "ambre" as const } : {}),
  }));
}
