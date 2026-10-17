import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CommandesService } from "./commandes.service";
import { OPTIONS_BILLETTERIE, type OptionsBilletterie } from "./passerelle";
import { SiegesService } from "./sieges.service";

/**
 * Balayage périodique : les blocages de 15 minutes dont la fin est passée et les commandes jamais
 * payées redonnent leurs sièges à la vente (et les spectateurs le voient en temps réel).
 * Le plan reste juste même sans balayage (un blocage échu ne compte plus), le balayage sert à
 * la diffusion et au ménage.
 */
@Injectable()
export class BalayageBilletterie implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("BalayageBilletterie");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly sieges: SiegesService,
    private readonly commandes: CommandesService,
    @Inject(OPTIONS_BILLETTERIE) private readonly options: OptionsBilletterie,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.balayageMs <= 0) return;
    this.minuterie = setInterval(() => void this.balayer(), this.options.balayageMs);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage ; deux passages ne se chevauchent jamais. */
  async balayer(): Promise<{ blocagesLeves: number; commandesExpirees: number }> {
    if (this.enCours) return { blocagesLeves: 0, commandesExpirees: 0 };
    this.enCours = true;
    try {
      const commandesExpirees = await this.commandes.expirerEchues();
      const blocagesLeves = (await this.sieges.expirerBlocages()).length;
      return { blocagesLeves, commandesExpirees };
    } catch (e) {
      this.journal.error(`Balayage interrompu : ${e instanceof Error ? e.message : String(e)}`);
      return { blocagesLeves: 0, commandesExpirees: 0 };
    } finally {
      this.enCours = false;
    }
  }
}
