import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { CommandesService } from "../../billetterie/commandes.service";
import type { Bus, Compagnie, Depart, Gare, Ligne } from "../../billetterie/modeles";
import {
  BilletsMemoire,
  CatalogueMemoire,
  CommandesMemoire,
  PromotionsMemoire,
} from "../../billetterie/memoire";
import { OPTIONS_BILLETTERIE } from "../../billetterie/passerelle";
import { Billets, Catalogue, Commandes, Inventaire, Promotions } from "../../billetterie/ports";
import { departType, heure } from "../../billetterie/testing/app-billetterie-test";
import { versIsoDouala } from "../../billetterie/temps";
import { AgregateurPaiement } from "../../paiements/agregateur";
import type { AgregateurSimule } from "../../paiements/agregateur-simule";
import { CONFIG_PAIEMENTS, chargerConfigPaiements } from "../../paiements/config";
import { ComptesReversementMemoire, PaiementsMemoire } from "../../paiements/memoire";
import { ModeDegradeService } from "../../paiements/mode-degrade.service";
import { ComptesReversement, Paiements } from "../../paiements/ports";
import { CONFIG_SMS, chargerConfigSms } from "../../sms/config";
import { AppModule } from "../../socle/app.module";
import { AuditRepository } from "../../socle/audit/audit.repository";
import { DefisRepository } from "../../socle/auth/defis.repository";
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
import { CONFIG_WHATSAPP, chargerConfigWhatsApp } from "../../whatsapp/config";
import type { FileEnvoiMemoire } from "../../whatsapp/file-memoire";
import { FileEnvoiWhatsApp } from "../../whatsapp/file";
import { FournisseurWhatsApp } from "../../whatsapp/fournisseur";
import type { FournisseurWhatsAppSimule } from "../../whatsapp/fournisseur-simule";
import { JournalWhatsApp } from "../../whatsapp/journal";
import { PasserelleWhatsAppService } from "../../whatsapp/passerelle.service";
import { GestionnaireEntrants } from "../../whatsapp/ports";
import { CONFIG_ACHAT_WHATSAPP, chargerConfigAchatWhatsApp } from "../config";
import { ConversationAchatService } from "../conversation.service";
import { GESTIONNAIRE_SUIVANT } from "../gestionnaire";
import {
  AchatsMemoire,
  ConversationsMemoire,
  EquipeMemoire,
  JournalAchatMemoire,
  TranscriptionMemoire,
} from "../memoire";
import {
  AchatsWhatsApp,
  ConversationsAchat,
  JournalAchatWhatsApp,
  ReconnaissanceEquipe,
  TranscriptionVocale,
} from "../ports";
import { SuiviAchatsWhatsAppService } from "../suivi-achats.service";

/* ------------------------------------------------------------------ le réseau de la planche */

/**
 * Trois compagnies sur Douala–Yaoundé, aux départs de la planche : Bêta (VIP, 7 500 F), Alpha
 * (4 000 F), Oméga (3 800 F). L'horloge démarre le lundi 2 novembre à 07:00 à Douala : « demain »
 * est le mardi 3, avec les départs 08:00, 08:30 et 09:30 de la conversation de la planche, un
 * départ d'après-midi et un de nuit pour les filtres.
 */
export const BETA = "00000000-0000-4000-8000-0000000000b1";
export const ALPHA = "00000000-0000-4000-8000-0000000000a1";
export const OMEGA = "00000000-0000-4000-8000-0000000000e1";
export const DEPART_BETA = "00000000-0000-4000-8000-00000000d101";
export const DEPART_ALPHA = "00000000-0000-4000-8000-00000000d102";
export const DEPART_OMEGA = "00000000-0000-4000-8000-00000000d103";
export const DEPART_ALPHA_APRES_MIDI = "00000000-0000-4000-8000-00000000d104";
export const DEPART_BETA_NUIT = "00000000-0000-4000-8000-00000000d105";
/** Aujourd'hui (lundi), Oméga, 11:00. */
export const DEPART_AUJOURDHUI = "00000000-0000-4000-8000-00000000d106";
/** Après-demain (mercredi), Alpha, 08:30. */
export const DEPART_APRES_DEMAIN = "00000000-0000-4000-8000-00000000d107";
/** Alpha : Douala > Bafoussam, demain 10:00. */
export const DEPART_BAFOUSSAM = "00000000-0000-4000-8000-00000000d108";
const LIGNE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002f9";
const GARE_BAFOUSSAM = "00000000-0000-4000-8000-0000000002b1";

export const JOUR = "2026-11-02";
export const DEMAIN = "2026-11-03";
export const APRES_DEMAIN = "2026-11-04";
const DEBUT = new Date("2026-11-02T06:00:00.000Z");

/** Aïcha, la voyageuse de la planche : un numéro Orange. */
export const TEL_AICHA = "+237691221008";
/** Un numéro MTN. */
export const TEL_MTN = "+237677012345";
/** Un numéro hors du Cameroun : pas de MoMo camerounais. */
export const TEL_ETRANGER = "+22997001122";

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
        { id: `arret-yde-${n}`, nom: "Yaoundé", ordre: 1, kmDepuisOrigine: 250, montee: false },
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

export interface OptionsAppAchatTest {
  /** Variables `WHATSAPP_ACHAT_*` en plus de celles du test. */
  env?: Record<string, string>;
  /** Variables `PAIEMENTS_*` en plus de celles du test. */
  envPaiements?: Record<string, string>;
  /** Pas de transcription vocale branchée (le défaut du module). */
  sansTranscription?: boolean;
  /** Le code « sans frais » n'existe pas dans les promotions. */
  sansPromotion?: boolean;
  /** Pas de compte de reversement pour Alpha. */
  alphaSansCompte?: boolean;
  /** Un assistant reçoit les messages qui ne concernent pas l'achat. */
  avecAssistant?: boolean;
}

/** Un assistant de test : note ce qu'on lui passe. */
export class AssistantMemoire extends GestionnaireEntrants {
  readonly recus: { de: string; texte: string | null }[] = [];
  async traiter(entrant: { de: string; texte: string | null }): Promise<void> {
    this.recus.push({ de: entrant.de, texte: entrant.texte });
  }
}

/**
 * L'API complète (gardes, rôles, audit) avec la vraie billetterie, les vrais paiements (agrégateur
 * simulé), la vraie passerelle WhatsApp (fournisseur simulé, webhook signé) et
 * `WhatsAppAchatModule`, sur les adaptateurs en mémoire. Le montage est celui de `AppModule` : le module
 * d'achat fournit le `GestionnaireEntrants` de la passerelle.
 */
export async function creerAppAchatTest(options: OptionsAppAchatTest = {}) {
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
  const configAchat = chargerConfigAchatWhatsApp({
    WHATSAPP_ACHAT_BALAYAGE_MS: "0",
    ...options.env,
  });
  const transcription = new TranscriptionMemoire();
  const equipe = new EquipeMemoire();
  const assistant = new AssistantMemoire();

  // L'assistant du rapport (`GESTIONNAIRE_SUIVANT`) est facultatif et absent de `AppModule` : un module
  // global le fournit à l'achat quand le test le demande.
  @Global()
  @Module({
    providers: options.avecAssistant
      ? [{ provide: GESTIONNAIRE_SUIVANT, useValue: assistant }]
      : [],
    exports: options.avecAssistant ? [GESTIONNAIRE_SUIVANT] : [],
  })
  class AssistantDeTest {}

  // `AppModule` monte déjà l'achat et la passerelle WhatsApp ; ce montage remplace leurs ports.
  let builder = Test.createTestingModule({ imports: [AppModule, AssistantDeTest] })
    .overrideProvider(ReconnaissanceEquipe)
    .useValue(equipe);
  if (!options.sansTranscription) {
    builder = builder.overrideProvider(TranscriptionVocale).useValue(transcription);
  }
  const module = await builder
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(CONFIG_PAIEMENTS)
    .useValue(configPaiements)
    .overrideProvider(CONFIG_ACHAT_WHATSAPP)
    .useValue(configAchat)
    .overrideProvider(CONFIG_SMS)
    .useValue(chargerConfigSms({ SMS_SONDAGE_MS: "0" }))
    .overrideProvider(CONFIG_WHATSAPP)
    .useValue(chargerConfigWhatsApp({ WHATSAPP_SONDAGE_MS: "0", WHATSAPP_PLANIFICATEUR_MS: "0" }))
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
    code: "BAF",
    nom: "Gare routière",
    ville: "Bafoussam",
  });
  catalogue.ajouterLigne({
    ...alpha.ligne,
    id: LIGNE_BAFOUSSAM,
    code: "DLABAF",
    origineGareId: alpha.gares[0].id,
    destinationGareId: GARE_BAFOUSSAM,
    tarifs: { classique: 3500, vip: 5000, bagage: 500 },
    arrets: [
      { id: "arret-dla-b", nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
      { id: "arret-baf", nom: "Bafoussam", ordre: 1, kmDepuisOrigine: 250, montee: false },
    ],
  });
  const parBus = (r: Reseau) => ({ ligneId: r.ligne.id, busId: r.bus.id });
  const ajouter = (id: string, surcharge: Partial<Depart>) =>
    catalogue.ajouterDepart(departType(id, surcharge));
  ajouter(DEPART_BETA, { ...parBus(beta), classe: "vip", heureDepart: heure("08:00", DEMAIN) });
  ajouter(DEPART_ALPHA, { ...parBus(alpha), heureDepart: heure("08:30", DEMAIN) });
  ajouter(DEPART_OMEGA, { ...parBus(omega), heureDepart: heure("09:30", DEMAIN) });
  ajouter(DEPART_ALPHA_APRES_MIDI, { ...parBus(alpha), heureDepart: heure("15:00", DEMAIN) });
  ajouter(DEPART_BETA_NUIT, { ...parBus(beta), heureDepart: heure("22:00", DEMAIN) });
  ajouter(DEPART_AUJOURDHUI, { ...parBus(omega), heureDepart: heure("11:00", JOUR) });
  ajouter(DEPART_APRES_DEMAIN, { ...parBus(alpha), heureDepart: heure("08:30", APRES_DEMAIN) });
  ajouter(DEPART_BAFOUSSAM, {
    ligneId: LIGNE_BAFOUSSAM,
    busId: alpha.bus.id,
    heureDepart: heure("10:00", DEMAIN),
  });

  const promotions = app.get(Promotions) as PromotionsMemoire;
  // Le code existe par défaut en mémoire (comme pour l'application) ; `sansPromotion` le retire.
  if (options.sansPromotion) promotions.retirer("WHATSAPP");
  else promotions.ajouter({ code: "WHATSAPP", type: "frais_offerts" });
  const comptesReversement = app.get(ComptesReversement) as ComptesReversementMemoire;
  await comptesReversement.definir(BETA, "compte-beta");
  if (!options.alphaSansCompte) await comptesReversement.definir(ALPHA, "compte-alpha");
  await comptesReversement.definir(OMEGA, "compte-omega");

  const agregateur = app.get(AgregateurPaiement) as AgregateurSimule;
  const fournisseur = app.get(FournisseurWhatsApp) as FournisseurWhatsAppSimule;
  const file = app.get(FileEnvoiWhatsApp) as FileEnvoiMemoire;
  const comptesService = app.get(ComptesService);

  let compteurMessage = 0;
  const t = {
    app,
    http: () => request(app.getHttpServer()),
    horloge,
    config: configAchat,
    agregateur,
    fournisseur,
    file,
    catalogue,
    transcription,
    equipe,
    assistant,
    conversations: app.get(ConversationsAchat) as ConversationsMemoire,
    journal: app.get(JournalAchatWhatsApp) as JournalAchatMemoire,
    achats: app.get(AchatsWhatsApp) as AchatsMemoire,
    conversation: app.get(ConversationAchatService),
    suivi: app.get(SuiviAchatsWhatsAppService),
    billets: app.get(Billets) as BilletsMemoire,
    commandes: app.get(Commandes) as CommandesMemoire,
    paiements: app.get(Paiements) as PaiementsMemoire,
    passerelle: app.get(PasserelleWhatsAppService),
    journalWhatsApp: app.get(JournalWhatsApp),
    comptesService,
    modeDegrade: app.get(ModeDegradeService),
    commandesService: app.get(CommandesService),
    inventaire: app.get(Inventaire),
    maintenant: () => versIsoDouala(horloge.maintenant()),
    fermer: () => app.close(),

    /** Envoie les messages en file à WhatsApp (le simulateur les note dans `fournisseur.envoyes`). */
    async vider() {
      for (let i = 0; i < 20; i++) if ((await file.traiterPrets()) === 0) return;
    },

    /** Crée le compte de ce numéro (sinon le premier message le crée, sans nom). */
    async creerCompte(nom: string, telephone: string) {
      return comptesService.creer({ nom, telephone, roles: ["voyageur"] });
    },

    /** Occupe des sièges d'un départ (des voyageurs qui ont déjà réservé). */
    async occuper(departId: string, sieges: number[]) {
      for (const siege of sieges) {
        const r = await t.inventaire.bloquer({
          departId,
          siege,
          par: "autre-voyageur",
          commandeId: null,
          jusqua: versIsoDouala(new Date(horloge.maintenant().getTime() + 3 * 3_600_000)),
          maintenant: versIsoDouala(horloge.maintenant()),
        });
        if (!r.ok) throw new Error(`siège ${siege} déjà pris`);
      }
    },

    /** La dernière commande retenue par WhatsApp. */
    async derniereCommande() {
      const achats = await t.achats.enEtat(
        ["reservee", "paiement_demande", "terminee", "abandonnee", "echouee"],
        1000,
      );
      const dernier = achats.at(-1);
      if (!dernier) throw new Error("aucun achat WhatsApp");
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

    /** Le voyageur refuse sur son téléphone (ou le délai passe) : l'agrégateur annonce l'échec. */
    async refuserPaiement(commandeId: string) {
      const [paiement] = await t.paiements.duCommande(commandeId);
      if (!paiement) throw new Error("aucun paiement pour cette commande");
      const transaction = agregateur.terminer(paiement.id, "echoue", { code: "refuse" });
      const n = agregateur.fabriquerNotification([
        {
          id: `evt-${transaction.idFournisseur}-echoue`,
          transaction: transaction.idFournisseur,
          reference: paiement.id,
          etat: "echoue",
          code: "refuse",
        },
      ]);
      const r = await request(app.getHttpServer())
        .post("/paiements/webhooks/simule")
        .set(n.entetes as Record<string, string>)
        .send(n.corpsBrut ?? "");
      if (r.status !== 200) throw new Error(`webhook refusé : ${r.status}`);
    },

    /** AfriMove coupe ou rétablit le paiement en ligne. */
    async degrader(actif: boolean) {
      await t.modeDegrade.definir(
        { id: "afrimove-test", role: "afrimove", compagnieId: null, gareId: null },
        actif,
        actif ? "test" : null,
      );
    },

    /** Poste un appel signé de WhatsApp avec ce message reçu. */
    async recevoir(message: {
      de: string;
      texte?: string | null;
      type?: string;
      idFournisseur?: string;
    }) {
      compteurMessage += 1;
      const webhook = fournisseur.fabriquerWebhook({
        messages: [
          {
            idFournisseur: message.idFournisseur ?? `wamid.test-${compteurMessage}`,
            de: message.de.replace("+", ""),
            texte: message.texte ?? null,
            type: message.type ?? "text",
            at: horloge.maintenant(),
          },
        ],
      });
      const r = await request(app.getHttpServer())
        .post("/whatsapp/webhooks")
        .set(webhook.entetes as Record<string, string>)
        .send(webhook.corpsBrut ?? "");
      if (r.status !== 200) throw new Error(`webhook WhatsApp refusé : ${r.status}`);
      await t.vider();
    },
  };
  return t;
}

export type AppAchatTest = Awaited<ReturnType<typeof creerAppAchatTest>>;

/* ------------------------------------------------------------------ un téléphone */

/**
 * Un voyageur sur WhatsApp : il écrit, et lit ce qu'AfriMove lui répond (les messages que le
 * fournisseur simulé a reçus pour son numéro).
 */
export class Telephone {
  constructor(
    private readonly t: AppAchatTest,
    readonly numero: string,
  ) {}

  /** Les messages reçus par ce numéro depuis le début. */
  recus(): string[] {
    return this.t.fournisseur.envoyes
      .filter((m) => m.destinataire === this.numero)
      .map((m) => m.texte);
  }

  /** Écrit un message ; rend ce qu'AfriMove a répondu (les nouveaux messages). */
  async ecrire(texte: string): Promise<string[]> {
    const avant = this.recus().length;
    await this.t.recevoir({ de: this.numero, texte });
    return this.recus().slice(avant);
  }

  /** Écrit un message et rend la réponse unique ; échoue s'il n'y en a pas exactement une. */
  async dire(texte: string): Promise<string> {
    const reponses = await this.ecrire(texte);
    if (reponses.length !== 1) {
      throw new Error(
        `une réponse attendue, ${reponses.length} reçues : ${JSON.stringify(reponses)}`,
      );
    }
    return reponses[0]!;
  }

  /** Envoie un message vocal (l'appel de la passerelle n'a pas de texte). */
  async parler(): Promise<string[]> {
    const avant = this.recus().length;
    await this.t.recevoir({ de: this.numero, texte: null, type: "audio" });
    return this.recus().slice(avant);
  }
}

export const telephone = (t: AppAchatTest, numero: string): Telephone => new Telephone(t, numero);
