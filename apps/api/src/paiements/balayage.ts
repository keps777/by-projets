import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { EncaissementsService } from "./encaissements.service";

/**
 * Balayage périodique : interroge l'agrégateur pour les paiements dont le webhook n'est pas arrivé,
 * expire ceux dont le délai est passé, reprend les commandes restées à confirmer et les
 * remboursements qui n'ont pas pu partir. Le système reste juste sans lui (le webhook suffit) ; il
 * rattrape ce que le webhook a manqué.
 */
@Injectable()
export class BalayagePaiements implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("BalayagePaiements");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly encaissements: EncaissementsService,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.balayageMs <= 0) return;
    this.minuterie = setInterval(() => void this.balayer(), this.config.balayageMs);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage ; deux passages ne se chevauchent jamais. */
  async balayer(): Promise<{ consultes: number; confirmations: number; remboursements: number }> {
    const rien = { consultes: 0, confirmations: 0, remboursements: 0 };
    if (this.enCours) return rien;
    this.enCours = true;
    try {
      return await this.encaissements.balayer();
    } catch (e) {
      this.journal.error(`Balayage interrompu : ${e instanceof Error ? e.message : String(e)}`);
      return rien;
    } finally {
      this.enCours = false;
    }
  }
}
