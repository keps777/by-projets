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
import { SmsGateway, SmsMock } from "../../socle/sms/sms.gateway";
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { FinancementModule } from "../financement.module";
import { FinancementService } from "../financement.service";
import {
  ConventionsMemoire,
  DonneesAgenceMemoire,
  DossiersMemoire,
  ENTETE_SECRET_PARTENAIRE,
  LotsPaieMemoire,
  OffresCreditMemoire,
  PartenaireSimule,
  PrelevementsMemoire,
  ReglagesMemoire,
  SalairesMemoire,
  SECRET_PARTENAIRE_TEST,
  VersementsPaieMemoire,
} from "../memoire";
import { PaieService } from "../paie.service";
import {
  ConventionsFinancement,
  DonneesAgence,
  DossiersFinancement,
  LotsPaie,
  OffresCredit,
  PartenaireFinancier,
  Prelevements,
  ReglagesFinancement,
  SalairesAgence,
  VersementsPaie,
} from "../ports";
import { DeuxFoisService } from "../deux-fois.service";
import { PrelevementsService } from "../prelevements.service";
import { TachesFinancement } from "../taches.service";
import type { Salaire } from "../modele";
import { versIsoDouala } from "../temps";

export const AGENCE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_AGENCE = "00000000-0000-4000-8000-0000000000c2";
export const PIN_PATRON = "482915";

export interface OptionsAppFinancementTest {
  config?: Record<string, string>;
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit, vérification du PIN) avec le financement sur ses
 * adaptateurs en mémoire. `AppModule` n'importe pas ce module : le montage est refait ici.
 */
export async function creerAppFinancementTest(options: OptionsAppFinancementTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut);
  const auditRepo = new AuditMemoire();

  const module = await Test.createTestingModule({ imports: [AppModule, FinancementModule] })
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
    .useValue(new EvenementsMemoire())
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  // rawBody : le corps brut des notifications du partenaire (comme main.ts).
  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  const hachage = app.get(HachageService);
  let compteur = 900;

  /** Un compte de l'agence (patron par défaut) avec le PIN `PIN_PATRON` et un jeton d'accès. */
  async function compte(
    role: Role = "patron",
    opts: { compagnieId?: string | null } = {},
  ): Promise<{ id: string; jeton: string; telephone: string }> {
    compteur += 1;
    const compagnieId = opts.compagnieId === undefined ? AGENCE : opts.compagnieId;
    const telephone = `+2376553${String(compteur).padStart(5, "0")}`;
    const personne = await comptes.creer({
      nom: `Test ${role} ${compteur}`,
      telephone,
      roles: [role],
      compagnieId,
      gareId: null,
      pin: PIN_PATRON,
      ...(METHODE_PAR_ROLE[role] === "motdepasse_sms"
        ? { motDePasse: "Un-mot-de-passe-solide" }
        : {}),
    });
    // Un patron se connecte par mot de passe : son PIN de signature est posé à part.
    personnes.modifier(personne.id, { pinHache: await hachage.hacher(PIN_PATRON) });
    const { accessToken } = await tokens.emettre({
      sub: personne.id,
      role,
      cid: personne.compagnieId,
      gid: personne.gareId,
    });
    return { id: personne.id, jeton: accessToken, telephone };
  }

  const donnees = app.get(DonneesAgence) as DonneesAgenceMemoire;
  const conventions = app.get(ConventionsFinancement) as ConventionsMemoire;

  /** Une agence qui remplit toutes les conditions : 90 jours de ventes, relevés rapprochés, pièces, convention. */
  function agenceEligible(agenceId = AGENCE, over: { signee?: boolean } = {}): void {
    donnees.ventesParAgence.set(agenceId, {
      joursCouverts: 90,
      total: 108_000_000,
      billets: 8940,
      colis: 2310,
      ventesMomo: 100_000_000,
    });
    donnees.releves.set(agenceId, { mois: 3, correspondancePct: 99.8 });
    donnees.piecesParAgence.set(agenceId, { registreEtCarteValides: true });
    donnees.comptes.set(agenceId, { id: `marchand-${agenceId.slice(-2)}`, operateur: "mtn" });
    conventions.conventions.set(agenceId, {
      partenaire: "Banque Atlantique",
      signeeA: over.signee === false ? null : "2026-10-01T10:00:00.000+01:00",
    });
  }

  const http = () => request(app.getHttpServer());
  /** L'instant du serveur de test (décalé de `decalageMs`), en ISO Douala : ce que signe l'appareil. */
  const iso = (decalageMs = 0) =>
    versIsoDouala(new Date(horloge.maintenant().getTime() + decalageMs));
  const entete = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
  const signature = (pin = PIN_PATRON) => ({ pin, methode: "pin" as const, signeA: iso() });

  return {
    app,
    http,
    horloge,
    iso,
    entete,
    signature,
    personnes,
    auditRepo,
    audit: app.get(AuditService),
    sms: app.get<SmsMock>(SmsGateway),
    compte,
    agenceEligible,
    financement: app.get(FinancementService),
    prelevementsService: app.get(PrelevementsService),
    paie: app.get(PaieService),
    deuxFois: app.get(DeuxFoisService),
    taches: app.get(TachesFinancement),
    dossiers: app.get(DossiersFinancement) as DossiersMemoire,
    prelevements: app.get(Prelevements) as PrelevementsMemoire,
    lots: app.get(LotsPaie) as LotsPaieMemoire,
    salaires: app.get(SalairesAgence) as SalairesMemoire,
    versements: app.get(VersementsPaie) as VersementsPaieMemoire,
    partenaire: app.get(PartenaireFinancier) as PartenaireSimule,
    donnees,
    conventions,
    credits: app.get(OffresCredit) as OffresCreditMemoire,
    reglages: app.get(ReglagesFinancement) as ReglagesMemoire,
    /** Appelle la route de notification comme le ferait le partenaire. */
    notifier: (corps: unknown, secret: string | null = SECRET_PARTENAIRE_TEST) =>
      http()
        .post("/financement/partenaire/notifications")
        .set(secret === null ? {} : { [ENTETE_SECRET_PARTENAIRE]: secret })
        .send(corps as object),
    fermer: () => app.close(),
  };
}

export type AppFinancementTest = Awaited<ReturnType<typeof creerAppFinancementTest>>;

/** Quelques salaires pour la paie : trois personnes avec un compte MoMo, une sans. */
export function salairesTypes(): Salaire[] {
  return [
    {
      personneId: "p-1",
      nom: "Joseph M.",
      montant: 150_000,
      compte: { operateur: "mtn", telephone: "+237670000001" },
    },
    {
      personneId: "p-2",
      nom: "Marie T.",
      montant: 120_000,
      compte: { operateur: "orange", telephone: "+237690000002" },
    },
    {
      personneId: "p-3",
      nom: "Alain B.",
      montant: 90_000,
      compte: { operateur: "mtn", telephone: "+237670000003" },
    },
  ];
}
