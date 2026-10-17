import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import { versIsoDouala } from "../../billetterie/temps";
import { AgregateurPaiement } from "../../paiements/agregateur";
import type { AgregateurSimule } from "../../paiements/agregateur-simule";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../../paiements/config";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
import { AppModule } from "../../socle/app.module";
import { HachageService } from "../../socle/auth/hachage.service";
import { METHODE_PAR_ROLE, type Role } from "../../socle/auth/roles";
import { TokensService } from "../../socle/auth/tokens.service";
import { ComptesService } from "../../socle/comptes/comptes.service";
import { CONFIG } from "../../socle/config/config";
import { configurerApp } from "../../socle/configurer-app";
import { PrismaService } from "../../socle/db/prisma.service";
import { VARIABLE_STOCKAGE } from "../../socle/db/stockage";
import { Horloge } from "../../socle/horloge";
import { configTest } from "../../socle/testing/app-test";
import { HorlogeFixe } from "../../socle/testing/memoire";
import { BalayageCovoiturage } from "../balayage";
import { CONFIG_COVOITURAGE, chargerConfigCovoiturage } from "../config";
import type { PasserelleVersementsSimulee } from "../memoire";
import { PasserelleVersements } from "../ports";

export const COMPTE_SEQUESTRE_PG = "sequestre-covoiturage";

/**
 * L'API complète sur PostgreSQL (`API_STOCKAGE=postgres`) : comptes, audit, billetterie et covoiturage
 * dans la base de test. Les paiements restent sur leurs adaptateurs en mémoire avec l'agrégateur
 * simulé (ils n'ont pas encore de tables), et le décaissement MoMo est simulé.
 */
export async function creerAppCovoiturageEnBase(options: { url: string; debut?: Date }) {
  const config = configTest({ DATABASE_URL: options.url });
  const stockageAvant = process.env[VARIABLE_STOCKAGE];
  process.env[VARIABLE_STOCKAGE] = "postgres";
  const horloge = new HorlogeFixe(options.debut ?? new Date("2027-01-04T08:00:00.000Z"));

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_PAIEMENTS)
    .useValue(
      chargerConfigPaiements({
        PAIEMENTS_FOURNISSEUR: "simule",
        PAIEMENTS_SIMULE_ISSUE: "en_attente",
        PAIEMENTS_BALAYAGE_MS: "0",
        PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
      }),
    )
    .overrideProvider(CONFIG_COVOITURAGE)
    .useValue(
      chargerConfigCovoiturage({
        COVOITURAGE_BALAYAGE_MS: "0",
        COVOITURAGE_COMPTE_SEQUESTRE: COMPTE_SEQUESTRE_PG,
      }),
    )
    .overrideProvider(CONFIG_SMS)
    .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(OPTIONS_BILLETTERIE)
    .useValue({ balayageMs: 0, pingMs: 0 })
    .compile();

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
  let compteur = 800;

  async function compte(
    role: Role,
    o: { nom?: string; telephone?: string } = {},
  ): Promise<{ id: string; jeton: string; telephone: string }> {
    compteur += 1;
    const telephone = o.telephone ?? `+2376553${String(compteur).padStart(5, "0")}`;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role} ${compteur}`,
      telephone,
      roles: [role],
      compagnieId: null,
      gareId: null,
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

  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    prisma,
    agregateur: app.get(AgregateurPaiement) as AgregateurSimule,
    passerelle: app.get(PasserelleVersements) as PasserelleVersementsSimulee,
    balayage: app.get(BalayageCovoiturage),
    compte,
    dans: (minutes: number) =>
      versIsoDouala(new Date(horloge.maintenant().getTime() + minutes * 60_000)),
    fermer: () => app.close(),
  };
}

export type AppCovoiturageEnBase = Awaited<ReturnType<typeof creerAppCovoiturageEnBase>>;
