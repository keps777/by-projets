import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { ConventionsService } from "./conventions.service";
import { ReglementsService } from "./reglements.service";

/** Une fois par quart d'heure : le lundi 08:00 est tenu à 15 minutes près, les préavis se comptent en jours. */
const PERIODE_MS = 15 * 60_000;

/**
 * Tâches de fond de l'inter-agences. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi toutes les
 * 15 minutes dans le processus. Sur plusieurs instances, plusieurs tâches tournent : un règlement n'existe
 * qu'une fois par convention et par lundi (écriture unique) et le paiement est rejoué avec la même clé.
 */
@Injectable()
export class TachesInterAgences implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesInterAgences");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly conventions: ConventionsService,
    private readonly reglements: ReglementsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.toutExecuter().catch((e: unknown) =>
        this.logger.error(`Tâches inter-agences en échec (${(e as Error).name})`),
      );
    }, PERIODE_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Les sorties dont le préavis est écoulé prennent effet. */
  appliquerSorties(): Promise<number> {
    return this.conventions.appliquerSorties();
  }

  /** Arrête et paie les règlements du lundi 08:00. */
  reglerLeLundi(): Promise<{ arretes: number; payes: number }> {
    return this.reglements.executer();
  }

  async toutExecuter(): Promise<void> {
    await this.appliquerSorties();
    await this.reglerLeLundi();
  }
}
