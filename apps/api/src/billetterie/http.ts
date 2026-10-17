import { BadRequestException } from "@nestjs/common";
import { DonneesInvalides, lire, type Lecteur } from "./validation";

/**
 * Exécute une lecture de paramètres ou de corps ; une donnée invalide devient une réponse 400 au
 * format de l'API : `{ code: "REQUETE_INVALIDE", message }`.
 */
export function ou400<T>(lecture: () => T): T {
  try {
    return lecture();
  } catch (e) {
    if (e instanceof DonneesInvalides) {
      throw new BadRequestException({ code: "REQUETE_INVALIDE", message: e.message });
    }
    throw e;
  }
}

/** Lit un corps de requête avec son lecteur. */
export function corps<T>(lecteur: Lecteur<T>, brut: unknown): T {
  return ou400(() => lire(lecteur, brut));
}
