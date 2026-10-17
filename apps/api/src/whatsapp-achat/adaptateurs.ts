import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository, TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import { FenetreFermee } from "../whatsapp/erreurs";
import { PasserelleWhatsAppService } from "../whatsapp/passerelle.service";
import {
  ComptesAchat,
  CompteAchatInactif,
  EnvoiAchatImpossible,
  MessagerieAchat,
  type MessageAchat,
} from "./ports";

/**
 * Adaptateurs vers le reste de la plateforme : l'achat par WhatsApp ne parle aux comptes et à la
 * passerelle WhatsApp que par leurs services exportés, sans rien y modifier.
 */

/**
 * Le voyageur d'un numéro WhatsApp. Le numéro est authentifié par WhatsApp (le webhook est signé) :
 * le compte est retrouvé, ou créé sans nom, avec le seul rôle voyageur. Le nom de ce compte est
 * vide : le billet se complète au quai si besoin (flux « billet sans nom » existant).
 */
@Injectable()
export class ComptesAchatComptes extends ComptesAchat {
  constructor(
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesRepository,
  ) {
    super();
  }

  async voyageurDe(msisdn: string): Promise<Utilisateur> {
    let personne = await this.comptes.trouverParTelephone(msisdn);
    if (!personne) {
      try {
        personne = await this.comptes.creer({ nom: "", telephone: msisdn, roles: ["voyageur"] });
      } catch (e) {
        // Deux premiers messages simultanés du même numéro : l'un crée, l'autre relit.
        if (!(e instanceof TelephoneDejaUtilise)) throw e;
        personne = await this.comptes.trouverParTelephone(msisdn);
      }
    }
    if (!personne || !personne.actif) throw new CompteAchatInactif();
    return { id: personne.id, role: "voyageur", compagnieId: null, gareId: null };
  }

  async prenomDe(voyageurId: string): Promise<string | null> {
    const personne = await this.personnes.trouverParId(voyageurId);
    const prenom = personne?.nom.trim().split(/\s+/)[0] ?? "";
    return prenom === "" ? null : prenom;
  }
}

/**
 * Envoi par la passerelle WhatsApp (AM-167) : `repondre` pour le texte libre, permis dans les 24
 * heures qui suivent le message du voyageur. Le billet payé, lui, a un repli : si la fenêtre est
 * fermée (paiement confirmé très tard), il part par le gabarit approuvé « billet », lui-même repris
 * par SMS si WhatsApp ne le remet pas.
 *
 * La passerelle est retrouvée au moment de l'envoi, pas à la construction : `WhatsAppModule` peut
 * être monté n'importe où dans l'application (avec ses adaptateurs de production) sans que ce module
 * l'importe une seconde fois ; deux instances de la passerelle enverraient chacune leur file.
 */
@Injectable()
export class MessagerieAchatPasserelle extends MessagerieAchat {
  readonly reel = true;
  private readonly logger = new Logger("WhatsAppAchat");

  constructor(private readonly module: ModuleRef) {
    super();
  }

  /** La passerelle est-elle montée dans l'application ? (vérifié au démarrage en production) */
  disponible(): boolean {
    try {
      this.passerelle();
      return true;
    } catch {
      return false;
    }
  }

  private passerelle(): PasserelleWhatsAppService {
    return this.module.get(PasserelleWhatsAppService, { strict: false });
  }

  async envoyer(message: MessageAchat): Promise<void> {
    const passerelle = this.passerelle();
    try {
      await passerelle.repondre({
        destinataire: message.destinataire,
        texte: message.texte,
        cle: message.cle,
        compagnieId: message.compagnieId ?? null,
      });
    } catch (e) {
      if (e instanceof FenetreFermee && !message.billet) {
        throw new EnvoiAchatImpossible("FENETRE_FERMEE");
      }
      if (!(e instanceof FenetreFermee) || !message.billet) throw e;
      this.logger.warn("Fenêtre de 24 h fermée : le billet part par le gabarit « billet »");
      await passerelle.envoyer({
        type: "billet",
        variables: message.billet.variables,
        destinataire: message.destinataire,
        cle: `${message.cle}:gabarit`,
        reference: { type: "billet", id: message.billet.billetId },
        compagnieId: message.compagnieId ?? null,
        demandeurId: message.billet.demandeurId,
      });
    }
  }
}
