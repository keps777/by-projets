import "reflect-metadata";
import type { AddressInfo } from "node:net";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
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
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { AuthVoyageurModule } from "../auth-voyageur.module";
import { CONFIG_AUTH_VOYAGEUR, chargerConfigAuthVoyageur } from "../config";
import type { EnvoiCodeSmsMemoire } from "../memoire";
import { EnvoiCodeSms, StockageConnexion } from "../ports";

export interface OptionsAppAuth {
  /** Variables `AUTH_VOYAGEUR_*`. */
  env?: Record<string, string>;
  /** Variables de l'application (`RATE_LIMIT_ENABLED`…). */
  config?: Record<string, string>;
  /** Modules ou fournisseurs à la place de ceux par défaut. */
  module?: ReturnType<typeof AuthVoyageurModule.avec> | typeof AuthVoyageurModule;
}

/** L'API complète (gardes, rôles, audit) avec `AuthVoyageurModule`, sur les adaptateurs en mémoire. */
export async function creerAppAuthTest(options: OptionsAppAuth = {}) {
  const config = configTest(options.config);
  const horloge = new HorlogeFixe(new Date("2027-01-05T07:00:00.000Z"));
  const auditRepo = new AuditMemoire();
  const personnes = new PersonnesMemoire();

  const module = await Test.createTestingModule({
    imports: [AppModule, options.module ?? AuthVoyageurModule],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_AUTH_VOYAGEUR)
    .useValue(chargerConfigAuthVoyageur(options.env ?? {}))
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
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

  let ecoute: Promise<string> | undefined;
  return {
    app,
    horloge,
    auditRepo,
    personnes,
    stockage: app.get(StockageConnexion),
    sms: app.get<EnvoiCodeSmsMemoire>(EnvoiCodeSms),
    http: () => request(app.getHttpServer()),
    /** Adresse d'un vrai serveur HTTP sur un port libre (pour le client d'API et son `fetch`). */
    urlBase: (): Promise<string> =>
      (ecoute ??= app.listen(0, "127.0.0.1").then(() => {
        const { port } = app.getHttpServer().address() as AddressInfo;
        return `http://127.0.0.1:${port}`;
      })),
    fermer: () => app.close(),
  };
}

export type AppAuthTest = Awaited<ReturnType<typeof creerAppAuthTest>>;
