import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable } from "./support";

let bac: BacASable;
beforeEach(() => {
  bac = new BacASable();
});
afterEach(() => bac.nettoyer());

// « Maintenant » = 2026-10-18 01:00 UTC. 30 jours avant : 2026-09-18 01:00 ; 7 jours avant : 2026-10-11 01:00.
const donnees = (h: string) => `afrimove-${h}.dump.age`;

describe("rétention des sauvegardes complètes (30 jours)", () => {
  it("supprime ce qui a plus de 30 jours, avec son empreinte, et garde le reste", () => {
    for (const h of [
      "20260901T010000Z", // 47 jours
      "20260915T010000Z", // 33 jours
      "20260920T010000Z", // 28 jours
      "20261010T010000Z",
      "20261017T010000Z",
    ]) {
      bac.poserComplet("a", h);
      bac.poserComplet("b", h);
    }
    const r = bac.lancer("purger.sh");
    expect(r.code, r.erreur).toBe(0);
    for (const f of ["a", "b"] as const) {
      expect(bac.fichiers(f, "complet")).toEqual(
        ["20260920T010000Z", "20261010T010000Z", "20261017T010000Z"].flatMap((h) => [
          donnees(h),
          `${donnees(h)}.sha256`,
        ]),
      );
    }
  });

  it("garde une sauvegarde de 30 jours pile et supprime celle de 30 jours plus une seconde", () => {
    bac.poserComplet("a", "20260918T010000Z"); // pile 30 jours : gardée
    bac.poserComplet("a", "20260918T005959Z"); // 30 jours + 1 s : supprimée
    for (const h of ["20261015T010000Z", "20261016T010000Z", "20261017T010000Z"])
      bac.poserComplet("a", h);
    bac.poserComplet("b", "20261017T010000Z");
    bac.lancer("purger.sh", [], { GARDER_AU_MOINS: "3" });
    const restants = bac.fichiers("a", "complet");
    expect(restants).toContain(donnees("20260918T010000Z"));
    expect(restants).not.toContain(donnees("20260918T005959Z"));
  });

  it("ne vide jamais le stock : les 3 plus récentes survivent même si elles ont plus de 30 jours", () => {
    for (const h of [
      "20260601T010000Z",
      "20260602T010000Z",
      "20260603T010000Z",
      "20260604T010000Z",
    ]) {
      bac.poserComplet("a", h);
      bac.poserComplet("b", h);
    }
    const r = bac.lancer("purger.sh");
    expect(r.code).toBe(0);
    for (const f of ["a", "b"] as const) {
      const noms = bac.fichiers(f, "complet").filter((n) => n.endsWith(".dump.age"));
      expect(noms).toEqual([
        donnees("20260602T010000Z"),
        donnees("20260603T010000Z"),
        donnees("20260604T010000Z"),
      ]);
    }
  });

  it("respecte RETENTION_COMPLET_JOURS", () => {
    for (const h of [
      "20261001T010000Z",
      "20261008T010000Z",
      "20261015T010000Z",
      "20261016T010000Z",
      "20261017T010000Z",
    ])
      bac.poserComplet("a", h);
    bac.poserComplet("b", "20261017T010000Z");
    bac.lancer("purger.sh", [], { RETENTION_COMPLET_JOURS: "5", GARDER_AU_MOINS: "3" });
    const noms = bac.fichiers("a", "complet").filter((n) => n.endsWith(".dump.age"));
    expect(noms).toEqual([
      donnees("20261015T010000Z"),
      donnees("20261016T010000Z"),
      donnees("20261017T010000Z"),
    ]);
  });

  it("ne touche pas aux fichiers sans horodatage", () => {
    bac.poser("a", "complet", "LISEZMOI.txt");
    bac.poserComplet("a", "20250101T010000Z");
    bac.poserComplet("a", "20261017T010000Z");
    bac.poserComplet("a", "20261016T010000Z");
    bac.poserComplet("a", "20261015T010000Z");
    bac.lancer("purger.sh");
    expect(bac.fichiers("a", "complet")).toContain("LISEZMOI.txt");
    expect(bac.fichiers("a", "complet")).not.toContain(donnees("20250101T010000Z"));
  });
});

describe("rétention du journal et des sauvegardes physiques (7 jours)", () => {
  it("supprime les segments de plus de 7 jours, sans garde-fou", () => {
    bac.poser("a", "journal", "20261010T230000Z_000000010000000000000001.age"); // 8 jours
    bac.poser("a", "journal", "20261012T010000Z_000000010000000000000002.age"); // 6 jours
    bac.poser("a", "journal", "20261018T000000Z_000000010000000000000003.age");
    bac.lancer("purger.sh");
    expect(bac.fichiers("a", "journal")).toEqual([
      "20261012T010000Z_000000010000000000000002.age",
      "20261018T000000Z_000000010000000000000003.age",
    ]);
  });

  it("supprime les sauvegardes physiques de plus de 7 jours, en gardant les 3 plus récentes", () => {
    const base = (h: string) => `afrimove-${h}.base.tar.age`;
    for (const h of [
      "20261001T010000Z",
      "20261002T010000Z",
      "20261003T010000Z",
      "20261004T010000Z",
      "20261017T010000Z",
    ])
      bac.poser("a", "physique", base(h));
    bac.lancer("purger.sh");
    expect(bac.fichiers("a", "physique")).toEqual([
      base("20261003T010000Z"),
      base("20261004T010000Z"),
      base("20261017T010000Z"),
    ]);
  });
});

describe("fournisseur injoignable", () => {
  it("ne supprime rien chez lui, signale l'erreur (code 1), et purge quand même l'autre", () => {
    for (const h of [
      "20250101T010000Z",
      "20261015T010000Z",
      "20261016T010000Z",
      "20261017T010000Z",
    ]) {
      bac.poserComplet("a", h);
      bac.poserComplet("b", h);
    }
    const r = bac.lancer("purger.sh", [], { RCLONE_PANNE: "sauv-a" });
    expect(r.code).toBe(1);
    expect(bac.fichiers("a", "complet")).toContain(donnees("20250101T010000Z"));
    expect(bac.fichiers("b", "complet")).not.toContain(donnees("20250101T010000Z"));
  });

  it("ne plante pas quand les dossiers n'existent pas encore", () => {
    const r = bac.lancer("purger.sh");
    expect(r.code, r.erreur).toBe(0);
  });
});
