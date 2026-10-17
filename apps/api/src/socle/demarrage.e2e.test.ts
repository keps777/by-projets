import "reflect-metadata";
import type { Type } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnvoiCodeSmsPasserelle } from "../auth-voyageur/adaptateurs";
import { VerificationAuthVoyageur } from "../auth-voyageur/auth-voyageur.module";
import {
  CONFIG_AUTH_VOYAGEUR,
  chargerConfigAuthVoyageur,
  type ConfigAuthVoyageur,
} from "../auth-voyageur/config";
import { EnvoiCodeSms } from "../auth-voyageur/ports";
import { Billets, ConversionDevises, Promotions } from "../billetterie/ports";
import { VerificationStockageBilletterie } from "../billetterie/billetterie.module";
import { ReferentielColis } from "../colis/ports";
import {
  CONFIG_COVOITURAGE,
  chargerConfigCovoiturage,
  type ConfigCovoiturage,
} from "../covoiturage/config";
import { VerificationStockageCovoiturage } from "../covoiturage/covoiturage.module";
import { VerificationStockageGps } from "../gps/gps.module";
import { VerificationPortsLivraison } from "../livraison/livraison.module";
import { ConversionDevisesPaiements } from "../paiements/adaptateurs";
import {
  CONFIG_PAIEMENTS,
  chargerConfigPaiements,
  type ConfigPaiements,
} from "../paiements/config";
import { VerificationStockagePaiements } from "../paiements/paiements.module";
import { CONFIG_RAPPORT, chargerConfigRapport, type ConfigRapport } from "../rapport/config";
import { VerificationRapport } from "../rapport/rapport.module";
import { SourceRapportSoirPourWhatsApp } from "../rapport/source-whatsapp";
import { VerificationPortsRelais } from "../relais/relais.module";
import { FileEnvoiSms } from "../sms/file";
import type { FileEnvoiMemoire } from "../sms/file-memoire";
import type { FournisseurSimule } from "../sms/fournisseur-simule";
import { RegistreFournisseurs } from "../sms/registre";
import { CONFIG_SMS, chargerConfigSms, type ConfigSms } from "../sms/config";
import { VerificationSms } from "../sms/sms.module";
import { CONFIG_USSD, chargerConfigUssd, type ConfigUssd } from "../ussd/config";
import { VerificationUssd } from "../ussd/ussd.module";
import { GestionnaireEntrantsAchat } from "../whatsapp-achat/gestionnaire";
import {
  CONFIG_ACHAT_WHATSAPP,
  chargerConfigAchatWhatsApp,
  type ConfigAchatWhatsApp,
} from "../whatsapp-achat/config";
import { VerificationAchatWhatsApp } from "../whatsapp-achat/whatsapp-achat.module";
import { AchatsWhatsApp, ConversationsAchat, JournalAchatWhatsApp } from "../whatsapp-achat/ports";
import { JournalWhatsApp } from "../whatsapp/journal";
import { AchatsUssd, JournalUssd, SessionsUssd } from "../ussd/ports";
import { ControlesEnRoute, RapportsSoir } from "../rapport/ports";
import { NotificationsTraitees, Paiements, Remboursements } from "../paiements/ports";
import { FichesVoyageur, StockageConnexion } from "../auth-voyageur/ports";
import { AnnuaireRapportPersonnes, SecoursSmsPasserelle } from "../whatsapp/adaptateurs";
import { CONFIG_WHATSAPP, chargerConfigWhatsApp, type ConfigWhatsApp } from "../whatsapp/config";
import {
  AnnuaireRapport,
  GestionnaireEntrants,
  SecoursSms,
  SourceRapportSoir,
} from "../whatsapp/ports";
import { VerificationWhatsApp } from "../whatsapp/whatsapp.module";
import { AuditRepository } from "./audit/audit.repository";
import { AppModule } from "./app.module";
import { DefisRepository } from "./auth/defis.repository";
import { PersonnesRepository } from "./comptes/personnes.repository";
import { CONFIG } from "./config/config";
import { PrismaService } from "./db/prisma.service";
import { EvenementsRepository } from "./evenements/evenements.service";
import { configTest, creerAppTest, type AppTest } from "./testing/app-test";
import { listerRoutes } from "./testing/routes";
import { AuditMemoire, DefisMemoire, EvenementsMemoire, PersonnesMemoire } from "./testing/memoire";

/**
 * Démarrage complet de l'application : tous les modules métier montés ensemble sur leurs adaptateurs en
 * mémoire (développement et tests), puis, en production, le refus de démarrer tant qu'un port est en
 * mémoire. C'est le test qui attrape un double montage, une route déclarée deux fois ou un fournisseur
 * manquant entre deux modules.
 */

describe("démarrage complet d'AppModule (adaptateurs en mémoire)", () => {
  let t: AppTest;
  beforeAll(async () => {
    t = await creerAppTest();
  });
  afterAll(() => t.fermer());

  const resoudre = <T>(jeton: Type<T> | (abstract new (...args: never[]) => T)): T =>
    t.app.get(jeton, { strict: false });

  it("l'application démarre et répond à /health", async () => {
    const r = await t.http().get("/health");
    expect(r.status).toBe(200);
  });

  it("aucune route n'est déclarée deux fois (méthode et chemin)", () => {
    const vues = new Map<string, string>();
    const doublons: string[] = [];
    for (const r of listerRoutes(t.app).filter((x) => !x.chemin.startsWith("/sondes"))) {
      // `:id` et `:billetId` désignent la même route pour Express : on compare la forme du chemin.
      const cle = `${r.methode} ${r.chemin.replace(/:[A-Za-z]+/g, ":p")}`;
      const deja = vues.get(cle);
      if (deja) doublons.push(`${cle} (${deja} et ${r.controleur})`);
      vues.set(cle, r.controleur);
    }
    expect(doublons).toEqual([]);
  });

  it("chaque module livré est monté : ses routes existent", () => {
    const routes = listerRoutes(t.app).map((r) => `${r.methode} ${r.chemin}`);
    const attendues = [
      "POST /gps/bus/:departId/positions", // gps
      "POST /paiements/webhooks/:fournisseur", // paiements
      "POST /whatsapp/webhooks", // whatsapp
      "GET /patron/rapports/soir", // rapport
      "POST /voyageur/connexion/code", // auth-voyageur
      "POST /ussd/:operateur", // ussd
      "GET /voyageur/covoit", // covoiturage
      "GET /relais/moi", // relais
      "GET /livreurs/moi", // livraison
    ];
    for (const route of attendues) expect(routes, route).toContain(route);
  });

  it("la connexion du voyageur n'existe qu'une fois : les routes /auth/voyageur/* sont retirées", async () => {
    const routes = listerRoutes(t.app).map((r) => `${r.methode} ${r.chemin}`);
    expect(routes.filter((r) => r.includes("/auth/voyageur"))).toEqual([]);
    const r = await t.http().post("/auth/voyageur/code").send({ telephone: "+237691221008" });
    expect(r.status).toBe(404);
  });

  it("une seule instance du module d'achat par WhatsApp : celui que la passerelle appelle", () => {
    expect(resoudre(GestionnaireEntrants)).toBe(resoudre(GestionnaireEntrantsAchat));
  });

  it("la passerelle WhatsApp lit le rapport du soir, l'annuaire des comptes et le repli SMS", () => {
    expect(resoudre(SourceRapportSoir)).toBeInstanceOf(SourceRapportSoirPourWhatsApp);
    expect(resoudre(SourceRapportSoir).reel).toBe(true);
    expect(resoudre(AnnuaireRapport)).toBeInstanceOf(AnnuaireRapportPersonnes);
    expect(resoudre(SecoursSms)).toBeInstanceOf(SecoursSmsPasserelle);
    expect(resoudre(SecoursSms).branche).toBe(true);
  });

  it("le taux de change de la billetterie vient de l'agrégateur de paiement", () => {
    expect(resoudre(ConversionDevises)).toBeInstanceOf(ConversionDevisesPaiements);
  });

  it("les canaux USSD et WhatsApp ont leur code « sans frais » (promotions en mémoire)", async () => {
    const promotions = resoudre(Promotions);
    expect(await promotions.trouver("USSD")).toMatchObject({ type: "frais_offerts" });
    expect(await promotions.trouver("WHATSAPP")).toMatchObject({ type: "frais_offerts" });
  });

  it("le référentiel des colis interroge les points relais", async () => {
    // Un relais inconnu : ni les relais ni le référentiel ne le connaissent.
    expect(await resoudre(ReferentielColis).relais("00000000-0000-4000-8000-0000000000ff")).toBe(
      null,
    );
  });

  it("le code de connexion du voyageur part par la passerelle SMS, au format WebOTP", async () => {
    expect(resoudre(EnvoiCodeSms)).toBeInstanceOf(EnvoiCodeSmsPasserelle);
    const r = await t.http().post("/voyageur/connexion/code").send({ telephone: "+237691221008" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await (resoudre(FileEnvoiSms) as FileEnvoiMemoire).traiterPrets();
    const principal = resoudre(RegistreFournisseurs).principal as FournisseurSimule;
    const envoye = principal.envoyes.at(-1)!;
    expect(envoye.destinataire).toBe("+237691221008");
    const lignes = envoye.texte.split("\n");
    expect(lignes).toHaveLength(3);
    expect(lignes.at(-1)).toMatch(/^@afrimove\.app #\d{4}$/);
  });

  it("les modules sans table restent en mémoire : le journal d'inventaire les nomme", () => {
    // Le garde-fou de chaque module est vérifié plus bas ; ici, simple contrôle que la billetterie
    // utilise bien la mémoire hors production (API_STOCKAGE absent).
    expect((resoudre(Billets) as { durable?: boolean }).durable).toBe(false);
  });
});

describe("production : l'application refuse de démarrer avec un port en mémoire", () => {
  let module: TestingModule;

  /** La configuration de chaque module telle qu'en développement, mais déclarée « production ». */
  const enProduction = <T extends { production: boolean }>(config: T): T => ({
    ...config,
    production: true,
  });

  beforeAll(async () => {
    const dev = configTest();
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({ ...dev, env: "production" })
      .overrideProvider(CONFIG_SMS)
      .useValue(enProduction<ConfigSms>(chargerConfigSms({})))
      .overrideProvider(CONFIG_WHATSAPP)
      .useValue(enProduction<ConfigWhatsApp>(chargerConfigWhatsApp({})))
      .overrideProvider(CONFIG_ACHAT_WHATSAPP)
      .useValue(enProduction<ConfigAchatWhatsApp>(chargerConfigAchatWhatsApp({})))
      .overrideProvider(CONFIG_PAIEMENTS)
      .useValue(enProduction<ConfigPaiements>(chargerConfigPaiements({})))
      .overrideProvider(CONFIG_USSD)
      .useValue(enProduction<ConfigUssd>(chargerConfigUssd({})))
      .overrideProvider(CONFIG_AUTH_VOYAGEUR)
      .useValue(enProduction<ConfigAuthVoyageur>(chargerConfigAuthVoyageur({})))
      .overrideProvider(CONFIG_COVOITURAGE)
      .useValue(enProduction<ConfigCovoiturage>(chargerConfigCovoiturage({})))
      .overrideProvider(CONFIG_RAPPORT)
      .useValue(enProduction<ConfigRapport>(chargerConfigRapport({})))
      .overrideProvider(PersonnesRepository)
      .useValue(new PersonnesMemoire())
      .overrideProvider(DefisRepository)
      .useValue(new DefisMemoire())
      .overrideProvider(AuditRepository)
      .useValue(new AuditMemoire())
      .overrideProvider(EvenementsRepository)
      .useValue(new EvenementsMemoire())
      .overrideProvider(PrismaService)
      .useValue({ estJoignable: async () => true, $disconnect: async () => undefined })
      .compile();
  });
  afterAll(async () => {
    // Le module n'a jamais été initialisé (les gardes l'en empêchent) : close() peut le rejouer.
    await module?.close().catch(() => undefined);
  });

  const gardes: ReadonlyArray<readonly [string, Type<{ onModuleInit?(): void }>, RegExp]> = [
    ["billetterie", VerificationStockageBilletterie, /BilletterieModule.*en mémoire/],
    ["sms", VerificationSms, /SmsModule.*en mémoire/],
    ["gps", VerificationStockageGps, /GpsModule.*en mémoire/],
    ["whatsapp", VerificationWhatsApp, /WhatsAppModule.*(mémoire|simulé)/],
    ["covoiturage", VerificationStockageCovoiturage, /CovoiturageModule.*(mémoire|simulés)/],
    ["relais", VerificationPortsRelais, /RelaisModule.*(mémoire|simulés)/],
    ["livraison", VerificationPortsLivraison, /LivraisonModule.*en mémoire/],
  ];

  it.each(gardes)(
    "%s : le garde-fou refuse la production et nomme ce qui manque",
    (_nom, garde, motif) => {
      const instance = module.get(garde, { strict: false });
      expect(() => instance.onModuleInit?.()).toThrowError(motif);
    },
  );

  // Les modules dont tous les ports de stockage sont sur PostgreSQL (lot A) : en production, `API_STOCKAGE`
  // les y met tout seul, et leur garde-fou ne trouve plus rien en mémoire.
  const gardesSurPostgres: ReadonlyArray<readonly [string, Type<{ onModuleInit?(): void }>]> = [
    ["paiements", VerificationStockagePaiements],
    ["rapport", VerificationRapport],
    ["auth-voyageur", VerificationAuthVoyageur],
    ["ussd", VerificationUssd],
  ];

  it.each(gardesSurPostgres)(
    "%s : en production, le stockage est sur PostgreSQL et le garde-fou ne refuse plus",
    (_nom, garde) => {
      const instance = module.get(garde, { strict: false });
      expect(() => instance.onModuleInit?.()).not.toThrow();
    },
  );

  it("les ports de stockage de ces modules sont ceux de PostgreSQL en production", () => {
    const ports = [
      Paiements,
      Remboursements,
      NotificationsTraitees,
      RapportsSoir,
      ControlesEnRoute,
      StockageConnexion,
      FichesVoyageur,
      SessionsUssd,
      JournalUssd,
      AchatsUssd,
      ConversationsAchat,
      JournalAchatWhatsApp,
      AchatsWhatsApp,
      JournalWhatsApp,
    ] as const;
    for (const port of ports) {
      const adaptateur = module.get(port, { strict: false }) as { durable: boolean };
      expect(adaptateur.durable, port.name).toBe(true);
    }
  });

  it("l'achat par WhatsApp ne refuse plus la production pour son stockage : il lui reste l'envoi et la passerelle", () => {
    const garde = module.get(VerificationAchatWhatsApp, { strict: false });
    // Conversations, journal et achats sont durables ; ce qui peut encore bloquer n'est plus le stockage.
    try {
      garde.onApplicationBootstrap();
    } catch (e) {
      expect(String(e)).not.toMatch(
        /conversations sont en mémoire|journal est en mémoire|achats sont en mémoire/,
      );
    }
  });

  it("l'application entière refuse de démarrer (init rejetée)", async () => {
    await expect(module.init()).rejects.toThrowError(/en mémoire|simulé/);
  });
});
