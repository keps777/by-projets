import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Inject,
} from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { TelephoneInvalide } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { CONFIG_WHATSAPP, type ConfigWhatsApp } from "./config";
import { AucunDestinataire, RapportIndisponible } from "./erreurs";
import { VariablesInvalides } from "./gabarits";
import { JournalWhatsApp } from "./journal";
import { PasserelleWhatsAppService } from "./passerelle.service";
import { AnnuaireRapport, SourceRapportSoir } from "./ports";
import { jourDouala, minutesDouala } from "./temps";
import type { EtatSecours, StatutWhatsApp } from "./types";

export interface ResumeRapport {
  compagnieId: string;
  jour: string;
  /** Personnes à qui le rapport est destiné (patron et superviseurs avec un numéro). */
  destinataires: number;
  /** Messages mis en file par cet appel. */
  envoyes: number;
  /** Messages déjà en file ou partis : un second appel n'envoie rien de plus. */
  dejaEnvoyes: number;
  /** Personnes qui n'ont pas pu être servies (numéro invalide, trop de messages). */
  echecs: Array<{ personneId: string; raison: string }>;
}

export interface LigneStatutRapport {
  destinataire: string;
  statut: StatutWhatsApp;
  secours: EtatSecours;
  envoyeA: Date | null;
  remisA: Date | null;
  luA: Date | null;
}

export interface StatutRapport {
  compagnieId: string;
  jour: string;
  messages: LigneStatutRapport[];
}

/**
 * Rapport du soir : prend le rapport de la compagnie (port `SourceRapportSoir`), le met en forme
 * dans le gabarit approuvé et le met en file pour le patron et chaque superviseur (port
 * `AnnuaireRapport`). L'envoi est idempotent par jour et par personne : relancer ne double rien.
 */
@Injectable()
export class RapportSoirWhatsAppService {
  constructor(
    private readonly passerelle: PasserelleWhatsAppService,
    private readonly source: SourceRapportSoir,
    private readonly annuaire: AnnuaireRapport,
    private readonly journal: JournalWhatsApp,
  ) {}

  /**
   * Lève `RapportIndisponible` (pas de rapport pour ce jour), `AucunDestinataire` ou
   * `VariablesInvalides` (rapport mal formé : même erreur pour tous, on s'arrête).
   */
  async envoyerRapport(compagnieId: string, jour: string): Promise<ResumeRapport> {
    const compagnie = await this.source.compagnie(compagnieId);
    const rapport = compagnie ? await this.source.rapport(compagnieId, jour) : null;
    if (!compagnie || !rapport) throw new RapportIndisponible(compagnieId, jour);
    const destinataires = await this.annuaire.destinataires(compagnieId);
    if (destinataires.length === 0) throw new AucunDestinataire(compagnieId);

    const resume: ResumeRapport = {
      compagnieId,
      jour,
      destinataires: destinataires.length,
      envoyes: 0,
      dejaEnvoyes: 0,
      echecs: [],
    };
    for (const d of destinataires) {
      try {
        const { nouveau } = await this.passerelle.envoyer({
          type: "rapport_soir",
          variables: { compagnie: compagnie.nom, rapport },
          destinataire: d.telephone,
          cle: `rapport:${compagnieId}:${jour}:${d.personneId}`,
          reference: { type: "rapport_soir", id: `${compagnieId}:${jour}` },
          compagnieId,
        });
        if (nouveau) resume.envoyes += 1;
        else resume.dejaEnvoyes += 1;
      } catch (e) {
        if (e instanceof VariablesInvalides) throw e;
        resume.echecs.push({
          personneId: d.personneId,
          raison: e instanceof TelephoneInvalide ? "telephone_invalide" : errNom(e),
        });
      }
    }
    return resume;
  }

  /** Où en est le rapport du jour : un état par destinataire (numéro masqué). */
  async statut(compagnieId: string, jour: string): Promise<StatutRapport> {
    const messages = await this.journal.lister({
      type: "rapport_soir",
      reference: { type: "rapport_soir", id: `${compagnieId}:${jour}` },
    });
    return {
      compagnieId,
      jour,
      messages: messages
        .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
        .map((m) => ({
          destinataire: m.destinataireMasque,
          statut: m.statut,
          secours: m.secours,
          envoyeA: m.envoyeA,
          remisA: m.remisA,
          luA: m.luA,
        })),
    };
  }
}

const errNom = (e: unknown): string => (e instanceof Error ? e.name : "erreur");

/** Efface le texte de repli chiffré des messages restés sans accusé au bout de 48 h. */
const RETENTION_SECOURS_MS = 48 * 60 * 60_000;
const NETTOYAGE_TOUTES_LES_MS = 60 * 60_000;

/**
 * Planificateur du rapport de 21 h (heure de Douala). Une minuterie appelle `tick()` ; dès que
 * l'heure est passée, le rapport du jour part pour chaque compagnie qui ne l'a pas encore reçu. Un
 * redémarrage en cours de soirée ne duplique rien (clé d'idempotence par personne et par jour) et
 * une donnée absente est réessayée à chaque passage jusqu'à minuit.
 */
@Injectable()
export class PlanificateurRapportSoir implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("RapportSoirPlanificateur");
  private minuterie: NodeJS.Timeout | null = null;
  private faits = new Set<string>();
  private signales = new Set<string>();
  private enCours = false;
  private dernierNettoyage = 0;

  constructor(
    private readonly rapports: RapportSoirWhatsAppService,
    private readonly source: SourceRapportSoir,
    private readonly journal: JournalWhatsApp,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
  ) {}

  onApplicationBootstrap(): void {
    const intervalle = this.config.rapport.planificateurMs;
    if (intervalle <= 0) return;
    this.minuterie = setInterval(() => {
      void this.tick().catch((e: unknown) =>
        this.logger.error(`Planificateur : ${e instanceof Error ? e.message : "erreur"}`),
      );
    }, intervalle);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage : envoie les rapports dus. Rend les compagnies traitées avec succès. */
  async tick(): Promise<string[]> {
    if (this.enCours) return [];
    this.enCours = true;
    try {
      const maintenant = this.horloge.maintenant();
      await this.nettoyer(maintenant);
      if (minutesDouala(maintenant) < this.config.rapport.minutesDepart) return [];
      const jour = jourDouala(maintenant);
      this.faits = new Set([...this.faits].filter((k) => k.startsWith(`${jour}:`)));
      this.signales = new Set([...this.signales].filter((k) => k.startsWith(`${jour}:`)));

      const traites: string[] = [];
      for (const compagnie of await this.source.compagnies()) {
        const cle = `${jour}:${compagnie.id}`;
        if (this.faits.has(cle)) continue;
        try {
          const resume = await this.rapports.envoyerRapport(compagnie.id, jour);
          this.faits.add(cle);
          traites.push(compagnie.id);
          this.logger.log(
            `Rapport du ${jour} : ${resume.envoyes} message(s) en file pour ${resume.destinataires} destinataire(s)` +
              (resume.echecs.length > 0 ? `, ${resume.echecs.length} sans numéro valide` : ""),
          );
          await this.noter("whatsapp.rapport_envoye", "succes", compagnie.id, jour, {
            destinataires: resume.destinataires,
            envoyes: resume.envoyes,
            echecs: resume.echecs.length,
          });
          if (resume.echecs.length > 0 && !this.signales.has(`${cle}:echecs`)) {
            this.signales.add(`${cle}:echecs`);
            await this.noter("whatsapp.rapport_echec", "echec", compagnie.id, jour, {
              raison: "destinataires_non_servis",
              echecs: resume.echecs.length,
            });
          }
        } catch (e) {
          if (e instanceof VariablesInvalides) this.faits.add(cle); // inutile de réessayer
          if (!this.signales.has(cle)) {
            this.signales.add(cle);
            this.logger.error(`Rapport du ${jour} non envoyé (${errNom(e)})`);
            await this.noter("whatsapp.rapport_echec", "echec", compagnie.id, jour, {
              raison: errNom(e),
            });
          }
        }
      }
      return traites;
    } finally {
      this.enCours = false;
    }
  }

  private async nettoyer(maintenant: Date): Promise<void> {
    if (maintenant.getTime() - this.dernierNettoyage < NETTOYAGE_TOUTES_LES_MS) return;
    this.dernierNettoyage = maintenant.getTime();
    const n = await this.journal.effacerSecoursAvant(
      new Date(maintenant.getTime() - RETENTION_SECOURS_MS),
    );
    if (n > 0) this.logger.log(`${n} texte(s) de repli effacé(s) (sans accusé depuis 48 h)`);
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
