import { describe, expect, it } from "vitest";
import { configTest } from "../socle/testing/app-test";
import {
  AgrementsMemoire,
  CommissionsMemoire,
  ComptesVendeursMemoire,
  NumerosVendeursMemoire,
  VendeursMemoire,
  VentesMemoire,
} from "./memoire";
import { VersementsMemoire } from "../relais/memoire";
import { chargerOptionsVendeurs } from "./options";
import { VerificationPortsVendeurs } from "./vendeurs.module";

describe("réglages du module (variables d'environnement)", () => {
  it("les défauts : 60 s d'attente du règlement, sondage 1 s, tâches toutes les 15 s", () => {
    expect(chargerOptionsVendeurs({})).toEqual({
      delaiReglementMs: 60_000,
      sondageMs: 1_000,
      tachesMs: 15_000,
      baseLienBillet: "https://afrimove.app/b/",
    });
  });

  it("lit les valeurs données, texte vide compris comme absent", () => {
    expect(
      chargerOptionsVendeurs({
        VENDEURS_DELAI_REGLEMENT_MS: "30000",
        VENDEURS_SONDAGE_MS: "500",
        VENDEURS_TACHES_MS: "0",
        VENDEURS_BASE_LIEN_BILLET: "https://billets.exemple.cm/b/",
      }),
    ).toEqual({
      delaiReglementMs: 30_000,
      sondageMs: 500,
      tachesMs: 0,
      baseLienBillet: "https://billets.exemple.cm/b/",
    });
    expect(chargerOptionsVendeurs({ VENDEURS_DELAI_REGLEMENT_MS: "" }).delaiReglementMs).toBe(
      60_000,
    );
  });

  it("refuse de démarrer sur une valeur illisible", () => {
    for (const env of [
      { VENDEURS_DELAI_REGLEMENT_MS: "une minute" },
      { VENDEURS_DELAI_REGLEMENT_MS: "-1" },
      { VENDEURS_DELAI_REGLEMENT_MS: "3600000" },
      { VENDEURS_SONDAGE_MS: "0" },
      { VENDEURS_TACHES_MS: "1.5" },
      { VENDEURS_BASE_LIEN_BILLET: "http://afrimove.app/b/" },
      { VENDEURS_BASE_LIEN_BILLET: "https://afrimove.app/b" },
    ]) {
      expect(() => chargerOptionsVendeurs(env), JSON.stringify(env)).toThrow(/VENDEURS_/);
    }
  });
});

describe("garde-fou de production", () => {
  const ports = () =>
    [
      new VendeursMemoire(),
      new AgrementsMemoire(),
      new NumerosVendeursMemoire(),
      new VentesMemoire(),
      new CommissionsMemoire(),
      new ComptesVendeursMemoire(),
      new VersementsMemoire(),
    ] as const;

  const garde = (env: "production" | "test") =>
    new VerificationPortsVendeurs({ ...configTest(), env }, ...ports());

  it("refuse de démarrer en production tant que le stockage est en mémoire, en nommant les ports", () => {
    expect(() => garde("production").onModuleInit()).toThrow(
      /VendeursRepository, AgrementsRepository, NumerosVendeurs, VentesRepository, CommissionsVendeurs, ComptesVendeurs, VersementsMobile/,
    );
  });

  it("laisse démarrer hors production", () => {
    expect(() => garde("test").onModuleInit()).not.toThrow();
  });
});
