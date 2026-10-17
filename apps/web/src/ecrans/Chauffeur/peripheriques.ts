/**
 * Périphériques du téléphone derrière des interfaces locales : l'écran ne touche jamais `navigator` ni le DOM
 * directement, les tests y glissent des doubles (`remplacerPeripheriques`).
 *
 * - la photo du justificatif se prend avec `<input type="file" accept="image/*" capture>` ;
 * - la position vient de `navigator.geolocation` (le suivi GPS serveur AM-170 viendra plus tard).
 */

/** Une photo prise ou choisie par le chauffeur. */
export interface PhotoJustificatif {
  nom: string;
  taille: number;
  fichier: File;
}

export interface FournisseurPhoto {
  /** Ouvre l'appareil photo ; `null` si le chauffeur annule. */
  prendre(): Promise<PhotoJustificatif | null>;
}

/** Position relevée au moment du geste (même forme que `SchemaPositionGps` des contrats). */
export interface PositionRelevee {
  latitude: number;
  longitude: number;
  /** Précision en mètres. */
  precisionM: number;
}

export interface FournisseurPosition {
  /** La position actuelle ; `null` si elle est refusée, indisponible ou trop lente (le geste n'attend pas). */
  position(): Promise<PositionRelevee | null>;
}

/** Appareil photo du navigateur : un champ fichier caché, ouvert par le geste du chauffeur. */
export const photoNavigateur: FournisseurPhoto = {
  prendre() {
    return new Promise<PhotoJustificatif | null>((resolve) => {
      const champ = document.createElement("input");
      champ.type = "file";
      champ.accept = "image/*";
      champ.setAttribute("capture", "environment");
      champ.hidden = true;
      champ.tabIndex = -1;
      champ.setAttribute("aria-hidden", "true");
      const terminer = (photo: PhotoJustificatif | null) => {
        champ.remove();
        resolve(photo);
      };
      champ.addEventListener("change", () => {
        const fichier = champ.files?.[0];
        terminer(fichier ? { nom: fichier.name, taille: fichier.size, fichier } : null);
      });
      champ.addEventListener("cancel", () => terminer(null));
      document.body.append(champ);
      champ.click();
    });
  },
};

/** Délai au-delà duquel le geste part sans position : une panne ne doit pas attendre le satellite. */
export const DELAI_POSITION_MS = 2500;

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
          resolve({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            precisionM: p.coords.accuracy,
          });
        },
        () => {
          clearTimeout(abandon);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: DELAI_POSITION_MS, maximumAge: 60_000 },
      );
    });
  },
};

export const peripheriques: { photo: FournisseurPhoto; position: FournisseurPosition } = {
  photo: photoNavigateur,
  position: positionNavigateur,
};

/** Remplace les périphériques (tests) ; renvoie la fonction qui remet ceux du navigateur. */
export function remplacerPeripheriques(
  doubles: Partial<{ photo: FournisseurPhoto; position: FournisseurPosition }>,
): () => void {
  const avant = { ...peripheriques };
  Object.assign(peripheriques, doubles);
  return () => {
    Object.assign(peripheriques, avant);
  };
}
