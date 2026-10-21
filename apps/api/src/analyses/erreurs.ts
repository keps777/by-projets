import { HttpException } from "@nestjs/common";

/** Erreur HTTP au format de l'API : `{ code, message }` (le client lit `code`). */
export function erreurApi(statut: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: statut, code, message }, statut);
}

export const requeteInvalide = (message: string): HttpException =>
  erreurApi(400, "REQUETE_INVALIDE", message);
