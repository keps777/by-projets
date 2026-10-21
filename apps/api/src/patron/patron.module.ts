import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { AdministrationModule } from "../administration/administration.module";
import { AssistantModule } from "../assistant/assistant.module";
import { CaisseModule } from "../caisse/caisse.module";
import { AlertesPatron, ReglesAgence } from "../caisse/ports";
import { ReglesMemoire } from "../caisse/memoire";
import { VerificateurSignature } from "../modules/signature";
import { SupervisionModule } from "../supervision/supervision.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CONFIG_PATRON, chargerConfigPatron, type ConfigPatron } from "./config";
import { FaitsDuJourService } from "./jour.service";
import { LecturesPatronService } from "./lectures.service";
import {
  AlertesEcritesMemoire,
  EquipePatronMemoire,
  ExploitationPatronMemoire,
  ReferentielPatronMemoire,
  ReglesPatronMemoire,
} from "./memoire";
import { PatronController, ReglagesPatronController } from "./patron.controller";
import {
  AlertesEcritesPrisma,
  EquipePatronPrisma,
  ExploitationPatronPrisma,
  ReferentielPatronPrisma,
  ReglesPatronPrisma,
} from "./postgres";
import {
  AlertesEcrites,
  EquipePatron,
  ExploitationPatron,
  ReferentielPatron,
  ReglesPatron,
  type Durable,
} from "./ports";
import { ReglagesPatronService } from "./reglages.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module patron est en mémoire (le patron
 * verrait un tableau vide, ou pire, ses réglages ne seraient pas enregistrés).
 */
@Injectable()
export class VerificationPatron implements OnModuleInit {
  constructor(
    @Inject(CONFIG_PATRON) private readonly config: ConfigPatron,
    private readonly referentiel: ReferentielPatron,
    private readonly exploitation: ExploitationPatron,
    private readonly alertes: AlertesEcrites,
    private readonly equipe: EquipePatron,
    private readonly regles: ReglesPatron,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: Array<[string, Durable]> = [
      ["ReferentielPatron", this.referentiel],
      ["ExploitationPatron", this.exploitation],
      ["AlertesEcrites", this.alertes],
      ["EquipePatron", this.equipe],
      ["ReglesPatron", this.regles],
    ];
    const volatils = ports.filter(([, port]) => !port.durable).map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `PatronModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL (apps/api/src/patron/postgres.ts) avant de démarrer en production.",
      );
    }
  }
}

/** Ce que l'on peut brancher à la place des adaptateurs par défaut (voir `PatronModule.avec`). */
export interface AdaptateursPatron {
  /**
   * Modules qui fournissent `VentesBillets`, `ActiviteColis`, `CaissesDuJour` et `DepartsDuJour` : le
   * module rapport du soir tel qu'il est monté dans l'application (`RapportModule.avecModulesExistants`).
   */
  imports?: ModuleMetadata["imports"];
  /** Fournisseurs qui remplacent ceux par défaut. */
  providers?: Provider[];
}

/**
 * Les routes `/patron/*` de l'espace patron : tableau du jour, alertes, gares, équipe, fiche d'une
 * personne, salle de contrôle, et les réglages (équipe, règles, comptes mobile money). Les lignes (leurs
 * horaires, leurs réglages, la génération des départs) sont celles du module administration, que ce module
 * importe pour l'accueil des réglages : il n'a ni table ni route de lignes à lui.
 *
 * Il n'a pas de source de chiffres à lui : les chiffres du jour viennent des ports du rapport du soir, la
 * caisse de `CaisseService`, les demandes d'annulation et l'état des gares de la supervision, les
 * suggestions de l'assistant. Il écrit les réglages (voir `README.md`). Les ports ont une version
 * PostgreSQL et une version en mémoire, choisies par `API_STOCKAGE`.
 *
 * Un seul `PatronModule.avec({ imports: [rapport] })` dans `AppModule`, avec le module rapport du soir de
 * l'application : un deuxième module rapport aurait ses propres ports, donc ses propres données.
 */
@Module({
  imports: [CaisseModule, SupervisionModule, AssistantModule, AdministrationModule],
  controllers: [PatronController, ReglagesPatronController],
  providers: [
    {
      provide: CONFIG_PATRON,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigPatron =>
        chargerConfigPatron(config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: ReferentielPatron,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ReferentielPatronPrisma(prisma)
          : new ReferentielPatronMemoire(),
    },
    {
      provide: ExploitationPatron,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ExploitationPatronPrisma(prisma)
          : new ExploitationPatronMemoire(),
    },
    {
      provide: AlertesEcrites,
      inject: [CONFIG, PrismaService, AlertesPatron, Horloge],
      useFactory: (
        config: AppConfig,
        prisma: PrismaService,
        ecrites: AlertesPatron,
        horloge: Horloge,
      ) => {
        if (stockageSurPostgres(config)) return new AlertesEcritesPrisma(prisma);
        // En mémoire, les alertes que la caisse écrit dans son propre port sont lues d'ici.
        const memoire = new AlertesEcritesMemoire();
        const lignes = (ecrites as unknown as { lignes?: ReadonlyArray<never> }).lignes;
        if (Array.isArray(lignes))
          memoire.brancher(
            () => lignes,
            () => horloge.maintenant(),
          );
        return memoire;
      },
    },
    {
      provide: EquipePatron,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new EquipePatronPrisma(prisma) : new EquipePatronMemoire(),
    },
    {
      provide: ReglesPatron,
      inject: [CONFIG, PrismaService, ReglesAgence],
      useFactory: (config: AppConfig, prisma: PrismaService, caisse: ReglesAgence) => {
        if (stockageSurPostgres(config)) return new ReglesPatronPrisma(prisma);
        // En mémoire, la tolérance réglée ici est celle que la caisse applique.
        const memoire = new ReglesPatronMemoire();
        if (caisse instanceof ReglesMemoire) {
          memoire.surTolerance = (compagnieId, montant) =>
            caisse.definirTolerance(compagnieId, montant);
        }
        return memoire;
      },
    },
    VerificateurSignature,
    FaitsDuJourService,
    LecturesPatronService,
    ReglagesPatronService,
    VerificationPatron,
  ],
  exports: [
    LecturesPatronService,
    ReglagesPatronService,
    CONFIG_PATRON,
    ReferentielPatron,
    ExploitationPatron,
    AlertesEcrites,
    EquipePatron,
    ReglesPatron,
  ],
})
export class PatronModule {
  /** Le module avec le module rapport de l'application et, au besoin, d'autres adaptateurs. */
  static avec(adaptateurs: AdaptateursPatron): DynamicModule {
    return {
      module: PatronModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
