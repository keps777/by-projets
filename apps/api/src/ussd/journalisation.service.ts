import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { masquerTelephone } from "../paiements/regles";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import type { OperateurUssd } from "./config";
import type { EtapeUssd, EvenementJournalUssd } from "./modeles";
import { JournalUssd } from "./ports";

export interface FaitUssd {
  operateur: OperateurUssd;
  evenement: EvenementJournalUssd;
  /** Numéro en clair : seule sa version masquée est conservée. */
  msisdn?: string | null;
  /** Clé de session (`<opérateur>:<identifiant>`) : seule son empreinte est conservée. */
  sessionCle?: string | null;
  etape?: EtapeUssd | null;
  /** Code court : `MODE_DEGRADE`, `SIEGE_PRIS`… Jamais un texte d'écran. */
  code?: string | null;
  dureeMs?: number | null;
}

/**
 * Journal des sessions USSD (« journalisation » du ticket). Il garde de quoi enquêter sur une
 * plainte (« j'ai payé et rien reçu ») sans rien conserver de personnel : numéro masqué
 * (`+237 ••••• 345`), session réduite à une empreinte, aucun texte d'écran ni réponse du voyageur.
 * Une panne du journal ne casse jamais une session : elle est signalée dans les logs et c'est tout.
 */
@Injectable()
export class JournalisationUssd {
  private readonly logger = new Logger("Ussd");

  constructor(
    private readonly journal: JournalUssd,
    private readonly chiffrement: ChiffrementService,
    private readonly horloge: Horloge,
  ) {}

  async noter(fait: FaitUssd): Promise<void> {
    try {
      await this.journal.enregistrer({
        id: randomUUID(),
        at: this.horloge.maintenant(),
        operateur: fait.operateur,
        msisdnMasque: fait.msisdn ? masquerTelephone(fait.msisdn) : null,
        sessionRef: fait.sessionCle
          ? this.chiffrement.indexAveugle(fait.sessionCle, "ussd.session-ref").slice(0, 12)
          : null,
        evenement: fait.evenement,
        etape: fait.etape ?? null,
        code: fait.code ?? null,
        dureeMs: fait.dureeMs ?? null,
      });
    } catch (e) {
      this.logger.error(
        `Journal USSD indisponible (${fait.evenement}) : ${e instanceof Error ? e.message : "erreur"}`,
      );
    }
  }
}
