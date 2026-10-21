import { patron } from "@afrimove/contrats";
import { TARIFS } from "@afrimove/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listerRoutes } from "../socle/testing/routes";
import { VerificationPortsComptable } from "./comptable.module";
import { IDS_EXPORT } from "./modele";
import {
  ActionsRapprochement,
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FaitsRapprochement,
  FichiersApercus,
  MessagerieCabinet,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
} from "./ports";
import { FRAIS_AGENCE_BILLET, FRAIS_AGENCE_COLIS } from "./regles";
import { FORMAT_EXPORT, NOM_EXPORT } from "./tableaux";
import { creerAppComptableTest, type AppComptableTest } from "./testing/app-comptable-test";

/**
 * Le module face au reste du dépôt : mêmes identifiants d'export que les contrats, mêmes tarifs que le
 * domaine, routes et rôles attendus, garde-fou de production.
 */

describe("parité avec les contrats et le domaine", () => {
  it("les cinq exports ont les identifiants, l'ordre et les formats des contrats et des maquettes", () => {
    expect([...IDS_EXPORT]).toEqual([...patron.IdExportSchema.options]);
    expect(IDS_EXPORT.map((id) => FORMAT_EXPORT[id])).toEqual([
      "XLSX",
      "XLSX",
      "CSV",
      "CSV",
      "PDF",
    ]);
    expect(IDS_EXPORT.map((id) => NOM_EXPORT[id])).toEqual([
      "Journal des ventes",
      "Journal de caisse",
      "Annulations et remboursements",
      "Écritures SYSCOHADA",
      "Factures AfriMove",
    ]);
  });

  it("les frais d'agence sont ceux du domaine : 75 F par billet, 150 F par colis", () => {
    expect(FRAIS_AGENCE_BILLET).toBe(TARIFS.fraisAgenceBillet);
    expect(FRAIS_AGENCE_COLIS).toBe(TARIFS.fraisAgenceColis);
  });
});

describe("routes du module", () => {
  let t: AppComptableTest;
  beforeEach(async () => {
    t = await creerAppComptableTest();
  });
  afterEach(async () => {
    await t.fermer();
  });

  it("expose exactement les routes du ticket, chacune avec ses rôles", () => {
    const routes = listerRoutes(t.app).filter((r) => r.chemin.startsWith("/patron/comptable"));
    expect(
      routes.map((r) => [r.methode, r.chemin, [...(r.roles ?? [])].sort().join("+")]).sort(),
    ).toEqual(
      [
        ["GET", "/patron/comptable", "comptable+patron"],
        ["GET", "/patron/comptable/cloture", "comptable+patron"],
        ["GET", "/patron/comptable/exports/:exportId/apercu", "comptable+patron"],
        ["GET", "/patron/comptable/exports/:exportId/fichier", "comptable+patron"],
        ["GET", "/patron/comptable/rapprochement", "comptable+patron"],
        ["POST", "/patron/comptable/clotures", "patron"],
        ["POST", "/patron/comptable/rapprochement/decisions", "patron"],
      ].sort(),
    );
    expect(routes.every((r) => !r.publique && !r.toutAuthentifie && !r.vente)).toBe(true);
  });
});

describe("garde-fou de production", () => {
  let t: AppComptableTest;
  beforeEach(async () => {
    t = await creerAppComptableTest();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const verificateur = (env: "test" | "production") =>
    new VerificationPortsComptable(
      { ...t.config, env },
      t.app.get(VentesComptables),
      t.app.get(SessionsComptables),
      t.app.get(AnnulationsComptables),
      t.app.get(RelevesOperateur),
      t.app.get(FaitsRapprochement),
      t.app.get(FacturesPayees),
      t.app.get(ParametresRepository),
      t.app.get(DecisionsRapprochement),
      t.app.get(Clotures),
      t.app.get(FichiersApercus),
      t.app.get(EnvoisCabinet),
      t.app.get(ActionsRapprochement),
      t.app.get(MessagerieCabinet),
    );

  it("accepte la mémoire hors production", () => {
    expect(() => t.app.get(VerificationPortsComptable).onModuleInit()).not.toThrow();
    expect(() => verificateur("test").onModuleInit()).not.toThrow();
  });

  it("refuse de démarrer en production tant qu'un port est en mémoire, en les nommant", () => {
    const verif = verificateur("production");
    expect(() => verif.onModuleInit()).toThrow(/VentesComptables.*Clotures.*MessagerieCabinet/s);
    expect(() => verif.onModuleInit()).toThrow(/comptable\/README\.md/);
  });

  it("ne lance pas la tâche de fond dans les tests", () => {
    // Un minuteur oublié empêcherait le processus de test de se terminer.
    expect((t.taches as unknown as { minuteur: unknown }).minuteur).toBeNull();
  });
});
