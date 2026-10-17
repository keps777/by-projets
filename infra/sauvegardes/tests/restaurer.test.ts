import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable } from "./support";

let bac: BacASable;
beforeEach(() => {
  bac = new BacASable();
});
afterEach(() => bac.nettoyer());

/** Ce que pg_dump (faux) produit avec PGFAUX_CONTENU=v1. */
const DUMP_ATTENDU = "PGDMP-FAUX|v1|données secrètes de la base";

function sauvegarder(env: Record<string, string> = {}, maintenant = "2026-10-18T01:00:00Z") {
  const r = bac.lancer("sauvegarder.sh", ["complet"], { MAINTENANT: maintenant, ...env });
  expect(r.code, r.erreur).toBe(0);
}
function restaurer(args: string[] = [], env: Record<string, string> = {}) {
  const identite = bac.identiteFausse("age1cleaaaa");
  return bac.lancer("restaurer.sh", ["--identite", identite, ...args], env);
}
const restauree = () => bac.existe(`${bac.etatPg}/restaure.dump`);

describe("restauration complète", () => {
  it("rend exactement les octets sauvegardés, dans une base créée pour l'occasion", () => {
    sauvegarder();
    const r = restaurer(["--rapport", `${bac.racine}/rapport.json`]);
    expect(r.code, r.erreur).toBe(0);
    expect(readFileSync(`${bac.etatPg}/restaure.dump`, "utf8")).toBe(DUMP_ATTENDU);
    expect(bac.existe(`${bac.etatPg}/base-creee`)).toBe(true);
  });

  it("chronomètre et écrit un rapport lisible par une machine", () => {
    sauvegarder();
    const r = restaurer(["--rapport", `${bac.racine}/rapport.json`]);
    const rapport = JSON.parse(readFileSync(`${bac.racine}/rapport.json`, "utf8"));
    expect(rapport).toMatchObject({
      objectif_secondes: 7200,
      respecte: true,
      fournisseur: "sauv-a:prod",
      fichier: "afrimove-20261018T010000Z.dump.age",
      base: "afrimove",
      tables: 12,
    });
    expect(Number.isInteger(rapport.duree_secondes)).toBe(true);
    expect(rapport.duree_secondes).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(r.sortie)).toEqual(rapport);
  });

  it("prend la sauvegarde la plus récente", () => {
    sauvegarder({ PGFAUX_CONTENU: "ancien" }, "2026-10-17T01:00:00Z");
    sauvegarder({ PGFAUX_CONTENU: "recent" }, "2026-10-18T01:00:00Z");
    expect(restaurer().code).toBe(0);
    expect(readFileSync(`${bac.etatPg}/restaure.dump`, "utf8")).toContain("|recent|");
  });

  it("peut restaurer une sauvegarde précise (--fichier)", () => {
    sauvegarder({ PGFAUX_CONTENU: "ancien" }, "2026-10-17T01:00:00Z");
    sauvegarder({ PGFAUX_CONTENU: "recent" }, "2026-10-18T01:00:00Z");
    expect(restaurer(["--fichier", "afrimove-20261017T010000Z.dump.age"]).code).toBe(0);
    expect(readFileSync(`${bac.etatPg}/restaure.dump`, "utf8")).toContain("|ancien|");
  });

  it("est déclarée TROP LENTE (code 3) mais reste restaurée quand la durée dépasse l'objectif", () => {
    sauvegarder();
    const r = restaurer(["--rapport", `${bac.racine}/rapport.json`], {
      OBJECTIF_RESTAURATION_SECONDES: "0",
      ALERTE_URL: "http://alerte.test/hook",
    });
    expect(r.code).toBe(3);
    expect(restauree()).toBe(true);
    expect(JSON.parse(readFileSync(`${bac.racine}/rapport.json`, "utf8")).respecte).toBe(false);
    expect(bac.journalDesFaux()).toContain("trop lente");
  });

  it("vérifie les tables attendues (VERIF_TABLES) et compte celles qui sont lisibles", () => {
    sauvegarder();
    const r = restaurer([], { VERIF_TABLES: "personne,billet,journal_audit" });
    expect(r.code, r.erreur).toBe(0);
    expect(JSON.parse(r.sortie).tables_verifiees).toBe(3);
  });

  it("échoue si une table attendue est illisible après restauration", () => {
    sauvegarder();
    const r = restaurer([], { VERIF_TABLES: "personne,billet", PGFAUX_TABLE_ILLISIBLE: "billet" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("billet");
  });

  it("refuse un nom de table douteux dans VERIF_TABLES (pas d'injection SQL)", () => {
    sauvegarder();
    const r = restaurer([], { VERIF_TABLES: 'personne";drop table billet;--' });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("invalide");
  });

  it("échoue si la base restaurée est vide de tables", () => {
    sauvegarder();
    const r = restaurer([], { PGFAUX_TABLES_APRES: "0" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("aucune table");
  });

  it("échoue si pg_restore signale une erreur (pas de restauration à moitié)", () => {
    sauvegarder();
    const r = restaurer([], { PGFAUX_RESTORE_PANNE: "1" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("pg_restore a échoué");
  });
});

describe("serveur de destination", () => {
  it("refuse d'écraser une base qui contient déjà des tables", () => {
    sauvegarder();
    const r = restaurer([], { PGFAUX_EXISTE: "1", PGFAUX_TABLES_AVANT: "5" });
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("n'est pas vide");
    expect(restauree()).toBe(false);
  });

  it("accepte une base existante mais vide (celle que crée le conteneur postgres)", () => {
    sauvegarder();
    const r = restaurer([], { PGFAUX_EXISTE: "1", PGFAUX_TABLES_AVANT: "0" });
    expect(r.code, r.erreur).toBe(0);
    expect(bac.existe(`${bac.etatPg}/base-creee`)).toBe(false);
  });

  it("recrée la base avec --ecraser", () => {
    sauvegarder();
    const r = restaurer(["--ecraser"], { PGFAUX_EXISTE: "1", PGFAUX_TABLES_AVANT: "5" });
    expect(r.code, r.erreur).toBe(0);
    expect(restauree()).toBe(true);
    expect(bac.journalDesFaux()).toContain("pg dropdb");
  });

  it("supprime la base après le contrôle avec --jetable (test mensuel sur le serveur de prod)", () => {
    sauvegarder();
    const r = restaurer(["--jetable", "--base", "afrimove_test_restauration"]);
    expect(r.code, r.erreur).toBe(0);
    expect(JSON.parse(r.sortie).base).toBe("afrimove_test_restauration");
    expect(bac.existe(`${bac.etatPg}/base-supprimee`)).toBe(true);
  });

  it("refuse un nom de base douteux", () => {
    sauvegarder();
    expect(restaurer(["--base", "x; drop database afrimove"]).code).toBe(1);
  });
});

describe("deux fournisseurs : on restaure même si l'un est perdu", () => {
  it("se rabat sur B quand A est en panne", () => {
    sauvegarder();
    const r = restaurer([], { RCLONE_PANNE: "sauv-a" });
    expect(r.code, r.erreur).toBe(0);
    expect(JSON.parse(r.sortie).fournisseur).toBe("sauv-b:prod");
    expect(readFileSync(`${bac.etatPg}/restaure.dump`, "utf8")).toBe(DUMP_ATTENDU);
  });

  it("se rabat sur B quand le fichier de A est corrompu (empreinte différente)", () => {
    sauvegarder();
    const fichierA = bac.chemin("a", "complet", "afrimove-20261018T010000Z.dump.age");
    writeFileSync(fichierA, readFileSync(fichierA, "utf8").replace(/.$/, "X"));
    const r = restaurer();
    expect(r.code, r.erreur).toBe(0);
    expect(JSON.parse(r.sortie).fournisseur).toBe("sauv-b:prod");
    expect(r.erreur).toContain("corrompu");
  });

  it("se rabat sur B quand l'empreinte de A est illisible", () => {
    sauvegarder();
    writeFileSync(bac.chemin("a", "complet", "afrimove-20261018T010000Z.dump.age.sha256"), "");
    const r = restaurer();
    expect(r.code, r.erreur).toBe(0);
    expect(JSON.parse(r.sortie).fournisseur).toBe("sauv-b:prod");
  });

  it("échoue proprement, sans toucher à la base, quand les deux copies sont mauvaises", () => {
    sauvegarder();
    for (const f of ["a", "b"] as const) {
      writeFileSync(bac.chemin(f, "complet", "afrimove-20261018T010000Z.dump.age"), "abîmé");
    }
    const r = restaurer();
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("aucune copie saine");
    expect(restauree()).toBe(false);
    expect(bac.existe(`${bac.etatPg}/base-creee`)).toBe(false);
  });

  it("peut être forcée sur un fournisseur (--fournisseur B)", () => {
    sauvegarder();
    const r = restaurer(["--fournisseur", "B"]);
    expect(JSON.parse(r.sortie).fournisseur).toBe("sauv-b:prod");
  });
});

describe("clé de déchiffrement", () => {
  it("échoue avec une mauvaise clé, sans toucher à la base", () => {
    sauvegarder();
    const mauvaise = bac.identiteFausse("age1autrecle");
    const r = bac.lancer("restaurer.sh", ["--identite", mauvaise]);
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("déchiffrement impossible");
    expect(restauree()).toBe(false);
  });

  it("exige l'option --identite", () => {
    sauvegarder();
    const r = bac.lancer("restaurer.sh", []);
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("--identite");
  });

  it("refuse une clé privée introuvable", () => {
    const r = bac.lancer("restaurer.sh", ["--identite", "/chemin/inexistant"]);
    expect(r.code).toBe(1);
  });
});

describe("récupération d'un segment de journal (restore_command)", () => {
  it("retrouve, déchiffre et écrit le segment demandé", () => {
    const segment = "000000010000000000000007";
    writeFileSync(`${bac.spool}/${segment}`, "contenu du WAL");
    expect(bac.lancer("expedier-journal.sh").code).toBe(0);
    const destination = `${bac.racine}/recupere`;
    const r = bac.lancer("recuperer-wal.sh", [segment, destination], {
      IDENTITE_AGE: bac.identiteFausse("age1cleaaaa"),
      RCLONE_PANNE: "sauv-a",
    });
    expect(r.code, r.erreur).toBe(0);
    expect(readFileSync(destination, "utf8")).toBe("contenu du WAL");
  });

  it("répond non (fin de rejeu) quand le segment n'existe nulle part", () => {
    const r = bac.lancer("recuperer-wal.sh", ["000000010000000000000099", `${bac.racine}/x`], {
      IDENTITE_AGE: bac.identiteFausse("age1cleaaaa"),
    });
    expect(r.code).toBe(1);
  });
});
