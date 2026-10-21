import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { GestionnaireEntrants, type EntrantRecu } from "../whatsapp/ports";
import { ConversationAchatService } from "./conversation.service";
import type { EntrantAchat } from "./modeles";
import { ReconnaissanceEquipe } from "./ports";

/**
 * Jeton d'un gestionnaire à qui passer les messages qui ne concernent pas l'achat de billets
 * (l'assistant du rapport du soir, par exemple). Facultatif : sans lui, ces messages reçoivent une
 * phrase d'orientation (« Écris « billet » et ton trajet »).
 */
export const GESTIONNAIRE_SUIVANT = Symbol("GESTIONNAIRE_SUIVANT");

/**
 * Branche l'achat sur la passerelle WhatsApp : c'est le `GestionnaireEntrants` que la passerelle
 * appelle pour chaque message reçu (webhook signé). Le coordinateur le déclare à la place de celui
 * par défaut (README) ; il ne lève jamais, la passerelle ne ferait de toute façon qu'enregistrer
 * l'erreur.
 *
 * Qui reçoit quoi :
 *  - un numéro de l'équipe (patron, superviseur) va à l'assistant, pas à l'achat ;
 *  - tout autre numéro : une conversation en cours, une demande de billet, une salutation, un vocal
 *    vont à l'achat ;
 *  - le reste (« Pourquoi le 09:30 part si vide ? ») va à l'assistant s'il y en a un, sinon reçoit
 *    la phrase d'orientation.
 */
@Injectable()
export class GestionnaireEntrantsAchat extends GestionnaireEntrants {
  private readonly logger = new Logger("WhatsAppAchat");

  constructor(
    private readonly conversation: ConversationAchatService,
    private readonly equipe: ReconnaissanceEquipe,
    @Optional()
    @Inject(GESTIONNAIRE_SUIVANT)
    private readonly suivant: GestionnaireEntrants | null,
  ) {
    super();
  }

  async traiter(entrant: EntrantRecu): Promise<void> {
    try {
      if (await this.equipe.estEquipe(entrant.de)) {
        await this.suivant?.traiter(entrant);
        return;
      }
      const resultat = await this.conversation.traiter(entrant as EntrantAchat);
      if (resultat === "ignore") {
        if (this.suivant) await this.suivant.traiter(entrant);
        else await this.conversation.repondreHorsSujet(entrant as EntrantAchat);
      }
    } catch (e) {
      // Le message est enregistré par la passerelle : rejouer le webhook n'y changerait rien.
      this.logger.error(
        `Message ${entrant.id} : l'achat a échoué (${e instanceof Error ? e.name : "erreur"})`,
      );
    }
  }
}
