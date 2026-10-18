import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CONFIG_PATRON, type ConfigPatron } from "./config";
import { ReglagesPatronService } from "./reglages.service";

/**
 * Met en vigueur les modifications de ligne programmées dont le jour est arrivé. Une minuterie appelle
 * `tick()` ; chaque application est idempotente (les listes de départs et d'arrêts sont remplacées par les
 * mêmes), donc deux instances qui tournent ensemble ne se gênent pas. Sans ce balayage, la modification
 * attendrait que le patron rouvre ses réglages.
 */
@Injectable()
export class PlanificateurLignes implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("PatronPlanificateur");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly reglages: ReglagesPatronService,
    @Inject(CONFIG_PATRON) private readonly config: ConfigPatron,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.balayageMs <= 0) return;
    this.minuterie = setInterval(() => {
      void this.tick().catch((e: unknown) =>
        this.logger.error(`Balayage : ${e instanceof Error ? e.message : "erreur"}`),
      );
    }, this.config.balayageMs);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage. Rend le nombre de lignes mises à jour. */
  async tick(): Promise<number> {
    if (this.enCours) return 0;
    this.enCours = true;
    try {
      const n = await this.reglages.balayerEchues();
      if (n > 0) this.logger.log(`${n} modification(s) de ligne mise(s) en vigueur`);
      return n;
    } finally {
      this.enCours = false;
    }
  }
}
