/** Formats et petits calculs de l'accueil « dans la même ville » (valeurs de la maquette : « 3 min », « 07:50 », « 9 km »). */
import type { voyageur as c } from "@afrimove/contrats";

/** Filtres de la liste (Tout · Moto · Covoit · Bus). */
export type FiltreType = "tout" | "moto" | "covoit" | "bus";

export const FILTRES: readonly FiltreType[] = ["tout", "moto", "covoit", "bus"];

/** Types d'offre demandés au serveur pour un filtre ; `undefined` = tous les types. */
export function typesDuFiltre(filtre: FiltreType): c.TypeOffreVille[] | undefined {
  switch (filtre) {
    case "moto":
      return ["moto_taxi"];
    case "covoit":
      return ["covoiturage"];
    case "bus":
      return ["bus_ville"];
    default:
      return undefined;
  }
}

/** Au-delà de ce délai, la ligne affiche l'heure de départ (« 07:50 ») plutôt qu'un délai (« 3 min »). */
export const SEUIL_DELAI_MINUTES = 10;

/** `2027-01-05T07:50:00.000+01:00` -> `07:50` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Vrai quand la ligne affiche un délai en minutes plutôt qu'une heure. */
export function departImminent(offre: Pick<c.OffreVille, "departDansMinutes">): boolean {
  return offre.departDansMinutes <= SEUIL_DELAI_MINUTES;
}

/** « Akwa, marché central » -> « Akwa » : le quartier, pour le résumé « Akwa → Bonabéri · 9 km ». */
export function quartier(lieu: string): string {
  return (lieu.split(",")[0] ?? lieu).trim();
}

/**
 * Qui conduit ou quelle ligne : le nom donné par l'API, suivi de « vérifiée » pour un conducteur vérifié
 * (« Clarisse · vérifiée »). Si l'API a déjà mis la mention dans le nom, on ne la répète pas.
 */
export function libelleQui(
  offre: Pick<c.OffreVille, "qui" | "verifie" | "type">,
  verifiee: string,
): string {
  if (offre.type === "covoiturage" && offre.verifie && !/vérifi/i.test(offre.qui)) {
    return `${offre.qui} · ${verifiee}`;
  }
  return offre.qui;
}

/** Le trajet que le voyageur a saisi : les deux lieux et si le départ est pris sur sa position. */
export interface Trajet {
  depart: string;
  arrivee: string;
  departSurMaPosition: boolean;
}

/** Texte du champ Départ : « Akwa, marché central · ma position ». */
export function texteDepart(trajet: Trajet, maPosition: string): string {
  return trajet.departSurMaPosition ? `${trajet.depart} · ${maPosition}` : trajet.depart;
}

/** Relit le texte d'un champ Départ : la mention « · ma position » est retirée du lieu et mémorisée. */
export function lireDepart(
  texte: string,
  maPosition: string,
): { depart: string; departSurMaPosition: boolean } {
  const suffixe = ` · ${maPosition}`;
  const net = texte.trimEnd();
  const surPosition = net.endsWith(suffixe);
  const lieu = surPosition ? net.slice(0, -suffixe.length) : net;
  return { depart: lieu.trim(), departSurMaPosition: surPosition };
}

/** Sens inverse : l'arrivée devient le départ (plus sur la position) et inversement. */
export function inverser(trajet: Trajet): Trajet {
  return { depart: trajet.arrivee, arrivee: trajet.depart, departSurMaPosition: false };
}
