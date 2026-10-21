import { describe, expect, it } from "vitest";
import { configTest } from "../socle/testing/app-test";
import { VerificationStockageAdministration } from "./administration.module";
import { chargerConfigAdministration } from "./config";
import type {
  AnnuaireAdmin,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
} from "./ports";
import {
  AnnuaireAdminMemoire,
  LignesMemoire,
  OrdresAppareilsMemoire,
  ParcBusMemoire,
  ProgrammeMemoire,
  RegistreAppareilsMemoire,
} from "./memoire";
import {
  AnnuaireAdminPrisma,
  LignesPrisma,
  OrdresAppareilsPrisma,
  ParcBusPrisma,
  ProgrammePrisma,
  RegistreAppareilsPrisma,
} from "./postgres";

/**
 * Garde-fou de production : l'administration (lignes, départs, appareils enrôlés, ordres d'effacement) ne démarre
 * pas sur un port en mémoire. Les pannes qu'il évite : un appareil enrôlé qu'un redémarrage rend muet, un ordre
 * d'effacement perdu avant d'avoir été lu.
 */

const enMemoire = () => {
  const lignes = new LignesMemoire();
  return {
    annuaire: new AnnuaireAdminMemoire(),
    lignes,
    parc: new ParcBusMemoire(),
    programme: new ProgrammeMemoire(lignes),
    registre: new RegistreAppareilsMemoire(),
    ordres: new OrdresAppareilsMemoire(),
  };
};

// Les adaptateurs PostgreSQL n'ouvrent aucune connexion à la construction : un client factice suffit pour lire `durable`.
const surPostgres = () => {
  const prisma = {} as never;
  return {
    annuaire: new AnnuaireAdminPrisma(prisma),
    lignes: new LignesPrisma(prisma),
    parc: new ParcBusPrisma(prisma),
    programme: new ProgrammePrisma(prisma),
    registre: new RegistreAppareilsPrisma(prisma),
    ordres: new OrdresAppareilsPrisma(prisma),
  };
};

const garde = (
  env: "production" | "test",
  p: {
    annuaire: AnnuaireAdmin;
    lignes: Lignes;
    parc: ParcBus;
    programme: Programme;
    registre: RegistreAppareils;
    ordres: OrdresAppareils;
  },
) =>
  new VerificationStockageAdministration(
    { ...configTest(), env },
    p.annuaire,
    p.lignes,
    p.parc,
    p.programme,
    p.registre,
    p.ordres,
  );

describe("configuration du balayage des modifications de ligne", () => {
  it("lit ADMIN_BALAYAGE_MS, éteint par défaut en test, toutes les cinq minutes sinon", () => {
    expect(chargerConfigAdministration({ NODE_ENV: "test" }).balayageMs).toBe(0);
    expect(chargerConfigAdministration({}).balayageMs).toBe(300_000);
    expect(chargerConfigAdministration({ ADMIN_BALAYAGE_MS: "60000" }).balayageMs).toBe(60_000);
    expect(
      chargerConfigAdministration({ NODE_ENV: "test", ADMIN_BALAYAGE_MS: "0" }).balayageMs,
    ).toBe(0);
  });

  it("refuse une valeur inexploitable en nommant la variable", () => {
    expect(() => chargerConfigAdministration({ ADMIN_BALAYAGE_MS: "souvent" })).toThrow(
      /ADMIN_BALAYAGE_MS/,
    );
    expect(() => chargerConfigAdministration({ ADMIN_BALAYAGE_MS: "-5" })).toThrow(
      /ADMIN_BALAYAGE_MS/,
    );
    expect(() => chargerConfigAdministration({ ADMIN_BALAYAGE_MS: "1.5" })).toThrow(
      /ADMIN_BALAYAGE_MS/,
    );
  });
});

describe("VerificationStockageAdministration", () => {
  it("refuse la production tant qu'un port est en mémoire, et nomme chacun", () => {
    expect(() => garde("production", enMemoire()).onModuleInit()).toThrowError(
      /AdministrationModule : AnnuaireAdmin, Lignes, ParcBus, Programme, RegistreAppareils, OrdresAppareils sont en mémoire/,
    );
    const mixte = { ...surPostgres(), registre: new RegistreAppareilsMemoire() };
    expect(() => garde("production", mixte).onModuleInit()).toThrowError(
      /: RegistreAppareils sont en mémoire/,
    );
  });

  it("laisse démarrer la production quand tous les ports sont sur PostgreSQL", () => {
    expect(() => garde("production", surPostgres()).onModuleInit()).not.toThrow();
  });

  it("laisse les tests et le développement tourner en mémoire", () => {
    expect(() => garde("test", enMemoire()).onModuleInit()).not.toThrow();
  });
});
