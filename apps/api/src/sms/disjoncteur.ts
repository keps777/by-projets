import { Inject, Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { CONFIG_SMS, type ConfigSms } from "./config";

/**
 * Disjoncteur par fournisseur : après `seuilEchecs` échecs d'affilée, le fournisseur est « ouvert »
 * pendant `ouvertureMs` et la passerelle ne l'appelle plus (le secours prend le relais, ou le
 * message attend son prochain essai). Passé ce délai, un seul appel d'essai est autorisé
 * (« semi-ouvert ») : s'il réussit le circuit se referme, sinon il se rouvre.
 *
 * L'état est propre au processus : chaque instance de l'API apprend toute seule.
 */

export type EtatCircuit = "ferme" | "ouvert" | "semi_ouvert";

interface Circuit {
  echecs: number;
  ouvertJusqua: number | null;
  essaiEnCours: boolean;
}

export interface EtatDisjoncteur {
  fournisseur: string;
  circuit: EtatCircuit;
  echecsConsecutifs: number;
  ouvertJusqua: Date | null;
}

@Injectable()
export class Disjoncteur {
  private readonly logger = new Logger("SmsDisjoncteur");
  private readonly circuits = new Map<string, Circuit>();

  constructor(
    private readonly horloge: Horloge,
    @Inject(CONFIG_SMS) private readonly config: ConfigSms,
  ) {}

  private circuit(nom: string): Circuit {
    let c = this.circuits.get(nom);
    if (!c) {
      c = { echecs: 0, ouvertJusqua: null, essaiEnCours: false };
      this.circuits.set(nom, c);
    }
    return c;
  }

  etat(nom: string): EtatCircuit {
    const c = this.circuit(nom);
    if (c.ouvertJusqua === null) return "ferme";
    return this.horloge.maintenant().getTime() < c.ouvertJusqua ? "ouvert" : "semi_ouvert";
  }

  /** Vrai si on peut appeler le fournisseur. En semi-ouvert, un seul appelant obtient `true`. */
  autoriser(nom: string): boolean {
    const etat = this.etat(nom);
    if (etat === "ferme") return true;
    if (etat === "ouvert") return false;
    const c = this.circuit(nom);
    if (c.essaiEnCours) return false;
    c.essaiEnCours = true;
    return true;
  }

  succes(nom: string): void {
    const c = this.circuit(nom);
    const etaitOuvert = c.ouvertJusqua !== null;
    c.echecs = 0;
    c.ouvertJusqua = null;
    c.essaiEnCours = false;
    if (etaitOuvert) this.logger.log(`Fournisseur ${nom} rétabli : circuit refermé`);
  }

  echec(nom: string): void {
    const c = this.circuit(nom);
    c.echecs += 1;
    const etaitSemiOuvert = c.essaiEnCours;
    c.essaiEnCours = false;
    if (etaitSemiOuvert || c.echecs >= this.config.disjoncteur.seuilEchecs) {
      const jusqua = this.horloge.maintenant().getTime() + this.config.disjoncteur.ouvertureMs;
      const dejaOuvert = c.ouvertJusqua !== null && !etaitSemiOuvert;
      c.ouvertJusqua = jusqua;
      if (!dejaOuvert) {
        this.logger.warn(
          `Fournisseur ${nom} en échec (${c.echecs} d'affilée) : circuit ouvert ` +
            `${Math.round(this.config.disjoncteur.ouvertureMs / 1000)} s`,
        );
      }
    }
  }

  etats(noms: readonly string[]): EtatDisjoncteur[] {
    return noms.map((fournisseur) => {
      const c = this.circuit(fournisseur);
      return {
        fournisseur,
        circuit: this.etat(fournisseur),
        echecsConsecutifs: c.echecs,
        ouvertJusqua: c.ouvertJusqua === null ? null : new Date(c.ouvertJusqua),
      };
    });
  }
}
