import type { DonneesBillet } from "./gabarits/billet";
import type { DonneesEtiquette } from "./gabarits/etiquette";
import {
  FileImpression,
  type InstantaneFile,
  type OptionsFile,
  type ResultatDemande,
} from "./file/file-impression";
import type { InstantaneLiaison, StockageCle, Transport } from "./transport/transport";

/** Tout ce qu'un écran veut savoir de l'impression, en un seul objet stable entre deux changements. */
export interface InstantaneImpression {
  /** Ce navigateur peut-il parler à une imprimante ? Faux sur Safari iOS. */
  disponible: boolean;
  liaison: InstantaneLiaison;
  file: InstantaneFile;
}

export interface OptionsService extends Partial<Omit<OptionsFile, "transport" | "stockage">> {
  transport: Transport;
  stockage: StockageCle;
}

/** Imprimante + file d'impression, prêtes à brancher sur les écrans (voir les hooks de `apps/web`). */
export class ServiceImpression {
  readonly transport: Transport;
  readonly file: FileImpression;
  private courant: InstantaneImpression;

  constructor(options: OptionsService) {
    this.transport = options.transport;
    this.file = new FileImpression(options);
    this.courant = this.calculer();
  }

  private calculer(): InstantaneImpression {
    return {
      disponible: this.transport.disponible,
      liaison: this.transport.instantane(),
      file: this.file.instantane(),
    };
  }

  instantane(): InstantaneImpression {
    const liaison = this.transport.instantane();
    const file = this.file.instantane();
    if (liaison !== this.courant.liaison || file !== this.courant.file) {
      this.courant = this.calculer();
    }
    return this.courant;
  }

  abonner(ecouteur: () => void): () => void {
    const a = this.transport.abonner(ecouteur);
    const b = this.file.abonner(ecouteur);
    return () => {
      a();
      b();
    };
  }

  /** Relit la file, tente de retrouver l'imprimante déjà appairée et relance ce qui attendait. */
  async demarrer(): Promise<void> {
    await this.file.demarrer();
    if (this.transport.disponible) await this.transport.reconnecter().catch(() => false);
  }

  arreter(): void {
    this.file.arreter();
  }

  /** À appeler depuis une touche : le navigateur exige un geste pour ouvrir le sélecteur Bluetooth. */
  appairer(): Promise<void> {
    return this.transport.appairer();
  }

  oublier(): Promise<void> {
    return this.transport.oublier();
  }

  imprimerBillet(donnees: DonneesBillet): Promise<ResultatDemande> {
    return this.file.imprimer("billet", donnees);
  }

  imprimerEtiquette(donnees: DonneesEtiquette): Promise<ResultatDemande> {
    return this.file.imprimer("etiquette", donnees);
  }

  reimprimer(id: string): Promise<ResultatDemande> {
    return this.file.reimprimer(id);
  }
}
