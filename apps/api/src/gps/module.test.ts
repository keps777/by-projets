import { describe, expect, it } from "vitest";
import type { AppConfig } from "../socle/config/config";
import { VerificationStockageGps } from "./gps.module";
import {
  AlertesMemoire,
  AvisMemoire,
  BilletsMemoire,
  DiffusionMemoire,
  EtatsSuiviMemoire,
  MissionsMemoire,
  OffresMemoire,
  PositionsMemoire,
  PrevenirMemoire,
  ProchesMemoire,
  ReseauMemoire,
} from "./memoire";

const config = (env: AppConfig["env"]) => ({ env }) as AppConfig;

function garde(env: AppConfig["env"]) {
  return new VerificationStockageGps(
    config(env),
    new ReseauMemoire(),
    new BilletsMemoire(),
    new ProchesMemoire(),
    new MissionsMemoire(),
    new OffresMemoire(),
    new PositionsMemoire(),
    new EtatsSuiviMemoire(),
    new AlertesMemoire(),
    new PrevenirMemoire(),
    new AvisMemoire(),
    new DiffusionMemoire(),
  );
}

describe("garde-fou de production", () => {
  it("refuse de démarrer en production tant que des ports sont en mémoire, et les nomme", () => {
    expect(() => garde("production").onModuleInit()).toThrowError(
      /GpsModule : ReseauTransport, BilletsSuivis, ProchesASuivre, MissionsSuivies, OffresDeMontee, Positions, EtatsSuivi, AlertesArret, PrevenirProches, AvisSuivi, DiffusionGps sont en mémoire/,
    );
  });

  it("laisse démarrer en développement et en test", () => {
    expect(() => garde("development").onModuleInit()).not.toThrow();
    expect(() => garde("test").onModuleInit()).not.toThrow();
  });

  it("accepte un port durable, mais nomme encore ceux qui restent en mémoire", () => {
    const g = garde("production");
    (g as unknown as { positions: { durable: boolean } }).positions = { durable: true };
    expect(() => g.onModuleInit()).toThrowError(/EtatsSuivi/);
    try {
      g.onModuleInit();
    } catch (e) {
      expect(String(e)).not.toMatch(/Positions,/);
    }
  });
});
