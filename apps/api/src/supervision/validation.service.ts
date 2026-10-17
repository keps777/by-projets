import { Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { interdit } from "../caisse/erreurs";
import type { EvenementLu, ValidationSuperviseurLue } from "../caisse/validation";
import { PreuvesPinService } from "./pin.service";

/**
 * Les deux gardes communes à toutes les écritures de la supervision :
 *
 * 1. l'auteur de l'événement est la personne connectée (on n'écrit pas au nom d'un autre) ;
 * 2. « aucune action sans le PIN d'un superviseur » : `validePar` doit être la preuve du PIN du
 *    superviseur connecté, pour CET événement (voir `PreuvesPinService`). Chaque refus est écrit dans
 *    le journal d'audit.
 */
@Injectable()
export class ValidationSuperviseurService {
  constructor(
    private readonly preuves: PreuvesPinService,
    private readonly audit: AuditService,
  ) {}

  verifierAuteur(e: EvenementLu<unknown>, u: Utilisateur): void {
    if (e.auteurId !== u.id) {
      throw interdit("AUTEUR_INCOHERENT", "L'auteur de l'événement n'est pas le compte connecté");
    }
  }

  async exiger(
    corps: unknown,
    validePar: ValidationSuperviseurLue,
    u: Utilisateur,
    type: string,
  ): Promise<void> {
    const refuser = async (code: string, message: string, cause: string) => {
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "superviseur.validation.refusee",
        resultat: "refus",
        details: { type, cause },
      });
      return interdit(code, message);
    };
    if (validePar.superviseurId !== u.id) {
      throw await refuser(
        "SUPERVISEUR_INCOHERENT",
        "La validation n'est pas celle du superviseur connecté",
        "superviseur_incoherent",
      );
    }
    if (validePar.methode !== "pin") {
      throw await refuser(
        "METHODE_NON_PRISE_EN_CHARGE",
        "Seul le PIN valide une action : l'empreinte n'est pas encore vérifiable par le serveur",
        "methode_non_prise_en_charge",
      );
    }
    if (!this.preuves.verifier(validePar, corps as Record<string, unknown>)) {
      throw await refuser(
        "PREUVE_PIN_INVALIDE",
        "Aucune action sans le PIN du superviseur : preuve absente, expirée ou ne portant pas sur cet événement",
        "preuve_invalide",
      );
    }
  }
}
