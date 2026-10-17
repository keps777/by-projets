import { Injectable, Logger } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { SmsGateway } from "../socle/sms/sms.gateway";

export interface Contact {
  id: string;
  nom: string;
  telephone: string;
}

/**
 * Qui est cette personne et comment la joindre : nom et téléphone en clair d'un compte, et envoi
 * d'un SMS qui ne bloque jamais le déroulé (une panne de SMS est notée, pas propagée).
 */
@Injectable()
export class AnnuairePersonnes {
  private readonly logger = new Logger("AnnuairePersonnes");

  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
    private readonly sms: SmsGateway,
  ) {}

  async contact(personneId: string): Promise<Contact> {
    const personne = await this.personnes.trouverParId(personneId);
    if (!personne) throw new ErreurColis(404, "compte_introuvable", "Compte introuvable");
    return {
      id: personne.id,
      nom: personne.nom,
      telephone: this.comptes.telephoneEnClair(personne),
    };
  }

  /** Envoie le SMS ; renvoie `false` (sans lever d'erreur) si le fournisseur est en panne. */
  async prevenir(telephone: string, message: string): Promise<boolean> {
    try {
      await this.sms.envoyer(telephone, message);
      return true;
    } catch (e) {
      this.logger.warn(`SMS non envoyé (${(e as Error).name})`);
      return false;
    }
  }
}
