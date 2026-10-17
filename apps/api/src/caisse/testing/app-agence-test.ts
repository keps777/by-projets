import "reflect-metadata";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { AuditService } from "../../socle/audit/audit.service";
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
import { SmsGateway, SmsMock } from "../../socle/sms/sms.gateway";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { CaisseService } from "../caisse.service";
import { JournalAgenceMemoire, EvenementsTraitesMemoire } from "../journal/memoire";
import { EvenementsTraites, JournalAgenceRepository } from "../journal/ports";
import { JournalSigneService } from "../journal/journal.service";
import {
  AlertesPatronMemoire,
  GuichetsMemoire,
  MouvementsMemoire,
  ReglesMemoire,
  SessionsMemoire,
} from "../memoire";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
} from "../ports";
import { CaisseModule } from "../caisse.module";
import { versIsoDouala } from "../temps";

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const GARE = "00000000-0000-4000-8000-0000000000a1";
export const AUTRE_GARE = "00000000-0000-4000-8000-0000000000a2";
export const GUICHET_2 = "00000000-0000-4000-8000-0000000000b2";
export const GUICHET_3 = "00000000-0000-4000-8000-0000000000b3";

/** Matin du lundi 2 novembre 2026 à Douala (l'horloge de test part de 08:00 UTC = 09:00 à Douala). */
export const DEBUT = new Date("2026-11-02T08:00:00.000Z");

export interface OptionsAppAgenceTest {
  /** Modules à monter à côté de `CaisseModule` (par exemple `SupervisionModule`). */
  modules?: Type<unknown>[];
  config?: Record<string, string>;
  debut?: Date;
}

let compteurUuid = 0;

/** UUID v4 lisible, déterministe dans un test (le serveur n'exige que la forme). */
export function uuid(): string {
  compteurUuid += 1;
  return `00000000-0000-4000-8000-${String(compteurUuid).padStart(12, "0")}`;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec la caisse (et les modules demandés) branchée
 * sur les adaptateurs en mémoire. Le socle de test n'importe pas ces modules : on refait le même
 * montage ici pour ne rien modifier dans le socle.
 */
export async function creerAppAgenceTest(options: OptionsAppAgenceTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut ?? DEBUT);
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({
    imports: [AppModule, CaisseModule, ...(options.modules ?? [])],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
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

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  let compteur = 700;

  /** Crée un compte du terrain et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    opts: {
      compagnieId?: string | null;
      gareId?: string | null;
      nom?: string;
      /** PIN du compte (un superviseur n'en a pas par défaut : le socle le range côté mot de passe). */
      pin?: string;
    } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const compagnieId = opts.compagnieId === undefined ? COMPAGNIE : opts.compagnieId;
    const gareId = opts.gareId === undefined ? GARE : opts.gareId;
    const personne = await comptes.creer({
      nom: opts.nom ?? `Test ${role}`,
      telephone: `+2376552${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId,
      pin: "482915",
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    if (motDePasse && opts.pin !== undefined) {
      personnes.modifier(personne.id, { pinHache: await hachage.hacher(opts.pin) });
    }
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken };
  }

  const guichets = app.get(GuichetsAgence) as GuichetsMemoire;
  guichets.declarer({
    id: GUICHET_2,
    rang: 2,
    gareId: GARE,
    gareCode: "DLA",
    compagnieId: COMPAGNIE,
  });
  guichets.declarer({
    id: GUICHET_3,
    rang: 3,
    gareId: GARE,
    gareCode: "DLA",
    compagnieId: COMPAGNIE,
  });

  return {
    app,
    config,
    http: () => request(app.getHttpServer()),
    horloge,
    personnes,
    auditRepo,
    audit: app.get(AuditService),
    sms: app.get<SmsMock>(SmsGateway),
    comptes,
    hachage,
    compte,
    caisse: app.get(CaisseService),
    journal: app.get(JournalSigneService),
    journalRepo: app.get(JournalAgenceRepository) as JournalAgenceMemoire,
    traites: app.get(EvenementsTraites) as EvenementsTraitesMemoire,
    sessions: app.get(SessionsCaisse) as SessionsMemoire,
    mouvements: app.get(MouvementsCaisse) as MouvementsMemoire,
    guichets,
    regles: app.get(ReglesAgence) as ReglesMemoire,
    alertes: app.get(AlertesPatron) as AlertesPatronMemoire,
    /** Heure de l'horloge de test, au format du contrat (ISO Douala). */
    maintenantIso: () => versIsoDouala(horloge.maintenant()),
    /** Un instant décalé de `ms` par rapport à l'horloge de test, en ISO Douala. */
    iso: (ms = 0) => versIsoDouala(horloge.maintenant().getTime() + ms),
    fermer: () => app.close(),
  };
}

export type AppAgenceTest = Awaited<ReturnType<typeof creerAppAgenceTest>>;
