import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { Passagers } from "../billetterie/passagers";
import { PaiementsModule } from "../paiements/paiements.module";
import { RelaisModule } from "../relais/relais.module";
import { SmsModule } from "../sms/sms.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import {
  MessagesVendeursSms,
  OffreBilletsBilletterie,
  ReglementsAgencePaiements,
} from "./adaptateurs";
import { AgrementsService } from "./agrements.service";
import { CommissionsService } from "./commissions.service";
import {
  AgrementsMemoire,
  CommissionsMemoire,
  ComptesVendeursMemoire,
  NumerosVendeursMemoire,
  VendeursMemoire,
  VentesMemoire,
} from "./memoire";
import { chargerOptionsVendeurs } from "./options";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  ComptesVendeurs,
  MessagesVendeurs,
  NumerosVendeurs,
  OPTIONS_VENDEURS,
  OffreBillets,
  ReglementsAgence,
  VendeursRepository,
  VentesRepository,
} from "./ports";
import { TachesVendeurs } from "./taches.service";
import { AgenceVendeursController, VendeurController } from "./vendeurs.controller";
import { VendeursService } from "./vendeurs.service";
import { VentesService } from "./ventes.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de stockage du module est branché sur
 * la mémoire (les vendeurs, leurs ventes et leurs commissions seraient perdus au redémarrage).
 */
@Injectable()
export class VerificationPortsVendeurs implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly vendeurs: VendeursRepository,
    private readonly agrements: AgrementsRepository,
    private readonly numeros: NumerosVendeurs,
    private readonly ventes: VentesRepository,
    private readonly commissions: CommissionsVendeurs,
    private readonly comptes: ComptesVendeurs,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["VendeursRepository", this.vendeurs],
      ["AgrementsRepository", this.agrements],
      ["NumerosVendeurs", this.numeros],
      ["VentesRepository", this.ventes],
      ["CommissionsVendeurs", this.commissions],
      ["ComptesVendeurs", this.comptes],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `VendeursModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs réels ` +
          "(tables PostgreSQL décrites dans apps/api/src/vendeurs/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Vendeurs ambulants (AM-149) : agrément par les agences, vente d'un billet au nom d'un voisin,
 * paiement MoMo de l'agence par le vendeur dans la minute (le vendeur ne détient jamais l'argent du
 * billet), commissions (100 F, 150 F VIP) versées le lundi.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`). Les départs, sièges et
 * billets passent par la billetterie (AM-162), le paiement de l'agence par les paiements (AM-165),
 * le SMS du billet par la passerelle SMS (AM-166) et le versement des commissions par
 * `VersementsMobile` du module des relais. Le stockage et les comptes sont en mémoire en attendant
 * leurs adaptateurs PostgreSQL (voir le README) ; le module n'est pas encore dans `AppModule`.
 */
@Module({
  imports: [BilletterieModule, PaiementsModule, SmsModule, RelaisModule],
  controllers: [VendeurController, AgenceVendeursController],
  providers: [
    VendeursService,
    VentesService,
    AgrementsService,
    CommissionsService,
    TachesVendeurs,
    VerificationPortsVendeurs,
    Passagers,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: OPTIONS_VENDEURS, useFactory: () => chargerOptionsVendeurs() },
    { provide: VendeursRepository, useClass: VendeursMemoire },
    { provide: AgrementsRepository, useClass: AgrementsMemoire },
    { provide: NumerosVendeurs, useClass: NumerosVendeursMemoire },
    { provide: VentesRepository, useClass: VentesMemoire },
    { provide: CommissionsVendeurs, useClass: CommissionsMemoire },
    { provide: ComptesVendeurs, useClass: ComptesVendeursMemoire },
    { provide: OffreBillets, useClass: OffreBilletsBilletterie },
    { provide: ReglementsAgence, useClass: ReglementsAgencePaiements },
    { provide: MessagesVendeurs, useClass: MessagesVendeursSms },
  ],
  exports: [
    VendeursService,
    VentesService,
    AgrementsService,
    CommissionsService,
    TachesVendeurs,
    VendeursRepository,
    AgrementsRepository,
    NumerosVendeurs,
    VentesRepository,
    CommissionsVendeurs,
    ComptesVendeurs,
    OffreBillets,
    ReglementsAgence,
    MessagesVendeurs,
  ],
})
export class VendeursModule {}
