import { enMs, versIsoDouala } from "@afrimove/domain";
import type { Instant, IsoDouala } from "@afrimove/domain";
import { ErreurAnnulee } from "./erreurs";

/**
 * Horloge injectable : tout ce qui dépend du temps (latence simulée, relances, temps réel simulé,
 * « maintenant » des scénarios) passe par elle, jamais par `Date.now` ni `setTimeout` en direct.
 */
export interface Horloge {
  /** Millisecondes depuis l'époque. */
  maintenant(): number;
  /** « Maintenant » en heure de Douala (ISO +01:00). */
  iso(): IsoDouala;
  /** Exécute `fn` dans `ms` ms ; renvoie l'annulation. */
  planifier(ms: number, fn: () => void): () => void;
  /** Attend `ms` ms ; rejette avec `ErreurAnnulee` si `signal` est annulé. */
  attendre(ms: number, signal?: AbortSignal): Promise<void>;
}

abstract class HorlogeBase implements Horloge {
  abstract maintenant(): number;
  abstract planifier(ms: number, fn: () => void): () => void;

  iso(): IsoDouala {
    return versIsoDouala(this.maintenant());
  }

  attendre(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new ErreurAnnulee());
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        annuler();
        reject(new ErreurAnnulee());
      };
      const annuler = this.planifier(ms, () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

class HorlogeReelle extends HorlogeBase {
  private readonly decalageMs: number;
  private readonly fige: boolean;

  constructor(decalageMs: number, fige = false) {
    super();
    this.decalageMs = decalageMs;
    this.fige = fige;
  }
  maintenant(): number {
    return this.fige ? this.decalageMs : Date.now() + this.decalageMs;
  }
  planifier(ms: number, fn: () => void): () => void {
    const id = setTimeout(fn, Math.max(0, ms));
    return () => clearTimeout(id);
  }
}

/** Horloge du système. */
export function horlogeSysteme(): Horloge {
  return new HorlogeReelle(0);
}

/**
 * Horloge qui part de `depart` puis s'écoule en temps réel (paramètre d'URL `horloge=<ISO>`) :
 * « il est 05 h 30 à la gare » pendant une démo.
 */
export function horlogeDepuis(depart: Instant): Horloge {
  return new HorlogeReelle(enMs(depart) - Date.now());
}

/** Horloge figée (paramètre d'URL `horloge=gelee:<ISO>`) : `maintenant()` ne bouge plus. Les minuteries restent réelles. */
export function horlogeGelee(instant: Instant): Horloge {
  return new HorlogeReelle(enMs(instant), true);
}

export interface HorlogeManuelle extends Horloge {
  /** Avance le temps, déclenchant dans l'ordre les minuteries échues. */
  avancer(ms: number): Promise<void>;
  /** Nombre de minuteries en attente. */
  readonly enAttente: number;
}

interface Minuterie {
  quand: number;
  fn: () => void;
}

class HorlogeDeTest extends HorlogeBase implements HorlogeManuelle {
  private now: number;
  private sequence = 0;
  private readonly minuteries = new Map<number, Minuterie>();

  constructor(depart: number) {
    super();
    this.now = depart;
  }

  get enAttente(): number {
    return this.minuteries.size;
  }

  maintenant(): number {
    return this.now;
  }

  planifier(ms: number, fn: () => void): () => void {
    const id = this.sequence++;
    this.minuteries.set(id, { quand: this.now + Math.max(0, ms), fn });
    return () => {
      this.minuteries.delete(id);
    };
  }

  async avancer(ms: number): Promise<void> {
    const cible = this.now + ms;
    for (;;) {
      let prochain: [number, Minuterie] | undefined;
      for (const entree of this.minuteries) {
        if (entree[1].quand <= cible && (!prochain || entree[1].quand < prochain[1].quand)) {
          prochain = entree;
        }
      }
      if (!prochain) break;
      this.minuteries.delete(prochain[0]);
      this.now = Math.max(this.now, prochain[1].quand);
      prochain[1].fn();
      await vider();
    }
    this.now = cible;
    await vider();
  }
}

async function vider(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Horloge pilotée par les tests : rien ne se passe tant qu'on n'appelle pas `avancer`. */
export function creerHorlogeManuelle(depart: Instant): HorlogeManuelle {
  return new HorlogeDeTest(enMs(depart));
}
