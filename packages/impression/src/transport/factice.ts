import {
  ErreurTransport,
  EtatObservable,
  type InstantaneLiaison,
  type Transport,
} from "./transport";

export interface OptionsTransportFactice {
  /** Faux : simule Safari iOS (pas de Web Bluetooth). */
  disponible?: boolean;
  /** Imprimante déjà appairée au départ. */
  appairee?: boolean;
  /** Imprimante allumée et à portée au départ. */
  branchee?: boolean;
  nom?: string;
  /** Durée d'une écriture, en millisecondes (démo : rend le « Impression… » visible). */
  latenceMs?: number;
}

/**
 * Imprimante simulée pour les tests et la démo : enregistre les octets reçus, peut être débranchée et
 * rebranchée, et peut faire échouer les prochaines écritures.
 */
export class TransportFactice implements Transport {
  readonly disponible: boolean;
  /** Un élément par appel à `envoyer`, dans l'ordre. */
  readonly envoyes: Uint8Array[] = [];
  private readonly etat: EtatObservable;
  private appairee: boolean;
  private branchee: boolean;
  private echecs = 0;
  private readonly infos: { id: string; nom: string };
  private readonly latenceMs: number;

  constructor(options: OptionsTransportFactice = {}) {
    this.disponible = options.disponible ?? true;
    this.appairee = options.appairee ?? true;
    this.branchee = options.branchee ?? true;
    this.infos = { id: "factice", nom: options.nom ?? "Imprimante simulée" };
    this.latenceMs = options.latenceMs ?? 0;
    this.etat = new EtatObservable(this.calculer());
  }

  private calculer(): InstantaneLiaison {
    const imprimante = this.appairee ? this.infos : null;
    if (!this.disponible) return { etat: "indisponible", imprimante: null, erreur: null };
    if (!this.appairee) return { etat: "non_appairee", imprimante: null, erreur: null };
    return { etat: this.branchee ? "ok" : "deconnectee", imprimante, erreur: null };
  }

  private synchroniser(): void {
    this.etat.changer(this.calculer());
  }

  instantane(): InstantaneLiaison {
    return this.etat.instantane();
  }

  abonner(ecouteur: () => void): () => void {
    return this.etat.abonner(ecouteur);
  }

  async appairer(): Promise<void> {
    if (!this.disponible) throw new ErreurTransport("indisponible", "Bluetooth indisponible");
    this.appairee = true;
    this.branchee = true;
    this.synchroniser();
  }

  async reconnecter(): Promise<boolean> {
    return this.appairee && this.branchee;
  }

  async envoyer(octets: Uint8Array): Promise<void> {
    if (!this.disponible) throw new ErreurTransport("indisponible", "Bluetooth indisponible");
    if (!this.appairee || !this.branchee) {
      throw new ErreurTransport("absente", "Imprimante absente");
    }
    if (this.latenceMs > 0) await new Promise((r) => setTimeout(r, this.latenceMs));
    if (this.echecs > 0) {
      this.echecs -= 1;
      throw new ErreurTransport("ecriture", "Écriture refusée par l'imprimante");
    }
    this.envoyes.push(Uint8Array.from(octets));
  }

  async oublier(): Promise<void> {
    this.appairee = false;
    this.synchroniser();
  }

  /** L'imprimante s'éteint ou sort de portée. */
  debrancher(): void {
    this.branchee = false;
    this.synchroniser();
  }

  /** L'imprimante revient. */
  brancher(): void {
    this.branchee = true;
    this.synchroniser();
  }

  /** Les `n` prochaines écritures échouent bien que l'imprimante soit connectée. */
  echouerProchains(n: number): void {
    this.echecs = n;
  }
}
