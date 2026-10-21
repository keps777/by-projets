import { HttpException } from "@nestjs/common";

/**
 * Un refus métier : un statut HTTP, un code stable (lu par l'application) et un message en français.
 * Le corps JSON est `{ code, message, details? }`, ce que lit l'adaptateur HTTP du client d'API.
 *
 * Codes des contrats : 409 `SIEGE_PRIS`, 422 `PAIEMENT_INVALIDE`, 403 `SUPERVISEUR_REQUIS`,
 * 409 `TRANSITION_INTERDITE`, 404 pour une ressource inconnue.
 */
export class Refus extends HttpException {
  constructor(
    statut: number,
    readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, statut);
  }
}

export const inconnu = (code: string, message: string): Refus => new Refus(404, code, message);
export const conflit = (code: string, message: string, details?: unknown): Refus =>
  new Refus(409, code, message, details);
export const invalide = (code: string, message: string, details?: unknown): Refus =>
  new Refus(422, code, message, details);
export const interdit = (code: string, message: string): Refus => new Refus(403, code, message);

export class PlageEpuisee extends Error {
  constructor(readonly plage: { debut: number; fin: number }) {
    super(`Plage de numéros épuisée (${plage.debut}–${plage.fin}) : demander une nouvelle plage`);
    this.name = "PlageEpuisee";
  }
}
