import { couleurRemplissage, type CouleurRemplissage } from "@afrimove/ui";
import type { AnalyseLigne, PointRecette } from "./types";

/**
 * Couleur du remplissage moyen face à la cible de la ligne : atteinte = vert, jusqu'à 20 points en dessous = ambre
 * (78 % pour une cible de 85 dans la planche), plus bas = rouge.
 */
export function tonRemplissage(remplissage: AnalyseLigne["remplissage"]): CouleurRemplissage {
  return couleurRemplissage(remplissage.pct, {
    vert: remplissage.cible,
    ambre: remplissage.cible - 20,
  });
}

/** Couleur d'une variation : rouge si elle baisse, vert si elle monte, neutre si elle ne bouge pas. */
export function tonVariation(pourcent: number): "vert" | "rouge" | "neutre" {
  if (pourcent < 0) return "rouge";
  return pourcent > 0 ? "vert" : "neutre";
}

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

export interface BarreJour {
  libelle: string;
  /** Hauteur de la barre en % de la hauteur du graphique (la plus haute fait 100). */
  hauteurPct: number;
  /** Jour que le commentaire de l'API nomme : vert s'il monte face à la veille, rouge s'il baisse. */
  ton: "vert" | "rouge" | "neutre";
}

/**
 * Les sept barres « Par jour de la semaine ». L'API donne la recette de chaque jour et un commentaire (« Le mardi
 * monte, le mercredi s'effondre… ») ; la planche colore les jours que le commentaire cite : vert quand la recette du
 * jour dépasse celle de la veille, rouge quand elle est plus basse. Le lundi n'a pas de veille dans la série : il
 * reste neutre. Hors des sept jours (une autre période), aucune barre n'est mise en avant.
 */
export function barresJours(serie: readonly PointRecette[], lecture: string): BarreJour[] {
  const max = Math.max(0, ...serie.map((p) => p.recette));
  const citees = new Set(
    serie.length === JOURS.length
      ? JOURS.flatMap((jour, i) => (new RegExp(`\\b${jour}\\b`, "i").test(lecture) ? [i] : []))
      : [],
  );
  return serie.map((point, i) => {
    const veille = serie[i - 1];
    const ton =
      citees.has(i) && veille && point.recette !== veille.recette
        ? point.recette > veille.recette
          ? "vert"
          : "rouge"
        : "neutre";
    return {
      libelle: point.libelle,
      hauteurPct: max > 0 ? Math.round((point.recette / max) * 1000) / 10 : 0,
      ton,
    };
  });
}
