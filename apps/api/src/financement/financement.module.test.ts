import { describe, expect, it } from "vitest";
import { configTest } from "../socle/testing/app-test";
import { VerificationPortsFinancement } from "./financement.module";
import {
  ConventionsMemoire,
  DonneesAgenceMemoire,
  DossiersMemoire,
  LotsPaieMemoire,
  OffresCreditMemoire,
  PartenaireSimule,
  PrelevementsMemoire,
  ReglagesMemoire,
  SalairesMemoire,
  VersementsPaieMemoire,
} from "./memoire";

describe("garde-fous du montage", () => {
  const enProduction = () =>
    configTest({
      NODE_ENV: "production",
      JWT_SECRET: "x".repeat(48),
      AUTH_PEPPER: "y".repeat(48),
      AUDIT_HMAC_KEY: "z".repeat(48),
      DATABASE_URL: "postgresql://prod:prod@db.interne:5432/afrimove",
    });

  const verification = (config = configTest()) =>
    new VerificationPortsFinancement(
      config,
      new DossiersMemoire(),
      new PrelevementsMemoire(),
      new LotsPaieMemoire(),
      new SalairesMemoire(),
      new VersementsPaieMemoire(),
      new PartenaireSimule(),
      new DonneesAgenceMemoire(),
      new ConventionsMemoire(),
      new OffresCreditMemoire(),
      new ReglagesMemoire(),
    );

  it("refuse de démarrer en production et nomme les ports en mémoire", () => {
    expect(() => verification(enProduction()).onModuleInit()).toThrow(
      /FinancementModule.*DossiersFinancement, Prelevements, LotsPaie, SalairesAgence, VersementsPaie, PartenaireFinancier, DonneesAgence, ConventionsFinancement, OffresCredit, ReglagesFinancement/,
    );
  });

  it("ne nomme que les ports encore en mémoire", () => {
    const v = verification(enProduction());
    // Un adaptateur durable : le port disparaît de la liste.
    Object.assign((v as unknown as { dossiers: object }).dossiers, { durable: true });
    expect(() => v.onModuleInit()).toThrow(/Prelevements/);
    expect(() => v.onModuleInit()).not.toThrow(/DossiersFinancement/);
  });

  it("démarre en production quand tous les ports sont durables", () => {
    const v = verification(enProduction());
    for (const port of Object.values(v)) {
      if (typeof port === "object" && port !== null && "durable" in port) {
        Object.assign(port, { durable: true });
      }
    }
    expect(() => v.onModuleInit()).not.toThrow();
  });

  it("démarre en mémoire hors production", () => {
    expect(() => verification().onModuleInit()).not.toThrow();
  });
});
