import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
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
import { VARIABLE_STOCKAGE } from "../../socle/db/stockage";
import { EvenementsRepository } from "../../socle/evenements/evenements.service";
import { Horloge } from "../../socle/horloge";
import { SmsGateway, SmsMock } from "../../socle/sms/sms.gateway";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { ColisModule } from "../colis.module";
import { ColisService } from "../colis.service";
import { GuichetColisService } from "../guichet.service";
import {
  AnalysePhotoMemoire,
  AssureurMemoire,
  ColisMemoire,
  DiffusionMemoire,
  FichiersPhotosMemoire,
  PaiementsMemoire,
  PhotosMemoire,
  ReclamationsMemoire,
  ReferentielMemoire,
} from "../memoire";
import {
  AnalysePhotoColis,
  AssureurPartenaire,
  ColisRepository,
  DiffusionSuivi,
  FichiersPhotos,
  PaiementsColis,
  PhotosColis,
  ReclamationsRepository,
  ReferentielColis,
} from "../ports";
import { ReclamationsService } from "../reclamations.service";
import { TachesColis } from "../taches.service";
import type { DepartColis, GareRef, GuichetRef } from "../modele";

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";

export const GARE_DLA: GareRef = {
  id: "00000000-0000-4000-8000-0000000000a1",
  code: "DLA",
  nom: "Alpha Douala",
  ville: "Douala",
};
export const GARE_BAF: GareRef = {
  id: "00000000-0000-4000-8000-0000000000a2",
  code: "BAF",
  nom: "Alpha Bafoussam",
  ville: "Bafoussam",
};
export const AUTRE_GARE: GareRef = {
  id: "00000000-0000-4000-8000-0000000000a3",
  code: "YDE",
  nom: "Alpha Yaoundé",
  ville: "Yaoundé",
};

/** Départ de 10:00 (Douala) vers Bafoussam : port de 1 500 F. L'horloge de test est à 09:00. */
export const DEPART_BAF: DepartColis = {
  id: "dep-alp-dlabaf-261102-1000",
  compagnieId: COMPAGNIE,
  compagnieNom: "Alpha Voyages",
  gareOrigine: GARE_DLA,
  gareDestination: GARE_BAF,
  heureDepart: "2026-11-02T10:00:00.000+01:00",
  arriveePrevue: "2026-11-02T15:00:00.000+01:00",
  portColis: 1500,
  soutePct: 60,
  ouvertAuColis: true,
};

export const GUICHET_2: GuichetRef = {
  id: "guichet-dla-2",
  rang: 2,
  gare: GARE_DLA,
  compagnieId: COMPAGNIE,
};

export const POINT_RELAIS = {
  id: "relais-1",
  nom: "Boutique Mama Ngo",
  ville: "Bafoussam",
  actif: true,
};

/** Lundi 2 novembre 2026, 09:00 à Douala. */
export const DEBUT_TEST = new Date("2026-11-02T08:00:00.000Z");

/** Horloge réglable : on avance, on recule, on revient au début entre deux tests. */
export class HorlogeColis extends Horloge {
  constructor(private instant = DEBUT_TEST) {
    super();
  }

  maintenant(): Date {
    return new Date(this.instant);
  }

  avancer(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }

  regler(instant: Date = DEBUT_TEST): void {
    this.instant = new Date(instant);
  }
}

export interface OptionsAppColisTest {
  config?: Record<string, string>;
  debut?: Date;
  /**
   * Monte le module sur PostgreSQL (`API_STOCKAGE=postgres`, comptes, audit et colis en base) au
   * lieu de la mémoire. Les lignes que les constantes de ce fichier désignent (compagnies, gares) et
   * le départ `departId` doivent exister en base ; l'annuaire des départs reste en mémoire et ne
   * connaît que ce départ.
   */
  postgres?: { url: string; departId: string };
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec le module des colis sur ses adaptateurs en
 * mémoire. Comme `creerAppSyncTest`, le montage refait celui de `creerAppTest` pour ne pas toucher
 * au socle : `AppModule` n'importe pas `ColisModule`.
 */
export async function creerAppColisTest(options: OptionsAppColisTest = {}) {
  const config = configTest({
    ...options.config,
    ...(options.postgres ? { DATABASE_URL: options.postgres.url } : {}),
  });
  const stockageAvant = process.env[VARIABLE_STOCKAGE];
  if (options.postgres) process.env[VARIABLE_STOCKAGE] = "postgres";
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeColis(options.debut);
  const auditRepo = new AuditMemoire();
  const evenements = new EvenementsMemoire();

  let montage = Test.createTestingModule({ imports: [AppModule, ColisModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(Horloge)
    .useValue(horloge);
  if (!options.postgres) {
    montage = montage
      .overrideProvider(PersonnesRepository)
      .useValue(personnes)
      .overrideProvider(DefisRepository)
      .useValue(new DefisMemoire())
      .overrideProvider(AuditRepository)
      .useValue(auditRepo)
      .overrideProvider(EvenementsRepository)
      .useValue(evenements)
      .overrideProvider(PrismaService)
      .useValue({ estJoignable: async () => true, $disconnect: async () => undefined });
  }
  const module = await montage.compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 700;

  /** Crée un compte et renvoie son identifiant, son téléphone et un jeton d'accès. */
  async function compte(
    role: Role,
    options: {
      compagnieId?: string | null;
      gareId?: string | null;
      nom?: string;
      telephone?: string;
    } = {},
  ): Promise<{ id: string; jeton: string; telephone: string; nom: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const voyageur = role === "voyageur";
    const telephone = options.telephone ?? `+2376553${String(compteur).padStart(5, "0")}`;
    const nom = options.nom ?? `Test ${role}`;
    const personne = await comptes.creer({
      nom,
      telephone,
      roles: [role],
      compagnieId:
        options.compagnieId === undefined ? (voyageur ? null : COMPAGNIE) : options.compagnieId,
      gareId: options.gareId === undefined ? (voyageur ? null : GARE_DLA.id) : options.gareId,
      pin: "482915",
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken, telephone, nom };
  }

  const referentiel = app.get(ReferentielColis) as ReferentielMemoire;
  // `InterAgencesModule` (dans `AppModule`) branche ce calcul sur les conventions en vigueur au démarrage ;
  // les tests du colis pilotent le drapeau du référentiel en mémoire.
  referentiel.interAgencesDisponible = async () => referentiel.interAgences;
  referentiel.gares.set(GARE_DLA.id, GARE_DLA);
  referentiel.gares.set(GARE_BAF.id, GARE_BAF);
  referentiel.gares.set(AUTRE_GARE.id, AUTRE_GARE);
  referentiel.departs.set(DEPART_BAF.id, { ...DEPART_BAF });
  if (options.postgres) {
    referentiel.departs.set(options.postgres.departId, {
      ...DEPART_BAF,
      id: options.postgres.departId,
    });
  }
  referentiel.guichets.set(GUICHET_2.id, GUICHET_2);
  referentiel.lesRelais.set(POINT_RELAIS.id, POINT_RELAIS);

  const sms = app.get<SmsMock>(SmsGateway);
  return {
    app,
    config,
    http: () => request(app.getHttpServer()),
    horloge,
    auditRepo,
    evenements,
    personnes,
    compte,
    sms,
    colis: app.get(ColisService),
    guichet: app.get(GuichetColisService),
    reclamations: app.get(ReclamationsService),
    taches: app.get(TachesColis),
    repo: app.get(ColisRepository) as ColisMemoire,
    photos: app.get(PhotosColis) as PhotosMemoire,
    fichiers: app.get(FichiersPhotos) as FichiersPhotosMemoire,
    reclamationsRepo: app.get(ReclamationsRepository) as ReclamationsMemoire,
    paiements: app.get(PaiementsColis) as PaiementsMemoire,
    assureur: app.get(AssureurPartenaire) as AssureurMemoire,
    analyse: app.get(AnalysePhotoColis) as AnalysePhotoMemoire,
    diffusion: app.get(DiffusionSuivi) as DiffusionMemoire,
    referentiel,
    fermer: async () => {
      await app.close();
      if (stockageAvant === undefined) delete process.env[VARIABLE_STOCKAGE];
      else process.env[VARIABLE_STOCKAGE] = stockageAvant;
    },
  };
}

export type AppColisTest = Awaited<ReturnType<typeof creerAppColisTest>>;

export const entete = (jeton: string): { Authorization: string } => ({
  Authorization: `Bearer ${jeton}`,
});

/** Les 6 chiffres du code de retrait dans un SMS. */
export function codeDuSms(message: string): string {
  const code = /Code de retrait : (\d{6})/.exec(message)?.[1];
  if (!code) throw new Error("Aucun code de retrait dans le SMS");
  return code;
}

/** Dernier SMS envoyé à ce numéro. */
export function dernierSmsA(t: AppColisTest, telephone: string): string | undefined {
  return [...t.sms.messages()].reverse().find((m) => m.telephone === telephone)?.message;
}

export function demandeCreation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    departId: DEPART_BAF.id,
    photoRef: "photos/colis-1.jpg",
    destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
    contenu: "Médicaments et vêtements",
    poidsKg: 2,
    valeurDeclaree: 25000,
    assurer: true,
    mode: "gare",
    paiement: { moyen: "mtn_momo", numero: "+237691221008" },
    ...over,
  };
}

/** Un événement « colis.enregistre » tel que l'appareil du guichet l'envoie. */
export function evenementEnregistre(
  auteurId: string,
  over: { colisId?: string; numeroPlage?: number; donnees?: Record<string, unknown> } = {},
): Record<string, unknown> {
  const colisId = over.colisId ?? randomUUID();
  return {
    id: randomUUID(),
    type: "colis.enregistre",
    at: "2026-11-02T09:05:00.000+01:00",
    appareilId: "appareil-guichet-2",
    auteurId,
    cible: { type: "colis", id: colisId },
    numeroPlage: over.numeroPlage ?? 1001,
    donnees: {
      colisId,
      departId: DEPART_BAF.id,
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Médicaments, vêtements",
      poidsKg: 2,
      valeurDeclaree: 25000,
      assure: true,
      photoRef: "photos/guichet-1.jpg",
      paiement: { mode: "cash", montant: 2000 },
      ...over.donnees,
    },
  };
}

export function evenementDepose(
  auteurId: string,
  colisId: string,
  donnees: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    type: "colis.depose",
    at: "2026-11-02T09:10:00.000+01:00",
    appareilId: "appareil-guichet-2",
    auteurId,
    cible: { type: "colis", id: colisId },
    numeroPlage: null,
    donnees: {
      colisId,
      poidsReleveKg: 2.1,
      photoRef: "photos/depot-1.jpg",
      complement: 0,
      ...donnees,
    },
  };
}
