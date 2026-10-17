import { Inject, Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { CONFIG_WHATSAPP, type ConfigWhatsApp } from "./config";

/**
 * Disjoncteur de l'API WhatsApp : après `seuilEchecs` échecs d'affilée, le circuit est « ouvert »
 * pendant `ouvertureMs` et la passerelle n'appelle plus WhatsApp (chaque essai échoue aussitôt, la
 * file réessaie puis bascule sur le SMS). Passé ce délai, un seul appel d'essai est autorisé
 * (« semi-ouvert ») : s'il réussit le circuit se referme, sinon il se rouvre.
 *
 * L'état est propre au processus : chaque instance de l'API apprend toute seule.
 */

export type EtatCircuit = "ferme" | "ouvert" | "semi_ouvert";

export interface EtatDisjoncteur {
  circuit: EtatCircuit;
  echecsConsecutifs: number;
  ouvertJusqua: Date | null;
}

@Injectable()
export class DisjoncteurWhatsApp {
  private readonly logger = new Logger("WhatsAppDisjoncteur");
  private echecs = 0;
  private ouvertJusqua: number | null = null;
  private essaiEnCours = false;

  constructor(
    private readonly horloge: Horloge,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
  ) {}

  etat(): EtatCircuit {
    if (this.ouvertJusqua === null) return "ferme";
    return this.horloge.maintenant().getTime() < this.ouvertJusqua ? "ouvert" : "semi_ouvert";
  }

  /** Vrai si on peut appeler WhatsApp. En semi-ouvert, un seul appelant obtient `true`. */
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
    if (etaitOuvert) this.logger.log("WhatsApp rétabli : circuit refermé");
  }

  echec(): void {
    this.echecs += 1;
    const etaitSemiOuvert = this.essaiEnCours;
    this.essaiEnCours = false;
    if (etaitSemiOuvert || this.echecs >= this.config.disjoncteur.seuilEchecs) {
      const dejaOuvert = this.ouvertJusqua !== null && !etaitSemiOuvert;
      this.ouvertJusqua = this.horloge.maintenant().getTime() + this.config.disjoncteur.ouvertureMs;
      if (!dejaOuvert) {
        this.logger.warn(
          `WhatsApp en échec (${this.echecs} d'affilée) : circuit ouvert ` +
            `${Math.round(this.config.disjoncteur.ouvertureMs / 1000)} s`,
        );
      }
    }
  }

  /** État lisible par l'administration. */
  instantane(): EtatDisjoncteur {
    return {
      circuit: this.etat(),
      echecsConsecutifs: this.echecs,
      ouvertJusqua: this.ouvertJusqua === null ? null : new Date(this.ouvertJusqua),
    };
  }
}
