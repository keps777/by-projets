import "reflect-metadata";
import { randomUUID } from "node:crypto";
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
import { AgenceService } from "../agence.service";
import { BalayageBilletterie } from "../balayage";
import { BilletsService } from "../billets.service";
import { BilletterieModule } from "../billetterie.module";
import { CommandesService } from "../commandes.service";
import { DepartsService } from "../departs.service";
import type { Bus, Compagnie, Depart, Gare, Guichet, Ligne } from "../modeles";
import {
  AvisMemoire,
  BilletsMemoire,
  CatalogueMemoire,
  ColisMemoire,
  CommandesMemoire,
  DiffusionMemoire,
  EvenementsTraitesMemoire,
  InventaireMemoire,
  PromotionsMemoire,
  ProchesMemoire,
  ScansMemoire,
} from "../memoire";
import {
  AvisBillets,
  Billets,
  Catalogue,
  ColisDuDepart,
  Commandes,
  DiffusionTempsReel,
  EvenementsTraites,
  Inventaire,
  Promotions,
  ProchesVoyageur,
  Scans,
  SignataireQr,
} from "../ports";
import { OPTIONS_BILLETTERIE } from "../passerelle";
import { SiegesService } from "../sieges.service";
import { versIsoDouala } from "../temps";

/* ------------------------------------------------------------------ jeu de données */

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const AUTRE_COMPAGNIE = "00000000-0000-4000-8000-0000000000c2";
export const GARE_DOUALA = "00000000-0000-4000-8000-0000000000a1";
export const GARE_YAOUNDE = "00000000-0000-4000-8000-0000000000a2";
export const AUTRE_GARE_DOUALA = "00000000-0000-4000-8000-0000000000b1";
export const AUTRE_GARE_YAOUNDE = "00000000-0000-4000-8000-0000000000b2";
export const GUICHET_1 = "00000000-0000-4000-8000-0000000000e1";
export const GUICHET_2 = "00000000-0000-4000-8000-0000000000e2";
export const LIGNE = "00000000-0000-4000-8000-00000000f001";
export const AUTRE_LIGNE = "00000000-0000-4000-8000-00000000f002";
export const BUS = "00000000-0000-4000-8000-00000000b001";
export const BUS_2 = "00000000-0000-4000-8000-00000000b002";
export const AUTRE_BUS = "00000000-0000-4000-8000-00000000b003";
export const PETIT_BUS = "00000000-0000-4000-8000-00000000b004";
/** Départ ordinaire : classique, 14:00, bus de 40 places, en vente, équipage complet, quai 3. */
export const DEPART = "00000000-0000-4000-8000-00000000d001";
/** Deuxième départ de la même ligne, 17:00 (cible des reports et des fusions). */
export const DEPART_2 = "00000000-0000-4000-8000-00000000d002";
/** Départ VIP, 16:00. */
export const DEPART_VIP = "00000000-0000-4000-8000-00000000d003";
/** Départ d'une autre compagnie, 16:30, 5 000 F. */
export const DEPART_AUTRE = "00000000-0000-4000-8000-00000000d004";
/** Départ de nuit (22:00) de la première compagnie. */
export const DEPART_NUIT = "00000000-0000-4000-8000-00000000d005";

/** Le matin du jour de test, 09:00 à Douala (l'horloge fixe est à 08:00 UTC). */
export const JOUR = "2026-11-02";

export const heure = (hhmm: string, jour = JOUR): string => `${jour}T${hhmm}:00+01:00`;

const compagnies: Compagnie[] = [
  { id: COMPAGNIE, code: "ALP", nom: "Alpha Voyages" },
  { id: AUTRE_COMPAGNIE, code: "ELT", nom: "Élite Express" },
];

const gares: Gare[] = [
  { id: GARE_DOUALA, compagnieId: COMPAGNIE, code: "DLA", nom: "Akwa", ville: "Douala" },
  { id: GARE_YAOUNDE, compagnieId: COMPAGNIE, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
  {
    id: AUTRE_GARE_DOUALA,
    compagnieId: AUTRE_COMPAGNIE,
    code: "DLA",
    nom: "Bonabéri",
    ville: "Douala",
  },
  {
    id: AUTRE_GARE_YAOUNDE,
    compagnieId: AUTRE_COMPAGNIE,
    code: "YDE",
    nom: "Biyem-Assi",
    ville: "Yaoundé",
  },
];

const guichets: Guichet[] = [
  { id: GUICHET_1, gareId: GARE_DOUALA, rang: 1 },
  { id: GUICHET_2, gareId: GARE_DOUALA, rang: 2 },
];

const arrets = (suffixe: string) => [
  { id: `arret-dla-${suffixe}`, nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
  { id: `arret-edea-${suffixe}`, nom: "Édéa", ordre: 1, kmDepuisOrigine: 65, montee: true },
  { id: `arret-yde-${suffixe}`, nom: "Yaoundé", ordre: 2, kmDepuisOrigine: 250, montee: false },
];

const lignes: Ligne[] = [
  {
    id: LIGNE,
    compagnieId: COMPAGNIE,
    code: "DLAYDE",
    origineGareId: GARE_DOUALA,
    destinationGareId: GARE_YAOUNDE,
    tarifs: { classique: 4000, vip: 6000, bagage: 500 },
    dureeMinutes: 270,
    arrets: arrets("a"),
  },
  {
    id: AUTRE_LIGNE,
    compagnieId: AUTRE_COMPAGNIE,
    code: "DLAYDE",
    origineGareId: AUTRE_GARE_DOUALA,
    destinationGareId: AUTRE_GARE_YAOUNDE,
    tarifs: { classique: 5000, vip: 7500, bagage: 500 },
    dureeMinutes: 240,
    arrets: arrets("b"),
  },
];

const bus: Bus[] = [
  {
    id: BUS,
    compagnieId: COMPAGNIE,
    immatriculation: "LT 214 AB",
    capacite: 40,
    capaciteSoute: 20,
    classe: "classique",
  },
  {
    id: BUS_2,
    compagnieId: COMPAGNIE,
    immatriculation: "LT 305 CD",
    capacite: 40,
    capaciteSoute: 20,
    classe: "classique",
  },
  {
    id: AUTRE_BUS,
    compagnieId: AUTRE_COMPAGNIE,
    immatriculation: "CE 118 EF",
    capacite: 50,
    capaciteSoute: 25,
    classe: "classique",
  },
  {
    id: PETIT_BUS,
    compagnieId: COMPAGNIE,
    immatriculation: "LT 007 ZZ",
    capacite: 4,
    capaciteSoute: 2,
    classe: "classique",
  },
];

/** Un départ prêt à vendre ; `surcharge` change ce qui doit l'être. */
export function departType(id: string, surcharge: Partial<Depart> = {}): Depart {
  return {
    id,
    numero: `ALP-DLAYDE-261102-${id.slice(-4)}`,
    ligneId: LIGNE,
    busId: BUS,
    classe: "classique",
    heureDepart: heure("14:00"),
    etat: "en_vente",
    historique: [],
    fusionneDansId: null,
    quai: 3,
    chauffeur: { id: "chauffeur-1", nom: "Paul Mbarga" },
    convoyeur: { id: "convoyeur-1", nom: "Joël Ndzana" },
    ...surcharge,
  };
}

/* ------------------------------------------------------------------ l'application */

export interface OptionsAppBilletterieTest {
  config?: Record<string, string>;
  /** Instant de départ de l'horloge du serveur. */
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec `BilletterieModule` branché sur ses
 * adaptateurs en mémoire, et un réseau de transport de test : deux compagnies, la ligne
 * Douala–Yaoundé de chacune, des départs, un guichet. Le socle de test n'importe pas
 * `BilletterieModule` : on refait le montage ici pour ne pas toucher au socle.
 */
export async function creerAppBilletterieTest(options: OptionsAppBilletterieTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut);

  const module = await Test.createTestingModule({ imports: [AppModule, BilletterieModule] })
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
    .overrideProvider(OPTIONS_BILLETTERIE)
    .useValue({ balayageMs: 0, pingMs: 0 })
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();
  // supertest ouvre le serveur à chaque requête : on évite l'alerte de trop d'écouteurs.
  app.getHttpServer().setMaxListeners(0);

  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  for (const c of compagnies) catalogue.ajouterCompagnie(c);
  for (const g of gares) catalogue.ajouterGare(g);
  for (const g of guichets) catalogue.ajouterGuichet(g);
  for (const l of lignes) catalogue.ajouterLigne(l);
  for (const b of bus) catalogue.ajouterBus(b);
  catalogue.ajouterDepart(departType(DEPART));
  catalogue.ajouterDepart(
    departType(DEPART_2, { heureDepart: heure("17:00"), busId: BUS_2, quai: 4 }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_VIP, { classe: "vip", heureDepart: heure("16:00"), quai: 5 }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_AUTRE, {
      ligneId: AUTRE_LIGNE,
      busId: AUTRE_BUS,
      heureDepart: heure("16:30"),
      numero: "ELT-DLAYDE-261102-1630",
    }),
  );
  catalogue.ajouterDepart(departType(DEPART_NUIT, { heureDepart: heure("22:00"), busId: null }));

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 700;

  /** Crée un compte et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    o: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const voyageur = role === "voyageur";
    const compagnieId = o.compagnieId === undefined ? (voyageur ? null : COMPAGNIE) : o.compagnieId;
    const gareId = o.gareId === undefined ? (voyageur ? null : GARE_DOUALA) : o.gareId;
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role}`,
      telephone: `+2376552${String(compteur).padStart(5, "0")}`,
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

  /** Un guichetier de la première compagnie, affecté au guichet 1 de la gare de Douala. */
  async function guichetier(guichetId = GUICHET_1, o: { nom?: string } = {}) {
    const c = await compte("guichetier", o);
    catalogue.affecterGuichet(c.id, guichetId);
    return c;
  }

  return {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    catalogue,
    billets: app.get(Billets) as BilletsMemoire,
    inventaire: app.get(Inventaire) as InventaireMemoire,
    commandes: app.get(Commandes) as CommandesMemoire,
    scans: app.get(Scans) as ScansMemoire,
    traites: app.get(EvenementsTraites) as EvenementsTraitesMemoire,
    avis: app.get(AvisBillets) as AvisMemoire,
    diffusion: app.get(DiffusionTempsReel) as DiffusionMemoire,
    promotions: app.get(Promotions) as PromotionsMemoire,
    proches: app.get(ProchesVoyageur) as ProchesMemoire,
    colis: app.get(ColisDuDepart) as ColisMemoire,
    signataire: app.get(SignataireQr),
    services: {
      sieges: app.get(SiegesService),
      billets: app.get(BilletsService),
      commandes: app.get(CommandesService),
      departs: app.get(DepartsService),
      agence: app.get(AgenceService),
      balayage: app.get(BalayageBilletterie),
    },
    compte,
    guichetier,
    /** L'heure du serveur au format de l'API (ISO, Douala). */
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),
  };
}

export type AppBilletterieTest = Awaited<ReturnType<typeof creerAppBilletterieTest>>;

/* ------------------------------------------------------------------ événements de l'agence */

interface DefinitionEvenementTest {
  readonly type: string;
  readonly numerote: boolean;
  readonly schema: { parse(valeur: unknown): unknown };
  readonly cible: (donnees: never) => { type: string; id: string };
}

export interface OptionsEvenement {
  id?: string;
  at?: string;
  appareilId?: string;
  numeroPlage?: number;
}

/**
 * Un événement de l'agence tel que l'appareil l'enverrait : identifiant tiré sur l'appareil, cible
 * déduite par le contrat. Il est relu avec le schéma zod du contrat avant d'être renvoyé : un test
 * ne peut pas envoyer un événement que le contrat refuserait.
 */
export function evenement(
  definition: DefinitionEvenementTest,
  auteurId: string,
  at: string,
  donnees: unknown,
  o: OptionsEvenement = {},
): Record<string, unknown> {
  const e = {
    id: o.id ?? randomUUID(),
    type: definition.type,
    at: o.at ?? at,
    appareilId: o.appareilId ?? "appareil-guichet-1",
    auteurId,
    cible: definition.cible(donnees as never),
    numeroPlage: definition.numerote ? (o.numeroPlage ?? 1) : null,
    donnees,
  };
  definition.schema.parse(e);
  return e;
}

/** Les données d'un paiement en espèces du montant exact. */
export const especes = (montant: number, recu = montant) => ({
  mode: "cash" as const,
  recu,
  rendu: recu - montant,
  reference: null,
});

export const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
