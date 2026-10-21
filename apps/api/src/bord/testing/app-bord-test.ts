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
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import type {
  Billet,
  Bus,
  Compagnie,
  Depart,
  Gare,
  Guichet,
  Ligne,
} from "../../billetterie/modeles";
import {
  BilletsMemoire,
  CatalogueMemoire,
  ColisMemoire,
  EvenementsTraitesMemoire,
  InventaireMemoire,
} from "../../billetterie/memoire";
import {
  Billets,
  Catalogue,
  ColisDuDepart,
  EvenementsTraites,
  Inventaire,
  SignataireQr,
} from "../../billetterie/ports";
import { BilletsService, entreeHistorique } from "../../billetterie/billets.service";
import { Passagers } from "../../billetterie/passagers";
import { numeroBillet } from "../../billetterie/regles";
import { aammjjDouala, versIsoDouala } from "../../billetterie/temps";
import { EtatsSuivi } from "../../gps/ports";
import { EtatsSuiviMemoire } from "../../gps/memoire";
import {
  ControlesBordMemoire,
  DepensesBordMemoire,
  IncidentsBordMemoire,
  MessagesBordMemoire,
  PassagesRouteMemoire,
  RetardsDepartMemoire,
  VentesEnRouteMemoire,
} from "../memoire";
import {
  ControlesBord,
  DepensesBord,
  IncidentsBord,
  MessagesBord,
  PassagesRoute,
  RetardsDepart,
  VentesEnRoute,
} from "../ports";

export {
  avec,
  especes,
  evenement,
  heure,
  JOUR,
  COMPAGNIE,
  AUTRE_COMPAGNIE,
  GARE_DOUALA,
  GARE_YAOUNDE,
  GUICHET_1,
  LIGNE,
  BUS,
  BUS_2,
  departType,
} from "../../billetterie/testing/app-billetterie-test";

import {
  AUTRE_COMPAGNIE,
  AUTRE_GARE_DOUALA,
  AUTRE_GARE_YAOUNDE,
  AUTRE_LIGNE,
  AUTRE_BUS,
  BUS,
  BUS_2,
  COMPAGNIE,
  GARE_DOUALA,
  GARE_YAOUNDE,
  GUICHET_1,
  GUICHET_2,
  LIGNE,
  departType,
  heure,
} from "../../billetterie/testing/app-billetterie-test";

/* ------------------------------------------------------------------ jeu de données */

/** Bus en route (état « parti ») : l'équipage de test, le bus 1. */
export const DEPART_ROUTE = "00000000-0000-4000-8000-00000000d101";
/** Bus à l'embarquement : le même équipage, le bus 2. */
export const DEPART_EMBARQUEMENT = "00000000-0000-4000-8000-00000000d102";
/** Bus en route d'un autre équipage de la même compagnie. */
export const DEPART_AUTRE_EQUIPAGE = "00000000-0000-4000-8000-00000000d103";
/** Bus encore en vente (ni embarquement ni route) du même équipage. */
export const DEPART_EN_VENTE = "00000000-0000-4000-8000-00000000d104";
/** Bus d'une autre compagnie. */
export const DEPART_AUTRE_COMPAGNIE = "00000000-0000-4000-8000-00000000d105";

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
];

/* ------------------------------------------------------------------ l'application */

export interface OptionsAppBordTest {
  config?: Record<string, string>;
  /** Instant de départ de l'horloge du serveur (par défaut 2026-11-02 à 08:00 UTC, 09:00 à Douala). */
  debut?: Date;
}

/**
 * L'API complète (gardes, rôles, journal d'audit) avec tous les modules sur leurs adaptateurs en mémoire, les
 * messages du bord consignés dans `messages`, et un réseau de transport de test : une compagnie avec son
 * équipage (convoyeur, chauffeur, contrôleur), des départs en route, à l'embarquement et en vente, et une
 * autre compagnie. Le montage reprend `creerAppBilletterieTest`, qu'on ne modifie pas.
 */
export async function creerAppBordTest(options: OptionsAppBordTest = {}) {
  const config = configTest(options.config);
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(options.debut);
  const messages = new MessagesBordMemoire();

  const module = await Test.createTestingModule({ imports: [AppModule] })
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
    .overrideProvider(MessagesBord)
    .useValue(messages)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);

  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  for (const c of compagnies) catalogue.ajouterCompagnie(c);
  for (const g of gares) catalogue.ajouterGare(g);
  for (const g of guichets) catalogue.ajouterGuichet(g);
  for (const l of lignes) catalogue.ajouterLigne(l);
  for (const b of bus) catalogue.ajouterBus(b);

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 800;

  /** Crée un compte et renvoie son identifiant et un jeton d'accès. */
  async function compte(
    role: Role,
    o: { compagnieId?: string | null; gareId?: string | null; nom?: string } = {},
  ): Promise<{ id: string; jeton: string; nom: string }> {
    compteur += 1;
    const motDePasse = METHODE_PAR_ROLE[role] === "motdepasse_sms";
    const voyageur = role === "voyageur";
    const compagnieId = o.compagnieId === undefined ? (voyageur ? null : COMPAGNIE) : o.compagnieId;
    const gareId = o.gareId === undefined ? (voyageur ? null : GARE_DOUALA) : o.gareId;
    const nom = o.nom ?? `Test ${role}`;
    const personne = await comptes.creer({
      nom,
      telephone: `+2376553${String(compteur).padStart(5, "0")}`,
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
    return { id: personne.id, jeton: accessToken, nom };
  }

  const convoyeur = await compte("convoyeur", { nom: "Joël Ndzana" });
  const chauffeur = await compte("chauffeur", { nom: "Paul Mbarga" });
  const controleur = await compte("controleur", { nom: "Aïcha Nkoulou" });
  const autreConvoyeur = await compte("convoyeur", { nom: "Eric Mballa" });
  const autreChauffeur = await compte("chauffeur", { nom: "Luc Biyick" });

  const equipe = {
    convoyeur: { id: convoyeur.id, nom: convoyeur.nom },
    chauffeur: { id: chauffeur.id, nom: chauffeur.nom },
  };
  catalogue.ajouterDepart(
    departType(DEPART_ROUTE, { etat: "parti", heureDepart: heure("08:30"), ...equipe }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_EMBARQUEMENT, {
      etat: "embarquement",
      busId: BUS_2,
      heureDepart: heure("09:30"),
      quai: 4,
      ...equipe,
    }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_AUTRE_EQUIPAGE, {
      etat: "parti",
      heureDepart: heure("08:00"),
      convoyeur: { id: autreConvoyeur.id, nom: autreConvoyeur.nom },
      chauffeur: { id: autreChauffeur.id, nom: autreChauffeur.nom },
    }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_EN_VENTE, { heureDepart: heure("14:00"), busId: BUS_2, ...equipe }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_AUTRE_COMPAGNIE, {
      etat: "parti",
      ligneId: AUTRE_LIGNE,
      busId: AUTRE_BUS,
      heureDepart: heure("08:00"),
      numero: "ELT-DLAYDE-261102-0800",
      ...equipe,
    }),
  );

  const billetsService = app.get(BilletsService);
  const passagers = app.get(Passagers);
  let sequence = 1000;

  /**
   * Un billet payé au guichet (numéro de la plage 1001+, QR signé), posé directement dans le stock : le
   * départ peut être dans n'importe quel état. `aBord` le fait passer à « embarqué ».
   */
  async function billetPaye(
    departId: string,
    siege: number,
    o: { nom?: string | null; telephone?: string | null; aBord?: boolean; prix?: number } = {},
  ): Promise<Billet> {
    sequence += 1;
    const dc = await catalogue.depart(departId);
    if (!dc) throw new Error(`Départ ${departId} inconnu`);
    const at = versIsoDouala(horloge.maintenant());
    const brut: Billet = {
      id: randomUUID(),
      numero: numeroBillet({
        agence: dc.compagnie.code,
        gare: "DLA",
        aammjj: aammjjDouala(at),
        sequence,
      }),
      sequence,
      compagnieId: dc.compagnie.id,
      gareId: GARE_DOUALA,
      departId,
      siege,
      classe: dc.depart.classe,
      prix: o.prix ?? dc.ligne.tarifs[dc.depart.classe],
      bagage: 0,
      canal: "guichet",
      guichetId: GUICHET_1,
      acheteurId: null,
      commandeId: null,
      passagerChiffre: passagers.chiffrer({
        nom: o.nom === undefined ? "Aminatou Fotso" : o.nom,
        telephone: o.telephone === undefined ? "+237691221008" : o.telephone,
        pieceQuatreDerniers: null,
      }),
      passagerTelephoneIndex: passagers.indexTelephone(
        o.telephone === undefined ? "+237691221008" : o.telephone,
      ),
      codeBillet: String(1000 + sequence).slice(-4),
      qr: "",
      creeA: at,
      etat: "paye",
      historique: [entreeHistorique("payer", "reserve", "paye", at, "guichet")],
      evenementId: randomUUID(),
      appareilId: "appareil-guichet-1",
      auteurId: "guichet",
      paiement: { mode: "cash", reference: null },
      aCompleterAuQuai: false,
      smsEnvoye: true,
      retardPrevenu: false,
      embarqueA: null,
      reporteDe: null,
    };
    const enregistre = await billetsService.enregistrer(brut, null);
    if (!o.aBord) return enregistre;
    return (await billetsService.embarquer(enregistre, at, "guichet")) ?? enregistre;
  }

  return {
    app,
    http: () => request(app.getHttpServer()),
    billetPaye,
    horloge,
    catalogue,
    messages,
    billets: app.get(Billets) as BilletsMemoire,
    inventaire: app.get(Inventaire) as InventaireMemoire,
    traites: app.get(EvenementsTraites) as EvenementsTraitesMemoire,
    colis: app.get(ColisDuDepart) as ColisMemoire,
    signataire: app.get(SignataireQr),
    suivi: app.get(EtatsSuivi) as EtatsSuiviMemoire,
    ventes: app.get(VentesEnRoute) as VentesEnRouteMemoire,
    passages: app.get(PassagesRoute) as PassagesRouteMemoire,
    depenses: app.get(DepensesBord) as DepensesBordMemoire,
    incidents: app.get(IncidentsBord) as IncidentsBordMemoire,
    retards: app.get(RetardsDepart) as RetardsDepartMemoire,
    controles: app.get(ControlesBord) as ControlesBordMemoire,
    compte,
    equipage: { convoyeur, chauffeur, controleur, autreConvoyeur, autreChauffeur },
    /** L'heure du serveur au format de l'API (ISO, Douala). */
    maintenant: () => versIsoDouala(horloge.maintenant()),
    /** Fait passer un départ à un autre état (le catalogue de test ne vérifie pas l'enchaînement). */
    async etat(departId: string, attendu: Depart["etat"], etat: Depart["etat"]) {
      await catalogue.changerDepart(departId, attendu, { etat });
    },
    fermer: () => app.close(),
  };
}

export type AppBordTest = Awaited<ReturnType<typeof creerAppBordTest>>;
