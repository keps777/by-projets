import type { voyageur as c } from "@afrimove/contrats";

/** Période de relecture du suivi : la position et l'heure estimée sont remises à jour toutes les 30 s. */
export const PERIODE_SUIVI_MS = 30_000;

/** `2027-01-05T11:35:00.000+01:00` -> `11:35` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `+237677000024` -> `+237 6 77 00 00 24` (numéro camerounais à neuf chiffres) ; sinon le numéro tel quel. */
export function numeroLisible(telephone: string): string {
  const morceaux = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(telephone);
  return morceaux ? `+237 ${morceaux.slice(1).join(" ")}` : telephone;
}

/**
 * Applique un message du canal temps réel au suivi reçu du serveur : vitesse, heure estimée, retard et prochain
 * arrêt. Un message d'un autre billet, ou dont le prochain arrêt est inconnu, laisse les arrêts tels quels.
 */
export function appliquerPosition(
  suivi: c.SuiviBus,
  message: c.MessagePositionBus | undefined,
): c.SuiviBus {
  if (message === undefined) return suivi;
  const rang =
    message.prochainArret === undefined
      ? -1
      : suivi.etapes.findIndex((etape) => etape.arret === message.prochainArret);
  return {
    ...suivi,
    vitesseKmh: message.vitesseKmh,
    arrivee: {
      ...suivi.arrivee,
      estimee: message.arriveeEstimee,
      retardMinutes: message.retardMinutes,
    },
    etapes:
      rang < 0
        ? suivi.etapes
        : suivi.etapes.map((etape, i) => ({
            ...etape,
            statut: i < rang ? "passe" : i === rang ? "prochain" : "a_venir",
          })),
  };
}

/**
 * Ville après laquelle se trouve le bus (« bus après Edéa ») : la dernière ville intermédiaire de la ligne dont
 * l'arrêt est passé. Sans arrêt passé sur une ville intermédiaire, la ville de départ.
 */
export function villeAvantBus(suivi: Pick<c.SuiviBus, "villes" | "etapes">): string {
  const passees = suivi.etapes.filter((etape) => etape.statut === "passe");
  const intermediaires = suivi.villes.slice(1, -1);
  const derniere = [...intermediaires]
    .reverse()
    .find((ville) => passees.some((etape) => etape.arret.startsWith(ville)));
  return derniere ?? suivi.villes[0] ?? "";
}
