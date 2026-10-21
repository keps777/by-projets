import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { ComptesVoyageurSocle, EmetteurSessionJwt } from "./adaptateurs";
import { ConnexionVoyageurController, FiltreReessai } from "./connexion.controller";
import { ConnexionVoyageurService } from "./connexion.service";
import { CONFIG_AUTH_VOYAGEUR, chargerConfigAuthVoyageur, type ConfigAuthVoyageur } from "./config";
import {
  EnvoiCodeSmsMemoire,
  EnvoiCodeWhatsAppAbsent,
  FichesVoyageurMemoire,
  StockageConnexionMemoire,
} from "./memoire";
import { FichesVoyageurPrisma, StockageConnexionPrisma } from "./postgres";
import {
  ComptesVoyageur,
  EmetteurSession,
  EnvoiCodeSms,
  EnvoiCodeWhatsApp,
  FichesVoyageur,
  StockageConnexion,
} from "./ports";

/**
 * Garde-fou : en production, refuse de démarrer tant que les codes et les fiches sont en mémoire
 * (un redémarrage effacerait les blocages : 5 essais de plus pour tout le monde) ou que le SMS part
 * dans une boîte simulée. WhatsApp non branché n'empêche pas de démarrer : les demandes WhatsApp se
 * replient sur le SMS (un avertissement le dit).
 */
@Injectable()
export class VerificationAuthVoyageur implements OnModuleInit {
  private readonly logger = new Logger("AuthVoyageur");

  constructor(
    @Inject(CONFIG_AUTH_VOYAGEUR) private readonly config: ConfigAuthVoyageur,
    private readonly stockage: StockageConnexion,
    private readonly fiches: FichesVoyageur,
    private readonly sms: EnvoiCodeSms,
    private readonly whatsapp: EnvoiCodeWhatsApp,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const problemes: string[] = [];
    if (!this.stockage.durable) problemes.push("les codes et les essais sont en mémoire");
    if (!this.fiches.durable) problemes.push("les fiches voyageur sont en mémoire");
    if (!this.sms.reel) problemes.push("l'envoi des codes par SMS est simulé");
    if (problemes.length > 0) {
      throw new Error(
        `AuthVoyageurModule : ${problemes.join(" ; ")}. Brancher les adaptateurs de production ` +
          "avant de démarrer (voir le README de apps/api/src/auth-voyageur).",
      );
    }
    if (!this.whatsapp.branche) {
      this.logger.warn(
        "WhatsApp n'est pas branché : les codes demandés par WhatsApp partent par SMS",
      );
    }
  }
}

/** Adaptateurs de production à brancher à la place de ceux en mémoire (voir `AuthVoyageurModule.avec`). */
export interface AdaptateursAuthVoyageur {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (`SmsModule`, Prisma…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `StockageConnexion`, `FichesVoyageur`,
   * `EnvoiCodeSms`, `EnvoiCodeWhatsApp`, `ComptesVoyageur`, `EmetteurSession`.
   */
  providers?: Provider[];
}

/**
 * Authentification du voyageur (AM-023) : `POST /voyageur/connexion/code` et
 * `POST /voyageur/connexion/verification`, les deux routes de la planche Connexion. Numéro + code de
 * 4 chiffres par SMS (WhatsApp en alternative), compte créé au premier code valide, session, limites
 * (5 essais puis attente, 1 envoi par 40 s) et SMS au format WebOTP.
 *
 * Module autonome : il s'appuie sur les services globaux du socle (configuration, audit, comptes,
 * jetons). Les codes, les essais et les fiches suivent `API_STOCKAGE` (PostgreSQL en production, mémoire
 * ailleurs, `postgres.ts`) ; l'envoi par SMS et par WhatsApp a des versions en mémoire que le
 * coordinateur remplace avec `AuthVoyageurModule.avec({ … })` (README).
 */
@Module({
  controllers: [ConnexionVoyageurController],
  providers: [
    {
      provide: CONFIG_AUTH_VOYAGEUR,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigAuthVoyageur =>
        chargerConfigAuthVoyageur(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: StockageConnexion,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): StockageConnexion =>
        stockageSurPostgres(config)
          ? new StockageConnexionPrisma(prisma)
          : new StockageConnexionMemoire(),
    },
    {
      provide: FichesVoyageur,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): FichesVoyageur =>
        stockageSurPostgres(config)
          ? new FichesVoyageurPrisma(prisma)
          : new FichesVoyageurMemoire(),
    },
    {
      provide: EnvoiCodeSms,
      inject: [CONFIG],
      // Simulateur : le texte n'est écrit dans les journaux que si SMS_MOCK_LOG_CODES=true (jamais en production).
      useFactory: (config: AppConfig): EnvoiCodeSms =>
        new EnvoiCodeSmsMemoire(config.sms.journaliserCodes),
    },
    { provide: EnvoiCodeWhatsApp, useClass: EnvoiCodeWhatsAppAbsent },
    { provide: ComptesVoyageur, useClass: ComptesVoyageurSocle },
    { provide: EmetteurSession, useClass: EmetteurSessionJwt },
    FiltreReessai,
    ConnexionVoyageurService,
    VerificationAuthVoyageur,
  ],
  exports: [ConnexionVoyageurService],
})
export class AuthVoyageurModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursAuthVoyageur): DynamicModule {
    return {
      module: AuthVoyageurModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
