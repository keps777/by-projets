import "reflect-metadata";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";
import { AuditRepository } from "../audit/audit.repository";
import { AuditService } from "../audit/audit.service";
import { DefisRepository } from "../auth/defis.repository";
import { PersonnesRepository } from "../comptes/personnes.repository";
import { ComptesService, type DemandeCompte } from "../comptes/comptes.service";
import { CONFIG, chargerConfig, type AppConfig } from "../config/config";
import { configurerApp } from "../configurer-app";
import { PrismaService } from "../db/prisma.service";
import { EvenementsRepository } from "../evenements/evenements.service";
import { Horloge } from "../horloge";
import { SmsGateway, SmsMock } from "../sms/sms.gateway";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "./memoire";

/** Variables d'environnement valides pour les tests (valeurs fabriquées, sans lien avec la production). */
export const ENV_TEST: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-jwt-secret-pour-les-tests-uniquement",
  AUTH_PEPPER: "test-poivre-pour-les-tests-uniquement-ok",
  AUDIT_HMAC_KEY: "test-cle-audit-pour-les-tests-uniquement",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 9).toString("base64"),
  RATE_LIMIT_ENABLED: "false",
};

export function configTest(surcharge: Record<string, string> = {}): AppConfig {
  return chargerConfig({ ...ENV_TEST, ...surcharge });
}

export interface OptionsAppTest {
  config?: Record<string, string>;
  /** Contrôleurs supplémentaires (routes factices pour tester les gardes). */
  controleurs?: Type<unknown>[];
  baseJoignable?: boolean;
}

export async function creerAppTest(options: OptionsAppTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const defis = new DefisMemoire();
  const auditRepo = new AuditMemoire();
  const evenements = new EvenementsMemoire();
  const horloge = new HorlogeFixe();
  const baseJoignable = { valeur: options.baseJoignable ?? true };

  const module = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controleurs ?? [],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(defis)
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(evenements)
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(PrismaService)
    .useValue({
      estJoignable: async () => baseJoignable.valeur,
      $disconnect: async () => undefined,
    })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const sms = app.get<SmsMock>(SmsGateway);

  return {
    app,
    config,
    http: () => request(app.getHttpServer()),
    personnes,
    defis,
    auditRepo,
    evenements,
    horloge,
    comptes,
    audit: app.get(AuditService),
    sms,
    baseJoignable,
    creerCompte: (demande: DemandeCompte) => comptes.creer(demande),
    /** Dernier code à 6 chiffres envoyé par SMS simulé. */
    dernierCode: (): string => {
      const message = sms.dernier()?.message ?? "";
      const code = /code est (\d{6})/.exec(message)?.[1];
      if (!code) throw new Error("Aucun code dans le dernier SMS");
      return code;
    },
    fermer: () => app.close(),
  };
}

export type AppTest = Awaited<ReturnType<typeof creerAppTest>>;
