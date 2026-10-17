import { Injectable } from "@nestjs/common";
import { SourceRapportSoir, type CompagnieRapport } from "../whatsapp/ports";
import type { RapportSoirEntree } from "../whatsapp/rapport";
import { ReferentielRapport } from "./ports";
import { RapportSoirService } from "./rapport.service";

/**
 * Le rapport du soir tel que la passerelle WhatsApp (AM-167) le lit : c'est le rapport arrêté par
 * ce module, celui que le patron relit aussi dans l'application. `RapportSoir` est accepté tel quel
 * comme `RapportSoirEntree` (un test de parité le vérifie avec le contrat).
 *
 * Branchement : `WhatsAppModule.avec({ imports: [RapportModule], providers: [{ provide:
 * SourceRapportSoir, useExisting: SourceRapportSoirPourWhatsApp }] })`.
 *
 * Quand le planificateur de la passerelle passe à 21:00, `rapport()` arrête le rapport s'il ne
 * l'est pas encore : l'envoi ne dépend donc ni de l'ordre des planificateurs, ni de la validation
 * des caisses.
 */
@Injectable()
export class SourceRapportSoirPourWhatsApp extends SourceRapportSoir {
  readonly reel = true;

  constructor(
    private readonly referentiel: ReferentielRapport,
    private readonly rapports: RapportSoirService,
  ) {
    super();
  }

  compagnies(): Promise<CompagnieRapport[]> {
    return this.referentiel.compagnies();
  }

  compagnie(id: string): Promise<CompagnieRapport | null> {
    return this.referentiel.compagnie(id);
  }

  rapport(compagnieId: string, jour: string): Promise<RapportSoirEntree | null> {
    return this.rapports.pourEnvoi(compagnieId, jour);
  }
}
