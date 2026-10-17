import { HttpException } from "@nestjs/common";
import { TransitionInterdite } from "./regles";

/**
 * Erreur métier des colis. Le corps est `{ code, message, details? }`, ce que lit le client d'API
 * (`ErreurHttp.code`, `ErreurHttp.details`). Jamais de code de retrait dans un message ou un détail.
 *
 * Codes en minuscules pour les routes du voyageur (comme le mock de `@afrimove/api-client`),
 * en majuscules pour celles de l'agence (comme le README des contrats de l'agence).
 */
export class ErreurColis extends HttpException {
  constructor(
    statut: number,
    readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, statut);
  }
}

export const colisIntrouvable = (): ErreurColis =>
  new ErreurColis(404, "colis_introuvable", "Colis introuvable");

export const colisInconnuAgence = (): ErreurColis =>
  new ErreurColis(404, "COLIS_INCONNU", "Aucun colis ne correspond");

export const departIntrouvable = (): ErreurColis =>
  new ErreurColis(404, "depart_introuvable", "Départ introuvable");

export const transitionInterdite = (e: TransitionInterdite): ErreurColis =>
  new ErreurColis(409, "TRANSITION_INTERDITE", e.message, { etat: e.de, action: e.action });

export const requeteInvalide = (
  message: string,
  details?: readonly { chemin: string; message: string }[],
): ErreurColis => new ErreurColis(400, "REQUETE_INVALIDE", message, details);

/** Le code de retrait est faux : il reste `essaisRestants` essais. Le code saisi n'est pas répété. */
export const codeInvalide = (essaisRestants: number): ErreurColis =>
  new ErreurColis(422, "code_invalide", "Code de retrait invalide", { essaisRestants });

/** Trois essais faux : le colis est bloqué, même avec le bon code ensuite. */
export const codeBloque = (): ErreurColis =>
  new ErreurColis(
    423,
    "code_bloque",
    "Trop d'essais : le colis est bloqué, un superviseur doit le débloquer",
  );
