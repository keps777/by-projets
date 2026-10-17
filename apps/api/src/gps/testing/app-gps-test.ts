import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
import { Horloge } from "../../socle/horloge";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { GpsModule } from "../gps.module";
import {
  AlertesMemoire,
  AvisMemoire,
  BilletsMemoire,
  DiffusionMemoire,
  EtatsSuiviMemoire,
  MissionsMemoire,
  OffresMemoire,
  PositionsMemoire,
  PrevenirMemoire,
  ProchesMemoire,
  ReseauMemoire,
} from "../memoire";
import { OPTIONS_GPS } from "../passerelle";
import {
  AlertesArret,
  AvisSuivi,
  BilletsSuivis,
  DiffusionGps,
  EtatsSuivi,
  MissionsSuivies,
  OffresDeMontee,
  Positions,
  PrevenirProches,
  ProchesASuivre,
  ReseauTransport,
} from "../ports";
import { SuiviBusService } from "../suivi.service";
import { versIsoDouala } from "../temps";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DEPART,
  DEPART_2,
  DEPART_AUTRE,
  pointPouma,
  trajetType,
} from "./monde";

/** 08:04 à Douala, le matin du jour de test : le bus vient de partir. */
export const DEBUT = new Date("2026-11-02T07:04:00.000Z");

export interface OptionsAppGpsTest {
  config?: Record<string, string>;
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec `GpsModule` branché sur ses adaptateurs en
 * mémoire et un réseau de transport de test : le départ DLA→YDE de 08:00 (en route, avec son
 * équipage et son bus), un second départ à venir, et un départ d'une autre compagnie.
 */
export async function creerAppGpsTest(options: OptionsAppGpsTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut ?? DEBUT);

  const module = await Test.createTestingModule({ imports: [AppModule, GpsModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(new AuditMemoire())
    .overrideProvider(EvenementsRepository)
    .useValue(new EvenementsMemoire())
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(OPTIONS_GPS)
    .useValue({ pingMs: 0 })
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 800;

  /** Crée un compte et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    o: { compagnieId?: string | null; nom?: string; id?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const voyageur = role === "voyageur";
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role}`,
      telephone: `+2376553${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: o.compagnieId === undefined ? (voyageur ? null : COMPAGNIE) : o.compagnieId,
      gareId: null,
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

  const reseau = app.get(ReseauTransport) as ReseauMemoire;
  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    reseau,
    billets: app.get(BilletsSuivis) as BilletsMemoire,
    proches: app.get(ProchesASuivre) as ProchesMemoire,
    missions: app.get(MissionsSuivies) as MissionsMemoire,
    offres: app.get(OffresDeMontee) as OffresMemoire,
    positions: app.get(Positions) as PositionsMemoire,
    etats: app.get(EtatsSuivi) as EtatsSuiviMemoire,
    alertes: app.get(AlertesArret) as AlertesMemoire,
    prevenirs: app.get(PrevenirProches) as PrevenirMemoire,
    avis: app.get(AvisSuivi) as AvisMemoire,
    diffusion: app.get(DiffusionGps) as DiffusionMemoire,
    suivi: app.get(SuiviBusService),
    compte,
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),
  };
}

export type AppGpsTest = Awaited<ReturnType<typeof creerAppGpsTest>>;

/**
 * Pose le réseau de test dans l'application, avec un chauffeur et un convoyeur réels (leurs
 * identifiants remplacent ceux du jeu de données).
 */
export async function peupler(t: AppGpsTest) {
  const chauffeur = await t.compte("chauffeur");
  const convoyeur = await t.compte("convoyeur");
  const autreChauffeur = await t.compte("chauffeur");
  const voyageur = await t.compte("voyageur", { nom: "Aïcha Ngo" });
  const autreVoyageur = await t.compte("voyageur", { nom: "Jean Atangana" });
  const patron = await t.compte("patron");
  const superviseur = await t.compte("superviseur");
  const livreur = await t.compte("livreur");

  t.reseau.ajouterTrajet(
    trajetType(DEPART, { chauffeurId: chauffeur.id, convoyeurId: convoyeur.id }),
  );
  t.reseau.ajouterTrajet(
    trajetType(DEPART_2, {
      chauffeurId: autreChauffeur.id,
      convoyeurId: null,
      etat: "en_vente",
      partiA: null,
      heureDepart: "2026-11-02T10:00:00.000+01:00",
      bus: { id: "bus-2", immatriculation: "LT 305 CD" },
    }),
  );
  t.reseau.ajouterTrajet(
    trajetType(DEPART_AUTRE, {
      compagnie: { id: AUTRE_COMPAGNIE, nom: "Élite Express" },
      bus: { id: "bus-3", immatriculation: "CE 118 EF" },
    }),
  );
  t.reseau.ajouterArret(pointPouma());

  t.billets.ajouter({
    billetId: "billet-1",
    departId: DEPART,
    voyageurId: voyageur.id,
    siege: 7,
    passagerNom: "Aïcha",
    valide: true,
  });
  t.proches.ajouter(voyageur.id, { id: "proche-maman", nom: "Maman", telephone: "+237699401822" });

  return {
    chauffeur,
    convoyeur,
    autreChauffeur,
    voyageur,
    autreVoyageur,
    patron,
    superviseur,
    livreur,
  };
}

export const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
