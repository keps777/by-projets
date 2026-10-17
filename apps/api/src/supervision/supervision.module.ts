import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CaisseModule } from "../caisse/caisse.module";
import { exigerStockageDurable } from "../caisse/stockage";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { EquipeService } from "./equipe.service";
import {
  DemandesAnnulationMemoire,
  EquipeMemoire,
  PinsEquipeMemoire,
  RegistreBilletsMemoire,
  SourceGareMemoire,
} from "./memoire";
import { PinSuperviseurService, PreuvesPinService } from "./pin.service";
import { DemandesAnnulation, EquipeGare, PinsEquipe, RegistreBillets, SourceGare } from "./ports";
import { SupervisionController } from "./supervision.controller";
import { SupervisionService } from "./supervision.service";
import { ValidationSuperviseurService } from "./validation.service";

@Injectable()
export class VerificationStockageSupervision implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly registre: RegistreBillets,
    private readonly demandes: DemandesAnnulation,
    private readonly source: SourceGare,
    private readonly equipe: EquipeGare,
    private readonly pins: PinsEquipe,
  ) {}

  onModuleInit(): void {
    exigerStockageDurable("SupervisionModule", this.config, [
      ["RegistreBillets", this.registre],
      ["DemandesAnnulation", this.demandes],
      ["SourceGare", this.source],
      ["EquipeGare", this.equipe],
      ["PinsEquipe", this.pins],
    ]);
  }
}

/**
 * Supervision de la gare (AM-164) : validation des clôtures, demandes d'annulation et décision par
 * PIN, équipe et PIN (provisoires par SMS, blocage après 3 essais), journal signé.
 *
 * À importer dans `AppModule` (périmètre du socle), avec `CaisseModule`. Les ports sont remplaçables :
 * les adaptateurs PostgreSQL remplacent les versions en mémoire (tables dans le README du dossier).
 */
@Module({
  imports: [CaisseModule],
  controllers: [SupervisionController],
  providers: [
    SupervisionService,
    EquipeService,
    PinSuperviseurService,
    PreuvesPinService,
    ValidationSuperviseurService,
    VerificationStockageSupervision,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: RegistreBillets, useClass: RegistreBilletsMemoire },
    { provide: DemandesAnnulation, useClass: DemandesAnnulationMemoire },
    { provide: SourceGare, useClass: SourceGareMemoire },
    { provide: EquipeGare, useClass: EquipeMemoire },
    { provide: PinsEquipe, useClass: PinsEquipeMemoire },
  ],
  exports: [
    SupervisionService,
    EquipeService,
    PinSuperviseurService,
    PreuvesPinService,
    RegistreBillets,
    DemandesAnnulation,
    SourceGare,
    EquipeGare,
    PinsEquipe,
  ],
})
export class SupervisionModule {}
