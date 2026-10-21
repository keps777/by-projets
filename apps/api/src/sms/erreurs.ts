/** Erreurs métier de la passerelle SMS (les routes les traduisent en réponses HTTP). */

export class QuotaSmsDepasse extends Error {
  constructor(readonly portee: "demandeur" | "destinataire" | "renvois") {
    super(
      portee === "demandeur"
        ? "Trop de SMS demandés par ce compte en une heure"
        : portee === "destinataire"
          ? "Trop de SMS envoyés à ce numéro en une heure"
          : "Ce billet a déjà été renvoyé le nombre de fois autorisé",
    );
    this.name = "QuotaSmsDepasse";
  }
}

/** La file n'a pas accepté le message : il est marqué en échec, personne ne sera facturé. */
export class FileIndisponible extends Error {
  constructor() {
    super("La file d'envoi des SMS est indisponible");
    this.name = "FileIndisponible";
  }
}

export class MessageSmsIntrouvable extends Error {
  constructor() {
    super("Message SMS introuvable");
    this.name = "MessageSmsIntrouvable";
  }
}

export class AnnulationImpossible extends Error {
  constructor(readonly statut: string) {
    super(`Ce SMS ne peut plus être annulé (statut « ${statut} »)`);
    this.name = "AnnulationImpossible";
  }
}
