import "reflect-metadata";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
import { AppModule } from "../app.module";
import { HachageService } from "../auth/hachage.service";
import { METHODE_PAR_ROLE, type Role } from "../auth/roles";
import { TokensService } from "../auth/tokens.service";
import { ComptesService } from "../comptes/comptes.service";
import { CONFIG } from "../config/config";
import { configurerApp } from "../configurer-app";
import { PrismaService } from "../db/prisma.service";
import { VARIABLE_STOCKAGE } from "../db/stockage";
import { Horloge } from "../horloge";
import { configTest } from "./app-test";
import { HorlogeFixe } from "./memoire";

/**
 * L'API entière sur PostgreSQL (`API_STOCKAGE=postgres`), dans la base de test : comptes, audit et
 * tous les modules qui ont des adaptateurs PostgreSQL. Les modules qui n'en ont pas encore restent en
 * mémoire (le garde-fou de production ne joue pas : `NODE_ENV=test`). Sert aux tests d'intégration
 * « de bout en bout » du lot B ; `personnaliser` permet de remplacer des fournisseurs (configuration
 * d'un module, par exemple).
 */
export interface OptionsAppPg {
  url: string;
  debut?: Date;
  personnaliser?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function creerAppPg(options: OptionsAppPg) {
  const config = configTest({ DATABASE_URL: options.url });
  const stockageAvant = process.env[VARIABLE_STOCKAGE];
  process.env[VARIABLE_STOCKAGE] = "postgres";
  const horloge = new HorlogeFixe(options.debut ?? new Date("2027-01-04T08:00:00.000Z"));

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_SMS)
    .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
    .overrideProvider(Horloge)
    .useValue(horloge);
  if (options.personnaliser) builder = options.personnaliser(builder);
  const module = await builder.compile();

  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);
  // Les fabriques des modules ont lu API_STOCKAGE au montage : la variable peut être rendue.
  if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
  else process.env[VARIABLE_STOCKAGE] = stockageAvant;

  const prisma = app.get(PrismaService);
  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  let compteur = 500;

  /** Crée un compte (de vraies lignes, avec leurs clés étrangères) et rend son identifiant et un jeton. */
  async function compte(
    role: Role,
    o: {
      nom?: string;
      telephone?: string;
      compagnieId?: string | null;
      gareId?: string | null;
    } = {},
  ): Promise<{ id: string; jeton: string; telephone: string }> {
    compteur += 1;
    const telephone = o.telephone ?? `+2376551${String(compteur).padStart(5, "0")}`;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role} ${compteur}`,
      telephone,
      roles: [role],
      compagnieId: o.compagnieId ?? null,
      gareId: o.gareId ?? null,
      pin: "482915",
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    if (motDePasse) {
      await prisma.personne.update({
        where: { id: personne.id },
        data: { pinHache: await hachage.hacher("482915") },
      });
    }
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken, telephone };
  }

  /** Un jeton pour un rôle que le compte vient de recevoir (relais, livreur…). */
  async function jetonPour(personneId: string, role: Role): Promise<string> {
    const { accessToken } = await tokens.emettre({ sub: personneId, role, cid: null, gid: null });
    return accessToken;
  }

  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    prisma,
    compte,
    jetonPour,
    resoudre: <T>(jeton: Type<T> | (abstract new (...args: never[]) => T)): T =>
      app.get(jeton, { strict: false }),
    fermer: () => app.close(),
  };
}

export type AppPg = Awaited<ReturnType<typeof creerAppPg>>;

export const entetePg = (jeton: string): Record<string, string> => ({
  Authorization: `Bearer ${jeton}`,
});
