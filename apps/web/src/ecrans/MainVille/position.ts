/**
 * Détection de la ville par la position. L'écran ne touche jamais `navigator` directement : il passe par un
 * fournisseur que les tests remplacent. Sans permission, sans GPS ou hors des villes desservies, on se replie sur
 * la dernière ville mémorisée (voir `EcranMainVille`).
 */
import { ecrire, lire } from "@/coquille/stockage";

export interface PositionRelevee {
  latitude: number;
  longitude: number;
}

export interface FournisseurPosition {
  /** La position actuelle ; `null` si elle est refusée, indisponible ou trop lente. */
  position(): Promise<PositionRelevee | null>;
}

/** Délai au-delà duquel on renonce à la position (l'écran affiche déjà la ville de repli). */
export const DELAI_POSITION_MS = 8000;

export const positionNavigateur: FournisseurPosition = {
  position() {
    return new Promise<PositionRelevee | null>((resolve) => {
      const geo = typeof navigator === "undefined" ? undefined : navigator.geolocation;
      if (!geo) {
        resolve(null);
        return;
      }
      const abandon = setTimeout(() => resolve(null), DELAI_POSITION_MS + 500);
      geo.getCurrentPosition(
        (p) => {
          clearTimeout(abandon);
          resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        },
        () => {
          clearTimeout(abandon);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: DELAI_POSITION_MS, maximumAge: 600_000 },
      );
    });
  },
};

let courant: FournisseurPosition = positionNavigateur;

export function fournisseurPosition(): FournisseurPosition {
  return courant;
}

/** Pour les tests : remplace le fournisseur et renvoie la fonction qui rétablit le précédent. */
export function remplacerFournisseurPosition(autre: FournisseurPosition): () => void {
  const precedent = courant;
  courant = autre;
  return () => {
    courant = precedent;
  };
}

/** Centre des villes desservies (latitude, longitude en degrés). */
export const VILLES_DESSERVIES: readonly (PositionRelevee & { nom: string })[] = [
  { nom: "Douala", latitude: 4.0511, longitude: 9.7679 },
  { nom: "Yaoundé", latitude: 3.848, longitude: 11.5021 },
  { nom: "Bafoussam", latitude: 5.4737, longitude: 10.4179 },
  { nom: "Bamenda", latitude: 5.9597, longitude: 10.146 },
  { nom: "Kribi", latitude: 2.94, longitude: 9.91 },
  { nom: "Ngaoundéré", latitude: 7.3167, longitude: 13.5833 },
];

/** Rayon autour du centre d'une ville dans lequel on considère le voyageur « dans la ville ». */
export const RAYON_VILLE_KM = 40;

const RAYON_TERRE_KM = 6371;

/** Distance à vol d'oiseau entre deux points (formule de haversine). */
export function distanceKm(a: PositionRelevee, b: PositionRelevee): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

/** La ville desservie la plus proche de la position, si elle est à moins de `RAYON_VILLE_KM` ; sinon `null`. */
export function villeProche(position: PositionRelevee): string | null {
  let meilleure: { nom: string; km: number } | null = null;
  for (const ville of VILLES_DESSERVIES) {
    const km = distanceKm(position, ville);
    if (km <= RAYON_VILLE_KM && (meilleure === null || km < meilleure.km)) {
      meilleure = { nom: ville.nom, km };
    }
  }
  return meilleure?.nom ?? null;
}

/** Ville de repli quand rien n'est détecté ni mémorisé. */
export const VILLE_PAR_DEFAUT = "Douala";

export const CLE_DERNIERE_VILLE = "afrimove.voyageur.derniereVille";

/** Dernière ville détectée ou choisie, relue au démarrage de l'écran. */
export function derniereVille(): string | null {
  const valeur = lire(CLE_DERNIERE_VILLE)?.trim();
  return valeur ? valeur : null;
}

export function memoriserVille(nom: string): void {
  ecrire(CLE_DERNIERE_VILLE, nom);
}
