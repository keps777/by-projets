import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import { DemandesService } from "./demandes.service";
import { LiberationService } from "./liberation.service";
import { ReservationsService } from "./reservations.service";
import { TrajetsService } from "./trajets.service";

export interface BilanBalayage {
  reservationsExpirees: number;
  argentLibere: number;
  versementsRepris: number;
  trajetsTermines: number;
  trajetsRenouveles: number;
  demandesExpirees: number;
}

const RIEN: BilanBalayage = {
  reservationsExpirees: 0,
  argentLibere: 0,
  versementsRepris: 0,
  trajetsTermines: 0,
  trajetsRenouveles: 0,
  demandesExpirees: 0,
};

/**
 * Balayage périodique, dans l'ordre :
 *  1. libère les places dont la retenue de 15 minutes est écoulée ;
 *  2. libère l'argent des trajets arrivés depuis plus de 2 h sans confirmation du passager ;
 *  3. reprend les versements qui n'ont pas pu partir ;
 *  4. ferme les trajets arrivés ;
 *  5. publie la semaine suivante des trajets réguliers ;
 *  6. clôt les demandes de passagers dont le jour est passé.
 * Le système reste juste sans lui pour les réservations (le paiement et la confirmation ne l'utilisent
 * pas) ; il rattrape ce qui dépend du temps. Chaque étape est indépendante : l'échec d'une ne bloque
 * pas les suivantes.
 */
@Injectable()
export class BalayageCovoiturage implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("BalayageCovoiturage");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly reservations: ReservationsService,
    private readonly liberation: LiberationService,
    private readonly trajets: TrajetsService,
    private readonly demandes: DemandesService,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
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
  async balayer(): Promise<BilanBalayage> {
    if (this.enCours) return { ...RIEN };
    this.enCours = true;
    try {
      const bilan = { ...RIEN };
      bilan.reservationsExpirees = await this.etape("expiration", () =>
        this.reservations.expirer(),
      );
      bilan.argentLibere = await this.etape("libération", () => this.reservations.libererEchues());
      bilan.versementsRepris = await this.etape("reprise des versements", () =>
        this.liberation.reprendre(),
      );
      bilan.trajetsTermines = await this.etape("fin des trajets", () => this.trajets.terminer());
      bilan.trajetsRenouveles = await this.etape("trajets réguliers", () =>
        this.trajets.renouveler(),
      );
      bilan.demandesExpirees = await this.etape("demandes", () => this.demandes.expirer());
      return bilan;
    } finally {
      this.enCours = false;
    }
  }

  private async etape(nom: string, travail: () => Promise<number>): Promise<number> {
    try {
      return await travail();
    } catch (e) {
      this.journal.error(
        `Balayage (${nom}) interrompu : ${e instanceof Error ? e.message : String(e)}`,
      );
      return 0;
    }
  }
}
