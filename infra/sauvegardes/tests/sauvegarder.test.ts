import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable } from "./support";

let bac: BacASable;
beforeEach(() => {
  bac = new BacASable();
});
afterEach(() => bac.nettoyer());

const NOM = "afrimove-20261018T010000Z.dump.age";

describe("sauvegarde complète", () => {
  it("dépose le dump chiffré et son empreinte chez les deux fournisseurs, nommés d'après l'heure UTC", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"]);
    expect(r.code, r.erreur).toBe(0);
    for (const f of ["a", "b"] as const) {
      expect(bac.fichiers(f, "complet")).toEqual([NOM, `${NOM}.sha256`]);
    }
  });

  it("ne dépose jamais le contenu en clair, et l'empreinte correspond au fichier déposé", () => {
    bac.lancer("sauvegarder.sh", ["complet"]);
    for (const f of ["a", "b"] as const) {
      const chiffre = readFileSync(bac.chemin(f, "complet", NOM));
      expect(chiffre.toString("latin1")).not.toContain("PGDMP");
      expect(chiffre.toString("latin1")).not.toContain("données secrètes");
      const empreinte = readFileSync(bac.chemin(f, "complet", `${NOM}.sha256`), "utf8");
      expect(empreinte).toBe(`${createHash("sha256").update(chiffre).digest("hex")}  ${NOM}\n`);
    }
  });

  it("chiffre pour chaque destinataire configuré", () => {
    bac.lancer("sauvegarder.sh", ["complet"]);
    const entete = readFileSync(bac.chemin("a", "complet", NOM), "utf8").split("\n")[0];
    expect(entete).toBe("AGE-FAUX age1cleaaaa age1clebbbb");
  });

  it("ne laisse aucun clair dans le dossier de travail après le passage", () => {
    bac.lancer("sauvegarder.sh", ["complet"]);
    expect(readdirSync(bac.travail).filter((n) => n.startsWith("tmp."))).toEqual([]);
    const note = JSON.parse(readFileSync(`${bac.travail}/derniere-complet.json`, "utf8"));
    expect(note).toMatchObject({ mode: "complet", fichier: NOM, reussis: 2 });
  });

  it("refuse de partir sans destinataire de chiffrement, sans rien déposer", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { AGE_DESTINATAIRES: "" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("AGE_DESTINATAIRES");
    expect(bac.fichiers("a", "complet")).toEqual([]);
  });

  it("refuse un destinataire qui n'est pas une clé age", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { AGE_DESTINATAIRES: "motdepasse123" });
    expect(r.code).toBe(1);
    expect(bac.fichiers("a", "complet")).toEqual([]);
  });

  it("refuse deux fournisseurs identiques", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { FOURNISSEUR_B: "sauv-a:prod" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("identiques");
  });

  it("refuse un mode inconnu", () => {
    const r = bac.lancer("sauvegarder.sh", ["quotidien"]);
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("mode inconnu");
  });

  it("sauvegarde PARTIELLE si un fournisseur est en panne : code 2, alerte, le fichier est chez l'autre", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], {
      RCLONE_PANNE: "sauv-b",
      ALERTE_URL: "http://alerte.test/hook",
    });
    expect(r.code).toBe(2);
    expect(bac.fichiers("a", "complet")).toEqual([NOM, `${NOM}.sha256`]);
    expect(bac.fichiers("b", "complet")).toEqual([]);
    const faux = bac.journalDesFaux();
    expect(faux).toContain("curl");
    expect(faux).toContain("PARTIELLE");
    expect(faux).toContain("sauv-b:prod");
    // Une sauvegarde partielle ne déclenche pas la purge : on ne supprime rien quand l'état est dégradé.
    expect(faux).not.toContain("deletefile");
  });

  it("échoue (code 1) et alerte si aucun fournisseur ne répond", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], {
      RCLONE_PANNE: "sauv-a,sauv-b",
      ALERTE_URL: "http://alerte.test/hook",
    });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("aucun fournisseur");
    expect(bac.journalDesFaux()).toContain("curl");
  });

  it("n'envoie rien et alerte si pg_dump échoue", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], {
      PGFAUX_DUMP_PANNE: "1",
      ALERTE_URL: "http://alerte.test/hook",
    });
    expect(r.code).toBe(1);
    expect(bac.fichiers("a", "complet")).toEqual([]);
    expect(bac.fichiers("b", "complet")).toEqual([]);
    expect(bac.journalDesFaux()).toContain("pg_dump a échoué");
  });

  it("refuse un dump vide", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { PGFAUX_DUMP_VIDE: "1" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("vide");
    expect(bac.fichiers("a", "complet")).toEqual([]);
  });

  it("refuse un dump que pg_restore ne sait pas lire", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { PGFAUX_DUMP_ILLISIBLE: "1" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("pas lisible");
    expect(bac.fichiers("a", "complet")).toEqual([]);
  });

  it("détecte un fichier tronqué chez un fournisseur (taille distante différente)", () => {
    const r = bac.lancer("sauvegarder.sh", ["complet"], { RCLONE_TRONQUER: "sauv-b" });
    expect(r.code).toBe(2);
    expect(r.erreur).toContain("taille distante différente");
  });

  it("lance la purge après une sauvegarde réussie chez les deux", () => {
    bac.poserComplet("a", "20250101T010000Z");
    bac.poserComplet("a", "20250102T010000Z");
    bac.poserComplet("a", "20250103T010000Z");
    bac.poserComplet("a", "20250104T010000Z");
    const r = bac.lancer("sauvegarder.sh", ["complet"]);
    expect(r.code, r.erreur).toBe(0);
    // 4 anciennes + 1 nouvelle : les 3 plus récentes sont protégées, la plus ancienne part.
    expect(bac.fichiers("a", "complet")).not.toContain("afrimove-20250101T010000Z.dump.age");
    expect(bac.fichiers("a", "complet")).toContain(NOM);
  });
});

describe("sauvegarde physique", () => {
  it("dépose une archive de base chiffrée dans physique/, chez les deux", () => {
    const r = bac.lancer("sauvegarder.sh", ["physique"]);
    expect(r.code, r.erreur).toBe(0);
    const nom = "afrimove-20261018T010000Z.base.tar.age";
    for (const f of ["a", "b"] as const) {
      expect(bac.fichiers(f, "physique")).toEqual([nom, `${nom}.sha256`]);
      expect(readFileSync(bac.chemin(f, "physique", nom), "latin1")).not.toContain("TAR-PHYSIQUE");
    }
    expect(bac.journalDesFaux()).toContain("pg_basebackup");
  });
});

describe("configuration", () => {
  it("lit le fichier de configuration, mais une variable déjà exportée l'emporte", () => {
    const fichier = `${bac.racine}/sauvegardes.env`;
    writeFileSync(
      fichier,
      [
        "# commentaire",
        'AGE_DESTINATAIRES="age1depuisfichier"',
        "FOURNISSEUR_A=sauv-a:fichier",
        "FOURNISSEUR_B=sauv-b:fichier",
      ].join("\n"),
    );
    const sansConfig = {
      SAUVEGARDES_ENV: fichier,
      AGE_DESTINATAIRES: undefined,
      FOURNISSEUR_A: undefined,
      FOURNISSEUR_B: undefined,
    };
    expect(bac.lancer("sauvegarder.sh", ["complet"], sansConfig).code).toBe(0);
    expect(readFileSync(bac.chemin("b", "..", "fichier", "complet", NOM), "utf8")).toContain(
      "age1depuisfichier",
    );

    // FOURNISSEUR_A exporté : il prime sur la ligne du fichier.
    const r = bac.lancer("sauvegarder.sh", ["complet"], {
      ...sansConfig,
      FOURNISSEUR_A: "sauv-a:prod",
    });
    expect(r.code, r.erreur).toBe(0);
    expect(bac.fichiers("a", "complet")).toContain(NOM);
  });
});
