import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { CabinetService } from "./cabinet.service";
import { RapprochementService } from "./rapprochement.service";

/** Une fois par quart d'heure : assez pour l'envoi du 2 (rattrapage sur trois jours) et la reprise des opérations. */
const PERIODE_MS = 15 * 60_000;

/**
 * Tâches de fond du comptable. Chacune est idempotente et peut être lancée à la main (tests, administration) ou
 * par une planification externe ; hors tests, le module les lance aussi toutes les 15 minutes dans le processus
 * (sans danger avec plusieurs instances : les clés d'idempotence empêchent un second remboursement ou un
 * second message).
 */
@Injectable()
export class TachesComptable implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesComptable");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly cabinet: CabinetService,
    private readonly rapprochement: RapprochementService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.toutExecuter().catch((e: unknown) =>
        this.logger.error(`Tâches du comptable en échec (${(e as Error).name})`),
      );
    }, PERIODE_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Envoie au cabinet les exports du mois écoulé, le jour réglé (le 2). */
  envoyerAuCabinet(): Promise<number> {
    return this.cabinet.envoyerAutomatiques();
  }

  /** Reprend les envois de clôture demandés mais pas encore partis ou confirmés. */
  reprendreEnvois(): Promise<number> {
    return this.cabinet.reprendreClotures();
  }

  /** Rejoue les remboursements, rattachements et réclamations dont le résultat était inconnu. */
  reprendreDecisions(): Promise<number> {
    return this.rapprochement.reprendre();
  }

  async toutExecuter(): Promise<void> {
    await this.reprendreDecisions();
    await this.reprendreEnvois();
    await this.envoyerAuCabinet();
  }
}
