import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Portefeuille } from "../relais/ports";
import { aammjjDouala, debutDeJour, minutesDuJour } from "../relais/temps";
import { VersementsService } from "../relais/versements.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { LivreursRepository } from "./ports";
import { MINUTE_VERSEMENT_LIVREUR } from "./regles";
import { MissionsService } from "./missions.service";

/** Les missions avancent vite (30 secondes pour répondre) : toutes les 5 secondes. */
const PERIODE_MISSIONS_MS = 5_000;
/** Les versements du soir n'ont pas besoin de plus d'une vérification par minute. */
const PERIODE_VERSEMENTS_MS = 60_000;

/**
 * Tâches de fond de la livraison. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi
 * dans le processus. Plusieurs instances peuvent tourner : les écritures sont atomiques (version de la
 * mission) et les clés d'idempotence empêchent un second versement.
 */
@Injectable()
export class TachesLivraison implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesLivraison");
  private minuteurs: NodeJS.Timeout[] = [];
  private enCours = { missions: false, versements: false };

  constructor(
    private readonly missions: MissionsService,
    private readonly livreurs: LivreursRepository,
    private readonly portefeuille: Portefeuille,
    private readonly versements: VersementsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteurs = [
      this.planifier("missions", PERIODE_MISSIONS_MS, () => this.missions.avancer()),
      this.planifier("versements", PERIODE_VERSEMENTS_MS, async () => {
        await this.verserLesLivreurs();
        await this.versements.reprendre();
      }),
    ];
  }

  onModuleDestroy(): void {
    for (const m of this.minuteurs) clearInterval(m);
  }

  /** Une tâche ne se lance pas si la précédente tourne encore. */
  private planifier(
    nom: "missions" | "versements",
    periode: number,
    tache: () => Promise<unknown>,
  ) {
    const minuteur = setInterval(() => {
      if (this.enCours[nom]) return;
      this.enCours[nom] = true;
      tache()
        .catch((e: unknown) =>
          this.logger.error(`Tâche « ${nom} » en échec (${(e as Error).name})`),
        )
        .finally(() => {
          this.enCours[nom] = false;
        });
    }, periode);
    minuteur.unref();
    return minuteur;
  }

  /**
   * Le soir, à partir de 20 h, verse à chaque livreur le solde de ses gains par MoMo. La clé du
   * versement porte le jour : relancer la tâche ne paie jamais deux fois.
   */
  async verserLesLivreurs(): Promise<{ verses: number; enAttente: number; refuses: number }> {
    const maintenant = this.missions.maintenant();
    const resultat = { verses: 0, enAttente: 0, refuses: 0 };
    if (minutesDuJour(maintenant) < MINUTE_VERSEMENT_LIVREUR) return resultat;
    const jour = aammjjDouala(debutDeJour(maintenant));
    for (const { partenaireId } of await this.portefeuille.soldesPositifs("livreur")) {
      const livreur = await this.livreurs.trouver(partenaireId);
      if (!livreur) continue;
      const { issue } = await this.versements.payer({
        type: "livreur",
        partenaireId,
        cle: `versement:livreur:${partenaireId}:${jour}`,
        motif: "versement",
        momo: livreur.momo,
        libelle: "AfriMove : vos gains de livreur du jour",
      });
      if (issue === "verse") resultat.verses += 1;
      else if (issue === "en_attente") resultat.enAttente += 1;
      else if (issue === "refuse") resultat.refuses += 1;
    }
    return resultat;
  }

  async toutExecuter() {
    return {
      missions: await this.missions.avancer(),
      versements: await this.verserLesLivreurs(),
      versementsRepris: await this.versements.reprendre(),
    };
  }
}
