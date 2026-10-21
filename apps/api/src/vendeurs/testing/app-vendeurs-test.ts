import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { Bus, Compagnie, Gare, Ligne } from "../../billetterie/modeles";
import {
  AvisMemoire,
  BilletsMemoire,
  CatalogueMemoire,
  InventaireMemoire,
} from "../../billetterie/memoire";
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import { AvisBillets, Billets, Catalogue, Inventaire } from "../../billetterie/ports";
import {
  AUTRE_BUS,
  AUTRE_COMPAGNIE,
  AUTRE_GARE_DOUALA,
  AUTRE_GARE_YAOUNDE,
  AUTRE_LIGNE,
  BUS,
  COMPAGNIE,
  GARE_DOUALA,
  GARE_YAOUNDE,
  LIGNE,
  PETIT_BUS,
  departType,
  heure,
} from "../../billetterie/testing/app-billetterie-test";
import { versIsoDouala } from "../../billetterie/temps";
import { AgregateurPaiement } from "../../paiements/agregateur";
import type { AgregateurSimule } from "../../paiements/agregateur-simule";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../../paiements/config";
import { ComptesReversementMemoire, PaiementsMemoire } from "../../paiements/memoire";
import { PaiementsModule } from "../../paiements/paiements.module";
import { ComptesReversement, Paiements } from "../../paiements/ports";
import { VersementsMemoire } from "../../relais/memoire";
import { VersementsMobile } from "../../relais/ports";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
import { JournalSms } from "../../sms/journal";
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
import {
  AgrementsMemoire,
  CommissionsMemoire,
  MessagesMemoire,
  NumerosVendeursMemoire,
  ReglementsMemoire,
  VendeursMemoire,
  VentesMemoire,
} from "../memoire";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  ComptesVendeurs,
  MessagesVendeurs,
  NumerosVendeurs,
  OPTIONS_VENDEURS,
  ReglementsAgence,
  VendeursRepository,
  VentesRepository,
  type OptionsVendeurs,
} from "../ports";
import { AgrementsService } from "../agrements.service";
import { CommissionsService } from "../commissions.service";
import { TachesVendeurs } from "../taches.service";
import { VendeursModule } from "../vendeurs.module";
import { VendeursService } from "../vendeurs.service";
import { VentesService } from "../ventes.service";

export { AUTRE_COMPAGNIE, COMPAGNIE, heure };

/** L'horloge fixe est au lundi 2 novembre 2026, 09:00 à Douala : le jour du versement. */
export const JOUR = "2026-11-02";
export const DEMAIN = "2026-11-03";
export const VENDREDI = "2026-11-06";

export const GARE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002b1";
const LIGNE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002f9";

/** Alpha : Douala > Yaoundé, classique, 4 000 F, demain 08:30. */
export const DEPART_ALPHA = "00000000-0000-4000-8000-00000000e101";
/** Élite : Douala > Yaoundé, VIP, 7 500 F, demain 08:00. */
export const DEPART_ELITE_VIP = "00000000-0000-4000-8000-00000000e102";
/** Alpha : un minibus de 4 places, demain 11:00. */
export const DEPART_PETIT = "00000000-0000-4000-8000-00000000e103";
/** Alpha : aujourd'hui 14:00 (pas encore parti). */
export const DEPART_AUJOURDHUI = "00000000-0000-4000-8000-00000000e104";
/** Alpha : aujourd'hui 08:00 (déjà parti). */
export const DEPART_PARTI = "00000000-0000-4000-8000-00000000e105";
/** Alpha : vendredi 08:30 (la revente « chaque vendredi »). */
export const DEPART_VENDREDI = "00000000-0000-4000-8000-00000000e106";
/** Alpha : Douala > Bafoussam, demain 07:00. */
export const DEPART_BAFOUSSAM = "00000000-0000-4000-8000-00000000e107";
/** Alpha : fermé à la vente. */
export const DEPART_FERME = "00000000-0000-4000-8000-00000000e108";

export const TEL_VOISIN = "+237670123456";
export const TEL_MTN = "+237677000031";
export const TEL_ORANGE = "+237691000032";

const compagnies: Compagnie[] = [
  { id: COMPAGNIE, code: "ALP", nom: "Alpha Voyages" },
  { id: AUTRE_COMPAGNIE, code: "ELT", nom: "Élite Express" },
];

const gares: Gare[] = [
  { id: GARE_DOUALA, compagnieId: COMPAGNIE, code: "DLA", nom: "Akwa", ville: "Douala" },
  { id: GARE_YAOUNDE, compagnieId: COMPAGNIE, code: "YDE", nom: "Mvan", ville: "Yaoundé" },
  {
    id: GARE_BAFOUSSAM,
    compagnieId: COMPAGNIE,
    code: "BFM",
    nom: "Gare routière",
    ville: "Bafoussam",
  },
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

const arrets = (suffixe: string) => [
  { id: `arret-dla-${suffixe}`, nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
  { id: `arret-yde-${suffixe}`, nom: "Yaoundé", ordre: 1, kmDepuisOrigine: 250, montee: false },
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
  {
    id: LIGNE_BAFOUSSAM,
    compagnieId: COMPAGNIE,
    code: "DLABFM",
    origineGareId: GARE_DOUALA,
    destinationGareId: GARE_BAFOUSSAM,
    tarifs: { classique: 3500, vip: 5000, bagage: 500 },
    dureeMinutes: 300,
    arrets: [
      { id: "arret-dla-c", nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
      { id: "arret-bfm-c", nom: "Bafoussam", ordre: 1, kmDepuisOrigine: 260, montee: false },
    ],
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

export interface OptionsAppVendeursTest {
  /** `paiements` : le vrai module des paiements (agrégateur simulé) ; `memoire` : un règlement piloté à la main. */
  reglement?: "paiements" | "memoire";
  /** Issue du premier appel à l'agrégateur simulé (réglage `paiements`). */
  issueAgregateur?: "reussi" | "en_attente" | "echoue";
  /** `memoire` : les messages sont gardés ; `reel` : ils partent par la passerelle SMS. */
  messages?: "memoire" | "reel";
  /** Attente maximale de la confirmation pendant la vente. */
  delaiReglementMs?: number;
  /** Les compagnies sans compte de reversement chez l'agrégateur. */
  sansCompteElite?: boolean;
}

/**
 * L'API complète (gardes, rôles, audit) avec la vraie billetterie, les vrais paiements (agrégateur
 * simulé) et `VendeursModule`, sur les adaptateurs en mémoire. Le réseau de transport de test :
 * Alpha et Élite sur Douala–Yaoundé, Alpha vers Bafoussam, des départs aujourd'hui, demain et vendredi.
 * L'horloge démarre un lundi à 09:00 à Douala.
 */
export async function creerAppVendeursTest(options: OptionsAppVendeursTest = {}) {
  const config = configTest();
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe();
  const reglementMode = options.reglement ?? "paiements";
  const reglements = new ReglementsMemoire();
  const messages = new MessagesMemoire();
  const optionsVendeurs: OptionsVendeurs = {
    delaiReglementMs: options.delaiReglementMs ?? 100,
    sondageMs: 5,
    tachesMs: 0,
    baseLienBillet: "https://afrimove.app/b/",
  };

  let builder = Test.createTestingModule({ imports: [AppModule, PaiementsModule, VendeursModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_PAIEMENTS)
    .useValue(
      chargerConfigPaiements({
        PAIEMENTS_FOURNISSEUR: "simule",
        PAIEMENTS_SIMULE_ISSUE: options.issueAgregateur ?? "reussi",
        PAIEMENTS_BALAYAGE_MS: "0",
        PAIEMENTS_CONSULTATION_APRES_MS: "0",
        PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
      }),
    )
    .overrideProvider(CONFIG_SMS)
    .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
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
    .overrideProvider(OPTIONS_VENDEURS)
    .useValue(optionsVendeurs)
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
    .overrideProvider(ComptesVendeurs)
    .useFactory({
      factory: (comptes: ComptesService) => new ComptesVendeursTest(comptes, personnes),
      inject: [ComptesService],
    });
  if (reglementMode === "memoire")
    builder = builder.overrideProvider(ReglementsAgence).useValue(reglements);
  if ((options.messages ?? "memoire") === "memoire") {
    builder = builder.overrideProvider(MessagesVendeurs).useValue(messages);
  }
  const module = await builder.compile();

  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);

  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  for (const c of compagnies) catalogue.ajouterCompagnie(c);
  for (const g of gares) catalogue.ajouterGare(g);
  for (const l of lignes) catalogue.ajouterLigne(l);
  for (const b of bus) catalogue.ajouterBus(b);
  const alpha = { ligneId: LIGNE, busId: BUS };
  catalogue.ajouterDepart(
    departType(DEPART_ALPHA, { ...alpha, heureDepart: heure("08:30", DEMAIN) }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_ELITE_VIP, {
      ligneId: AUTRE_LIGNE,
      busId: AUTRE_BUS,
      classe: "vip",
      heureDepart: heure("08:00", DEMAIN),
      numero: "ELT-DLAYDE-261103-0800",
    }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_PETIT, {
      ligneId: LIGNE,
      busId: PETIT_BUS,
      heureDepart: heure("11:00", DEMAIN),
    }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_AUJOURDHUI, { ...alpha, heureDepart: heure("14:00", JOUR) }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_PARTI, { ...alpha, heureDepart: heure("08:00", JOUR) }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_VENDREDI, { ...alpha, heureDepart: heure("08:30", VENDREDI) }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_BAFOUSSAM, {
      ligneId: LIGNE_BAFOUSSAM,
      busId: BUS,
      heureDepart: heure("07:00", DEMAIN),
    }),
  );
  catalogue.ajouterDepart(
    departType(DEPART_FERME, { ...alpha, heureDepart: heure("16:00", DEMAIN), etat: "annule" }),
  );

  const comptesReversement = app.get(ComptesReversement) as ComptesReversementMemoire;
  await comptesReversement.definir(COMPAGNIE, "compte-alpha");
  if (!options.sansCompteElite) await comptesReversement.definir(AUTRE_COMPAGNIE, "compte-elite");

  const comptes = app.get(ComptesService);
  const tokens = app.get(TokensService);
  let compteur = 300;

  /** Crée un compte et renvoie son identifiant, son téléphone et un jeton d'accès. */
  async function compte(
    role: Role,
    o: {
      compagnieId?: string | null;
      gareId?: string | null;
      nom?: string;
      telephone?: string;
    } = {},
  ): Promise<{ id: string; jeton: string; telephone: string }> {
    compteur += 1;
    const sansCompagnie = ["voyageur", "vendeur", "afrimove"].includes(role);
    const telephone = o.telephone ?? `+2376553${String(compteur).padStart(5, "0")}`;
    const personne = await comptes.creer({
      nom: o.nom ?? `Test ${role} ${compteur}`,
      telephone,
      roles: [role],
      compagnieId: o.compagnieId === undefined ? (sansCompagnie ? null : COMPAGNIE) : o.compagnieId,
      gareId: o.gareId === undefined ? (sansCompagnie ? null : GARE_DOUALA) : o.gareId,
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
    return { id: personne.id, jeton: accessToken, telephone };
  }

  /** Un jeton de vendeur pour un compte créé par l'agrément. */
  async function jetonVendeur(personneId: string): Promise<string> {
    const { accessToken } = await tokens.emettre({
      sub: personneId,
      role: "vendeur",
      cid: null,
      gid: null,
    });
    return accessToken;
  }

  const patrons = new Map<string, { id: string; jeton: string }>();
  /** Le patron de la compagnie (créé au besoin) : c'est lui qui agrée. */
  async function patronDe(compagnieId: string) {
    let p = patrons.get(compagnieId);
    if (!p) {
      p = await compte("patron", { compagnieId, gareId: null });
      patrons.set(compagnieId, p);
    }
    return p;
  }

  const http = () => request(app.getHttpServer());
  const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });

  interface VendeurCree {
    id: string;
    jeton: string;
    numero: string;
    telephone: string;
  }
  let numeroTel = 0;
  /**
   * Un vendeur agréé par ces compagnies (Alpha par défaut), par les vraies routes de l'agence.
   */
  async function creerVendeur(
    o: {
      nom?: string;
      telephone?: string;
      operateur?: "mtn" | "orange";
      compagnies?: string[];
      quartier?: string;
      ville?: string;
      commissions?: { commissionClassique?: number; commissionVip?: number };
    } = {},
  ): Promise<VendeurCree> {
    numeroTel += 1;
    const telephone = o.telephone ?? `+2376770${String(10000 + numeroTel)}`;
    let id = "";
    let numero = "";
    for (const compagnieId of o.compagnies ?? [COMPAGNIE]) {
      const patron = await patronDe(compagnieId);
      const rep = await http()
        .post("/agence/vendeurs")
        .set(avec(patron.jeton))
        .send({
          nom: o.nom ?? "Nadège",
          telephone,
          quartier: o.quartier ?? "Ndokoti",
          ville: o.ville ?? "Douala",
          momo: { telephone, operateur: o.operateur ?? "mtn" },
          ...(o.commissions ?? {}),
        });
      if (rep.status !== 201)
        throw new Error(`Agrément refusé : ${rep.status} ${JSON.stringify(rep.body)}`);
      id = rep.body.vendeurId;
      numero = rep.body.numero;
    }
    return { id, jeton: await jetonVendeur(id), numero, telephone };
  }

  const vendre = (jeton: string, corps: Record<string, unknown>) =>
    http().post("/vendeurs/moi/ventes").set(avec(jeton)).send(corps);

  /** Le corps d'une vente d'un billet au nom d'un voisin. */
  const venteDe = (
    departId: string,
    voisin: { nom?: string; telephone?: string } = {},
    moyen = "mtn_momo",
  ) => ({
    departId,
    voisin: { nom: voisin.nom ?? "Mme Ebogo", telephone: voisin.telephone ?? TEL_VOISIN },
    reglementAgence: moyen,
  });

  return {
    app,
    http,
    avec,
    horloge,
    personnes,
    catalogue,
    compte,
    creerVendeur,
    jetonVendeur,
    patronDe,
    vendre,
    venteDe,
    agregateur: app.get(AgregateurPaiement) as AgregateurSimule,
    reglements,
    messages,
    journalSms: app.get(JournalSms),
    billets: app.get(Billets) as BilletsMemoire,
    inventaire: app.get(Inventaire) as InventaireMemoire,
    avisBillets: app.get(AvisBillets) as AvisMemoire,
    paiements: app.get(Paiements) as PaiementsMemoire,
    comptesReversement,
    versements: app.get(VersementsMobile) as VersementsMemoire,
    vendeurs: app.get(VendeursRepository) as VendeursMemoire,
    agrements: app.get(AgrementsRepository) as AgrementsMemoire,
    numeros: app.get(NumerosVendeurs) as NumerosVendeursMemoire,
    ventes: app.get(VentesRepository) as VentesMemoire,
    commissions: app.get(CommissionsVendeurs) as CommissionsMemoire,
    audit: app.get(AuditRepository) as AuditMemoire,
    services: {
      vendeurs: app.get(VendeursService),
      ventes: app.get(VentesService),
      agrements: app.get(AgrementsService),
      commissions: app.get(CommissionsService),
      taches: app.get(TachesVendeurs),
    },
    /** L'heure du serveur au format de l'API (ISO, Douala). */
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),
  };
}

export type AppVendeursTest = Awaited<ReturnType<typeof creerAppVendeursTest>>;

/** Le compte du vendeur existe vraiment (jeton valide) : comme le fera l'adaptateur du coordinateur. */
class ComptesVendeursTest extends ComptesVendeurs {
  constructor(
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesMemoire,
  ) {
    super();
  }

  async ouvrir(a: { nom: string; telephone: string }) {
    let personne = await this.comptes.trouverParTelephone(a.telephone);
    let nouveau = false;
    if (!personne) {
      personne = await this.comptes.creer({
        nom: a.nom,
        telephone: a.telephone,
        roles: ["vendeur"],
        pin: "482915",
      });
      nouveau = true;
    } else if (!personne.roles.includes("vendeur")) {
      this.personnes.modifier(personne.id, { roles: [...personne.roles, "vendeur"] });
    }
    return { personneId: personne.id, nom: personne.nom, nouveau };
  }
}

// Les messages gardés en mémoire servent aux assertions ; `sms` (SmsMock) à l'intégration complète.
export { AuditMemoire, CommissionsMemoire, MessagesMemoire, ReglementsMemoire };
