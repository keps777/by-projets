import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { AuditService } from "../../socle/audit/audit.service";
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
import { AgenceService } from "../../billetterie/agence.service";
import { BilletsMemoire, CatalogueMemoire, InventaireMemoire } from "../../billetterie/memoire";
import { Billets, Catalogue, Inventaire } from "../../billetterie/ports";
import {
  DEPART,
  DEPART_2,
  departType,
  heure,
  peuplerCatalogue,
} from "../../billetterie/testing/app-billetterie-test";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
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
} from "../ports";
import {
  AlertesMemoire,
  AppareilsMemoire,
  ControleNumerosMemoire,
  JournalMemoire,
  ProvisionnementMemoire,
  SiegesMemoire,
} from "../memoire";
import { RejeuService } from "../rejeu.service";
import { SyncModule } from "../sync.module";

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const GARE = "00000000-0000-4000-8000-0000000000a1";
export const AUTRE_GARE = "00000000-0000-4000-8000-0000000000a2";

/** Un troisième départ ordinaire (19:00, bus de 40 places) à côté de `DEPART` et `DEPART_2` de la billetterie. */
export const DEPART_3 = "00000000-0000-4000-8000-00000000d0a3";
/** Trois départs ordinaires de la gare de test : classique, 4 000 F, 40 places. */
export const DEPARTS_TEST = [DEPART, DEPART_2, DEPART_3] as const;

export interface OptionsAppSyncTest {
  config?: Record<string, string>;
  /** Instant de départ de l'horloge du serveur. */
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec le module de synchronisation branché sur les
 * adaptateurs en mémoire. Le socle de test (`creerAppTest`) n'importe pas `SyncModule` : on refait
 * le même montage ici pour ne pas toucher au socle.
 */
export async function creerAppSyncTest(options: OptionsAppSyncTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut);
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({ imports: [AppModule, SyncModule] })
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

  // Le réseau de transport de la billetterie (mêmes identifiants de compagnie et de gare que ci-dessus) : une vente
  // rejouée devient un billet (A6), elle a donc besoin d'un départ qui existe.
  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  peuplerCatalogue(catalogue);
  catalogue.ajouterDepart(departType(DEPART_3, { heureDepart: heure("19:00"), quai: 6 }));

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 500;

  /** Crée un compte du terrain et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    options: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const compagnieId = options.compagnieId === undefined ? COMPAGNIE : options.compagnieId;
    const gareId = options.gareId === undefined ? GARE : options.gareId;
    const personne = await comptes.creer({
      nom: options.nom ?? `Test ${role}`,
      telephone: `+2376551${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId,
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
    /** Le catalogue et les billets de la billetterie (en mémoire) : ce que les ventes rejouées créent. */
    catalogue,
    billets: app.get(Billets) as BilletsMemoire,
    inventaire: app.get(Inventaire) as InventaireMemoire,
    agence: app.get(AgenceService),
    journal: app.get(JournalSync) as JournalMemoire,
    sieges: app.get(SiegesSync) as SiegesMemoire,
    alertes: app.get(AlertesSync) as AlertesMemoire,
    provisionnement: app.get(ProvisionnementSync) as ProvisionnementMemoire,
    numeros: app.get(ControleNumeros) as ControleNumerosMemoire,
    attribution: app.get(AttributionPlages),
    rejeu: app.get(RejeuService),
    audit: app.get(AuditService),
    /** Déclare un appareil (administration) dans la gare et la compagnie de test. */
    declarer: (appareil: NouvelAppareil): Promise<AppareilSync> =>
      appareils.declarer({ gareId: GARE, compagnieId: COMPAGNIE, ...appareil }),
    fermer: () => app.close(),
  };
}

export type AppSyncTest = Awaited<ReturnType<typeof creerAppSyncTest>>;
