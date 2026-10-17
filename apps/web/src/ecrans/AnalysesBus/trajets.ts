import type { TFunction } from "i18next";
import { duree, groupes } from "./formats";
import { suiteDesPassagers } from "./tons";
import type { TrajetBus } from "./types";

/** « Lun 06:00 · Douala → Bafoussam » : le premier texte de la ligne d'un trajet. */
export function quandTrajet(t: TFunction, trajet: TrajetBus): string {
  return t("trajets.quand", {
    jour: t(`jours.${trajet.jour}`),
    heure: trajet.heure,
    origine: trajet.origine,
    destination: trajet.destination,
  });
}

/**
 * Le détail d'un trajet, morceau par morceau, séparés par « · » :
 * - trajet sans incident : « 28 / 30 · 98 000 · à l'heure » (passagers, recette, ponctualité) ;
 * - trajet avec incident : « panne embrayage à Mbouda · 2 h 10 · 30 replacés » (l'incident, sa durée, les passagers).
 * Un morceau que l'API ne donne pas (passagers, recette, retard, durée : `null`) est simplement omis.
 */
export function detailTrajet(
  t: TFunction,
  trajet: TrajetBus,
): { texte: string; incident: boolean } {
  const { incident, passagers, recette, retardMinutes } = trajet;
  const morceaux: string[] = [];
  if (incident) {
    morceaux.push(incident.description);
    if (incident.dureeMinutes !== null) morceaux.push(duree(incident.dureeMinutes));
    if (passagers) {
      morceaux.push(t(`trajets.${suiteDesPassagers(incident)}`, { count: passagers.remplis }));
    }
  } else {
    if (passagers) morceaux.push(`${passagers.remplis} / ${passagers.capacite}`);
    if (recette !== null) morceaux.push(groupes(recette));
    if (retardMinutes !== null) {
      morceaux.push(
        retardMinutes === 0
          ? t("trajets.aLHeure")
          : t("trajets.retard", { duree: duree(retardMinutes) }),
      );
    }
  }
  return { texte: morceaux.join(" · "), incident: incident !== null };
}
