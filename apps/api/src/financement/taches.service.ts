import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { FinancementService } from "./financement.service";
import { PaieService } from "./paie.service";
import { DossiersFinancement } from "./ports";
import { PrelevementsService } from "./prelevements.service";

/** Une fois par quart d'heure : suffisant pour un délai de réponse de 24 h. */
const PERIODE_MS = 15 * 60_000;

/**
 * Tâches de fond du financement. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi toutes
 * les 15 minutes dans le processus (sans effet de bord si plusieurs instances tournent : les écritures
 * sont atomiques et les clés d'idempotence empêchent un second versement ou prélèvement).
 */
@Injectable()
export class TachesFinancement implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesFinancement");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly financement: FinancementService,
    private readonly prelevements: PrelevementsService,
    private readonly paie: PaieService,
    private readonly dossiers: DossiersFinancement,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.toutExecuter().catch((e: unknown) =>
        this.logger.error(`Tâches du financement en échec (${(e as Error).name})`),
      );
    }, PERIODE_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  /** Renvoie les dossiers que le partenaire n'a pas accusés. */
  async rejouerTransmissions(): Promise<number> {
    let transmis = 0;
    for (const dossier of await this.dossiers.nonTransmis()) {
      const apres = await this.financement.transmettre(dossier);
      if (apres.accuseA !== null) transmis += 1;
    }
    return transmis;
  }

  /** Demande au partenaire où en sont les dossiers en analyse (une notification a pu se perdre). */
  async interrogerPartenaire(): Promise<void> {
    for (const dossier of await this.dossiers.enAnalyse()) {
      await this.financement.rattraper(dossier);
    }
  }

  async toutExecuter(): Promise<void> {
    await this.rejouerTransmissions();
    await this.interrogerPartenaire();
    await this.prelevements.rejouerEnAttente();
    await this.paie.rattraper();
  }
}
