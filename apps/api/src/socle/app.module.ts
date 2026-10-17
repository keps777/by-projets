import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { EnvoiCodeSmsPasserelle } from "../auth-voyageur/adaptateurs";
import { AuthVoyageurModule } from "../auth-voyageur/auth-voyageur.module";
import { EnvoiCodeSms } from "../auth-voyageur/ports";
import { AnalysesModule } from "../analyses/analyses.module";
import { AssistantRapportMoteur } from "../assistant/assistant-rapport";
import { AssistantModule } from "../assistant/assistant.module";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { CaisseModule } from "../caisse/caisse.module";
import { ColisModule } from "../colis/colis.module";
import { ComptableModule } from "../comptable/comptable.module";
import { CovoiturageModule } from "../covoiturage/covoiturage.module";
import { GpsModule } from "../gps/gps.module";
import { LivraisonModule } from "../livraison/livraison.module";
import { ModulesModule } from "../modules/modules.module";
import { NumerotationModule } from "../numerotation/numerotation.module";
import { PaiementsModule } from "../paiements/paiements.module";
import { AssistantRapport } from "../rapport/ports";
import { RapportModule } from "../rapport/rapport.module";
import { SourceRapportSoirPourWhatsApp } from "../rapport/source-whatsapp";
import { RelaisModule } from "../relais/relais.module";
import { SmsModule } from "../sms/sms.module";
import { SupervisionModule } from "../supervision/supervision.module";
import { SyncModule } from "../sync/sync.module";
import { UssdModule } from "../ussd/ussd.module";
import { EquipeAnnuaire } from "../whatsapp-achat/adaptateurs";
import { GestionnaireEntrantsAchat } from "../whatsapp-achat/gestionnaire";
import { ReconnaissanceEquipe } from "../whatsapp-achat/ports";
import { WhatsAppAchatModule } from "../whatsapp-achat/whatsapp-achat.module";
import { AnnuaireRapportPersonnes, SecoursSmsPasserelle } from "../whatsapp/adaptateurs";
import {
  AnnuaireRapport,
  GestionnaireEntrants,
  SecoursSms,
  SourceRapportSoir,
} from "../whatsapp/ports";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { GardeAuthentification, GardeRoles } from "./auth/gardes";
import { ChiffrementModule } from "./chiffrement/chiffrement.module";
import { CONFIG, type AppConfig } from "./config/config";
import { ConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { EvenementsModule } from "./evenements/evenements.module";
import { SanteController } from "./sante/sante.controller";

/**
 * Connexion du voyageur (AM-023) : le code part par la passerelle SMS (gabarit `code_connexion`, au
 * format WebOTP). Les codes, les essais et les fiches suivent `API_STOCKAGE` (adaptateurs PostgreSQL du lot A
 * choisis dans `AuthVoyageurModule`).
 */
const authVoyageur = AuthVoyageurModule.avec({
  imports: [SmsModule],
  providers: [{ provide: EnvoiCodeSms, useClass: EnvoiCodeSmsPasserelle }],
});

/**
 * Rapport du soir (AM-171) branché sur la caisse, la billetterie et la numérotation (`avecModulesExistants`).
 * Le référentiel, les ventes, les colis, les annulations, les contrôles et les rapports arrêtés suivent
 * `API_STOCKAGE` (adaptateurs PostgreSQL du lot A choisis dans `RapportModule`).
 */
const rapport = RapportModule.avecModulesExistants({
  // Lot C : la phrase d'analyse du rapport du soir vient du moteur de l'assistant du patron (AM-109).
  imports: [AssistantModule],
  providers: [{ provide: AssistantRapport, useExisting: AssistantRapportMoteur }],
});

/**
 * Achat par WhatsApp (AM-168). Le même objet de module est donné à `WhatsAppModule` : une seule instance,
 * donc une seule file et un seul état de conversations. Les numéros de l'équipe (patron, superviseurs) sont
 * lus dans les comptes : leurs messages vont à l'assistant du rapport, pas à l'achat. Les conversations, le
 * journal et les achats suivent `API_STOCKAGE` (adaptateurs PostgreSQL du lot A, choisis dans
 * `WhatsAppAchatModule`).
 */
const achatWhatsApp = WhatsAppAchatModule.avec({
  providers: [{ provide: ReconnaissanceEquipe, useClass: EquipeAnnuaire }],
});

/**
 * Passerelle WhatsApp (AM-167) : repli par SMS sur la passerelle SMS, rapport du soir lu dans le module
 * rapport, destinataires lus dans les comptes, messages reçus confiés à l'achat conversationnel (qui passe à
 * l'assistant ce qui ne le concerne pas, une fois `GESTIONNAIRE_SUIVANT` fourni). Le journal (messages,
 * essais, messages reçus) suit `API_STOCKAGE` (adaptateur PostgreSQL du lot A, choisi dans `WhatsAppModule`) ;
 * la file d'envoi reste en mémoire.
 */
const whatsApp = WhatsAppModule.avec({
  imports: [SmsModule, rapport, achatWhatsApp],
  providers: [
    { provide: SecoursSms, useClass: SecoursSmsPasserelle },
    { provide: SourceRapportSoir, useExisting: SourceRapportSoirPourWhatsApp },
    { provide: AnnuaireRapport, useClass: AnnuaireRapportPersonnes },
    { provide: GestionnaireEntrants, useExisting: GestionnaireEntrantsAchat },
  ],
});

/**
 * Socle de l'API et modules métier. Les gardes sont globales et s'exécutent dans cet ordre :
 * limitation de débit, authentification, rôles (refusé par défaut).
 */
@Module({
  imports: [
    ConfigModule,
    ChiffrementModule,
    DbModule,
    AuditModule,
    EvenementsModule,
    AuthModule,
    // Modules métier. Ceux qui n'ont pas (ou pas tous) leurs adaptateurs PostgreSQL tournent sur la
    // mémoire et refusent de démarrer en production (apps/api/INTEGRATION.md).
    // NumerotationModule est aussi importé par SyncModule (qui lui emprunte ControleNumeros et
    // AttributionPlages) : Nest ne l'instancie qu'une fois.
    NumerotationModule,
    SyncModule,
    BilletterieModule,
    ColisModule,
    CaisseModule,
    SupervisionModule,
    ModulesModule,
    SmsModule,
    GpsModule,
    PaiementsModule,
    rapport,
    achatWhatsApp,
    whatsApp,
    authVoyageur,
    UssdModule,
    CovoiturageModule,
    RelaisModule,
    LivraisonModule,
    // Lot C : analyses (global, lu par l'assistant), assistant du patron, comptable.
    AnalysesModule,
    AssistantModule,
    ComptableModule,
    ThrottlerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        skipIf: () => !config.limitationDebit,
      }),
    }),
  ],
  controllers: [SanteController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: GardeAuthentification },
    { provide: APP_GUARD, useExisting: GardeRoles },
  ],
})
export class AppModule {}
