import { HttpException } from "@nestjs/common";

/**
 * Un refus métier : un statut HTTP, un code stable (lu par l'application) et un message en français.
 * Le corps JSON est `{ code, message, details? }`, ce que lit l'adaptateur HTTP du client d'API.
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
export const interdit = (code: string, message: string): Refus => new Refus(403, code, message);
