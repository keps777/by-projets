import { describe, expect, it } from "vitest";
import { configTest } from "../socle/testing/app-test";
import { moduleDuCatalogue } from "./catalogue";
import { ModuleRequis } from "./garde-module";
import { AnnuaireMemoire, ReglagesMemoire } from "./memoire";
import { VerificationStockageModules } from "./modules.module";
import { ModulesService } from "./modules.service";

describe("garde-fous du montage", () => {
  const enProduction = () =>
    configTest({
      NODE_ENV: "production",
      JWT_SECRET: "x".repeat(48),
      AUTH_PEPPER: "y".repeat(48),
      AUDIT_HMAC_KEY: "z".repeat(48),
      DATABASE_URL: "postgresql://prod:prod@db.interne:5432/afrimove",
    });

  it("refuse de démarrer en production tant que les réglages sont en mémoire", () => {
    const verification = new VerificationStockageModules(
      enProduction(),
      new ReglagesMemoire(),
      new AnnuaireMemoire(),
    );
    expect(() => verification.onModuleInit()).toThrow(/ReglagesModules, AnnuaireAgences/);
  });

  it("démarre en production quand les ports sont durables", () => {
    const durable = { durable: true };
    const verification = new VerificationStockageModules(
      enProduction(),
      Object.assign(new ReglagesMemoire(), durable),
      Object.assign(new AnnuaireMemoire(), durable),
    );
    expect(() => verification.onModuleInit()).not.toThrow();
  });

  it("démarre en mémoire hors production", () => {
    const verification = new VerificationStockageModules(
      configTest(),
      new ReglagesMemoire(),
      new AnnuaireMemoire(),
    );
    expect(() => verification.onModuleInit()).not.toThrow();
  });
});

describe("usage par les autres modules de l'API", () => {
  it("@ModuleRequis refuse un module qui n'existe pas dès la déclaration de la route", () => {
    expect(() => ModuleRequis("colis_typo")).toThrow(/module inconnu/);
    expect(() => ModuleRequis("colis")).not.toThrow();
    expect(moduleDuCatalogue("colis")).toBeDefined();
  });

  it("estActif refuse un code inconnu plutôt que de laisser passer une faute de frappe", async () => {
    const reglages = new ReglagesMemoire();
    const service = new ModulesService(
      reglages,
      new AnnuaireMemoire(),
      // Les autres dépendances ne servent pas à estActif.
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    await expect(service.estActif("a1", "colis_typo")).rejects.toThrow(/Module inconnu/);
    expect(await service.estActif("a1", "colis")).toBe(true);
    await reglages.definirAgence("a1", "colis", false);
    expect(await service.estActif("a1", "colis")).toBe(false);
  });
});
