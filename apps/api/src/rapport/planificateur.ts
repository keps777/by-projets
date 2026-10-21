import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { CONFIG_RAPPORT, type ConfigRapport } from "./config";
import { RapportSoirService } from "./rapport.service";
import { jourDouala, minutesDouala } from "./temps";

/**
 * Planificateur du rapport de 21 h (heure de Douala). Une minuterie appelle `tick()` ; dès que
 * l'heure est passée, le rapport du jour est arrêté pour chaque compagnie qui n'a pas encore le sien.
 *
 * - **Rien n'attend personne** : le rapport est arrêté à l'heure même si une caisse n'est pas
 *   validée (elle est signalée dans le rapport).
 * - **Plusieurs instances, redémarrages** : arrêter un rapport est idempotent (un seul par compagnie
 *   et par jour, `RapportsSoir.creer`), deux instances qui tournent en même temps ne produisent
 *   qu'un rapport.
 * - **Une panne ne fait pas rater le soir** : une compagnie en échec est réessayée à chaque passage
 *   jusqu'à minuit.
 *
 * L'envoi WhatsApp est fait par le planificateur de la passerelle (`PlanificateurRapportSoir`,
 * AM-167), qui lit ce rapport par `SourceRapportSoirPourWhatsApp`.
 */
@Injectable()
export class PlanificateurRapport implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("RapportPlanificateur");
  private minuterie: NodeJS.Timeout | null = null;
  /** Compagnies dont le rapport du jour est arrêté (on ne les relit plus ce jour-là). */
  private faits = new Set<string>();
  private jourDesFaits = "";
  private enCours = false;

  constructor(
    private readonly rapports: RapportSoirService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_RAPPORT) private readonly config: ConfigRapport,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.planificateurMs <= 0) return;
    this.minuterie = setInterval(() => {
      void this.tick().catch((e: unknown) =>
        this.logger.error(`Planificateur : ${e instanceof Error ? e.message : "erreur"}`),
      );
    }, this.config.planificateurMs);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage : arrête les rapports dus. Rend les compagnies dont le rapport vient d'être arrêté. */
  async tick(): Promise<string[]> {
    if (this.enCours) return [];
    this.enCours = true;
    try {
      const maintenant = this.horloge.maintenant();
      if (minutesDouala(maintenant) < this.config.minutesDepart) return [];
      const jour = jourDouala(maintenant);
      if (jour !== this.jourDesFaits) {
        this.jourDesFaits = jour;
        this.faits = new Set();
      }

      const resume = await this.rapports.genererPourToutes(jour, this.faits);
      for (const id of [...resume.generes, ...resume.dejaFaits]) this.faits.add(id);
      if (resume.generes.length > 0) {
        this.logger.log(`Rapport du ${jour} arrêté pour ${resume.generes.length} compagnie(s)`);
      }
      return resume.generes;
    } finally {
      this.enCours = false;
    }
  }
}
