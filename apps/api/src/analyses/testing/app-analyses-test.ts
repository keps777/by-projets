import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
import { HachageService } from "../../socle/auth/hachage.service";
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
import { AnalysesModule } from "../analyses.module";
import { AnalysesService } from "../analyses.service";
import {
  FaitsCaisse,
  FaitsDeparts,
  OffresPubliques,
  ReferentielAnalyses,
  ReseauAnonyme,
} from "../ports";
import { COMPAGNIE, monterAnalyses, type MontageAnalyses } from "./montage";

export interface OptionsAppAnalyses {
  /** Modules à monter en plus (l'assistant). */
  modules?: Array<new () => unknown>;
  /** Fournisseurs à remplacer : `[jeton, valeur]`. */
  remplacements?: Array<[unknown, unknown]>;
  config?: Record<string, string>;
  montage?: MontageAnalyses;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec `AnalysesModule` branché sur les ports en mémoire
 * d'un montage `monterAnalyses()` que le test remplit avant d'appeler les routes.
 */
export async function creerAppAnalysesTest(options: OptionsAppAnalyses = {}) {
  const montage = options.montage ?? monterAnalyses();
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const auditRepo = new AuditMemoire();
  const evenements = new EvenementsMemoire();

  let builder = Test.createTestingModule({
    imports: [AppModule, AnalysesModule, ...(options.modules ?? [])],
  })
    .overrideProvider(ReferentielAnalyses)
    .useValue(montage.referentiel)
    .overrideProvider(FaitsDeparts)
    .useValue(montage.departs)
    .overrideProvider(FaitsCaisse)
    .useValue(montage.caisse)
    .overrideProvider(OffresPubliques)
    .useValue(montage.offres)
    .overrideProvider(ReseauAnonyme)
    .useValue(montage.reseau)
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(evenements)
    .overrideProvider(Horloge)
    .useValue(montage.horloge)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined });
  for (const [jeton, valeur] of options.remplacements ?? []) {
    builder = builder.overrideProvider(jeton as never).useValue(valeur);
  }
  const module = await builder.compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  let compteur = 900;

  /** Crée un compte (patron de la compagnie de la planche par défaut) et un jeton d'accès. */
  async function compte(
    role: Role,
    opts: { compagnieId?: string | null; gareId?: string | null; pin?: string } = {},
  ): Promise<{ id: string; jeton: string; pin: string }> {
    compteur += 1;
    const pin = opts.pin ?? "482915";
    const personne = await comptes.creer({
      nom: `Test ${role}`,
      telephone: `+2376554${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: opts.compagnieId === undefined ? COMPAGNIE : opts.compagnieId,
      gareId: opts.gareId === undefined ? null : opts.gareId,
      pin,
      ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
        ? { motDePasse: "Un-mot-de-passe-solide" }
        : {}),
    });
    // Un patron se connecte par mot de passe : son PIN de signature est posé à part.
    personnes.modifier(personne.id, { pinHache: await hachage.hacher(pin) });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken, pin };
  }

  return {
    app,
    montage,
    auditRepo,
    http: () => request(app.getHttpServer()),
    compte,
    service: app.get(AnalysesService),
    fermer: () => app.close(),
  };
}

export type AppAnalysesTest = Awaited<ReturnType<typeof creerAppAnalysesTest>>;
