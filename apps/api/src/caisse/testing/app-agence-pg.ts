import "reflect-metadata";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { HachageService } from "../../socle/auth/hachage.service";
import { METHODE_PAR_ROLE, type Role } from "../../socle/auth/roles";
import { TokensService } from "../../socle/auth/tokens.service";
import { ComptesService } from "../../socle/comptes/comptes.service";
import { CONFIG } from "../../socle/config/config";
import { configurerApp } from "../../socle/configurer-app";
import { VARIABLE_STOCKAGE } from "../../socle/db/stockage";
import { PrismaService } from "../../socle/db/prisma.service";
import { Horloge } from "../../socle/horloge";
import { SmsGateway, SmsMock } from "../../socle/sms/sms.gateway";
import { configTest } from "../../socle/testing/app-test";
import { HorlogeFixe } from "../../socle/testing/memoire";
import { CaisseModule } from "../caisse.module";
import { CaisseService } from "../caisse.service";
import { JournalSigneService } from "../journal/journal.service";
import { versIsoDouala } from "../temps";
import { DEBUT } from "./app-agence-test";
import { FixturesPg } from "./fixtures-pg";

/**
 * L'API complète sur PostgreSQL (`API_STOCKAGE=postgres`) : comptes, audit, caisse, journal signé et,
 * si on les demande, les autres modules de l'agence (supervision), le tout dans la base de test. Comme
 * `creerAppAgenceTest`, le montage refait celui de `creerAppTest` pour ne rien modifier dans le socle.
 *
 * Le décor (compagnie, gare, guichets) est créé par `decor()` ; les comptes par `compte()` : de vraies
 * lignes, avec leurs clés étrangères.
 */

export interface OptionsAppAgencePg {
  url: string;
  /** Modules à monter à côté de `CaisseModule` (par exemple `SupervisionModule`). */
  modules?: Type<unknown>[];
  config?: Record<string, string>;
  debut?: Date;
}

export async function creerAppAgencePg(options: OptionsAppAgencePg) {
  const config = configTest({ ...options.config, DATABASE_URL: options.url });
  const stockageAvant = process.env[VARIABLE_STOCKAGE];
  process.env[VARIABLE_STOCKAGE] = "postgres";
  const horloge = new HorlogeFixe(options.debut ?? DEBUT);

  const module = await Test.createTestingModule({
    imports: [AppModule, CaisseModule, ...(options.modules ?? [])],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(Horloge)
    .useValue(horloge)
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const prisma = app.get(PrismaService);
  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  const fx = new FixturesPg(prisma);
  let compteur = 700;

  /** Une compagnie, une gare et trois guichets (rangs 1 à 3). */
  async function decor() {
    const compagnie = await fx.compagnie();
    const gare = await fx.gare(compagnie.id);
    const guichets = [
      await fx.guichet(gare.id, 1),
      await fx.guichet(gare.id, 2),
      await fx.guichet(gare.id, 3),
    ];
    return { compagnie, gare, guichets };
  }

  /** Crée un compte du terrain (avec ses clés étrangères) et renvoie son identifiant et un jeton. */
  async function compte(
    role: Role,
    d: { compagnieId: string; gareId: string | null },
    opts: { nom?: string; pin?: string; guichetId?: string } = {},
  ): Promise<{ id: string; jeton: string; pin: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const pin = opts.pin ?? "482915";
    const personne = await comptes.creer({
      nom: opts.nom ?? `Test ${role} ${compteur}`,
      telephone: `+2376552${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: d.compagnieId,
      gareId: d.gareId,
      pin,
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    // Un superviseur se connecte par mot de passe : son PIN de supervision est posé à la main.
    if (motDePasse) {
      await prisma.personne.update({
        where: { id: personne.id },
        data: { pinHache: await hachage.hacher(pin) },
      });
    }
    if (opts.guichetId) {
      await prisma.personne.update({
        where: { id: personne.id },
        data: { guichetId: opts.guichetId },
      });
    }
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
    config,
    prisma,
    fx,
    http: () => request(app.getHttpServer()),
    horloge,
    sms: app.get<SmsMock>(SmsGateway),
    hachage,
    comptes,
    decor,
    compte,
    caisse: app.get(CaisseService),
    journal: app.get(JournalSigneService),
    /** Heure de l'horloge de test, au format du contrat (ISO Douala). */
    maintenantIso: () => versIsoDouala(horloge.maintenant()),
    /** Un instant décalé de `ms` par rapport à l'horloge de test, en ISO Douala. */
    iso: (ms = 0) => versIsoDouala(horloge.maintenant().getTime() + ms),
    fermer: async () => {
      await app.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    },
  };
}

export type AppAgencePg = Awaited<ReturnType<typeof creerAppAgencePg>>;
