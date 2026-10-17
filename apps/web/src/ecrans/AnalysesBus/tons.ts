import type { BarreHistogramme } from "@afrimove/ui";
import { net } from "./formats";
import type { AnalyseBus, PointNet, TrajetBus } from "./types";

export type Ton = "neutre" | "vert" | "rouge";

/**
 * Couleur du net du bus (tuile « Net »). Le net est rouge quand le bus est à surveiller ou qu'il perd de l'argent
 * (planche : LT 207 est à surveiller, son net de + 0,6 M est en rouge) ; vert sinon.
 */
export function tonNetBus(bus: Pick<AnalyseBus, "statut" | "net">): "vert" | "rouge" {
  return bus.statut === "a_surveiller" || bus.net < 0 ? "rouge" : "vert";
}

/** Couleur du net d'un trajet : vert s'il rapporte, rouge s'il coûte, neutre à zéro. */
export function tonNetTrajet(trajet: Pick<TrajetBus, "net">): Ton {
  return trajet.net > 0 ? "vert" : trajet.net < 0 ? "rouge" : "neutre";
}

/** Couleur de la tendance du net par semaine (« − 62 % depuis la panne du 12 nov. » en rouge). */
export function tonTendance(variationPct: number): Ton {
  return variationPct > 0 ? "vert" : variationPct < 0 ? "rouge" : "neutre";
}

/** Sous quelle part de la meilleure semaine une barre passe en rouge, puis en ambre (planche : S46 35 %, S47 60 %). */
const SEUIL_ROUGE = 0.5;
const SEUIL_AMBRE = 0.75;

/**
 * Les barres du net par semaine : grises tant que la semaine tient son rang, ambre quand elle tombe sous les trois
 * quarts de la meilleure, rouge sous la moitié (planche : S41 à S45 grises, S46 et S48 rouges, S47 ambre).
 */
export function barresNet(serie: readonly PointNet[]): BarreHistogramme[] {
  const meilleur = Math.max(0, ...serie.map((p) => p.net));
  return serie.map((point) => {
    const part = meilleur > 0 ? point.net / meilleur : 1;
    const accent = part < SEUIL_ROUGE ? "rouge" : part < SEUIL_AMBRE ? "ambre" : undefined;
    return {
      etiquette: point.libelle,
      valeur: point.net,
      valeurAffichee: net(point.net),
      ...(accent ? { accent } : {}),
    };
  });
}

/**
 * Que sont devenus les passagers d'un trajet en panne ? Le contrat ne le dit pas : la planche écrit « 30 replacés »
 * quand la panne arrive en route (ils sont repris par un autre bus) et « 30 gardés » quand elle arrive avant le départ
 * (ils attendent le bus réparé). On le déduit du texte de l'incident.
 */
export function suiteDesPassagers(incident: { description: string }): "replaces" | "gardes" {
  return /\b(au|avant le) départ\b/i.test(incident.description) ? "gardes" : "replaces";
}

/** Nombre de pannes de la semaine, pour la mention « 5 · 2 pannes ». */
export function nombrePannes(trajets: readonly Pick<TrajetBus, "incident">[]): number {
  return trajets.filter((t) => t.incident?.nature === "panne").length;
}

/**
 * Découpe l'avis de l'assistant : la dernière phrase (la recommandation) est en gras dans la planche. Un avis d'une
 * seule phrase reste en texte normal.
 */
export function separerAvis(avis: string): { debut: string; recommandation: string } {
  const texte = avis.trim();
  const coupe = texte.lastIndexOf(". ");
  if (coupe < 0) return { debut: texte, recommandation: "" };
  return { debut: texte.slice(0, coupe + 2), recommandation: texte.slice(coupe + 2) };
}
