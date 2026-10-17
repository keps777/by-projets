import { Injectable } from "@nestjs/common";
import { PasserelleSmsService } from "../sms/passerelle.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import {
  ComptesUssd,
  CompteUssdInactif,
  NotifieurBilletUssd,
  type DemandeSmsBillet,
} from "./ports";

/**
 * Adaptateurs vers le reste de la plateforme : le service USSD ne parle aux comptes et aux SMS que
 * par leurs services exportés, sans rien y modifier.
 */

/**
 * Le voyageur d'un numéro de téléphone. Sa SIM l'authentifie (c'est l'opérateur qui nous donne le
 * numéro) : le compte est retrouvé, ou créé sans nom, avec le seul rôle voyageur. Le nom de ce
 * compte est vide : le billet se complète au quai si besoin (flux « billet sans nom » existant).
 */
@Injectable()
export class ComptesUssdComptes extends ComptesUssd {
  constructor(private readonly comptes: ComptesService) {
    super();
  }

  async voyageurDe(msisdn: string): Promise<Utilisateur> {
    let personne = await this.comptes.trouverParTelephone(msisdn);
    if (!personne) {
      try {
        personne = await this.comptes.creer({ nom: "", telephone: msisdn, roles: ["voyageur"] });
      } catch (e) {
        // Deux premiers appels simultanés du même numéro : l'un crée, l'autre relit.
        if (!(e instanceof TelephoneDejaUtilise)) throw e;
        personne = await this.comptes.trouverParTelephone(msisdn);
      }
    }
    if (!personne || !personne.actif) throw new CompteUssdInactif();
    return { id: personne.id, role: "voyageur", compagnieId: null, gareId: null };
  }
}

/**
 * Le SMS du billet part par la passerelle SMS (gabarit `billet` : compagnie, trajet, heure, siège,
 * code à 4 chiffres et lien). Même clé d'idempotence que le billet vendu au guichet
 * (`billet:<id>:<numéro>`) : si l'intégration branche aussi `billet.emis` sur les SMS, le voyageur ne
 * reçoit pas deux messages.
 */
@Injectable()
export class NotifieurBilletSms extends NotifieurBilletUssd {
  readonly reel = true;

  constructor(private readonly passerelle: PasserelleSmsService) {
    super();
  }

  async envoyer(demande: DemandeSmsBillet): Promise<void> {
    await this.passerelle.envoyerBillet({
      billetId: demande.billetId,
      destinataire: demande.destinataire,
      variables: demande.variables,
      compagnieId: demande.compagnieId,
      demandeurId: demande.demandeurId,
    });
  }
}
