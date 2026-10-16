import { Inject, Injectable, Logger } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../config/config";

/**
 * Envoi de SMS. Le vrai fournisseur (agrégateur SMS) viendra avec le socle messages ; d'ici là,
 * l'interface est branchée sur un simulateur. Les autres modules ne dépendent que de `SmsGateway`.
 */
export abstract class SmsGateway {
  /** `telephone` est au format international (+237…). Lève une erreur si l'envoi échoue. */
  abstract envoyer(telephone: string, message: string): Promise<void>;
}

export interface SmsEnvoye {
  telephone: string;
  message: string;
  at: Date;
}

/**
 * Simulateur : garde les derniers messages en mémoire (tests) et, si SMS_MOCK_LOG_CODES=true
 * (jamais en production), les écrit dans la console pour qu'un développeur lise le code reçu.
 */
@Injectable()
export class SmsMock extends SmsGateway {
  private readonly logger = new Logger("SmsMock");
  private readonly boite: SmsEnvoye[] = [];

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    super();
  }

  async envoyer(telephone: string, message: string): Promise<void> {
    this.boite.push({ telephone, message, at: new Date() });
    if (this.boite.length > 100) this.boite.shift();
    if (this.config.sms.journaliserCodes) {
      this.logger.log(`SMS simulé vers ${telephone} : ${message}`);
    } else {
      this.logger.log("SMS simulé envoyé (contenu non journalisé)");
    }
  }

  /** Messages simulés, du plus ancien au plus récent (tests uniquement). */
  messages(): readonly SmsEnvoye[] {
    return this.boite;
  }

  dernier(): SmsEnvoye | undefined {
    return this.boite[this.boite.length - 1];
  }
}
