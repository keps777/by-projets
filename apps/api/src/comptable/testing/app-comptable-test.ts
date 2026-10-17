import "reflect-metadata";
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
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { CabinetService } from "../cabinet.service";
import { ClotureService } from "../cloture.service";
import { ComptableModule } from "../comptable.module";
import { ComptableService } from "../comptable.service";
import type {
  ActionsMemoire,
  AnnulationsMemoire,
  ClotureMemoire,
  DecisionsMemoire,
  EnvoisMemoire,
  FacturesPayeesMemoire,
  FaitsMemoire,
  FichiersApercusMemoire,
  MessagerieMemoire,
  ParametresMemoire,
  RelevesMemoire,
  SessionsMemoire,
  VentesMemoire,
} from "../memoire";
import {
  ActionsRapprochement,
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FaitsRapprochement,
  FichiersApercus,
  MessagerieCabinet,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
} from "../ports";
import { RapprochementService } from "../rapprochement.service";
import { TachesComptable } from "../taches.service";
import { VerrouillageMois } from "../verrouillage.service";
import { AGENCE, AUTRE_AGENCE } from "./donnees";

export { AGENCE, AUTRE_AGENCE };

export const PIN_PATRON = "482915";
export const EMAIL_CABINET = "cabinet@compta-douala.cm";

/** 5 janvier 2027, 09:12 à Douala : le matin de la clôture de décembre dans les maquettes. */
export const MATIN_DE_CLOTURE = new Date("2027-01-05T08:12:00.000Z");

export interface OptionsAppComptableTest {
  config?: Record<string, string>;
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec le module comptable branché sur ses adaptateurs en
 * mémoire. `AppModule` n'importe pas `ComptableModule` : on refait le montage ici.
 */
export async function creerAppComptableTest(options: OptionsAppComptableTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut ?? MATIN_DE_CLOTURE);
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({
    imports: [AppModule, ComptableModule],
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
  let compteur = 800;

  /** Crée un compte, lui donne le PIN `PIN_PATRON` et renvoie son identifiant et un jeton. */
  async function compte(
    role: Role,
    opts: { compagnieId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const compagnieId = opts.compagnieId === undefined ? AGENCE : opts.compagnieId;
    const personne = await comptes.creer({
      nom: opts.nom ?? `Test ${role}`,
      telephone: `+2376553${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId,
      gareId: null,
      pin: PIN_PATRON,
      ...(motDePasse ? { motDePasse: "Un-mot-de-passe-solide" } : {}),
    });
    personnes.modifier(personne.id, { pinHache: await hachage.hacher(PIN_PATRON) });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken };
  }

  const http = () => request(app.getHttpServer());
  const iso = (decalageMs = 0) =>
    new Date(horloge.maintenant().getTime() + decalageMs + 3_600_000)
      .toISOString()
      .replace("Z", "+01:00");

  const signature = (pin = PIN_PATRON, methode: "pin" | "empreinte" = "pin") => ({
    pin,
    methode,
    signeA: iso(),
  });

  return {
    app,
    config,
    http,
    horloge,
    iso,
    personnes,
    auditRepo,
    audit: app.get(AuditService),
    compte,
    signature,
    /** Corps signé de `AppliquerRapprochement`. */
    corpsDecisions: (
      mois: string,
      decisions: { reference: string; action: "rembourser" | "rattacher" | "demander" }[],
      pin = PIN_PATRON,
    ) => ({ mois, decisions, signature: signature(pin) }),
    /** Corps signé de `CloturerMois`. */
    corpsCloture: (mois: string, envoyerAuCabinet = false, pin = PIN_PATRON) => ({
      mois,
      envoyerAuCabinet,
      signature: signature(pin),
    }),
    ventes: app.get(VentesComptables) as VentesMemoire,
    sessions: app.get(SessionsComptables) as SessionsMemoire,
    annulations: app.get(AnnulationsComptables) as AnnulationsMemoire,
    releves: app.get(RelevesOperateur) as RelevesMemoire,
    faits: app.get(FaitsRapprochement) as FaitsMemoire,
    facturesPayees: app.get(FacturesPayees) as FacturesPayeesMemoire,
    parametres: app.get(ParametresRepository) as ParametresMemoire,
    decisions: app.get(DecisionsRapprochement) as DecisionsMemoire,
    clotures: app.get(Clotures) as ClotureMemoire,
    apercus: app.get(FichiersApercus) as FichiersApercusMemoire,
    envois: app.get(EnvoisCabinet) as EnvoisMemoire,
    actions: app.get(ActionsRapprochement) as ActionsMemoire,
    messagerie: app.get(MessagerieCabinet) as MessagerieMemoire,
    verrou: app.get(VerrouillageMois),
    comptable: app.get(ComptableService),
    rapprochement: app.get(RapprochementService),
    cloture: app.get(ClotureService),
    cabinet: app.get(CabinetService),
    taches: app.get(TachesComptable),
    fermer: () => app.close(),
  };
}

export type AppComptableTest = Awaited<ReturnType<typeof creerAppComptableTest>>;
