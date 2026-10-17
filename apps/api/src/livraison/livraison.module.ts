import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { ColisModule } from "../colis/colis.module";
import { ColisRepository } from "../colis/ports";
import { RelaisModule } from "../relais/relais.module";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AgentsLivreursController, InscriptionLivreurController } from "./inscription.controller";
import { InscriptionLivreurService } from "./inscription.service";
import {
  LivraisonVoyageurController,
  LivreurController,
  SuiviPublicController,
} from "./livraison.controller";
import { LivraisonService } from "./livraison.service";
import { LivreursService } from "./livreurs.service";
import {
  DemandesLivreurMemoire,
  DiffusionLivraisonMemoire,
  InvitationsMemoire,
  LivreursMemoire,
  MissionsMemoire,
  PartagesSuiviMemoire,
} from "./memoire";
import { MissionsService } from "./missions.service";
import {
  DemandesLivreurPrisma,
  InvitationsPrisma,
  LivreursPrisma,
  MissionsPrisma,
  PartagesSuiviPrisma,
} from "./postgres";
import {
  ColisALivrer,
  ColisALivrerParColis,
  DemandesLivreurRepository,
  DiffusionLivraison,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
} from "./ports";
import { TachesLivraison } from "./taches.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire
 * (les livreurs, les missions et leurs gains seraient perdus au redémarrage).
 */
@Injectable()
export class VerificationPortsLivraison implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly livreurs: LivreursRepository,
    private readonly demandes: DemandesLivreurRepository,
    private readonly missions: MissionsRepository,
    private readonly partages: PartagesSuivi,
    private readonly invitations: Invitations,
    private readonly diffusion: DiffusionLivraison,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["LivreursRepository", this.livreurs],
      ["DemandesLivreurRepository", this.demandes],
      ["MissionsRepository", this.missions],
      ["PartagesSuivi", this.partages],
      ["Invitations", this.invitations],
      ["DiffusionLivraison", this.diffusion],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `LivraisonModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs réels ` +
          "(tables PostgreSQL décrites dans apps/api/src/livraison/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Livraison moto (AM-148) : inscription et vérification des livreurs (badge L-…), missions proposées
 * une à une selon la zone, les heures et la charge (30 secondes pour accepter), remise contre le code du
 * client, destinataire absent (10 minutes, puis relais), gains (70 % de la livraison) versés le soir.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`) avec une version en mémoire
 * (`memoire.ts`). Il s'appuie sur `RelaisModule` (portefeuille, versements, lieux, rôles) et sur
 * `ColisService.executer` pour tout changement d'état d'un colis. Dans `AppModule`. Les ports de
 * persistance ont une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par
 * `API_STOCKAGE`. Reste dans le processus, et fait donc refuser la production : la diffusion en direct.
 */
@Module({
  imports: [ColisModule, RelaisModule],
  controllers: [
    LivraisonVoyageurController,
    SuiviPublicController,
    LivreurController,
    InscriptionLivreurController,
    AgentsLivreursController,
  ],
  providers: [
    MissionsService,
    LivreursService,
    LivraisonService,
    InscriptionLivreurService,
    TachesLivraison,
    VerificationPortsLivraison,
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: LivreursRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new LivreursPrisma(prisma, chiffrement)
          : new LivreursMemoire(),
    },
    {
      provide: DemandesLivreurRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new DemandesLivreurPrisma(prisma, chiffrement)
          : new DemandesLivreurMemoire(),
    },
    {
      provide: MissionsRepository,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new MissionsPrisma(prisma) : new MissionsMemoire(),
    },
    {
      provide: PartagesSuivi,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PartagesSuiviPrisma(prisma) : new PartagesSuiviMemoire(),
    },
    {
      provide: Invitations,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new InvitationsPrisma(prisma) : new InvitationsMemoire(),
    },
    // La diffusion en direct passe par les passerelles WebSocket, qui restent à écrire : elle reste dans le
    // processus et refuse la production.
    { provide: DiffusionLivraison, useClass: DiffusionLivraisonMemoire },
    {
      provide: ColisALivrer,
      inject: [ColisRepository],
      useFactory: (colis: ColisRepository) => new ColisALivrerParColis(colis),
    },
  ],
  exports: [
    MissionsService,
    LivreursService,
    LivraisonService,
    InscriptionLivreurService,
    TachesLivraison,
    LivreursRepository,
    DemandesLivreurRepository,
    MissionsRepository,
    PartagesSuivi,
    Invitations,
    DiffusionLivraison,
    ColisALivrer,
  ],
})
export class LivraisonModule {}
