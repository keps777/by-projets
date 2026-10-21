/**
 * Jeton d'accès de l'adaptateur HTTP (recette AM-181).
 *
 * Constat de la recette : `creerClientDepuisEnvironnement` créait le client HTTP sans `obtenirJeton`, donc
 * aucune requête de l'application n'emportait `Authorization: Bearer` et l'API répondait 401 à tout ce qui
 * n'est pas public. Tant que l'écran de connexion des agents n'existe pas, le jeton émis par
 * `POST /auth/guichet/connexion` (ou `/auth/direction/verification`) est déposé dans le stockage local de
 * l'appareil sous cette clé (par l'installation de l'appareil ou, en recette, par le banc), et le client le
 * relit à chaque requête, donc après une reconnexion aussi.
 */
export const CLE_JETON = "afrimove.jeton";

type Stockage = Pick<Storage, "getItem">;

/** Le jeton gardé sur l'appareil, ou `null` (stockage absent, bloqué ou vide). Ne lève jamais. */
export function jetonDepuisStockage(stockage?: Stockage): string | null {
  try {
    const source = stockage ?? (globalThis as { localStorage?: Stockage }).localStorage;
    const jeton = source?.getItem(CLE_JETON);
    return jeton && jeton.length > 0 ? jeton : null;
  } catch {
    return null;
  }
}
