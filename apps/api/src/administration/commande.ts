import { HttpException } from "@nestjs/common";
import { DonneesInvalides, lire, type Lecteur } from "../billetterie/validation";
import { erreurApi, type SignaturePin } from "../modules/commande";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { signature as lecteurSignature } from "./schemas";

export { erreurApi };
export type { SignaturePin };

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Lit la signature d'une écriture signée. Absente ou illisible : 401 `PIN_REQUIS`, comme le mock du client
 * (`lireCommande`), pour que l'écran réagisse de la même façon aux deux adaptateurs.
 */
export function lireSignature(corps: unknown): SignaturePin {
  try {
    return lire(lecteurSignature, estObjet(corps) ? corps["signature"] : undefined);
  } catch (e) {
    if (e instanceof DonneesInvalides) {
      throw erreurApi(401, "PIN_REQUIS", "Signature PIN requise pour cette écriture");
    }
    throw e;
  }
}

/** Lit un corps signé des contrats patron : une erreur de forme est un 422 `COMMANDE_INVALIDE`. */
export function lireCommande<T>(lecteur: Lecteur<T>, corps: unknown): T {
  try {
    return lire(lecteur, corps);
  } catch (e) {
    if (e instanceof DonneesInvalides) {
      throw erreurApi(422, "COMMANDE_INVALIDE", `Corps de la commande invalide : ${e.message}`);
    }
    throw e;
  }
}

/** Un compte d'une compagnie : sinon 403 `AGENCE_REQUISE` (jamais « toutes les compagnies »). */
export function compagnieDe(u: Utilisateur): string {
  if (u.compagnieId === null) {
    throw erreurApi(403, "AGENCE_REQUISE", "Votre compte n'est rattaché à aucune agence");
  }
  return u.compagnieId;
}

export const refuse = (message: string): HttpException => erreurApi(403, "HORS_PERIMETRE", message);

export const introuvable = (code: string, message: string): HttpException =>
  erreurApi(404, code, message);

export const conflit = (code: string, message: string): HttpException =>
  erreurApi(409, code, message);

export const invalide = (code: string, message: string): HttpException =>
  erreurApi(422, code, message);
