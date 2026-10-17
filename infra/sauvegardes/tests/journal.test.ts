import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable } from "./support";

let bac: BacASable;
beforeEach(() => {
  bac = new BacASable();
});
afterEach(() => bac.nettoyer());

const SEGMENT = "000000010000000000000007";

describe("archiver-wal.sh (archive_command, tourne dans le conteneur postgres)", () => {
  it("met le segment de côté dans le spool et ne laisse aucun fichier partiel", () => {
    const source = join(bac.racine, "pg_wal_segment");
    writeFileSync(source, "contenu du segment");
    const r = bac.lancerSh("archiver-wal.sh", [source, SEGMENT]);
    expect(r.code, r.erreur).toBe(0);
    expect(readFileSync(join(bac.spool, SEGMENT), "utf8")).toBe("contenu du segment");
    expect(bac.existe(join(bac.spool, `${SEGMENT}.partiel`))).toBe(false);
  });

  it("accepte un réessai identique (PostgreSQL rejoue l'archivage après un arrêt brutal)", () => {
    const source = join(bac.racine, "pg_wal_segment");
    writeFileSync(source, "contenu");
    expect(bac.lancerSh("archiver-wal.sh", [source, SEGMENT]).code).toBe(0);
    expect(bac.lancerSh("archiver-wal.sh", [source, SEGMENT]).code).toBe(0);
  });

  it("refuse d'écraser un segment déjà archivé avec un contenu différent", () => {
    const source = join(bac.racine, "pg_wal_segment");
    writeFileSync(source, "premier");
    bac.lancerSh("archiver-wal.sh", [source, SEGMENT]);
    writeFileSync(source, "différent");
    const r = bac.lancerSh("archiver-wal.sh", [source, SEGMENT]);
    expect(r.code).toBe(1);
    expect(readFileSync(join(bac.spool, SEGMENT), "utf8")).toBe("premier");
  });

  it("échoue (PostgreSQL gardera le segment) si le dossier d'attente est absent", () => {
    const source = join(bac.racine, "pg_wal_segment");
    writeFileSync(source, "contenu");
    const r = bac.lancerSh("archiver-wal.sh", [source, SEGMENT], {
      SPOOL_WAL: join(bac.racine, "absent"),
    });
    expect(r.code).toBe(1);
  });

  it("échoue si la source n'existe pas", () => {
    expect(bac.lancerSh("archiver-wal.sh", [join(bac.racine, "rien"), SEGMENT]).code).not.toBe(0);
  });
});

describe("expedier-journal.sh", () => {
  function deposer(nom: string, iso: string, contenu = "segment") {
    const chemin = join(bac.spool, nom);
    writeFileSync(chemin, contenu);
    bac.dater(chemin, iso);
  }

  it("chiffre chaque segment, le dépose chez les deux avec l'heure du fichier, puis vide le spool", () => {
    deposer(SEGMENT, "2026-10-18T00:55:00Z", "WAL secret");
    const r = bac.lancer("expedier-journal.sh");
    expect(r.code, r.erreur).toBe(0);
    const nom = `20261018T005500Z_${SEGMENT}.age`;
    for (const f of ["a", "b"] as const) {
      expect(bac.fichiers(f, "journal")).toEqual([nom]);
      expect(readFileSync(bac.chemin(f, "journal", nom), "latin1")).not.toContain("WAL secret");
    }
    expect(bac.existe(join(bac.spool, SEGMENT))).toBe(false);
  });

  it("ignore les segments en cours d'écriture (.partiel)", () => {
    deposer(`${SEGMENT}.partiel`, "2026-10-18T00:55:00Z");
    const r = bac.lancer("expedier-journal.sh");
    expect(r.code).toBe(0);
    expect(bac.fichiers("a", "journal")).toEqual([]);
    expect(bac.existe(join(bac.spool, `${SEGMENT}.partiel`))).toBe(true);
  });

  it("garde le segment dans le spool si un fournisseur est en panne (code 2), puis le renvoie sans doublon", () => {
    deposer(SEGMENT, "2026-10-18T00:55:00Z");
    const r1 = bac.lancer("expedier-journal.sh", [], { RCLONE_PANNE: "sauv-b" });
    expect(r1.code).toBe(2);
    expect(bac.existe(join(bac.spool, SEGMENT))).toBe(true);
    expect(bac.fichiers("a", "journal")).toHaveLength(1);
    expect(bac.fichiers("b", "journal")).toHaveLength(0);

    const r2 = bac.lancer("expedier-journal.sh");
    expect(r2.code, r2.erreur).toBe(0);
    expect(bac.fichiers("a", "journal")).toHaveLength(1); // même nom : écrasé, pas dupliqué
    expect(bac.fichiers("b", "journal")).toHaveLength(1);
    expect(bac.existe(join(bac.spool, SEGMENT))).toBe(false);
  });

  it("traite plusieurs segments dans l'ordre et n'en perd aucun", () => {
    deposer("000000010000000000000001", "2026-10-18T00:40:00Z");
    deposer("000000010000000000000002", "2026-10-18T00:45:00Z");
    deposer("000000010000000000000003", "2026-10-18T00:50:00Z");
    expect(bac.lancer("expedier-journal.sh").code).toBe(0);
    expect(bac.fichiers("b", "journal")).toEqual([
      "20261018T004000Z_000000010000000000000001.age",
      "20261018T004500Z_000000010000000000000002.age",
      "20261018T005000Z_000000010000000000000003.age",
    ]);
  });

  it("refuse de tourner sans destinataire de chiffrement (le journal ne part jamais en clair)", () => {
    deposer(SEGMENT, "2026-10-18T00:55:00Z");
    const r = bac.lancer("expedier-journal.sh", [], { AGE_DESTINATAIRES: "" });
    expect(r.code).toBe(1);
    expect(bac.fichiers("a", "journal")).toEqual([]);
    expect(bac.existe(join(bac.spool, SEGMENT))).toBe(true);
  });
});
