import { HttpException, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { VerificateurSignature } from "../modules/signature";
import { agenceRequise } from "./erreurs";
import type { SignaturePin } from "./validation";
import { versIsoDouala } from "./temps";

/** L'agence du patron connecté ; un compte sans agence n'a pas de financement. */
export function agenceDe(utilisateur: Utilisateur): string {
  if (utilisateur.compagnieId === null) throw agenceRequise();
  return utilisateur.compagnieId;
}

/** Ce qu'une écriture signée renvoie en plus de sa réponse : l'accusé du journal (`AccuseSigne`). */
export interface AccuseSigne {
  journalId: string;
  signeA: string;
  signePar: string;
}

export interface ResultatEcriture<T> {
  reponse: T;
  /** Ce que l'écriture a touché, pour le journal. */
  cible?: { type: string; id: string };
  /** Données utiles à l'enquête (jamais de PIN, de numéro de téléphone ni de salaire individuel). */
  details?: Record<string, unknown>;
}

/**
 * Toute écriture du patron est signée par son PIN, vérifiée par le même contrôleur que les modules
 * (3 essais puis 15 minutes de blocage, signature de moins de 10 minutes), puis datée, signée et ajoutée
 * au journal d'audit. Une demande refusée, quelle qu'en soit la raison, entre aussi au journal.
 */
@Injectable()
export class EcrituresSignees {
  constructor(
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  async executer<T extends object>(
    utilisateur: Utilisateur,
    action: string,
    demande: Record<string, unknown>,
    signature: SignaturePin,
    travail: () => Promise<ResultatEcriture<T>>,
  ): Promise<T & AccuseSigne> {
    const acteur = {
      id: utilisateur.id,
      role: utilisateur.role,
      compagnieId: utilisateur.compagnieId,
    };
    let resultat: ResultatEcriture<T>;
    try {
      await this.signature.verifier(utilisateur, signature);
      resultat = await travail();
    } catch (e) {
      if (e instanceof HttpException) {
        const reponse = e.getResponse();
        const cause =
          typeof reponse === "object" && reponse !== null && "code" in reponse
            ? String((reponse as { code: unknown }).code)
            : "erreur";
        await this.audit.enregistrer({
          acteur,
          action,
          resultat: "refus",
          details: { ...demande, cause },
        });
      }
      throw e;
    }
    const ligne = await this.audit.enregistrer({
      acteur,
      action,
      resultat: "succes",
      cible: resultat.cible ?? null,
      details: { ...demande, ...resultat.details },
    });
    return {
      journalId: ligne.id,
      signeA: versIsoDouala(this.horloge.maintenant()),
      signePar: utilisateur.id,
      ...resultat.reponse,
    };
  }
}

/** SMS au patron qui a fait la demande. Une panne de SMS est notée, jamais propagée. */
@Injectable()
export class PrevenirPatron {
  private readonly logger = new Logger("PrevenirPatron");

  constructor(
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
    private readonly sms: SmsGateway,
  ) {}

  async envoyer(personneId: string, message: string): Promise<void> {
    try {
      const personne = await this.personnes.trouverParId(personneId);
      if (!personne) return;
      await this.sms.envoyer(this.comptes.telephoneEnClair(personne), message);
    } catch (e) {
      this.logger.warn(`SMS non envoyé (${(e as Error).name})`);
    }
  }
}
