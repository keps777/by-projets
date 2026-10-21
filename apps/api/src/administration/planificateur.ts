import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CONFIG_ADMINISTRATION, type ConfigAdministration } from "./config";
import { LignesService } from "./lignes.service";

/**
 * Met en vigueur les modifications de ligne programmées dont le jour est arrivé. Une minuterie appelle
 * `tick()` ; chaque application est idempotente (le brouillon disparaît quand il est appliqué), donc deux
 * instances qui tournent ensemble ne se gênent pas. Sans ce balayage, la modification attendrait que le patron
 * rouvre la ligne ou que les départs soient générés (`LignesService.appliquerSiEchu`).
 */
@Injectable()
export class PlanificateurLignes implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("AdministrationPlanificateur");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly lignes: LignesService,
    @Inject(CONFIG_ADMINISTRATION) private readonly config: ConfigAdministration,
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
      const n = await this.lignes.balayerEchues();
      if (n > 0) this.logger.log(`${n} modification(s) de ligne mise(s) en vigueur`);
      return n;
    } finally {
      this.enCours = false;
    }
  }
}
