import { HttpException } from "@nestjs/common";

/**
 * Erreur métier du financement. Le corps est `{ code, message, details? }`, ce que lit le client d'API
 * (`ErreurHttp.code`). Les codes en majuscules sont ceux du mock de `@afrimove/api-client`
 * (`DOSSIER_INCONNU`, `DOSSIER_NON_RETIRABLE`, `AU_DESSUS_DU_PLAFOND`, `PIN_REQUIS`, `PIN_INCORRECT`,
 * `COMMANDE_INVALIDE`) pour que l'écran réagisse pareil aux deux adaptateurs. Jamais de PIN, de numéro de
 * téléphone ni de montant de salaire individuel dans un message.
 */
export class ErreurFinancement extends HttpException {
  constructor(
    statut: number,
    readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super(
      { statusCode: statut, code, message, ...(details !== undefined ? { details } : {}) },
      statut,
    );
  }
}

export const agenceRequise = (): ErreurFinancement =>
  new ErreurFinancement(403, "AGENCE_REQUISE", "Ce compte n'est rattaché à aucune agence");

export const dossierInconnu = (): ErreurFinancement =>
  new ErreurFinancement(404, "DOSSIER_INCONNU", "Dossier de financement introuvable");

export const dossierNonRetirable = (): ErreurFinancement =>
  new ErreurFinancement(
    409,
    "DOSSIER_NON_RETIRABLE",
    "Le dossier ne peut plus être retiré : le partenaire a déjà répondu",
  );

export const commandeInvalide = (
  message: string,
  details?: readonly { chemin: string; message: string }[],
): ErreurFinancement => new ErreurFinancement(422, "COMMANDE_INVALIDE", message, details);

export const pinRequis = (): ErreurFinancement =>
  new ErreurFinancement(401, "PIN_REQUIS", "Signature PIN requise pour cette opération");

export const partenaireIndisponible = (): ErreurFinancement =>
  new ErreurFinancement(
    503,
    "PARTENAIRE_INDISPONIBLE",
    "Le partenaire financier ne répond pas, réessaie dans un instant",
  );
