import { Logger } from "@nestjs/common";
import type { Horloge } from "../socle/horloge";
import {
  ErreurNonRelancable,
  FileEnvoiWhatsApp,
  type ComptesFile,
  type DonneesTravailWhatsApp,
  type OptionsTravail,
  type ProcesseurWhatsApp,
  type TravailWhatsApp,
} from "./file";

type Etat = "attente" | "actif" | "termine" | "echoue";

interface Interne {
  travail: TravailWhatsApp;
  etat: Etat;
  /** Instant (ms) à partir duquel le prochain essai peut démarrer. */
  disponibleA: number;
  sequence: number;
}

/** Combien de travaux terminés on garde en mémoire pour refuser un `jobId` déjà vu. */
const HISTORIQUE_MAX = 5000;

/**
 * File en mémoire, au comportement de BullMQ pour ce dont la passerelle a besoin : `jobId`
 * idempotent, délai, priorité, essais, attente exponentielle ou fixe entre deux essais,
 * `ErreurNonRelancable`. Elle lit l'heure sur `Horloge` : les tests avancent l'horloge puis appellent
 * `traiterPrets()`, sans minuterie ni attente réelle.
 *
 * **Volatile** : tout est perdu au redémarrage, `durable` vaut `false`.
 */
export class FileEnvoiMemoire extends FileEnvoiWhatsApp {
  readonly durable = false;
  private readonly logger = new Logger("WhatsAppFileMemoire");
  private readonly travaux = new Map<string, Interne>();
  private processeur: ProcesseurWhatsApp | null = null;
  private concurrence = 5;
  private minuterie: NodeJS.Timeout | null = null;
  private sequence = 0;
  private enBoucle = false;

  /** `sondageMs` > 0 : une minuterie appelle `traiterPrets()` ; 0 : c'est à l'appelant de le faire. */
  constructor(
    private readonly horloge: Horloge,
    private readonly sondageMs = 0,
  ) {
    super();
  }

  async ajouter(
    nom: string,
    donnees: DonneesTravailWhatsApp,
    options: OptionsTravail,
  ): Promise<{ id: string; nouveau: boolean }> {
    if (/:/.test(options.jobId)) throw new Error("jobId ne peut pas contenir « : » (comme BullMQ)");
    if (options.attempts < 1) throw new Error("attempts doit valoir 1 au moins");
    if (this.travaux.has(options.jobId)) return { id: options.jobId, nouveau: false };
    const maintenant = this.horloge.maintenant().getTime();
    this.travaux.set(options.jobId, {
      travail: {
        id: options.jobId,
        name: nom,
        data: { ...donnees },
        attemptsMade: 0,
        opts: { ...options, backoff: { ...options.backoff } },
        timestamp: maintenant,
      },
      etat: "attente",
      disponibleA: maintenant + Math.max(0, options.delay ?? 0),
      sequence: this.sequence++,
    });
    return { id: options.jobId, nouveau: true };
  }

  traiter(processeur: ProcesseurWhatsApp, options: { concurrence?: number } = {}): void {
    if (this.processeur) throw new Error("Un processeur est déjà enregistré");
    this.processeur = processeur;
    this.concurrence = Math.max(1, options.concurrence ?? 5);
    if (this.sondageMs > 0) {
      this.minuterie = setInterval(() => {
        void this.traiterPrets().catch((e: unknown) =>
          this.logger.error(`Traitement de la file : ${e instanceof Error ? e.message : "erreur"}`),
        );
      }, this.sondageMs);
      this.minuterie.unref();
    }
  }

  /**
   * Fait tourner tous les travaux dont l'heure est venue, `concurrence` à la fois, jusqu'à ce qu'il
   * n'y en ait plus de prêt. Renvoie le nombre d'essais effectués.
   */
  async traiterPrets(): Promise<number> {
    const processeur = this.processeur;
    if (!processeur || this.enBoucle) return 0;
    this.enBoucle = true;
    let essais = 0;
    try {
      for (;;) {
        const maintenant = this.horloge.maintenant().getTime();
        const prets = [...this.travaux.values()]
          .filter((t) => t.etat === "attente" && t.disponibleA <= maintenant)
          .sort(
            (a, b) =>
              (a.travail.opts.priority ?? 100) - (b.travail.opts.priority ?? 100) ||
              a.disponibleA - b.disponibleA ||
              a.sequence - b.sequence,
          )
          .slice(0, this.concurrence);
        if (prets.length === 0) break;
        await Promise.all(prets.map((t) => this.executer(t, processeur)));
        essais += prets.length;
      }
    } finally {
      this.enBoucle = false;
    }
    this.purger();
    return essais;
  }

  private async executer(interne: Interne, processeur: ProcesseurWhatsApp): Promise<void> {
    interne.etat = "actif";
    const instantane: TravailWhatsApp = { ...interne.travail, data: { ...interne.travail.data } };
    try {
      await processeur(instantane);
      interne.etat = "termine";
    } catch (e) {
      interne.travail.attemptsMade += 1;
      const { attemptsMade, opts } = interne.travail;
      if (e instanceof ErreurNonRelancable || attemptsMade >= opts.attempts) {
        interne.etat = "echoue";
        return;
      }
      const attente =
        opts.backoff.type === "fixed"
          ? opts.backoff.delay
          : Math.round(2 ** (attemptsMade - 1) * opts.backoff.delay);
      interne.disponibleA = this.horloge.maintenant().getTime() + attente;
      interne.etat = "attente";
    }
  }

  /** Oublie les plus anciens travaux terminés au-delà de la limite. */
  private purger(): void {
    const finis = [...this.travaux.values()].filter(
      (t) => t.etat === "termine" || t.etat === "echoue",
    );
    if (finis.length <= HISTORIQUE_MAX) return;
    finis
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, finis.length - HISTORIQUE_MAX)
      .forEach((t) => this.travaux.delete(t.travail.id));
  }

  async retirer(jobId: string): Promise<boolean> {
    const t = this.travaux.get(jobId);
    if (!t || t.etat !== "attente") return false;
    this.travaux.delete(jobId);
    return true;
  }

  async compter(): Promise<ComptesFile> {
    const comptes: ComptesFile = { attente: 0, actifs: 0, termines: 0, echoues: 0 };
    for (const t of this.travaux.values()) {
      if (t.etat === "attente") comptes.attente += 1;
      else if (t.etat === "actif") comptes.actifs += 1;
      else if (t.etat === "termine") comptes.termines += 1;
      else comptes.echoues += 1;
    }
    return comptes;
  }

  async fermer(): Promise<void> {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Test : prochain instant où un travail en attente devient prêt, ou `null`. */
  prochaineEcheance(): Date | null {
    const dates = [...this.travaux.values()]
      .filter((t) => t.etat === "attente")
      .map((t) => t.disponibleA);
    return dates.length === 0 ? null : new Date(Math.min(...dates));
  }

  /** Test : copie des travaux (charge utile comprise), pour vérifier ce qui est écrit dans la file. */
  instantane(): TravailWhatsApp[] {
    return [...this.travaux.values()].map((t) => ({ ...t.travail }));
  }
}
