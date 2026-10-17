import { Injectable } from "@nestjs/common";
import { PasserelleSmsService } from "../sms/passerelle.service";
import type { TypeSms } from "../sms/types";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { SecoursIndisponible } from "./erreurs";
import {
  AnnuaireRapport,
  SecoursSms,
  type DemandeSecoursSms,
  type DestinataireRapport,
} from "./ports";

/**
 * Adaptateurs de WhatsApp qui s'appuient sur les autres modules (branchés par `AppModule`).
 */

/** Type de gabarit SMS qui correspond à chaque gabarit WhatsApp (mêmes variables, voir le README). */
const TYPE_SMS_DU_GABARIT: Readonly<Record<DemandeSecoursSms["type"], TypeSms>> = {
  billet: "billet",
  colis: "code_retrait",
  alerte_proche: "alerte_proche",
  alerte_retard: "retard",
  // Le rapport du soir n'a pas de gabarit SMS : sa ligne de repli (`texte`) part en texte système.
  rapport_soir: "systeme",
};

/**
 * Repli par SMS : un message que WhatsApp ne remet pas part par la passerelle SMS (AM-166), avec la même
 * clé d'idempotence (le même repli demandé deux fois n'envoie qu'un SMS). Les variables sont celles du
 * gabarit WhatsApp, déjà validées ; la passerelle SMS les valide à son tour avec son gabarit.
 */
@Injectable()
export class SecoursSmsPasserelle extends SecoursSms {
  readonly branche = true;

  constructor(private readonly sms: PasserelleSmsService) {
    super();
  }

  async envoyer(demande: DemandeSecoursSms): Promise<{ messageId: string }> {
    const type = TYPE_SMS_DU_GABARIT[demande.type];
    try {
      const { message } = await this.sms.envoyer({
        type,
        variables: type === "systeme" ? { texte: demande.texte } : demande.variables,
        destinataire: demande.destinataire,
        cle: demande.cle,
        compagnieId: demande.compagnieId,
        ...(demande.reference ? { reference: demande.reference } : {}),
        urgent: true,
      } as Parameters<PasserelleSmsService["envoyer"]>[0]);
      return { messageId: message.id };
    } catch (e) {
      // Variables refusées, quota ou file indisponible : WhatsApp note l'échec du repli (`echec_sms`).
      throw new SecoursIndisponible(`SMS de repli refusé (${(e as Error).name})`);
    }
  }
}

/**
 * Qui reçoit le rapport de 21 h : le patron et les superviseurs actifs de la compagnie (table
 * `personne`), numéro déchiffré. Le patron passe en premier ; une personne qui cumule les deux rôles
 * n'est servie qu'une fois, comme patron.
 */
@Injectable()
export class AnnuaireRapportPersonnes extends AnnuaireRapport {
  readonly reel = true;

  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
  ) {
    super();
  }

  async destinataires(compagnieId: string): Promise<DestinataireRapport[]> {
    const personnes = await this.personnes.listerActifsParRoles(compagnieId, [
      "patron",
      "superviseur",
    ]);
    const destinataires = personnes.map(
      (p): DestinataireRapport => ({
        personneId: p.id,
        nom: p.nom,
        role: p.roles.includes("patron") ? "patron" : "superviseur",
        telephone: this.comptes.telephoneEnClair(p),
      }),
    );
    // Patron d'abord, puis superviseurs ; l'ordre d'origine (création) est gardé à rôle égal.
    return destinataires.sort((a, b) => Number(b.role === "patron") - Number(a.role === "patron"));
  }
}
