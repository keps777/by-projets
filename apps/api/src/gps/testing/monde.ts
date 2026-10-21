import type { ArretTrajet, PointArret, TrajetBus } from "../modeles";

/**
 * Le réseau de test : la ligne Douala–Yaoundé de deux compagnies, avec des coordonnées réelles
 * (arrondies) et les kilomètres par la route. Partagé par les tests unitaires et ceux de l'API.
 */

export const JOUR = "2026-11-02";
export const heure = (hhmm: string): string => `${JOUR}T${hhmm}:00.000+01:00`;

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const DEPART = "00000000-0000-4000-8000-00000000d001";
export const DEPART_2 = "00000000-0000-4000-8000-00000000d002";
export const DEPART_AUTRE = "00000000-0000-4000-8000-00000000d004";

/** Les arrêts de la ligne : Douala (0 km), Edéa (65), Pouma (110), Boumnyebel (150), Yaoundé (250). */
export const COORDONNEES = {
  douala: { latitude: 4.0511, longitude: 9.7043 },
  edea: { latitude: 3.8, longitude: 10.1333 },
  pouma: { latitude: 3.8333, longitude: 10.5333 },
  boumnyebel: { latitude: 3.9167, longitude: 10.8167 },
  yaounde: { latitude: 3.8167, longitude: 11.5167 },
} as const;

export function arretsLigne(suffixe: string): ArretTrajet[] {
  return [
    {
      id: `arret-dla-${suffixe}`,
      nom: "Douala Akwa",
      ordre: 0,
      kmDepuisOrigine: 0,
      montee: true,
      ...COORDONNEES.douala,
    },
    {
      id: `arret-edea-${suffixe}`,
      nom: "Edéa",
      ordre: 1,
      kmDepuisOrigine: 65,
      arretMinutes: 10,
      montee: true,
      ...COORDONNEES.edea,
    },
    {
      id: `arret-pouma-${suffixe}`,
      nom: "Pouma",
      ordre: 2,
      kmDepuisOrigine: 110,
      montee: true,
      ...COORDONNEES.pouma,
    },
    {
      id: `arret-boum-${suffixe}`,
      nom: "Boumnyebel",
      ordre: 3,
      kmDepuisOrigine: 150,
      placesQuiMontent: 4,
      montee: true,
      ...COORDONNEES.boumnyebel,
    },
    {
      id: `arret-yde-${suffixe}`,
      nom: "Yaoundé Mvan",
      ordre: 4,
      kmDepuisOrigine: 250,
      montee: false,
      ...COORDONNEES.yaounde,
    },
  ];
}

/** Un départ de 08:00 (4 h 30 de trajet), en route, avec son équipage. */
export function trajetType(departId: string, surcharge: Partial<TrajetBus> = {}): TrajetBus {
  return {
    departId,
    compagnie: { id: COMPAGNIE, nom: "Alpha Voyages" },
    classe: "classique",
    ligneLibelle: "Douala → Yaoundé",
    sens: "vers Yaoundé",
    bus: { id: "bus-1", immatriculation: "LT 412 AB" },
    chauffeurId: "chauffeur-1",
    convoyeurId: "convoyeur-1",
    etat: "parti",
    heureDepart: heure("08:00"),
    partiA: heure("08:00"),
    dureeMinutes: 270,
    arrets: arretsLigne("a"),
    villes: ["Douala", "Edéa", "Yaoundé"],
    gareArrivee: "Mvan",
    aBord: 36,
    ...surcharge,
  };
}

/** Un arrêt vu par « Monter en route » : Pouma. */
export function pointPouma(id = "arret-pouma-a"): PointArret {
  return {
    id,
    nom: "Pouma",
    ...COORDONNEES.pouma,
    pointDeMontee: "Point de montée : station Total Pouma, côté droit.",
    ligne: {
      libelle: "Douala → Yaoundé",
      sens: "vers Yaoundé",
      arrets: ["Douala", "Edéa", "Pouma", "Boumnyebel", "Yaoundé"],
    },
  };
}

/**
 * Une position à `km` kilomètres de route sur le tronçon Douala–Edéa ou Edéa–Yaoundé, en
 * interpolant entre les arrêts (utile pour simuler un trajet).
 */
export function pointAuKm(km: number): { latitude: number; longitude: number } {
  const arrets = arretsLigne("a");
  for (let i = 0; i < arrets.length - 1; i++) {
    const a = arrets[i] as ArretTrajet;
    const b = arrets[i + 1] as ArretTrajet;
    if (km >= a.kmDepuisOrigine && km <= b.kmDepuisOrigine) {
      const f = (km - a.kmDepuisOrigine) / (b.kmDepuisOrigine - a.kmDepuisOrigine);
      return {
        latitude: a.latitude + f * (b.latitude - a.latitude),
        longitude: a.longitude + f * (b.longitude - a.longitude),
      };
    }
  }
  throw new RangeError(`km hors ligne : ${km}`);
}
