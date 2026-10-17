import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import { construireRapport } from "./calcul";
import { CollecteRapportService } from "./collecte.service";
import { CONFIG_RAPPORT, type ConfigRapport } from "./config";
import { RapportIntrouvable, RapportPasEncore } from "./erreurs";
import type { RapportSoir } from "./modele";
import { ReferentielRapport, RapportsSoir } from "./ports";
import { decalerJour, joursEntre, jourDouala, minutesDouala, versIsoDouala } from "./temps";

export interface ResultatGeneration {
  rapport: RapportSoir;
  /** `false` : le rapport existait déjà (autre instance, relance), rien n'a été recalculé. */
  nouveau: boolean;
}

export interface ResumeGeneration {
  jour: string;
  generes: string[];
  dejaFaits: string[];
  echecs: Array<{ compagnieId: string; raison: string }>;
}

/**
 * Génération et lecture du rapport du soir.
 *
 * - **Un rapport par compagnie et par jour, écrit une seule fois** : `generer` rend le rapport déjà
 *   écrit s'il y en a un. Ce que le patron a reçu à 21 h est ce qu'il relit dans l'app le lendemain,
 *   même si une caisse est validée ou un trou comblé entre-temps.
 * - **Il part à l'heure dite quoi qu'il arrive** : une caisse non validée est signalée dans le
 *   rapport, elle ne le retarde pas (voir `CollecteRapportService` pour les sources en panne).
 */
@Injectable()
export class RapportSoirService {
  private readonly logger = new Logger("RapportSoir");

  constructor(
    private readonly referentiel: ReferentielRapport,
    private readonly collecte: CollecteRapportService,
    private readonly rapports: RapportsSoir,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_RAPPORT) private readonly config: ConfigRapport,
  ) {}

  /** Le rapport du jour est-il dû ? Oui à partir de l'heure du rapport, et pour tout jour passé. */
  estDu(jour: string, maintenant: Date = this.horloge.maintenant()): boolean {
    const aujourdhui = jourDouala(maintenant);
    if (jour < aujourdhui) return true;
    return jour === aujourdhui && minutesDouala(maintenant) >= this.config.minutesDepart;
  }

  /** Le jour dont on parle quand personne n'en nomme un : le dernier rapport dû. */
  jourParDefaut(maintenant: Date = this.horloge.maintenant()): string {
    const aujourdhui = jourDouala(maintenant);
    return this.estDu(aujourdhui, maintenant) ? aujourdhui : decalerJour(aujourdhui, -1);
  }

  /** Le rapport écrit pour ce jour, sans rien calculer. */
  async lire(compagnieId: string, jour: string): Promise<RapportSoir | null> {
    return (await this.rapports.trouver(compagnieId, jour))?.rapport ?? null;
  }

  /**
   * Arrête le rapport du jour : rassemble les faits, calcule, écrit. Idempotent. Lève
   * `RapportIntrouvable` pour une compagnie inconnue.
   */
  async generer(compagnieId: string, jour: string): Promise<ResultatGeneration> {
    const existant = await this.rapports.trouver(compagnieId, jour);
    if (existant) return { rapport: existant.rapport, nouveau: false };

    const compagnie = await this.referentiel.compagnie(compagnieId);
    if (!compagnie) throw new RapportIntrouvable(compagnieId, jour);

    const arreteA = this.horloge.maintenant();
    const entrees = await this.collecte.collecter(compagnie, jour, arreteA);
    const calcule = construireRapport(entrees);
    const { rapport: ecrit, nouveau } = await this.rapports.creer({
      compagnieId,
      jour,
      genereA: versIsoDouala(arreteA),
      rapport: calcule,
    });
    if (nouveau) {
      await this.noter("rapport.genere", "succes", compagnieId, jour, {
        nbGares: ecrit.rapport.nbGares,
        nbBillets: ecrit.rapport.chiffres.billets,
        incidents: entrees.incidents,
      });
    }
    return { rapport: ecrit.rapport, nouveau };
  }

  /**
   * Le rapport pour l'application du patron. Sans `jour`, le dernier rapport dû. Un rapport pas
   * encore dû lève `RapportPasEncore` ; un jour hors de l'historique, `RapportIntrouvable`. Un
   * rapport dû mais pas encore arrêté (planificateur en retard, jour passé jamais calculé) est
   * arrêté à la demande.
   */
  async pourLApp(compagnieId: string, jour?: string): Promise<RapportSoir> {
    const maintenant = this.horloge.maintenant();
    const demande = jour ?? this.jourParDefaut(maintenant);
    const stocke = await this.lire(compagnieId, demande);
    if (stocke) return stocke;
    if (!this.estDu(demande, maintenant)) {
      throw new RapportPasEncore(demande, this.config.heure);
    }
    if (joursEntre(demande, jourDouala(maintenant)) > this.config.joursHistorique) {
      throw new RapportIntrouvable(compagnieId, demande);
    }
    return (await this.generer(compagnieId, demande)).rapport;
  }

  /**
   * Le rapport pour l'envoi WhatsApp : le même que pour l'application, ou `null` s'il n'est pas dû
   * ou trop ancien (la passerelle répond alors « pas de rapport »).
   */
  async pourEnvoi(compagnieId: string, jour: string): Promise<RapportSoir | null> {
    try {
      return await this.pourLApp(compagnieId, jour);
    } catch (e) {
      if (e instanceof RapportPasEncore || e instanceof RapportIntrouvable) return null;
      throw e;
    }
  }

  /**
   * Arrête le rapport de chaque compagnie qui n'a pas encore le sien pour ce jour. `ignorer` :
   * compagnies déjà servies, que le planificateur ne relit pas à chaque passage.
   */
  async genererPourToutes(
    jour: string,
    ignorer: ReadonlySet<string> = new Set(),
  ): Promise<ResumeGeneration> {
    const resume: ResumeGeneration = { jour, generes: [], dejaFaits: [], echecs: [] };
    for (const compagnie of await this.referentiel.compagnies()) {
      if (ignorer.has(compagnie.id)) continue;
      try {
        const { nouveau } = await this.generer(compagnie.id, jour);
        (nouveau ? resume.generes : resume.dejaFaits).push(compagnie.id);
      } catch (e) {
        const raison = e instanceof Error ? e.name : "erreur";
        resume.echecs.push({ compagnieId: compagnie.id, raison });
        this.logger.error(`Rapport du ${jour} non arrêté (${raison})`);
        await this.noter("rapport.genere", "echec", compagnie.id, jour, { raison });
      }
    }
    return resume;
  }

  private async noter(
    action: string,
    resultat: "succes" | "echec",
    compagnieId: string,
    jour: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.enregistrer({
        action,
        resultat,
        cible: { type: "rapport_soir", id: `${compagnieId}:${jour}` },
        details: { compagnieId, jour, ...details },
      });
    } catch {
      this.logger.error(`Rapport ${jour} : ${action} non porté au journal d'audit`);
    }
  }
}
