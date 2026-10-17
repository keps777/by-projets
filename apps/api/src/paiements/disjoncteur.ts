import { Logger } from "@nestjs/common";

/**
 * Disjoncteur de l'agrégateur : après `seuilEchecs` échecs d'affilée, il est « ouvert » pendant
 * `ouvertureMs` et le module ne l'appelle plus (le mode dégradé s'active seul). Passé ce délai, un
 * seul appel d'essai est autorisé (« semi-ouvert ») : s'il réussit le circuit se referme, sinon il
 * se rouvre. L'état est propre au processus.
 */

export type EtatCircuit = "ferme" | "ouvert" | "semi_ouvert";

export class DisjoncteurPaiements {
  private readonly journal = new Logger("PaiementsDisjoncteur");
  private echecs = 0;
  private ouvertJusqua: number | null = null;
  private essaiEnCours = false;

  constructor(
    private readonly maintenant: () => Date,
    private readonly options: { seuilEchecs: number; ouvertureMs: number },
  ) {}

  etat(): EtatCircuit {
    if (this.ouvertJusqua === null) return "ferme";
    return this.maintenant().getTime() < this.ouvertJusqua ? "ouvert" : "semi_ouvert";
  }

  /** Vrai si on peut appeler l'agrégateur. En semi-ouvert, un seul appelant obtient `true`. */
  autoriser(): boolean {
    const etat = this.etat();
    if (etat === "ferme") return true;
    if (etat === "ouvert") return false;
    if (this.essaiEnCours) return false;
    this.essaiEnCours = true;
    return true;
  }

  succes(): void {
    const etaitOuvert = this.ouvertJusqua !== null;
    this.echecs = 0;
    this.ouvertJusqua = null;
    this.essaiEnCours = false;
    if (etaitOuvert) this.journal.log("Agrégateur rétabli : circuit refermé");
  }

  echec(): void {
    this.echecs += 1;
    const etaitSemiOuvert = this.essaiEnCours;
    this.essaiEnCours = false;
    if (etaitSemiOuvert || this.echecs >= this.options.seuilEchecs) {
      const dejaOuvert = this.ouvertJusqua !== null && !etaitSemiOuvert;
      this.ouvertJusqua = this.maintenant().getTime() + this.options.ouvertureMs;
      if (!dejaOuvert) {
        this.journal.warn(
          `Agrégateur en échec (${this.echecs} d'affilée) : circuit ouvert ` +
            `${Math.round(this.options.ouvertureMs / 1000)} s, mode dégradé`,
        );
      }
    }
  }

  resume(): { circuit: EtatCircuit; echecsConsecutifs: number; ouvertJusqua: Date | null } {
    return {
      circuit: this.etat(),
      echecsConsecutifs: this.echecs,
      ouvertJusqua: this.ouvertJusqua === null ? null : new Date(this.ouvertJusqua),
    };
  }
}
