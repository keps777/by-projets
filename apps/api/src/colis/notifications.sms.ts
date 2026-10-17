import { Injectable } from "@nestjs/common";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { NotificationsColis, type EvenementNotification } from "./ports";

/** Ce que l'expéditeur lit à chaque étape (« AfriMove : votre colis C-DLA-270105-0017 … »). */
export const PHRASE_EXPEDITEUR: Readonly<Record<EvenementNotification, string>> = {
  depose: "est bien déposé",
  charge: "est chargé dans le bus",
  en_route: "est en route",
  decharge: "est arrivé à destination",
  disponible: "est disponible au retrait",
  en_relais: "est arrivé au point relais",
  en_livraison: "est en cours de livraison",
  livre: "a été livré",
  remis: "a été remis au destinataire",
  non_retire: "n'a pas été retiré dans les 7 jours",
  retourne: "vous est retourné",
  perdu: "est signalé perdu",
  litige: "fait l'objet d'un litige",
};

export const PHRASE_DESTINATAIRE: Readonly<
  Record<"disponible" | "en_relais" | "non_retire", string>
> = {
  disponible: "est disponible au retrait",
  en_relais: "vous attend au point relais",
  non_retire: "n'a pas été retiré dans les 7 jours et va être retourné",
};

/**
 * Messages par SMS (`SmsGateway` du socle). WhatsApp n'a pas de fournisseur pour l'instant : un
 * envoi demandé par WhatsApp part par SMS, et l'accusé le dit (`sms`).
 */
@Injectable()
export class NotificationsColisSms extends NotificationsColis {
  constructor(private readonly sms: SmsGateway) {
    super();
  }

  async envoyerCodeDestinataire(message: {
    telephone: string;
    expediteurNom: string;
    numeroColis: string;
    code: string;
  }): Promise<"sms"> {
    await this.sms.envoyer(
      message.telephone,
      `AfriMove : ${message.expediteurNom} vous envoie le colis ${message.numeroColis}. ` +
        `Code de retrait : ${message.code}. Ne le donnez qu'au moment de la remise, ` +
        "avec votre pièce d'identité.",
    );
    return "sms";
  }

  async notifierExpediteur(message: {
    telephone: string;
    numeroColis: string;
    evenement: EvenementNotification;
  }): Promise<void> {
    await this.sms.envoyer(
      message.telephone,
      `AfriMove : votre colis ${message.numeroColis} ${PHRASE_EXPEDITEUR[message.evenement]}.`,
    );
  }

  async notifierDestinataire(message: {
    telephone: string;
    numeroColis: string;
    evenement: "disponible" | "en_relais" | "non_retire";
    lieu: string;
  }): Promise<void> {
    await this.sms.envoyer(
      message.telephone,
      `AfriMove : le colis ${message.numeroColis} ${PHRASE_DESTINATAIRE[message.evenement]} : ` +
        `${message.lieu}. Munissez-vous de votre pièce d'identité et du code de retrait.`,
    );
  }
}
