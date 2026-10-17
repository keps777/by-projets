import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable } from "./support";

let bac: BacASable;
beforeEach(() => {
  bac = new BacASable();
});
afterEach(() => bac.nettoyer());

// Maintenant : 2026-10-18 01:00 UTC. Limite de fraîcheur : 26 h, donc 2026-10-16 23:00 UTC.
describe("sonde de fraîcheur des sauvegardes complètes", () => {
  it("est verte quand les deux fournisseurs ont une sauvegarde de la nuit", () => {
    bac.poserComplet("a", "20261018T010000Z");
    bac.poserComplet("b", "20261018T010005Z");
    const r = bac.lancer("verifier.sh");
    expect(r.code, r.erreur).toBe(0);
  });

  it("est rouge et alerte si un fournisseur a manqué la nuit, et nomme le fournisseur en cause", () => {
    bac.poserComplet("a", "20261018T010000Z");
    bac.poserComplet("b", "20261016T010000Z"); // 48 h
    const r = bac.lancer("verifier.sh", [], { ALERTE_URL: "http://alerte.test/hook" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("sauv-b:prod");
    expect(r.erreur).toContain("trop ancienne");
    expect(bac.journalDesFaux()).toContain("curl");
  });

  it("accepte une sauvegarde vieille d'exactement 26 h", () => {
    bac.poserComplet("a", "20261016T230000Z");
    bac.poserComplet("b", "20261016T230000Z");
    expect(bac.lancer("verifier.sh").code).toBe(0);
  });

  it("refuse 26 h plus une seconde", () => {
    bac.poserComplet("a", "20261018T010000Z");
    bac.poserComplet("b", "20261016T225959Z");
    const r = bac.lancer("verifier.sh");
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("sauv-b:prod");
  });

  it("est rouge si un fournisseur n'a aucune sauvegarde", () => {
    bac.poserComplet("a", "20261018T010000Z");
    const r = bac.lancer("verifier.sh");
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("aucune sauvegarde");
  });

  it("est rouge si l'empreinte .sha256 manque : sans elle la restauration ne pourrait pas vérifier le fichier", () => {
    bac.poser("a", "complet", "afrimove-20261018T010000Z.dump.age");
    bac.poserComplet("b", "20261018T010000Z");
    const r = bac.lancer("verifier.sh");
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("empreinte");
  });

  it("est rouge si un fournisseur ne répond pas", () => {
    bac.poserComplet("a", "20261018T010000Z");
    bac.poserComplet("b", "20261018T010000Z");
    const r = bac.lancer("verifier.sh", [], { RCLONE_PANNE: "sauv-b" });
    expect(r.code).toBe(1);
  });
});

describe("sonde de fraîcheur du journal (VERIFIER_JOURNAL=1)", () => {
  beforeEach(() => {
    bac.poserComplet("a", "20261018T010000Z");
    bac.poserComplet("b", "20261018T010000Z");
  });

  it("est verte avec un segment de moins de 30 minutes chez les deux", () => {
    bac.poser("a", "journal", "20261018T003500Z_000000010000000000000009.age");
    bac.poser("b", "journal", "20261018T003500Z_000000010000000000000009.age");
    expect(bac.lancer("verifier.sh", [], { VERIFIER_JOURNAL: "1" }).code).toBe(0);
  });

  it("est rouge si le dernier segment a plus de 30 minutes chez l'un des deux", () => {
    bac.poser("a", "journal", "20261018T003500Z_000000010000000000000009.age");
    bac.poser("b", "journal", "20261018T002000Z_000000010000000000000008.age");
    const r = bac.lancer("verifier.sh", [], { VERIFIER_JOURNAL: "1" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("sauv-b:prod");
    expect(r.erreur).toContain("du journal");
  });

  it("ne regarde pas le journal sans VERIFIER_JOURNAL", () => {
    expect(bac.lancer("verifier.sh").code).toBe(0);
  });
});
