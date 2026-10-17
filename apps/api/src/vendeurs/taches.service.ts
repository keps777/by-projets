import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { CommissionsService } from "./commissions.service";
import { OPTIONS_VENDEURS, type OptionsVendeurs } from "./ports";
import { VentesService } from "./ventes.service";

/**
 * Tâches de fond des vendeurs. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi
 * toutes les 15 secondes dans le processus (sans effet de bord si plusieurs instances tournent :
 * les écritures sont atomiques, les billets s'émettent par identifiant et les clés d'idempotence
 * empêchent un second versement).
 */
@Injectable()
export class TachesVendeurs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesVendeurs");
  private minuteur: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly ventes: VentesService,
    private readonly commissions: CommissionsService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(OPTIONS_VENDEURS) private readonly options: OptionsVendeurs,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test" || this.options.tachesMs === 0) return;
    this.minuteur = setInterval(() => {
      // Un passage lent n'en déclenche pas un second par-dessus.
      if (this.enCours) return;
      this.enCours = true;
      this.toutExecuter()
        .catch((e: unknown) =>
          this.logger.error(`Tâches des vendeurs en échec (${(e as Error).name})`),
        )
        .finally(() => {
          this.enCours = false;
        });
    }, this.options.tachesMs);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Conclut les ventes en route (paiement reçu, refusé ou expiré). */
  reprendreVentes() {
    return this.ventes.reprendre();
  }

  /** Le lundi à partir de 8 h, verse les commissions de la semaine. */
  verserLesCommissions() {
    return this.commissions.verserLaSemaine();
  }

  async toutExecuter() {
    return {
      ventes: await this.ventes.reprendre(),
      versements: await this.commissions.verserLaSemaine(),
      versementsRepris: await this.commissions.reprendre(),
    };
  }
}
