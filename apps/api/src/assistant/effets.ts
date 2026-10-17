import { jourSemaine } from "../analyses/periodes";
import type { ActionProposee } from "../analyses/modele";
import { debutDeJour, decalerJour, heureDouala, jourDouala, versIsoDouala } from "../rapport/temps";

/**
 * Quand une proposition acceptée prend effet. Règles par défaut des adaptateurs ; un adaptateur de
 * production peut en décider autrement (il connaît le planning).
 *
 * - décaler un départ : « dès lundi », le prochain lundi à 00:00 (jamais le jour même) ;
 * - ajouter un départ : la prochaine fois que ce jour de la semaine arrive à cette heure ;
 * - contrôle inopiné, numéro obligatoire en cadence : tout de suite.
 */
export function effetDe(action: ActionProposee, maintenant: Date): string {
  const aujourdhui = jourDouala(maintenant);
  const p = action.parametres;
  if (p.type === "decaler_depart") {
    const jusquauLundi = (1 - jourSemaine(aujourdhui) + 7) % 7 || 7;
    return versIsoDouala(debutDeJour(decalerJour(aujourdhui, jusquauLundi))!);
  }
  if (p.type === "ajouter_depart") {
    let attente = (p.jourSemaine - jourSemaine(aujourdhui) + 7) % 7;
    if (attente === 0 && heureDouala(maintenant) >= p.heure) attente = 7;
    return versIsoDouala(new Date(`${decalerJour(aujourdhui, attente)}T${p.heure}:00.000+01:00`));
  }
  return versIsoDouala(maintenant);
}
