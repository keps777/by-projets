import type { patron } from "@afrimove/api-client";

/** Ce que les hooks du patron renvoient (@afrimove/contrats n'est pas une dépendance de l'application). */
export type TableauDuJour = NonNullable<ReturnType<typeof patron.useTableauDuJour>["data"]>;
export type Alerte = NonNullable<ReturnType<typeof patron.useAlertes>["data"]>["alertes"][number];
export type MessageDirect = NonNullable<ReturnType<typeof patron.useDirectJour>["dernier"]>;

/** Ce que le temps réel a publié depuis la dernière lecture. */
export interface Direct {
  chiffres?: { instant: string; jour: TableauDuJour["jour"] };
  alertes: Alerte[];
}

export const DIRECT_VIDE: Direct = { alertes: [] };

/** Range un message du canal du jour : les derniers chiffres remplacent les précédents, une alerte s'ajoute une fois. */
export function recevoir(direct: Direct, message: MessageDirect): Direct {
  if (message.type === "chiffres") {
    return { ...direct, chiffres: { instant: message.instant, jour: message.jour } };
  }
  if (direct.alertes.some((a) => a.id === message.alerte.id)) return direct;
  return { ...direct, alertes: [message.alerte, ...direct.alertes] };
}

function auMoinsAussiRecent(a: string, b: string): boolean {
  return Date.parse(a) >= Date.parse(b);
}

/**
 * Le tableau du jour, avec les derniers chiffres du direct quand ils sont plus récents que la lecture (une lecture
 * plus récente que le message le remplace : elle le contient déjà).
 */
export function tableauAvecDirect(tableau: TableauDuJour, direct: Direct): TableauDuJour {
  const { chiffres } = direct;
  if (!chiffres || !auMoinsAussiRecent(chiffres.instant, tableau.instant)) return tableau;
  return { ...tableau, instant: chiffres.instant, jour: chiffres.jour };
}

/** Les alertes de la lecture, précédées de celles que le direct a publiées depuis et que la lecture ne contient pas encore. */
export function alertesAvecDirect(alertes: readonly Alerte[], direct: Direct): Alerte[] {
  const connues = new Set(alertes.map((a) => a.id));
  return [...direct.alertes.filter((a) => !connues.has(a.id)), ...alertes];
}
