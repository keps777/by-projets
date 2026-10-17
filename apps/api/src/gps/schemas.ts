import { REGLES_GPS, type EntreePosition } from "./regles";
import type { DemandeMontee } from "./montee.service";
import {
  DonneesInvalides,
  entier,
  idOpaque,
  isoDouala,
  latitude,
  longitude,
  nombre,
  objet,
  optionnel,
  parametre,
  parametreNombre,
  tableau,
} from "./validation";

/**
 * Lecteurs des corps et paramètres du module. Les positions envoyées par les appareils n'ont pas
 * encore de contrat dans `@afrimove/contrats` (à ajouter par le ticket des contrats) : leurs
 * formes sont définies ici ; les réponses, elles, suivent les contrats existants.
 */

/** Une position du téléphone : instant, coordonnées, précision en mètres, vitesse en km/h. */
export const lirePosition = objet({
  instant: isoDouala,
  latitude,
  longitude,
  precisionM: optionnel(nombre({ min: 0, max: 100_000 })),
  vitesseKmh: optionnel(nombre({ min: 0, max: REGLES_GPS.vitesseMaxKmh })),
});

/** Jusqu'à 100 positions par envoi : un téléphone qui retrouve le réseau rattrape son retard. */
export const lireLotPositions = objet({
  positions: tableau(lirePosition, { min: 1, max: 100 }),
});

export type LotPositions = { positions: EntreePosition[] };

export const lirePrevenirProche = objet({
  procheId: idOpaque,
  minutesAvantArrivee: optionnel(entier({ min: 1, max: REGLES_GPS.prevenirMinutesMax })),
});

/** `?arretId=` ou `?lat=&lng=` (la position GPS du voyageur) : au moins l'un des deux. */
export function lireDemandeMontee(requete: Record<string, unknown>): DemandeMontee {
  const arretId = parametre(requete, "arretId");
  const lat = parametreNombre(requete, "lat", { min: -90, max: 90 });
  const lng = parametreNombre(requete, "lng", { min: -180, max: 180 });
  if (arretId !== undefined) {
    if (arretId.length < 1 || arretId.length > 128) {
      throw new DonneesInvalides("arretId", "identifiant invalide");
    }
    return { arretId };
  }
  if (lat === undefined || lng === undefined) {
    throw new DonneesInvalides("", "arretId, ou lat et lng ensemble, attendu");
  }
  return { latitude: lat, longitude: lng };
}
