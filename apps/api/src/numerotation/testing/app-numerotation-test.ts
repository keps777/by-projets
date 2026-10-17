import "reflect-metadata";
import { Module } from "@nestjs/common";
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
import { Horloge, HorlogeSysteme } from "../../socle/horloge";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import {
  AlertesMemoire,
  AppareilsMemoire,
  JournalMemoire,
  ProvisionnementMemoire,
  SiegesMemoire,
} from "../../sync/memoire";
import {
  AlertesSync,
  AppareilsSync,
  AttributionPlages,
  ControleNumeros,
  JournalSync,
  ProvisionnementSync,
  SiegesSync,
  type AppareilSync,
  type NouvelAppareil,
} from "../../sync/ports";
import { RejeuService } from "../../sync/rejeu.service";
import { SyncController } from "../../sync/sync.controller";
import { AlertesNumerotation, PlagesAttribuees, RegistreNumeros } from "../ports";
import { ControleJourneeService } from "../controle-journee.service";
import { NumerotationModule } from "../numerotation.module";
import { NumerotationService } from "../numerotation.service";
import { PlagesService } from "../plages.service";
import type { AlertesNumerotationMemoire, RegistreNumerosMemoire } from "../memoire";
import { COMPAGNIE, GARE } from "./montage";

export { AUTRE_GARE, COMPAGNIE, GARE } from "./montage";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";

/**
 * `SyncModule` tel qu'il doit être une fois AM-161 branché : mêmes fournisseurs, mais `ControleNumeros`
 * et `AttributionPlages` viennent de `NumerotationModule` (importé) au lieu des versions en mémoire.
 * C'est exactement la modification de `sync/sync.module.ts` décrite dans le README du dossier ;
 * ce module de test la fait sans toucher au dossier `sync`.
 */
@Module({
  imports: [NumerotationModule],
  controllers: [SyncController],
  providers: [
    RejeuService,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: AppareilsSync, useClass: AppareilsMemoire },
    { provide: JournalSync, useClass: JournalMemoire },
    { provide: SiegesSync, useClass: SiegesMemoire },
    { provide: AlertesSync, useClass: AlertesMemoire },
    { provide: ProvisionnementSync, useClass: ProvisionnementMemoire },
  ],
  // SyncModule exportait ces deux jetons : il réexporte maintenant le module qui les fournit
  exports: [RejeuService, NumerotationModule],
})
export class SyncAvecNumerotation {}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec la synchronisation branchée sur la
 * numérotation d'AM-161, le tout sur les adaptateurs en mémoire.
 */
export async function creerAppNumerotationTest(options: { debut?: Date } = {}) {
  const config = configTest();
  const horloge = new HorlogeFixe(options.debut ?? new Date("2027-01-05T20:00:00.000Z"));
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({ imports: [AppModule, SyncAvecNumerotation] })
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
    .useValue(horloge)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 700;

  /** Crée un compte et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    options: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const personne = await comptes.creer({
      nom: options.nom ?? `Test ${role}`,
      telephone: `+2376552${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: options.compagnieId === undefined ? COMPAGNIE : options.compagnieId,
      gareId: options.gareId === undefined ? GARE : options.gareId,
      pin: "482915",
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken };
  }

  const appareils = app.get(AppareilsSync) as AppareilsMemoire;
  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    auditRepo,
    compte,
    appareils,
    alertesSync: app.get(AlertesSync) as AlertesMemoire,
    controleNumeros: app.get(ControleNumeros),
    attribution: app.get(AttributionPlages),
    plages: app.get(PlagesService),
    numerotation: app.get(NumerotationService),
    controle: app.get(ControleJourneeService),
    plagesStock: app.get(PlagesAttribuees),
    registre: app.get(RegistreNumeros) as RegistreNumerosMemoire,
    alertesNumerotation: app.get(AlertesNumerotation) as AlertesNumerotationMemoire,
    declarer: (appareil: NouvelAppareil): Promise<AppareilSync> =>
      appareils.declarer({ gareId: GARE, compagnieId: COMPAGNIE, ...appareil }),
    fermer: () => app.close(),
  };
}

export type AppNumerotationTest = Awaited<ReturnType<typeof creerAppNumerotationTest>>;
