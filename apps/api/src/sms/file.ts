/**
 * Port de la file d'envoi. La forme suit BullMQ (`Queue.add`, `Worker`, `Job`) pour que
 * l'adaptateur Redis soit un simple recopiage :
 *
 * | ici                           | BullMQ                                                   |
 * | ----------------------------- | -------------------------------------------------------- |
 * | `ajouter(nom, donnees, opts)` | `queue.add(nom, donnees, opts)` (`jobId`, `delay`, …)    |
 * | `traiter(processeur, …)`      | `new Worker(nom, processeur, { concurrency })`           |
 * | `TravailSms`                  | `Job` (`id`, `data`, `attemptsMade`, `opts`)             |
 * | `ErreurNonRelancable`         | `UnrecoverableError` (le travail échoue sans réessai)    |
 * | `retirer(jobId)`              | `(await queue.getJob(id))?.remove()`                     |
 * | `compter()`                   | `queue.getJobCounts()`                                   |
 *
 * `attemptsMade` vaut le nombre d'essais **déjà terminés** quand le processeur démarre (0 au
 * premier). Une file en mémoire (`file-memoire.ts`) sert aux tests et au développement ; en
 * production, le module refuse de démarrer tant que la file n'est pas durable.
 */

/** Charge utile : le numéro et le texte n'y figurent que chiffrés (la file peut vivre dans Redis). */
export interface DonneesTravailSms {
  messageId: string;
  destinataireChiffre: string;
  texteChiffre: string;
}

export interface OptionsTravail {
  /** Identifiant du travail : en ajouter un second avec le même `jobId` est sans effet. */
  jobId: string;
  /** Attente avant le premier essai, en millisecondes. */
  delay?: number;
  /** Nombre d'essais au total. */
  attempts: number;
  backoff: { type: "exponential" | "fixed"; delay: number };
  /** 1 = le plus urgent (comme BullMQ). */
  priority?: number;
}

export interface TravailSms {
  id: string;
  name: string;
  data: DonneesTravailSms;
  attemptsMade: number;
  opts: OptionsTravail;
  /** Création, en millisecondes depuis 1970. */
  timestamp: number;
}

export type ProcesseurSms = (travail: TravailSms) => Promise<void>;

/** Le travail échoue tout de suite, sans nouvel essai (équivalent de `UnrecoverableError`). */
export class ErreurNonRelancable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecoverableError";
  }
}

export interface ComptesFile {
  /** En attente d'un essai (prêts ou différés). */
  attente: number;
  actifs: number;
  termines: number;
  echoues: number;
}

export abstract class FileEnvoiSms {
  /** `true` pour une file qui garde ses travaux après un redémarrage (Redis). */
  abstract readonly durable: boolean;

  abstract ajouter(
    nom: string,
    donnees: DonneesTravailSms,
    options: OptionsTravail,
  ): Promise<{ id: string; nouveau: boolean }>;

  /** Enregistre le processeur (un seul) et démarre le traitement. */
  abstract traiter(processeur: ProcesseurSms, options?: { concurrence?: number }): void;

  /** Retire un travail qui n'a pas encore démarré. `false` s'il est introuvable ou déjà en cours. */
  abstract retirer(jobId: string): Promise<boolean>;

  abstract compter(): Promise<ComptesFile>;

  abstract fermer(): Promise<void>;
}
