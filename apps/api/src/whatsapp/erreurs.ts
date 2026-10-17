/** Erreurs métier de la passerelle WhatsApp (les routes les traduisent en réponses HTTP). */

export class QuotaWhatsAppDepasse extends Error {
  constructor(readonly portee: "demandeur" | "destinataire") {
    super(
      portee === "demandeur"
        ? "Trop de messages WhatsApp demandés par ce compte en une heure"
        : "Trop de messages WhatsApp envoyés à ce numéro en une heure",
    );
    this.name = "QuotaWhatsAppDepasse";
  }
}

/** La file n'a pas accepté le message : il est marqué en échec. */
export class FileWhatsAppIndisponible extends Error {
  constructor() {
    super("La file d'envoi WhatsApp est indisponible");
    this.name = "FileWhatsAppIndisponible";
  }
}

export class MessageWhatsAppIntrouvable extends Error {
  constructor() {
    super("Message WhatsApp introuvable");
    this.name = "MessageWhatsAppIntrouvable";
  }
}

export class AnnulationImpossible extends Error {
  constructor(readonly statut: string) {
    super(`Ce message ne peut plus être annulé (statut « ${statut} »)`);
    this.name = "AnnulationImpossible";
  }
}

/** Texte libre refusé : la personne n'a pas écrit depuis 24 h, seul un gabarit approuvé est permis. */
export class FenetreFermee extends Error {
  constructor() {
    super(
      "La personne n'a pas écrit depuis 24 heures : WhatsApp n'autorise qu'un gabarit approuvé",
    );
    this.name = "FenetreFermee";
  }
}

/** Le rapport du soir ne peut pas être produit (données absentes pour ce jour). */
export class RapportIndisponible extends Error {
  constructor(
    readonly compagnieId: string,
    readonly jour: string,
  ) {
    super(`Pas de rapport du soir pour le ${jour}`);
    this.name = "RapportIndisponible";
  }
}

/** Ni patron ni superviseur avec un numéro à qui envoyer le rapport. */
export class AucunDestinataire extends Error {
  constructor(readonly compagnieId: string) {
    super("Aucun destinataire pour le rapport du soir de cette compagnie");
    this.name = "AucunDestinataire";
  }
}

/** Le canal de repli par SMS n'est pas branché ou n'a pas pu prendre le message. */
export class SecoursIndisponible extends Error {
  constructor(message = "Le repli par SMS n'est pas branché") {
    super(message);
    this.name = "SecoursIndisponible";
  }
}
