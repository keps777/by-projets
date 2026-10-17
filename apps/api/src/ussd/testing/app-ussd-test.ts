import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { CommandesService } from "../../billetterie/commandes.service";
import type { Bus, Compagnie, Gare, Ligne } from "../../billetterie/modeles";
import {
  AvisMemoire,
  BilletsMemoire,
  CatalogueMemoire,
  CommandesMemoire,
  PromotionsMemoire,
} from "../../billetterie/memoire";
import { AvisBillets, Billets, Catalogue, Commandes, Promotions } from "../../billetterie/ports";
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import { departType, heure } from "../../billetterie/testing/app-billetterie-test";
import { versIsoDouala } from "../../billetterie/temps";
import { AgregateurPaiement } from "../../paiements/agregateur";
import type { AgregateurSimule } from "../../paiements/agregateur-simule";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../../paiements/config";
import { ComptesReversementMemoire, PaiementsMemoire } from "../../paiements/memoire";
import { ModeDegradeService } from "../../paiements/mode-degrade.service";
import { Paiements, ComptesReversement } from "../../paiements/ports";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
import { JournalSms } from "../../sms/journal";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
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
import { CONFIG_USSD, chargerConfigUssd, type OperateurUssd } from "../config";
import {
  AchatsUssdMemoire,
  JournalUssdMemoire,
  NotifieurBilletMemoire,
  SessionsMemoire,
  SuiviBusMemoire,
  SuiviColisMemoire,
} from "../memoire";
import {
  AchatsUssd,
  JournalUssd,
  NotifieurBilletUssd,
  SessionsUssd,
  SuiviBusUssd,
  SuiviColisUssd,
} from "../ports";
import { SuiviAchatsUssdService } from "../suivi-achats.service";
import { UssdModule } from "../ussd.module";

export const JETON_MTN = "jeton-mtn-pour-les-tests-uniquement-0123456789";
export const JETON_ORANGE = "jeton-orange-pour-les-tests-uniquement-0123456789";

/** Un numéro MTN et un numéro Orange. */
export const TEL_MTN = "+237677012345";
export const TEL_ORANGE = "+237691221008";
export const TEL_PROCHE = "+237655123456";

/* ------------------------------------------------------------------ le réseau de la planche */

/**
 * Trois compagnies sur Douala–Yaoundé, aux départs de la planche : Bêta (VIP, 7 500 F), Alpha
 * (4 000 F), Oméga (3 800 F). L'horloge démarre à 07:00 à Douala : les départs sont à 08:00,
 * 08:30 et 09:30.
 */
export const BETA = "00000000-0000-4000-8000-0000000000b1";
export const ALPHA = "00000000-0000-4000-8000-0000000000a1";
export const OMEGA = "00000000-0000-4000-8000-0000000000e1";
export const DEPART_BETA = "00000000-0000-4000-8000-00000000d101";
export const DEPART_ALPHA = "00000000-0000-4000-8000-00000000d102";
export const DEPART_OMEGA = "00000000-0000-4000-8000-00000000d103";
/** Le 3 novembre : le lendemain du jour de test. */
export const DEPART_DEMAIN = "00000000-0000-4000-8000-00000000d104";
/** Alpha : Bafoussam > Douala, 10:00 — pour vérifier que le trajet suit le dernier billet. */
export const DEPART_BAFOUSSAM = "00000000-0000-4000-8000-00000000d105";
const GARE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002b1";
const LIGNE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002f9";

const DEBUT = new Date("2026-11-02T06:00:00.000Z");

interface Reseau {
  compagnie: Compagnie;
  gares: [Gare, Gare];
  ligne: Ligne;
  bus: Bus;
}

function reseau(id: string, code: string, nom: string, tarifs: Ligne["tarifs"], n: number): Reseau {
  const gareDepart: Gare = {
    id: `00000000-0000-4000-8000-0000000${n}00a1`,
    compagnieId: id,
    code: "DLA",
    nom: "Akwa",
    ville: "Douala",
  };
  const gareArrivee: Gare = {
    id: `00000000-0000-4000-8000-0000000${n}00a2`,
    compagnieId: id,
    code: "YDE",
    nom: "Mvan",
    ville: "Yaoundé",
  };
  return {
    compagnie: { id, code, nom },
    gares: [gareDepart, gareArrivee],
    ligne: {
      id: `00000000-0000-4000-8000-0000000${n}00f1`,
      compagnieId: id,
      code: "DLAYDE",
      origineGareId: gareDepart.id,
      destinationGareId: gareArrivee.id,
      tarifs,
      dureeMinutes: 270,
      arrets: [
        { id: `arret-dla-${n}`, nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
        { id: `arret-edea-${n}`, nom: "Édéa", ordre: 1, kmDepuisOrigine: 65, montee: true },
        { id: `arret-yde-${n}`, nom: "Yaoundé", ordre: 2, kmDepuisOrigine: 250, montee: false },
      ],
    },
    bus: {
      id: `00000000-0000-4000-8000-0000000${n}00b1`,
      compagnieId: id,
      immatriculation: `LT 00${n} AB`,
      capacite: 40,
      capaciteSoute: 20,
      classe: "classique",
    },
  };
}

const RESEAUX = [
  reseau(BETA, "BET", "Bêta Voyages", { classique: 5000, vip: 7500, bagage: 500 }, 1),
  reseau(ALPHA, "ALP", "Alpha Voyages", { classique: 4000, vip: 6000, bagage: 500 }, 2),
  reseau(OMEGA, "OME", "Oméga Transports", { classique: 3800, vip: 5500, bagage: 500 }, 3),
] as const;

/* ------------------------------------------------------------------ l'application */

export interface OptionsAppUssdTest {
  /** Variables `USSD_*` en plus de celles du test. */
  env?: Record<string, string>;
  /** Variables `PAIEMENTS_*` en plus de celles du test. */
  envPaiements?: Record<string, string>;
  /** Pas de départ le jour de test (seulement ceux de demain). */
  sansDepartsAujourdhui?: boolean;
  /** Le SMS du billet part pour de bon par la passerelle SMS (sinon un notifieur en mémoire). */
  smsReel?: boolean;
  /** Le code « sans frais » n'existe pas dans les promotions. */
  sansPromotion?: boolean;
  /** Pas de compte de reversement pour Alpha. */
  alphaSansCompte?: boolean;
}

/**
 * L'API complète (gardes, rôles, audit) avec la vraie billetterie, les vrais paiements (agrégateur
 * simulé) et `UssdModule`, sur les adaptateurs en mémoire.
 */
export async function creerAppUssdTest(options: OptionsAppUssdTest = {}) {
  const config = configTest();
  const personnes = new PersonnesMemoire();
  const horloge = new HorlogeFixe(DEBUT);
  const configPaiements = chargerConfigPaiements({
    PAIEMENTS_FOURNISSEUR: "simule",
    PAIEMENTS_SIMULE_ISSUE: "en_attente",
    PAIEMENTS_BALAYAGE_MS: "0",
    PAIEMENTS_URL_LIEN_PROCHE: "https://afrimove.app/payer",
    ...options.envPaiements,
  });
  const configUssd = chargerConfigUssd({
    USSD_MTN_JETON: JETON_MTN,
    USSD_ORANGE_JETON: JETON_ORANGE,
    USSD_BALAYAGE_MS: "0",
    ...options.env,
  });

  let builder = Test.createTestingModule({ imports: [AppModule, UssdModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_PAIEMENTS)
    .useValue(configPaiements)
    .overrideProvider(CONFIG_USSD)
    .useValue(configUssd)
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
    .overrideProvider(PrismaService)
    .useValue({ estJoignable: async () => true, $disconnect: async () => undefined });
  const notifieur = new NotifieurBilletMemoire();
  const colis = new SuiviColisMemoire();
  const bus = new SuiviBusMemoire();
  builder = builder.overrideProvider(SuiviColisUssd).useValue(colis);
  builder = builder.overrideProvider(SuiviBusUssd).useValue(bus);
  if (!options.smsReel) builder = builder.overrideProvider(NotifieurBilletUssd).useValue(notifieur);
  const module = await builder.compile();

  const app = module.createNestApplication<NestExpressApplication>({ rawBody: true });
  configurerApp(app, config);
  await app.init();
  app.getHttpServer().setMaxListeners(0);

  const catalogue = app.get(Catalogue) as CatalogueMemoire;
  for (const r of RESEAUX) {
    catalogue.ajouterCompagnie(r.compagnie);
    for (const g of r.gares) catalogue.ajouterGare(g);
    catalogue.ajouterLigne(r.ligne);
    catalogue.ajouterBus(r.bus);
  }
  const [beta, alpha, omega] = RESEAUX;
  catalogue.ajouterGare({
    id: GARE_BAFOUSSAM,
    compagnieId: ALPHA,
    code: "BFM",
    nom: "Gare routiere",
    ville: "Bafoussam",
  });
  catalogue.ajouterLigne({
    ...alpha.ligne,
    id: LIGNE_BAFOUSSAM,
    code: "BFMDLA",
    origineGareId: GARE_BAFOUSSAM,
    destinationGareId: alpha.gares[0].id,
    tarifs: { classique: 3500, vip: 5000, bagage: 500 },
    arrets: [
      { id: "arret-bfm", nom: "Bafoussam", ordre: 0, kmDepuisOrigine: 0, montee: true },
      { id: "arret-dla-b", nom: "Douala", ordre: 1, kmDepuisOrigine: 250, montee: false },
    ],
  });
  catalogue.ajouterDepart(
    departType(DEPART_BAFOUSSAM, {
      ligneId: LIGNE_BAFOUSSAM,
      busId: alpha.bus.id,
      heureDepart: heure("10:00", "2026-11-02"),
    }),
  );
  const parBus = (r: Reseau) => ({ ligneId: r.ligne.id, busId: r.bus.id });
  const jour = "2026-11-02";
  if (!options.sansDepartsAujourdhui) {
    catalogue.ajouterDepart(
      departType(DEPART_BETA, {
        ...parBus(beta),
        classe: "vip",
        heureDepart: heure("08:00", jour),
      }),
    );
    catalogue.ajouterDepart(
      departType(DEPART_ALPHA, { ...parBus(alpha), heureDepart: heure("08:30", jour) }),
    );
    catalogue.ajouterDepart(
      departType(DEPART_OMEGA, { ...parBus(omega), heureDepart: heure("09:30", jour) }),
    );
  }
  catalogue.ajouterDepart(
    departType(DEPART_DEMAIN, { ...parBus(alpha), heureDepart: heure("07:00", "2026-11-03") }),
  );

  if (!options.sansPromotion) {
    (app.get(Promotions) as PromotionsMemoire).ajouter({ code: "USSD", type: "frais_offerts" });
  }
  const comptesReversement = app.get(ComptesReversement) as ComptesReversementMemoire;
  await comptesReversement.definir(BETA, "compte-beta");
  if (!options.alphaSansCompte) await comptesReversement.definir(ALPHA, "compte-alpha");
  await comptesReversement.definir(OMEGA, "compte-omega");

  const agregateur = app.get(AgregateurPaiement) as AgregateurSimule;
  const t = {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    config: configUssd,
    agregateur,
    catalogue,
    notifieur,
    sessions: app.get(SessionsUssd) as SessionsMemoire,
    journal: app.get(JournalUssd) as JournalUssdMemoire,
    achats: app.get(AchatsUssd) as AchatsUssdMemoire,
    colis,
    bus,
    suivi: app.get(SuiviAchatsUssdService),
    billets: app.get(Billets) as BilletsMemoire,
    commandes: app.get(Commandes) as CommandesMemoire,
    paiements: app.get(Paiements) as PaiementsMemoire,
    avis: app.get(AvisBillets) as AvisMemoire,
    journalSms: app.get(JournalSms),
    comptesService: app.get(ComptesService),
    modeDegrade: app.get(ModeDegradeService),
    commandesService: app.get(CommandesService),
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),
    /** La dernière commande retenue par USSD. */
    async derniereCommande() {
      const achats = await t.achats.enEtat(
        ["reservee", "paiement_demande", "terminee", "abandonnee"],
        1000,
      );
      const dernier = achats.at(-1);
      if (!dernier) throw new Error("aucun achat USSD");
      const commande = await t.commandes.trouver(dernier.commandeId);
      return { achat: dernier, commande: commande! };
    },
    /** L'opérateur confirme le paiement de la commande : l'agrégateur appelle le webhook signé. */
    async confirmerPaiement(commandeId: string) {
      const [paiement] = await t.paiements.duCommande(commandeId);
      if (!paiement) throw new Error("aucun paiement pour cette commande");
      const n = agregateur.notificationDeReussite(paiement.id);
      const r = await request(app.getHttpServer())
        .post("/paiements/webhooks/simule")
        .set(n.entetes as Record<string, string>)
        .send(n.corpsBrut ?? "");
      if (r.status !== 200) throw new Error(`webhook refusé : ${r.status}`);
      return paiement;
    },
    /** AfriMove coupe ou rétablit le paiement en ligne. */
    async degrader(actif: boolean) {
      await t.modeDegrade.definir(
        { id: "afrimove-test", role: "afrimove", compagnieId: null, gareId: null },
        actif,
        actif ? "test" : null,
      );
    },
    async jeton(roleVoyageurTel: string): Promise<string> {
      const p = await t.comptesService.trouverParTelephone(roleVoyageurTel);
      if (!p) throw new Error("compte inconnu");
      const { accessToken } = await app.get(TokensService).emettre({
        sub: p.id,
        role: "voyageur",
        cid: null,
        gid: null,
      });
      return accessToken;
    },
  };
  return t;
}

export type AppUssdTest = Awaited<ReturnType<typeof creerAppUssdTest>>;

/* ------------------------------------------------------------------ un téléphone */

export interface EcranRecu {
  texte: string;
  fin: boolean;
  statut: number;
}

let compteurSession = 0;

/**
 * Un téléphone qui compose *123# chez un opérateur. Il parle comme l'opérateur : MTN envoie le
 * texte cumulé des réponses, Orange le type de requête et la dernière réponse.
 */
export class Telephone {
  private readonly sessionId = `session-${++compteurSession}-${Date.now()}`;
  private cumul: string[] = [];
  private ouverte = false;

  constructor(
    private readonly t: AppUssdTest,
    readonly operateur: OperateurUssd,
    readonly msisdn: string,
  ) {}

  private async envoyer(corps: Record<string, unknown>): Promise<EcranRecu> {
    const jeton = this.operateur === "mtn" ? JETON_MTN : JETON_ORANGE;
    const r = await this.t
      .http()
      .post(`/ussd/${this.operateur}`)
      .set("Authorization", `Bearer ${jeton}`)
      .send(corps);
    if (this.operateur === "mtn") {
      const texte = String(r.text);
      return {
        texte: texte.replace(/^(CON|END) /, ""),
        fin: texte.startsWith("END"),
        statut: r.status,
      };
    }
    const j = r.body as { message?: string; action?: string };
    return { texte: j.message ?? "", fin: j.action === "end", statut: r.status };
  }

  /** Compose le code. */
  async composer(): Promise<EcranRecu> {
    this.cumul = [];
    this.ouverte = true;
    return this.operateur === "mtn"
      ? this.envoyer({
          sessionId: this.sessionId,
          msisdn: this.msisdn,
          serviceCode: "*123#",
          text: "",
        })
      : this.envoyer({
          session_id: this.sessionId,
          msisdn: this.msisdn,
          request_type: "begin",
        });
  }

  /** Tape une réponse. */
  async repondre(saisie: string): Promise<EcranRecu> {
    if (!this.ouverte) throw new Error("composer() d'abord");
    this.cumul.push(saisie);
    return this.operateur === "mtn"
      ? this.envoyer({
          sessionId: this.sessionId,
          msisdn: this.msisdn,
          serviceCode: "*123#",
          text: this.cumul.join("*"),
        })
      : this.envoyer({
          session_id: this.sessionId,
          msisdn: this.msisdn,
          request_type: "continue",
          input: saisie,
        });
  }

  /** Raccroche sans rien taper (l'opérateur ne le signale pas toujours). */
  async quitter(): Promise<EcranRecu | null> {
    if (this.operateur !== "orange") return null;
    return this.envoyer({ session_id: this.sessionId, msisdn: this.msisdn, request_type: "end" });
  }
}

export const telephone = (t: AppUssdTest, operateur: OperateurUssd, msisdn: string): Telephone =>
  new Telephone(t, operateur, msisdn);
