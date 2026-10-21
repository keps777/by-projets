import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ColisService, SYSTEME } from "../colis/colis.service";
import { ErreurColis } from "../colis/erreurs";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { AnnuairePersonnes } from "./annuaire";
import { ColisDuRelais, Portefeuille, ReceptionsRelais, RelaisRepository } from "./ports";
import {
  GAIN_REPRISE_RELAIS,
  GARDE_RELAIS_JOURS,
  RAPPEL_APRES_JOURS,
  versementRelaisDu,
} from "./regles";
import { RelaisService, recuLe } from "./relais.service";
import { aammjjDouala, debutDeSemaine, joursEcoules } from "./temps";
import { VersementsService } from "./versements.service";

const SYSTEME_ACTEUR = { id: SYSTEME, role: "afrimove", compagnieId: null, gareId: null } as const;

/** Une fois par quart d'heure : suffisant pour des délais de 5 et 7 jours et un versement du lundi. */
const PERIODE_MS = 15 * 60_000;

/**
 * Tâches de fond des points relais. Chacune est idempotente et peut être lancée à la main (tests,
 * administration) ou par une planification externe ; en dehors des tests, le module les lance aussi
 * toutes les 15 minutes dans le processus (sans effet de bord si plusieurs instances tournent : les
 * écritures sont atomiques et les clés d'idempotence empêchent un second versement).
 */
@Injectable()
export class TachesRelais implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("TachesRelais");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly service: RelaisService,
    private readonly colis: ColisService,
    private readonly repo: RelaisRepository,
    private readonly receptions: ReceptionsRelais,
    private readonly colisDuRelais: ColisDuRelais,
    private readonly portefeuille: Portefeuille,
    private readonly versements: VersementsService,
    private readonly annuaire: AnnuairePersonnes,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.toutExecuter().catch((e: unknown) =>
        this.logger.error(`Tâches des points relais en échec (${(e as Error).name})`),
      );
    }, PERIODE_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  /** Rappelle au destinataire, à partir du 5e jour, que son colis l'attend chez le relais. */
  async envoyerRappels(): Promise<number> {
    const maintenant = this.service.maintenant();
    let envoyes = 0;
    for (const colis of await this.colisDuRelais.parEtats(["en_relais"])) {
      if (colis.relaisId === null) continue;
      const reception = await this.receptions.trouver(colis.id);
      const depuis = joursEcoules(recuLe(colis, reception), maintenant);
      if (depuis < RAPPEL_APRES_JOURS || depuis >= GARDE_RELAIS_JOURS) continue;
      await this.receptions.ajouter({
        colisId: colis.id,
        relaisId: colis.relaisId,
        recuA: recuLe(colis, null),
        rappelEnvoyeA: null,
        remiseOuverteA: null,
      });
      if (!(await this.receptions.marquerRappel(colis.id, maintenant))) continue;
      const relais = await this.repo.trouver(colis.relaisId);
      await this.annuaire.prevenir(
        colis.destinataire.telephone,
        `AfriMove : le colis ${colis.numero} vous attend chez ${relais?.nom ?? "le point relais"} ` +
          `depuis ${depuis} jours. Il sera repris dans ${GARDE_RELAIS_JOURS - depuis} jour` +
          `${GARDE_RELAIS_JOURS - depuis > 1 ? "s" : ""}. Munissez-vous de votre code et de votre pièce.`,
      );
      envoyes += 1;
    }
    return envoyes;
  }

  /** Passe en « non retiré » les colis gardés depuis 7 jours chez le relais : ils seront repris. */
  async marquerNonRetires(): Promise<number> {
    const maintenant = this.service.maintenant();
    let marques = 0;
    for (const colis of await this.colisDuRelais.parEtats(["en_relais"])) {
      const reception = await this.receptions.trouver(colis.id);
      if (joursEcoules(recuLe(colis, reception), maintenant) < GARDE_RELAIS_JOURS) continue;
      try {
        await this.colis.executer({
          acteur: SYSTEME_ACTEUR,
          colis: { id: colis.id },
          action: "marquer_non_retire",
          motif: "garde de 7 jours écoulée chez le relais",
        });
        marques += 1;
      } catch (e) {
        // Déjà marqué par la tâche des colis, ou remis entre-temps : rien à faire.
        if (!(e instanceof ErreurColis)) {
          this.logger.warn(
            `Colis ${colis.numero} non marqué « non retiré » (${(e as Error).name})`,
          );
        }
      }
    }
    return marques;
  }

  /** Verse 100 F au relais pour chaque colis qu'il a gardé 7 jours et que l'agence a repris. */
  async crediterReprises(): Promise<number> {
    let credites = 0;
    for (const colis of await this.colisDuRelais.parEtats(["retourne"])) {
      if (colis.relaisId === null) continue;
      const etapes = colis.historique;
      const enRelais = etapes.findIndex((h) => h.action === "envoyer_en_relais");
      const nonRetire = etapes.findIndex((h) => h.action === "marquer_non_retire");
      if (enRelais === -1 || nonRetire < enRelais) continue; // jamais passé par un relais
      const relais = await this.repo.trouver(colis.relaisId);
      const retour = [...etapes].reverse().find((h) => h.action === "retourner");
      if (!relais || !retour) continue;
      const nouveau = await this.portefeuille.crediter({
        cle: `reprise:${colis.id}`,
        type: "relais",
        partenaireId: relais.id,
        montant: GAIN_REPRISE_RELAIS,
        motif: "reprise",
        reference: colis.id,
        at: retour.at,
      });
      if (nouveau) credites += 1;
    }
    return credites;
  }

  /**
   * Le lundi à partir de 8 h, verse à chaque relais le solde de ses gains par MoMo. La clé du
   * versement porte la semaine : relancer la tâche ne paie jamais deux fois.
   */
  async verserLesRelais(): Promise<{ verses: number; enAttente: number; refuses: number }> {
    const maintenant = this.service.maintenant();
    const debut = debutDeSemaine(maintenant);
    const resultat = { verses: 0, enAttente: 0, refuses: 0 };
    if (!versementRelaisDu(maintenant, debut)) return resultat;
    for (const { partenaireId } of await this.portefeuille.soldesPositifs("relais")) {
      const relais = await this.repo.trouver(partenaireId);
      if (!relais) continue;
      const { issue } = await this.versements.payer({
        type: "relais",
        partenaireId,
        cle: `versement:relais:${partenaireId}:${aammjjDouala(debut)}`,
        motif: "versement",
        momo: relais.momo,
        libelle: "AfriMove : gains de la semaine de votre point relais",
      });
      if (issue === "verse") resultat.verses += 1;
      else if (issue === "en_attente") resultat.enAttente += 1;
      else if (issue === "refuse") resultat.refuses += 1;
    }
    return resultat;
  }

  async toutExecuter() {
    return {
      rappels: await this.envoyerRappels(),
      colisNonRetires: await this.marquerNonRetires(),
      reprises: await this.crediterReprises(),
      versements: await this.verserLesRelais(),
      versementsRepris: await this.versements.reprendre(),
    };
  }
}
