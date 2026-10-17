import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../socle/app.module";
import { AuditRepository } from "../socle/audit/audit.repository";
import { DefisRepository } from "../socle/auth/defis.repository";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { CONFIG } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { EvenementsRepository } from "../socle/evenements/evenements.service";
import { configTest } from "../socle/testing/app-test";
import {
  AuditMemoire,
  DefisMemoire,
  EvenementsMemoire,
  PersonnesMemoire,
} from "../socle/testing/memoire";
import { chargerConfigRapport, ConfigRapportInvalide } from "./config";
import {
  ActiviteColisMemoire,
  AnnulationsMemoire,
  CaissesMemoire,
  ControlesMemoire,
  DepartsMemoire,
  RapportsSoirMemoire,
  ReferentielMemoire,
  TrousMemoire,
  VentesBilletsMemoire,
} from "./memoire";
import { VerificationRapport } from "./rapport.module";
import {
  CaissesDuJour,
  DepartsDuJour,
  ReferentielRapport,
  TrousNumerotation,
  type Durable,
} from "./ports";
import {
  CaissesDuJourSessions,
  DepartsDuJourBilletterie,
  TrousNumerotationControle,
} from "./ponts";
import { SourceRapportSoirPourWhatsApp } from "./source-whatsapp";

describe("configuration", () => {
  it("a des valeurs par défaut : 21:00, passage toutes les 30 s, 31 jours d'historique", () => {
    expect(chargerConfigRapport({})).toEqual({
      heure: "21:00",
      minutesDepart: 1260,
      planificateurMs: 30_000,
      joursHistorique: 31,
      production: false,
    });
  });

  it("désactive le planificateur dans les tests, sauf demande contraire", () => {
    expect(chargerConfigRapport({ NODE_ENV: "test" }).planificateurMs).toBe(0);
    expect(
      chargerConfigRapport({ NODE_ENV: "test", RAPPORT_PLANIFICATEUR_MS: "1000" }).planificateurMs,
    ).toBe(1000);
  });

  it("lit l'heure et l'historique de l'environnement", () => {
    const c = chargerConfigRapport({ RAPPORT_HEURE: "20:30", RAPPORT_JOURS_HISTORIQUE: "7" }, true);
    expect(c).toMatchObject({
      heure: "20:30",
      minutesDepart: 1230,
      joursHistorique: 7,
      production: true,
    });
  });

  it("signale toutes les erreurs d'un coup", () => {
    expect(() =>
      chargerConfigRapport({
        RAPPORT_HEURE: "9h",
        RAPPORT_PLANIFICATEUR_MS: "-1",
        RAPPORT_JOURS_HISTORIQUE: "0",
      }),
    ).toThrow(ConfigRapportInvalide);
    try {
      chargerConfigRapport({ RAPPORT_HEURE: "9h", RAPPORT_PLANIFICATEUR_MS: "x" });
    } catch (e) {
      expect((e as Error).message).toContain("RAPPORT_HEURE");
      expect((e as Error).message).toContain("RAPPORT_PLANIFICATEUR_MS");
    }
  });
});

describe("garde-fou de production", () => {
  const durable = (): Durable => ({ durable: true });
  const monter = (production: boolean, surcharge: Record<string, Durable> = {}) =>
    new VerificationRapport(
      chargerConfigRapport({}, production),
      (surcharge["ref"] ?? new ReferentielMemoire()) as ReferentielMemoire,
      (surcharge["ventes"] ?? new VentesBilletsMemoire()) as VentesBilletsMemoire,
      (surcharge["departs"] ?? new DepartsMemoire()) as DepartsMemoire,
      (surcharge["colis"] ?? new ActiviteColisMemoire()) as ActiviteColisMemoire,
      (surcharge["caisses"] ?? new CaissesMemoire()) as CaissesMemoire,
      (surcharge["annulations"] ?? new AnnulationsMemoire()) as AnnulationsMemoire,
      (surcharge["trous"] ?? new TrousMemoire()) as TrousMemoire,
      (surcharge["controles"] ?? new ControlesMemoire()) as ControlesMemoire,
      (surcharge["rapports"] ?? new RapportsSoirMemoire()) as RapportsSoirMemoire,
    );

  it("ne dit rien en développement et en test", () => {
    expect(() => monter(false).onModuleInit()).not.toThrow();
  });

  it("refuse de démarrer en production avec un port en mémoire, en les nommant tous", () => {
    expect(() => monter(true).onModuleInit()).toThrowError(
      /ReferentielRapport.*VentesBillets.*DepartsDuJour.*ActiviteColis.*CaissesDuJour.*AnnulationsDuJour.*TrousNumerotation.*ControlesEnRoute.*RapportsSoir/,
    );
  });

  it("démarre en production quand tous les ports sont durables", () => {
    const tous = Object.fromEntries(
      [
        "ref",
        "ventes",
        "departs",
        "colis",
        "caisses",
        "annulations",
        "trous",
        "controles",
        "rapports",
      ].map((k) => [k, durable()]),
    );
    expect(() => monter(true, tous).onModuleInit()).not.toThrow();
  });

  it("un seul port en mémoire suffit à refuser, et seul celui-là est nommé", () => {
    const tous = Object.fromEntries(
      ["ref", "ventes", "departs", "colis", "caisses", "annulations", "trous", "controles"].map(
        (k) => [k, durable()],
      ),
    );
    expect(() => monter(true, tous).onModuleInit()).toThrowError(/RapportsSoir sont en mémoire/);
  });
});

describe("assemblage Nest", () => {
  async function compiler(module: Parameters<typeof Test.createTestingModule>[0]["imports"]) {
    return Test.createTestingModule({ imports: module })
      .overrideProvider(CONFIG)
      .useValue(configTest())
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
  }

  it("démarre dans AppModule, branché sur la caisse, la billetterie et la numérotation", async () => {
    const m = await compiler([AppModule]);
    await m.init();
    expect(m.get(SourceRapportSoirPourWhatsApp).reel).toBe(true);
    expect(m.get(CaissesDuJour)).toBeInstanceOf(CaissesDuJourSessions);
    expect(m.get(DepartsDuJour)).toBeInstanceOf(DepartsDuJourBilletterie);
    expect(m.get(TrousNumerotation)).toBeInstanceOf(TrousNumerotationControle);
    // Les autres ports attendent leurs adaptateurs PostgreSQL : en mémoire, le garde-fou refuse la production.
    expect(m.get(ReferentielRapport)).toBeInstanceOf(ReferentielMemoire);
    await m.close();
  });

  it("laisse remplacer un adaptateur en gardant les ponts", async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(configTest())
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
      .overrideProvider(CaissesDuJour)
      .useValue(new CaissesMemoire())
      .compile();
    await m.init();
    expect(m.get(CaissesDuJour)).toBeInstanceOf(CaissesMemoire); // remplacé
    expect(m.get(DepartsDuJour)).toBeInstanceOf(DepartsDuJourBilletterie); // gardé
    await m.close();
  });
});
