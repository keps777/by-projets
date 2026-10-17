import "reflect-metadata";
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
import { configTest } from "../../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  HorlogeFixe,
  PersonnesMemoire,
} from "../../socle/testing/memoire";
import { CONFIG_WHATSAPP, chargerConfigWhatsApp } from "../config";
import type { FileEnvoiMemoire } from "../file-memoire";
import { FileEnvoiWhatsApp } from "../file";
import { FournisseurWhatsApp } from "../fournisseur";
import type { FournisseurWhatsAppSimule } from "../fournisseur-simule";
import { JournalWhatsApp } from "../journal";
import {
  AnnuaireRapportMemoire,
  GestionnaireEntrantsMemoire,
  SecoursSmsMemoire,
  SourceRapportMemoire,
} from "../memoire";
import { PasserelleWhatsAppService } from "../passerelle.service";
import { AnnuaireRapport, GestionnaireEntrants, SecoursSms, SourceRapportSoir } from "../ports";
import { PlanificateurRapportSoir } from "../rapport-soir.service";
import { rapportMaquette } from "./montage";

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const GARE = "00000000-0000-4000-8000-0000000000a1";

/** L'API complète (gardes, rôles, audit) avec `WhatsAppModule`, sur les adaptateurs en mémoire. */
export async function creerAppWhatsAppTest(env: Record<string, string> = {}) {
  const config = configTest();
  const horloge = new HorlogeFixe(new Date("2027-01-05T07:00:00.000Z"));
  const auditRepo = new AuditMemoire();
  const secoursSms = new SecoursSmsMemoire();
  const source = new SourceRapportMemoire()
    .ajouter({ id: COMPAGNIE, nom: "Alpha Voyages" }, rapportMaquette())
    .ajouter({ id: AUTRE_COMPAGNIE, nom: "Beta Express" }, rapportMaquette());
  const annuaire = new AnnuaireRapportMemoire()
    .definir(COMPAGNIE, [
      { personneId: "p-patron", nom: "Joseph", role: "patron", telephone: "+237655010001" },
      { personneId: "p-sup", nom: "Essono", role: "superviseur", telephone: "+237655010002" },
    ])
    .definir(AUTRE_COMPAGNIE, [
      { personneId: "q-patron", nom: "Paul", role: "patron", telephone: "+237655020001" },
    ]);
  const gestionnaire = new GestionnaireEntrantsMemoire();

  // `AppModule` monte déjà la passerelle (repli SMS, source du rapport, annuaire, achat) : les adaptateurs
  // en mémoire de ce montage les remplacent un par un.
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SecoursSms)
    .useValue(secoursSms)
    .overrideProvider(SourceRapportSoir)
    .useValue(source)
    .overrideProvider(AnnuaireRapport)
    .useValue(annuaire)
    .overrideProvider(GestionnaireEntrants)
    .useValue(gestionnaire)
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_WHATSAPP)
    .useValue(
      chargerConfigWhatsApp({ WHATSAPP_SONDAGE_MS: "0", WHATSAPP_PLANIFICATEUR_MS: "0", ...env }),
    )
    .overrideProvider(PersonnesRepository)
    .useValue(new PersonnesMemoire())
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

  // rawBody : la signature des appels de WhatsApp se calcule sur le corps exact
  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 800;

  async function compte(
    role: Role,
    options: { compagnieId?: string | null; gareId?: string | null } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const personne = await comptes.creer({
      nom: `Test ${role}`,
      telephone: `+2376553${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: options.compagnieId === undefined ? COMPAGNIE : options.compagnieId,
      gareId: options.gareId === undefined ? GARE : options.gareId,
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
    return { id: personne.id, jeton: accessToken };
  }

  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    auditRepo,
    compte,
    secoursSms,
    source,
    annuaire,
    gestionnaire,
    passerelle: app.get(PasserelleWhatsAppService),
    planificateur: app.get(PlanificateurRapportSoir),
    journal: app.get(JournalWhatsApp),
    file: app.get(FileEnvoiWhatsApp) as FileEnvoiMemoire,
    fournisseur: app.get(FournisseurWhatsApp) as FournisseurWhatsAppSimule,
    fermer: () => app.close(),
  };
}

export type AppWhatsAppTest = Awaited<ReturnType<typeof creerAppWhatsAppTest>>;
