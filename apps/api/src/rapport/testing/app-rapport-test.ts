import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
import { METHODE_PAR_ROLE, type Role } from "../../socle/auth/roles";
import { TokensService } from "../../socle/auth/tokens.service";
import { ComptesService } from "../../socle/comptes/comptes.service";
import { PersonnesRepository } from "../../socle/comptes/personnes.repository";
import { CONFIG } from "../../socle/config/config";
import { configurerApp } from "../../socle/configurer-app";
import { PrismaService } from "../../socle/db/prisma.service";
import { EvenementsRepository } from "../../socle/evenements/evenements.service";
import { Horloge } from "../../socle/horloge";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { PlanificateurRapport } from "../planificateur";
import { RapportModule } from "../rapport.module";
import { RapportSoirService } from "../rapport.service";
import { AKWA, COMPAGNIE, monterRapport, type MontageRapport } from "./montage";
import {
  ActiviteColis,
  AnnulationsDuJour,
  AssistantRapport,
  CaissesDuJour,
  ControlesEnRoute,
  DepartsDuJour,
  RapportsSoir,
  ReferentielRapport,
  TrousNumerotation,
  VentesBillets,
} from "../ports";

/**
 * L'API complète (gardes, rôles, audit) avec `RapportModule`, branchée sur les ports en mémoire
 * d'un montage `monterRapport()` que le test remplit avant d'appeler les routes.
 */
export async function creerAppRapportTest() {
  const montage: MontageRapport = monterRapport();
  const config = configTest();
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({
    imports: [
      AppModule,
      RapportModule.avec({
        providers: [
          { provide: ReferentielRapport, useValue: montage.referentiel },
          { provide: VentesBillets, useValue: montage.ventes },
          { provide: DepartsDuJour, useValue: montage.departs },
          { provide: ActiviteColis, useValue: montage.colis },
          { provide: CaissesDuJour, useValue: montage.caisses },
          { provide: AnnulationsDuJour, useValue: montage.annulations },
          { provide: TrousNumerotation, useValue: montage.trous },
          { provide: ControlesEnRoute, useValue: montage.controles },
          { provide: AssistantRapport, useValue: montage.assistant },
          { provide: RapportsSoir, useValue: montage.rapports },
        ],
      }),
    ],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PersonnesRepository)
    .useValue(new PersonnesMemoire())
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(new EvenementsMemoire())
    .overrideProvider(Horloge)
    .useValue(montage.horloge)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 700;

  async function compte(
    role: Role,
    options: { compagnieId?: string | null; gareId?: string | null } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const personne = await comptes.creer({
      nom: `Test ${role}`,
      telephone: `+2376554${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: options.compagnieId === undefined ? COMPAGNIE : options.compagnieId,
      gareId: options.gareId === undefined ? AKWA : options.gareId,
      pin: "482915",
      ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
        ? { motDePasse: "Un-mot-de-passe-solide" }
        : {}),
    });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken };
  }

  return {
    app,
    montage,
    auditRepo,
    http: () => request(app.getHttpServer()),
    compte,
    service: app.get(RapportSoirService),
    planificateur: app.get(PlanificateurRapport),
    fermer: () => app.close(),
  };
}

export type AppRapportTest = Awaited<ReturnType<typeof creerAppRapportTest>>;
