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
import { CONFIG_AUTH_VOYAGEUR, chargerConfigAuthVoyageur } from "../config";
import { EnvoiCodeSmsMemoire } from "../memoire";
import { EnvoiCodeSms, StockageConnexion } from "../ports";

export interface OptionsAppAuth {
  /** Variables `AUTH_VOYAGEUR_*`. */
  env?: Record<string, string>;
  /** Variables de l'application (`RATE_LIMIT_ENABLED`…). */
  config?: Record<string, string>;
  /** Envoi réel des codes par la passerelle SMS (comme `AppModule`) au lieu de la boîte en mémoire. */
  passerelleSms?: boolean;
  /** Fournisseurs de la connexion à remplacer (par exemple `EnvoiCodeWhatsApp`). */
  fournisseurs?: ReadonlyArray<{
    provide: abstract new (...args: never[]) => unknown;
    useValue: unknown;
  }>;
}

/** L'API complète (gardes, rôles, audit) avec `AuthVoyageurModule`, sur les adaptateurs en mémoire. */
export async function creerAppAuthTest(options: OptionsAppAuth = {}) {
  const config = configTest(options.config);
  const horloge = new HorlogeFixe(new Date("2027-01-05T07:00:00.000Z"));
  const auditRepo = new AuditMemoire();
  const personnes = new PersonnesMemoire();

  // `AppModule` monte la connexion du voyageur avec la passerelle SMS ; par défaut ces tests lisent la boîte
  // en mémoire (`sms`), comme les autres montages lisent celle du socle.
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!options.passerelleSms) {
    builder = builder
      .overrideProvider(EnvoiCodeSms)
      .useValue(new EnvoiCodeSmsMemoire(config.sms.journaliserCodes));
  }
  for (const f of options.fournisseurs ?? []) {
    builder = builder.overrideProvider(f.provide).useValue(f.useValue);
  }
  const module = await builder
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
