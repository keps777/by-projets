import {
  AgregateurPaiement,
  ErreurAgregateurTemporaire,
  NotificationInvalide,
  type NotificationAgregateur,
  type ReponseEncaissement,
  type ReponseRemboursement,
  type StatutTransaction,
} from "./agregateur";

/** Code porté par l'erreur : l'agrégateur n'est pas configuré, rien n'a été envoyé. */
export const CODE_AGREGATEUR_ABSENT = "agregateur_absent";

/**
 * Aucun agrégateur configuré (`PAIEMENTS_FOURNISSEUR=aucun`, défaut en production tant que le compte
 * n'est pas ouvert) : le module reste en mode dégradé, aucun appel ne part.
 */
export class AgregateurAbsent extends AgregateurPaiement {
  readonly nom = "aucun";
  readonly reel = false;

  private refuser(): never {
    throw new ErreurAgregateurTemporaire(CODE_AGREGATEUR_ABSENT);
  }

  async initier(): Promise<ReponseEncaissement> {
    return this.refuser();
  }

  async consulter(): Promise<StatutTransaction | null> {
    return this.refuser();
  }

  async rembourser(): Promise<ReponseRemboursement> {
    return this.refuser();
  }

  async tauxMillieme(): Promise<number | null> {
    return this.refuser();
  }

  lireNotifications(): NotificationAgregateur[] {
    throw new NotificationInvalide("signature", "Aucun agrégateur configuré");
  }
}
