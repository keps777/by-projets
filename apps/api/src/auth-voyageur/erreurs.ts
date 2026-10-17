import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Un refus métier : un statut HTTP, un code stable (lu par l'application) et un message en français.
 * Le corps JSON est `{ code, message, details? }`, ce que lit l'adaptateur HTTP du client d'API.
 *
 * Codes de ces routes :
 *  - 400 `REQUETE_INVALIDE` : corps mal formé (numéro, code de 4 chiffres) ;
 *  - 401 `CODE_INVALIDE` (`details.essaisRestants`) et `CODE_EXPIRE` ;
 *  - 422 `CANAL_INDISPONIBLE`, `NUMERO_NON_AUTORISE` ;
 *  - 429 `TROP_ESSAIS`, `ENVOI_TROP_RAPPROCHE`, `TROP_DE_DEMANDES` (avec l'en-tête `Retry-After`) ;
 *  - 503 `ENVOI_IMPOSSIBLE`.
 */
export class Refus extends HttpException {
  constructor(
    statut: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, statut);
  }
}

/** 429 avec l'attente exacte : le filtre du contrôleur la copie dans l'en-tête `Retry-After`. */
export class ReessayerPlusTard extends Refus {
  /** Secondes à attendre (arrondies au-dessus, au moins 1). */
  readonly attenteSecondes: number;

  constructor(
    code: string,
    message: string,
    attenteSecondes: number,
    details: Record<string, unknown> = {},
  ) {
    const attente = Math.max(1, Math.ceil(attenteSecondes));
    super(HttpStatus.TOO_MANY_REQUESTS, code, message, {
      ...details,
      reessayerDansSecondes: attente,
    });
    this.attenteSecondes = attente;
  }
}

/** Le canal demandé ne peut pas porter le code (WhatsApp non branché, passerelle indisponible). */
export class CanalIndisponible extends Error {
  constructor(
    readonly canal: "sms" | "whatsapp",
    options?: { cause?: unknown },
  ) {
    super(`Le canal « ${canal} » est indisponible`, options);
    this.name = "CanalIndisponible";
  }
}

/** Toutes les erreurs de configuration d'un coup, sans afficher de secret. */
export class ConfigAuthVoyageurInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration de l'authentification voyageur invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigAuthVoyageurInvalide";
  }
}
