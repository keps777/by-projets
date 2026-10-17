import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Type } from "@nestjs/common";
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
import { ColisModule } from "../../colis/colis.module";
import { ColisService } from "../../colis/colis.service";
import {
  ColisMemoire,
  DiffusionMemoire,
  PaiementsMemoire,
  ReferentielMemoire,
} from "../../colis/memoire";
import {
  ColisRepository,
  DiffusionSuivi,
  PaiementsColis,
  ReferentielColis,
} from "../../colis/ports";
import {
  COMPAGNIE,
  DEPART_BAF,
  GARE_BAF,
  GUICHET_2,
  GARE_DLA,
  HorlogeColis,
  demandeCreation,
  entete,
} from "../../colis/testing/app-colis-test";
import type { PointRelaisStocke } from "../modele";
import {
  AttributionRolesMemoire,
  BrouillonsRelaisMemoire,
  DemandesRelaisMemoire,
  LieuxMemoire,
  PortefeuilleMemoire,
  ReceptionsRelaisMemoire,
  RelaisMemoire,
  VersementsMemoire,
} from "../memoire";
import {
  AttributionRoles,
  BrouillonsRelais,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
  VersementsMobile,
} from "../ports";
import { InscriptionRelaisService } from "../inscription.service";
import { RelaisModule } from "../relais.module";
import { RelaisService } from "../relais.service";
import { TachesRelais } from "../taches.service";
import { VersementsService } from "../versements.service";

export { COMPAGNIE, DEPART_BAF, GARE_BAF, GARE_DLA, entete };

/** Attribue vraiment le rôle au compte (comme le fera l'adaptateur du coordinateur) : le jeton passe la garde. */
export class AttributionRolesTest extends AttributionRolesMemoire {
  constructor(private readonly personnes: PersonnesMemoire) {
    super();
  }

  override async ajouterRole(personneId: string, role: "relais" | "livreur") {
    await super.ajouterRole(personneId, role);
    const personne = this.personnes.lignes.get(personneId);
    if (personne && !personne.roles.includes(role)) {
      this.personnes.modifier(personneId, { roles: [...personne.roles, role] });
    }
  }
}

export interface OptionsAppRelaisTest {
  config?: Record<string, string>;
  /** Modules supplémentaires à monter (la livraison). */
  modules?: Type<unknown>[];
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec les colis et les points relais sur leurs
 * adaptateurs en mémoire. Le montage refait celui de `creerAppColisTest` : `AppModule` n'importe pas
 * ces modules.
 */
export async function creerAppRelaisTest(options: OptionsAppRelaisTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeColis();
  const auditRepo = new AuditMemoire();
  const evenements = new EvenementsMemoire();
  const roles = new AttributionRolesTest(personnes);

  const module = await Test.createTestingModule({
    imports: [AppModule, ColisModule, RelaisModule, ...(options.modules ?? [])],
  })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(Horloge)
    .useValue(horloge)
    .overrideProvider(PersonnesRepository)
    .useValue(personnes)
    .overrideProvider(DefisRepository)
    .useValue(new DefisMemoire())
    .overrideProvider(AuditRepository)
    .useValue(auditRepo)
    .overrideProvider(EvenementsRepository)
    .useValue(evenements)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .overrideProvider(AttributionRoles)
    .useValue(roles)
    .overrideProvider(Lieux)
    .useValue(new LieuxMemoire())
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 800;

  /** Crée un compte et renvoie son identifiant, son téléphone et un jeton d'accès. */
  async function compte(
    role: Role,
    options: { nom?: string; telephone?: string; gareId?: string | null } = {},
  ): Promise<{ id: string; jeton: string; telephone: string; nom: string }> {
    compteur += 1;
    const voyageur = ["voyageur", "relais", "livreur", "afrimove"].includes(role);
    const telephone = options.telephone ?? `+2376554${String(compteur).padStart(5, "0")}`;
    const nom = options.nom ?? `Test ${role} ${compteur}`;
    const personne = await comptes.creer({
      nom,
      telephone,
      roles: [role],
      compagnieId: voyageur ? null : COMPAGNIE,
      gareId: options.gareId === undefined ? (voyageur ? null : GARE_DLA.id) : options.gareId,
      pin: "482915",
      ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
        ? { motDePasse: "Un-mot-de-passe-solide" }
        : {}),
    });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken, telephone, nom };
  }

  /** Un jeton pour un rôle que le compte a reçu depuis (activation d'un relais ou d'un livreur). */
  async function jetonPour(personneId: string, role: Role): Promise<string> {
    const { accessToken } = await tokens.emettre({
      sub: personneId,
      role,
      cid: null,
      gid: null,
    });
    return accessToken;
  }

  const referentiel = app.get(ReferentielColis) as ReferentielMemoire;
  referentiel.gares.set(GARE_DLA.id, GARE_DLA);
  referentiel.gares.set(GARE_BAF.id, GARE_BAF);
  referentiel.departs.set(DEPART_BAF.id, { ...DEPART_BAF });
  referentiel.guichets.set(GUICHET_2.id, GUICHET_2);
  const relaisService = app.get(RelaisService);
  // Le branchement que fera le coordinateur : l'annuaire des relais du colis lit les points relais.
  referentiel.relais = (id: string) => relaisService.reference(id);

  const relaisRepo = app.get(RelaisRepository) as RelaisMemoire;

  /** Un point relais actif à Bafoussam, avec son compte (rôle `relais`). */
  async function creerRelais(
    over: Partial<PointRelaisStocke> & { telephone?: string } = {},
  ): Promise<{ relais: PointRelaisStocke; compte: Awaited<ReturnType<typeof compte>> }> {
    const proprietaire = await compte("relais", {
      nom: over.nom ?? "Mama Ngo",
      telephone: over.telephone,
    });
    const numero = relaisRepo.lignes.size + 1;
    const relais: PointRelaisStocke = {
      id: randomUUID(),
      version: 1,
      code: `R-BAF-${String(numero).padStart(4, "0")}`,
      personneId: proprietaire.id,
      nom: "Boutique Mama Ngo",
      typeBoutique: "Boutique · alimentation",
      ville: "Bafoussam",
      quartier: "Tamdja",
      repere: "face au marché",
      position: null,
      ouvert: "7 h – 20 h · lun.–sam.",
      tailleMax: "Tous (≤ 30 kg)",
      capacite: 30,
      particularite: null,
      momo: { telephone: "+237670000111", operateur: "mtn" },
      facadeRef: "photos/facade-1.jpg",
      actif: true,
      note: 5,
      creeA: "2026-10-01T10:00:00.000+01:00",
      premierColisA: null,
      ...over,
    };
    delete (relais as { telephone?: string }).telephone;
    if (!(await relaisRepo.ajouter(relais))) throw new Error("Relais non ajouté");
    return { relais, compte: proprietaire };
  }

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
    jetonPour,
    creerRelais,
    sms,
    colis: app.get(ColisService),
    repo: app.get(ColisRepository) as ColisMemoire,
    paiements: app.get(PaiementsColis) as PaiementsMemoire,
    diffusion: app.get(DiffusionSuivi) as DiffusionMemoire,
    referentiel,
    relaisRepo,
    relais: relaisService,
    inscription: app.get(InscriptionRelaisService),
    taches: app.get(TachesRelais),
    versements: app.get(VersementsService),
    portefeuille: app.get(Portefeuille) as PortefeuilleMemoire,
    operateur: app.get(VersementsMobile) as VersementsMemoire,
    lieux: app.get(Lieux) as unknown as LieuxMemoire,
    demandes: app.get(DemandesRelaisRepository) as DemandesRelaisMemoire,
    brouillons: app.get(BrouillonsRelais) as BrouillonsRelaisMemoire,
    receptions: app.get(ReceptionsRelais) as ReceptionsRelaisMemoire,
    roles,
    fermer: async () => {
      await app.close();
    },
  };
}

export type AppRelaisTest = Awaited<ReturnType<typeof creerAppRelaisTest>>;

/** Dernier SMS envoyé à ce numéro. */
export function dernierSmsA(t: Pick<AppRelaisTest, "sms">, telephone: string): string | undefined {
  return [...t.sms.messages()].reverse().find((m) => m.telephone === telephone)?.message;
}

export function tousLesSmsA(t: Pick<AppRelaisTest, "sms">, telephone: string): string[] {
  return t.sms
    .messages()
    .filter((m) => m.telephone === telephone)
    .map((m) => m.message);
}

export interface EquipeRelais {
  /** Aïcha, la voyageuse qui envoie le colis. */
  expediteur: { id: string; jeton: string; telephone: string; nom: string };
  /** Thérèse, la destinataire. */
  destinataire: { id: string; jeton: string; telephone: string; nom: string };
  inconnu: { id: string; jeton: string };
  guichetier: { id: string; jeton: string };
  guichetierBaf: { id: string; jeton: string };
  convoyeur: { id: string; jeton: string };
  superviseur: { id: string; jeton: string };
  agent: { id: string; jeton: string };
}

export async function creerEquipeRelais(t: AppRelaisTest): Promise<EquipeRelais> {
  return {
    expediteur: await t.compte("voyageur", { telephone: "+237691221008", nom: "Ngo Aïcha" }),
    destinataire: await t.compte("voyageur", { telephone: "+237699401822", nom: "Ngo Thérèse" }),
    inconnu: await t.compte("voyageur", { telephone: "+237677000111", nom: "Passant" }),
    guichetier: await t.compte("guichetier", { gareId: GARE_DLA.id }),
    guichetierBaf: await t.compte("guichetier", { gareId: GARE_BAF.id }),
    convoyeur: await t.compte("convoyeur", { gareId: GARE_DLA.id }),
    superviseur: await t.compte("superviseur", { gareId: GARE_DLA.id }),
    agent: await t.compte("afrimove", { gareId: null }),
  };
}

export interface ColisCree {
  colisId: string;
  numero: string;
  code: string;
}

/** Un colis créé dans l'app par l'expéditeur pour la destinataire. */
export async function creerColis(
  t: AppRelaisTest,
  e: EquipeRelais,
  over: Record<string, unknown> = {},
): Promise<ColisCree> {
  const rep = await t
    .http()
    .post("/colis")
    .set(entete(e.expediteur.jeton))
    .send(demandeCreation({ photoRef: `photos/colis-${randomUUID()}.jpg`, ...over }));
  if (rep.status !== 201) throw new Error(`Création refusée : ${JSON.stringify(rep.body)}`);
  return {
    colisId: rep.body.colis.id,
    numero: rep.body.colis.numero,
    code: rep.body.colis.retrait.code,
  };
}

/** Chargement à Douala, départ, déchargement et mise à disposition à Bafoussam. */
export async function amenerJusquaDisponible(
  t: AppRelaisTest,
  e: EquipeRelais,
  colisId: string,
): Promise<void> {
  for (const [jeton, action] of [
    [e.guichetier.jeton, "charger"],
    [e.convoyeur.jeton, "expedier"],
    [e.convoyeur.jeton, "decharger"],
    [e.guichetierBaf.jeton, "rendre_disponible"],
  ] as const) {
    const rep = await t
      .http()
      .post("/agence/colis/scans")
      .set(entete(jeton))
      .send({ colisId, action });
    if (rep.status !== 200) throw new Error(`${action} refusé : ${JSON.stringify(rep.body)}`);
  }
}

/** Un faux code, différent du vrai. */
export const fauxCode = (code: string): string => (code === "000000" ? "111111" : "000000");
