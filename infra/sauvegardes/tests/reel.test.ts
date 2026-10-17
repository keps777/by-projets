import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BacASable, commandeDisponible } from "./support";

/**
 * Essais avec les VRAIS outils : age (chiffrement), puis PostgreSQL (pg_dump, pg_restore, psql).
 * Ils ne tournent que si les outils sont installés (et, pour PostgreSQL, si DATABASE_URL_TEST désigne un
 * serveur sur lequel l'utilisateur peut créer des bases) : sinon ils sont ignorés, comme les autres
 * tests d'intégration du dépôt. Les fournisseurs, eux, restent des dossiers (faux rclone) : aucun
 * stockage distant réel n'est essayé ici.
 */

const ageDispo = commandeDisponible("age") && commandeDisponible("age-keygen");
const urlPg = process.env.DATABASE_URL_TEST;
const pgDispo =
  ageDispo &&
  !!urlPg &&
  ["psql", "pg_dump", "pg_restore", "createdb", "dropdb"].every(commandeDisponible);

function genererCles(dossier: string): { publique: string; identite: string } {
  const identite = `${dossier}/cle-age.txt`;
  const r = spawnSync("age-keygen", ["-o", identite], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  const publique = /public key: (age1\w+)/.exec(readFileSync(identite, "utf8"))?.[1];
  if (!publique) throw new Error("clé publique introuvable");
  return { publique, identite };
}

let bac: BacASable;
afterEach(() => bac?.nettoyer());

describe.skipIf(!ageDispo)("avec le vrai age", () => {
  beforeEach(() => {
    bac = new BacASable({ ageReel: true });
  });

  it("chiffre vraiment : la sauvegarde déposée est un fichier age, illisible sans la clé privée", () => {
    const { publique, identite } = genererCles(bac.racine);
    bac.env.AGE_DESTINATAIRES = publique;
    expect(bac.lancer("sauvegarder.sh", ["complet"]).code).toBe(0);
    const nom = "afrimove-20261018T010000Z.dump.age";
    const contenu = readFileSync(bac.chemin("a", "complet", nom));
    expect(contenu.subarray(0, 21).toString()).toBe("age-encryption.org/v1");
    expect(contenu.toString("latin1")).not.toContain("PGDMP");

    const bonne = bac.lancer("restaurer.sh", ["--identite", identite]);
    expect(bonne.code, bonne.erreur).toBe(0);
    expect(readFileSync(`${bac.etatPg}/restaure.dump`, "utf8")).toBe(
      "PGDMP-FAUX|v1|données secrètes de la base",
    );
  });

  it("une autre clé privée ne déchiffre pas", () => {
    const { publique } = genererCles(bac.racine);
    bac.env.AGE_DESTINATAIRES = publique;
    bac.lancer("sauvegarder.sh", ["complet"]);
    const autreDossier = `${bac.racine}/autre`;
    spawnSync("mkdir", ["-p", autreDossier]);
    const { identite: autre } = genererCles(autreDossier);
    const r = bac.lancer("restaurer.sh", ["--identite", autre]);
    expect(r.code).toBe(1);
    expect(r.erreur).toContain("déchiffrement impossible");
    expect(bac.existe(`${bac.etatPg}/restaure.dump`)).toBe(false);
  });

  it("deux destinataires : chacun peut relire la sauvegarde", () => {
    const un = genererCles(bac.racine);
    spawnSync("mkdir", ["-p", `${bac.racine}/deux`]);
    const deux = genererCles(`${bac.racine}/deux`);
    bac.env.AGE_DESTINATAIRES = `${un.publique} ${deux.publique}`;
    bac.lancer("sauvegarder.sh", ["complet"]);
    expect(bac.lancer("restaurer.sh", ["--identite", deux.identite, "--ecraser"]).code).toBe(0);
  });

  it("le journal (WAL) est lui aussi chiffré pour de vrai, et se relit avec recuperer-wal.sh", () => {
    const { publique, identite } = genererCles(bac.racine);
    bac.env.AGE_DESTINATAIRES = publique;
    const segment = "000000010000000000000042";
    spawnSync("sh", ["-c", `printf 'WAL en clair' > '${bac.spool}/${segment}'`]);
    expect(bac.lancer("expedier-journal.sh").code).toBe(0);
    const destination = `${bac.racine}/segment-relu`;
    const r = bac.lancer("recuperer-wal.sh", [segment, destination], { IDENTITE_AGE: identite });
    expect(r.code, r.erreur).toBe(0);
    expect(readFileSync(destination, "utf8")).toBe("WAL en clair");
  });
});

describe.skipIf(!pgDispo)("avec un vrai PostgreSQL (DATABASE_URL_TEST)", () => {
  const suffixe = randomBytes(4).toString("hex");
  const source = `afrimove_sauv_src_${suffixe}`;
  const cible = `afrimove_sauv_rest_${suffixe}`;
  let envPg: Record<string, string> = {};

  function psql(base: string, sql: string): string {
    const r = spawnSync("psql", ["-d", base, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      env: { ...process.env, ...envPg },
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim();
  }

  beforeEach(() => {
    bac = new BacASable({ ageReel: true });
    const url = new URL(urlPg ?? "postgresql://localhost");
    envPg = {
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
    };
    psql("postgres", `create database ${source}`);
    psql(
      source,
      `create table personne (id serial primary key, nom text not null, telephone text);
       create table billet (id serial primary key, personne_id int references personne(id), prix int not null);
       insert into personne (nom, telephone) select 'Voyageur ' || g, '+2376' || lpad(g::text, 8, '0') from generate_series(1, 2000) g;
       insert into billet (personne_id, prix) select g, 5000 + (g % 7) * 500 from generate_series(1, 2000) g;`,
    );
  });

  afterEach(() => {
    for (const base of [source, cible]) {
      spawnSync("psql", ["-d", "postgres", "-c", `drop database if exists ${base}`], {
        env: { ...process.env, ...envPg },
      });
    }
  });

  const empreinte = (base: string) =>
    psql(
      base,
      `select md5(string_agg(p.id || p.nom || coalesce(p.telephone,'') || b.prix, ',' order by p.id)) from personne p join billet b on b.personne_id = p.id`,
    );

  it("sauvegarde chiffrée, perte de la base, restauration chronométrée : les données reviennent à l'identique", () => {
    const { publique, identite } = genererCles(bac.racine);
    const env = {
      ...envPg,
      PG_COMMANDE: "",
      PG_UTILISATEUR: envPg.PGUSER ?? "",
      PG_BASE: source,
      AGE_DESTINATAIRES: publique,
      VERIF_TABLES: "personne,billet",
    };
    const avant = empreinte(source);

    const sauvegarde = bac.lancer("sauvegarder.sh", ["complet"], env);
    expect(sauvegarde.code, sauvegarde.erreur).toBe(0);
    expect(bac.fichiers("b", "complet")).toHaveLength(2);

    // « Serveur vide » : la base de destination n'existe pas du tout.
    const restauration = bac.lancer(
      "restaurer.sh",
      ["--identite", identite, "--base", cible, "--rapport", `${bac.racine}/rapport.json`],
      env,
    );
    expect(restauration.code, restauration.erreur).toBe(0);
    const rapport = JSON.parse(readFileSync(`${bac.racine}/rapport.json`, "utf8"));
    expect(rapport).toMatchObject({ respecte: true, base: cible, tables_verifiees: 2 });

    expect(psql(cible, "select count(*) from personne")).toBe("2000");
    expect(empreinte(cible)).toBe(avant);

    // Une seconde restauration sur la même base refuse d'écraser.
    const deuxieme = bac.lancer("restaurer.sh", ["--identite", identite, "--base", cible], env);
    expect(deuxieme.code).toBe(1);
    expect(deuxieme.erreur).toContain("n'est pas vide");
  });

  it("une restauration --jetable ne laisse pas de base derrière elle", () => {
    const { publique, identite } = genererCles(bac.racine);
    const env = {
      ...envPg,
      PG_COMMANDE: "",
      PG_UTILISATEUR: envPg.PGUSER ?? "",
      PG_BASE: source,
      AGE_DESTINATAIRES: publique,
    };
    expect(bac.lancer("sauvegarder.sh", ["complet"], env).code).toBe(0);
    const r = bac.lancer(
      "restaurer.sh",
      ["--identite", identite, "--base", cible, "--jetable"],
      env,
    );
    expect(r.code, r.erreur).toBe(0);
    expect(psql("postgres", `select count(*) from pg_database where datname = '${cible}'`)).toBe(
      "0",
    );
  });
});
