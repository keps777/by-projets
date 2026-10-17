import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import { CommandesService } from "../../billetterie/commandes.service";
import type { Bus, Compagnie, Gare, Ligne } from "../../billetterie/modeles";
import { AvisMemoire, CatalogueMemoire, CommandesMemoire } from "../../billetterie/memoire";
import { AvisBillets, Billets, Catalogue, Commandes } from "../../billetterie/ports";
import { versIsoDouala } from "../../billetterie/temps";
import {
  AUTRE_COMPAGNIE,
  BUS,
  COMPAGNIE,
  DEPART,
  GARE_DOUALA,
  GARE_YAOUNDE,
  LIGNE,
  departType,
} from "../../billetterie/testing/app-billetterie-test";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
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
import { AgregateurPaiement } from "../agregateur";
import type { AgregateurSimule } from "../agregateur-simule";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../config";
import { EncaissementsService } from "../encaissements.service";
import { LiensService } from "../liens.service";
import { ComptesReversementMemoire, PaiementsMemoire, RemboursementsMemoire } from "../memoire";
import { ModeDegradeService } from "../mode-degrade.service";
import { PaiementsModule } from "../paiements.module";
import { PaiementsService } from "../paiements.service";
import { ComptesReversement, Paiements, Remboursements } from "../ports";
import { RemboursementsService } from "../remboursements.service";

export { AUTRE_COMPAGNIE, COMPAGNIE, DEPART };
export const COMPTE_COMPAGNIE = "compte-alpha";

const compagnies: Compagnie[] = [
  { id: COMPAGNIE, code: "ALP", nom: "Alpha Voyages" },
  { id: AUTRE_COMPAGNIE, code: "ELT", nom: "Élite Express" },
];
const gares: Gare[] = [
  { id: GARE_DOUALA, compagnieId: COMPAGNIE, code: "DLA", nom: "Akwa", ville: "Douala" },
  { id: GARE_YAOUNDE, compagnieId: COMPAGNIE, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
];
const ligne: Ligne = {
  id: LIGNE,
  compagnieId: COMPAGNIE,
  code: "DLAYDE",
  origineGareId: GARE_DOUALA,
  destinationGareId: GARE_YAOUNDE,
  tarifs: { classique: 4000, vip: 6000, bagage: 500 },
  dureeMinutes: 270,
  arrets: [
    { id: "arret-dla", nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
    { id: "arret-yde", nom: "Yaoundé", ordre: 1, kmDepuisOrigine: 250, montee: false },
  ],
};
const bus: Bus = {
  id: BUS,
  compagnieId: COMPAGNIE,
  immatriculation: "LT 214 AB",
  capacite: 40,
  capaciteSoute: 20,
  classe: "classique",
};

export interface OptionsAppPaiementsTest {
  /** Variables `PAIEMENTS_*` en plus de celles du test (agrégateur simulé, issue en attente). */
  env?: Record<string, string>;
  /** Pas de compte de reversement pour la compagnie. */
  sansCompte?: boolean;
}

/**
 * L'API complète (gardes, rôles, audit) avec `PaiementsModule` — donc la vraie billetterie — sur
 * les adaptateurs en mémoire, un agrégateur simulé et l'horloge fixe. Le corps brut est conservé
 * (`rawBody`) comme en production : la signature des webhooks se calcule dessus.
 */
export async function creerAppPaiementsTest(options: OptionsAppPaiementsTest = {}) {
  const config = configTest();
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe();
  const auditRepo = new AuditMemoire();
  const configPaiements = chargerConfigPaiements({
    PAIEMENTS_FOURNISSEUR: "simule",
    PAIEMENTS_SIMULE_ISSUE: "en_attente",
    PAIEMENTS_BALAYAGE_MS: "0",
    PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
    ...options.env,
  });

  const module = await Test.createTestingModule({ imports: [AppModule, PaiementsModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_PAIEMENTS)
    .useValue(configPaiements)
    .overrideProvider(CONFIG_SMS)
    .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
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
    .overrideProvider(OPTIONS_BILLETTERIE)
    .useValue({ balayageMs: 0, pingMs: 0 })
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);

  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  for (const c of compagnies) catalogue.ajouterCompagnie(c);
  for (const g of gares) catalogue.ajouterGare(g);
  catalogue.ajouterLigne(ligne);
  catalogue.ajouterBus(bus);
  catalogue.ajouterDepart(departType(DEPART));

  const comptesReversement = app.get(ComptesReversement) as ComptesReversementMemoire;
  if (!options.sansCompte) await comptesReversement.definir(COMPAGNIE, COMPTE_COMPAGNIE);

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 900;

  async function compte(
    role: Role,
    o: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const voyageur = role === "voyageur";
    const aucune = voyageur || role === "afrimove";
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role}`,
      telephone: `+2376554${String(compteur).padStart(5, "0")}`,
      roles: [role],
      compagnieId: o.compagnieId === undefined ? (aucune ? null : COMPAGNIE) : o.compagnieId,
      gareId: o.gareId === undefined ? (aucune ? null : GARE_DOUALA) : o.gareId,
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

  const agregateur = app.get(AgregateurPaiement) as AgregateurSimule;
  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    auditRepo,
    agregateur,
    catalogue,
    commandes: app.get(Commandes) as CommandesMemoire,
    avisBillets: app.get(AvisBillets) as AvisMemoire,
    billets: app.get(Billets),
    paiements: app.get(Paiements) as PaiementsMemoire,
    remboursements: app.get(Remboursements) as RemboursementsMemoire,
    comptesReversement,
    services: {
      paiements: app.get(PaiementsService),
      encaissements: app.get(EncaissementsService),
      remboursements: app.get(RemboursementsService),
      liens: app.get(LiensService),
      mode: app.get(ModeDegradeService),
      commandes: app.get(CommandesService),
    },
    compte,
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),
  };
}

export type AppPaiementsTest = Awaited<ReturnType<typeof creerAppPaiementsTest>>;

export const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
