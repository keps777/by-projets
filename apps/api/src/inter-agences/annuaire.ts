import { Injectable, Logger } from "@nestjs/common";
import type { SignaturePin } from "../modules/commande";
import { VerificateurSignature } from "../modules/signature";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { SignaturesPatron } from "./ports";

export interface Contact {
  id: string;
  nom: string;
  telephone: string;
}

/**
 * Qui dirige la compagnie et comment le joindre : le patron actif d'une compagnie (nom et téléphone en
 * clair), et l'envoi d'un SMS qui ne bloque jamais le déroulé (une panne de SMS est notée, pas propagée).
 */
@Injectable()
export class AnnuairePatrons {
  private readonly logger = new Logger("AnnuairePatrons");

  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
    private readonly sms: SmsGateway,
  ) {}

  /** Les patrons actifs de la compagnie. */
  async patrons(compagnieId: string): Promise<Contact[]> {
    const liste = await this.personnes.listerActifsParRoles(compagnieId, ["patron"]);
    return liste.map((p) => ({
      id: p.id,
      nom: p.nom,
      telephone: this.comptes.telephoneEnClair(p),
    }));
  }

  /** Le nom d'un compte (le signataire d'une convention), ou `null` s'il n'existe plus. */
  async nom(personneId: string): Promise<string | null> {
    return (await this.personnes.trouverParId(personneId))?.nom ?? null;
  }

  /** Prévient les patrons de la compagnie, un SMS chacun. Renvoie le nombre de SMS partis. */
  async prevenirPatrons(compagnieId: string, message: string): Promise<number> {
    let partis = 0;
    for (const patron of await this.patrons(compagnieId)) {
      if (await this.prevenir(patron.telephone, message)) partis += 1;
    }
    return partis;
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

/** Le PIN du compte connecté, vérifié comme à la connexion (compteurs d'essais et blocage compris). */
@Injectable()
export class SignaturesPatronParPin extends SignaturesPatron {
  constructor(private readonly verificateur: VerificateurSignature) {
    super();
  }

  verifier(utilisateur: Utilisateur, signature: SignaturePin): Promise<void> {
    return this.verificateur.verifier(utilisateur, signature);
  }
}
