import { agence, creerClientHttp } from "@afrimove/api-client";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, connecter, fenetreSansBalayage, lire, pile, type Session } from "../support/api";
import { COMPTES } from "../support/config";
import { creerDepart } from "../support/journee";
import { Poste } from "../support/postes";
import { attendre, envApi, portLibre } from "../support/processus";

/**
 * Critère 5 : « une sauvegarde est restaurée sur un serveur vide ».
 *
 * Les VRAIS scripts de `infra/sauvegardes` (`sauvegarder.sh`, `restaurer.sh`) tournent contre le PostgreSQL local de la
 * recette, avec le vrai `age` (chiffrement) et les vrais `pg_dump` / `pg_restore`. Seul `rclone` est remplacé (il n'est
 * pas installé ici et aucun stockage distant n'existe) : le faux `rclone` du dépôt écrit dans deux dossiers locaux qui
 * jouent les deux fournisseurs. Le « serveur vide » est une base neuve sur le même PostgreSQL : ce n'est PAS une
 * machine neuve (voir le procès-verbal).
 *
 * Ce qu'on prouve : la sauvegarde est chiffrée et déposée en double, la restauration dans une base vide réussit
 * dans l'objectif de 2 h, chaque table est identique (nombre de lignes et empreinte du contenu), et une API démarrée
 * sur la base restaurée sert le même rapport du soir, accepte les mêmes connexions et continue à vendre.
 */
const racine = pile().racine;
const scripts = join(racine, "infra/sauvegardes");
const outils = [
  "age",
  "age-keygen",
  "pg_dump",
  "pg_restore",
  "psql",
  "createdb",
  "dropdb",
  "bash",
  "sha256sum",
];
const outilsAbsents = outils.filter((o) => spawnSync("sh", ["-c", `command -v ${o}`]).status !== 0);

const H = 3_600_000;
let tmp: string;
let distants: string;
let envScripts: Record<string, string>;
let identite: string;
let baseRestauree: string;
let enfants: ChildProcess[] = [];
let patron: Session;
let jourRapport: string;
let rapportAvant: unknown;
let sauvegarde: { code: number; sortie: string; erreur: string; secondes: number };
let restauration: { code: number; sortie: string; erreur: string; secondes: number };
let empreintesAvant: Record<string, { n: number; md5: string }>;
const rapportRestauration: {
  duree_secondes?: number;
  respecte?: boolean;
  tables?: number;
  octets?: number;
} = {};

function lancer(
  script: string,
  args: string[],
): { code: number; sortie: string; erreur: string; secondes: number } {
  const t0 = Date.now();
  const r = spawnSync("bash", [join(scripts, script), ...args], {
    env: envScripts,
    encoding: "utf8",
  });
  return {
    code: r.status ?? -1,
    sortie: r.stdout,
    erreur: r.stderr,
    secondes: (Date.now() - t0) / 1000,
  };
}

/** Nombre de lignes et empreinte du contenu de chaque table, dans l'ordre : deux bases identiques donnent les mêmes. */
function empreintes(base: string): Record<string, { n: number; md5: string }> {
  const { serveurPg } = pile();
  const psql = (sql: string): string =>
    spawnSync("psql", [`${serveurPg}/${base}`, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
      encoding: "utf8",
    }).stdout.trim();
  const tables = psql(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
  ).split("\n");
  const sortie: Record<string, { n: number; md5: string }> = {};
  for (const t of tables) {
    const [n, md5] = psql(
      `select count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from "${t}" x`,
    ).split("|");
    sortie[t] = { n: Number(n), md5: md5 ?? "" };
  }
  return sortie;
}

beforeAll(async () => {
  if (outilsAbsents.length > 0) return;
  await fenetreSansBalayage();
  const { serveurPg, base } = pile();
  tmp = mkdtempSync(join(tmpdir(), "afrimove-recette-sauv-"));
  distants = join(tmp, "distants");
  const bin = join(tmp, "bin");
  mkdirSync(distants, { recursive: true });
  mkdirSync(bin, { recursive: true });
  // Pas de rclone sur cette machine : le faux rclone du dépôt (dossiers locaux) joue les deux fournisseurs.
  copyFileSync(join(scripts, "tests/stubs/rclone"), join(bin, "rclone"));
  chmodSync(join(bin, "rclone"), 0o755);
  // Clé age de la restauration (en vrai : deux clés tenues hors ligne par deux personnes).
  identite = join(tmp, "cle-age.txt");
  expect(spawnSync("age-keygen", ["-o", identite]).status).toBe(0);
  const publique = /public key: (age1\w+)/.exec(readFileSync(identite, "utf8"))?.[1];
  const url = new URL(serveurPg);
  baseRestauree = `${base}_restauree`;
  envScripts = {
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    HOME: tmp,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    SAUVEGARDES_ENV: join(tmp, "absent.env"),
    RACINE_DISTANTS: distants,
    FOURNISSEUR_A: "sauv-a:afrimove/recette",
    FOURNISSEUR_B: "sauv-b:afrimove/recette",
    AGE_DESTINATAIRES: publique ?? "",
    PG_COMMANDE: "",
    PG_UTILISATEUR: decodeURIComponent(url.username),
    PG_BASE: base,
    DOSSIER_TRAVAIL: join(tmp, "travail"),
    VERIF_TABLES: "personne,billet,session_caisse,journal_evenement,journal_audit,colis,depart",
  };
  mkdirSync(envScripts["DOSSIER_TRAVAIL"]!, { recursive: true });

  // Une petite journée dans la base (jour clos, il y a six jours) : ventes aux trois guichets, une caisse validée, et
  // le rapport du soir arrêté ce jour-là.
  patron = await connecter("patron");
  const local = new Date(Date.now() + H);
  const minuit = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 6) - H;
  jourRapport = new Date(minuit + H).toISOString().slice(0, 10);
  const depart = creerDepart({ heureDepart: new Date(minuit + 9 * H) });
  const noms = ["guichetier", "guichetier2", "guichetier3"] as const;
  let siege = 0;
  for (const [i, nom] of noms.entries()) {
    const session = await connecter(nom);
    const poste = new Poste(session, i + 1, minuit + 7 * H);
    for (let k = 0; k < 5; k++) {
      await poste.vendre({
        depart,
        siege: ++siege,
        nom: `Voyageur ${siege}`,
        mode: k % 2 === 0 ? "cash" : "momo",
      });
      await poste.horloge.avancer(10 * 60_000);
    }
  }
  rapportAvant = (
    await appeler("GET", "/patron/rapports/soir", {
      jeton: patron.jeton,
      requete: { jour: jourRapport },
    })
  ).corps;
});

afterAll(() => {
  for (const e of enfants) if (!e.killed) e.kill();
  if (baseRestauree) {
    const { serveurPg } = pile();
    spawnSync("psql", [
      `${serveurPg}/postgres`,
      "-q",
      "-c",
      `drop database if exists ${baseRestauree} with (force)`,
    ]);
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(outilsAbsents.length > 0)(
  "critère 5 : sauvegarde chiffrée, restaurée sur un serveur vide",
  () => {
    it("la sauvegarde complète est chiffrée (age) et déposée en double, chacune avec son empreinte", () => {
      // La base ne doit pas bouger pendant la sauvegarde (le serveur est au repos) : sinon on recommence une fois.
      for (let essai = 0; essai < 2; essai++) {
        empreintesAvant = empreintes(pile().base);
        sauvegarde = lancer("sauvegarder.sh", ["complet"]);
        if (sauvegarde.code !== 0) break;
        const apres = empreintes(pile().base);
        if (JSON.stringify(apres) === JSON.stringify(empreintesAvant)) break;
        rmSync(distants, { recursive: true, force: true });
        mkdirSync(distants, { recursive: true });
      }
      expect(sauvegarde.code, sauvegarde.erreur).toBe(0);
      for (const fournisseur of ["sauv-a", "sauv-b"]) {
        const dossier = join(distants, fournisseur, "afrimove/recette/complet");
        const fichiers = readdirSync(dossier);
        const dump = fichiers.find((f) => f.endsWith(".dump.age"));
        expect(dump, `${fournisseur} : ${fichiers.join(", ")}`).toBeDefined();
        expect(fichiers).toContain(`${dump}.sha256`);
        const contenu = readFileSync(join(dossier, dump!));
        // Un fichier age, illisible sans la clé privée : ni l'en-tête PostgreSQL ni un nom de table n'apparaissent.
        expect(contenu.subarray(0, 21).toString()).toBe("age-encryption.org/v1");
        expect(contenu.toString("latin1")).not.toContain("PGDMP");
        expect(contenu.toString("latin1")).not.toContain("session_caisse");
      }
      // Rien n'est resté en clair dans le dossier de travail du serveur.
      expect(
        readdirSync(envScripts["DOSSIER_TRAVAIL"]!).filter((f) => f.endsWith(".dump")),
      ).toEqual([]);
    });

    it("la restauration dans une base vide réussit, chronométrée, bien sous les 2 heures", () => {
      restauration = lancer("restaurer.sh", [
        "--identite",
        identite,
        "--base",
        baseRestauree,
        "--rapport",
        join(tmp, "rapport.json"),
      ]);
      expect(restauration.code, restauration.erreur).toBe(0);
      Object.assign(
        rapportRestauration,
        JSON.parse(readFileSync(join(tmp, "rapport.json"), "utf8")),
      );
      expect(rapportRestauration.respecte).toBe(true);
      expect(rapportRestauration.duree_secondes).toBeLessThan(7200);
      expect(rapportRestauration.tables).toBeGreaterThan(50);
      console.log(
        `\nCritère 5 : sauvegarde ${sauvegarde.secondes.toFixed(1)} s, restauration ${rapportRestauration.duree_secondes} s ` +
          `(${rapportRestauration.octets} octets chiffrés, ${rapportRestauration.tables} tables), objectif 7 200 s`,
      );
    });

    it("une deuxième restauration sur la même base est refusée : jamais d'écrasement silencieux", () => {
      const r = lancer("restaurer.sh", ["--identite", identite, "--base", baseRestauree]);
      expect(r.code).toBe(1);
      expect(r.erreur).toContain("n'est pas vide");
    });

    it("chaque table restaurée est identique à la source : même nombre de lignes, même empreinte du contenu", () => {
      const restaure = empreintes(baseRestauree);
      expect(Object.keys(restaure).sort()).toEqual(Object.keys(empreintesAvant).sort());
      const differentes = Object.keys(empreintesAvant).filter(
        (t) =>
          restaure[t]!.n !== empreintesAvant[t]!.n || restaure[t]!.md5 !== empreintesAvant[t]!.md5,
      );
      expect(differentes, `tables différentes : ${differentes.join(", ")}`).toEqual([]);
      // Et ce n'est pas une base presque vide : les billets, caisses, comptes et journaux y sont.
      expect(restaure["billet"]!.n).toBeGreaterThanOrEqual(15);
      expect(restaure["personne"]!.n).toBeGreaterThanOrEqual(7);
      expect(restaure["journal_evenement"]).toBeDefined();
    });

    it("une API démarrée sur la base restaurée sert le même rapport du soir, accepte les mêmes connexions et continue à vendre", async () => {
      const { serveurPg, dossierApi } = pile();
      const port = await portLibre([]);
      const journal = join(tmp, "api-restauree.log");
      const sortie = openSync(journal, "a");
      const api = spawn(process.execPath, [join(dossierApi, "dist/main.js")], {
        cwd: dossierApi,
        env: envApi({
          serveurPg,
          base: baseRestauree,
          portApi: port,
          origines: "http://127.0.0.1:1",
        }),
        stdio: ["ignore", sortie, sortie],
      });
      closeSync(sortie);
      enfants.push(api);
      const urlBase = `http://127.0.0.1:${port}`;
      await attendre(`${urlBase}/health`);

      // Le même rapport, arrêté à l'époque, avec le jeton émis par l'ancien serveur (même secret de signature).
      const rapport = await appeler("GET", "/patron/rapports/soir", {
        jeton: patron.jeton,
        requete: { jour: jourRapport },
        urlBase,
      });
      expect(rapport.statut).toBe(200);
      expect(rapport.corps).toEqual(rapportAvant);

      // Les PIN hachés sont lisibles : un guichetier se reconnecte sur le serveur restauré.
      const connexion = await appeler<{ accessToken: string }>("POST", "/auth/guichet/connexion", {
        urlBase,
        corps: {
          telephone: COMPTES.guichetier.telephone,
          pin: COMPTES.guichetier.secret,
          role: "guichetier",
        },
      });
      expect(connexion.statut).toBe(200);

      // Il vend : le serveur restauré accepte une vente du jour (rang 3, numéros encore libres aujourd'hui).
      const g3 = await connecter("guichetier3");
      const poste = new Poste(g3, 3);
      const depart = creerDepart({ heureDepart: new Date(Date.now() + 2 * H) }, baseRestauree);
      const client = creerClientHttp({
        urlBase,
        obtenirJeton: () => g3.jeton,
        relance: { max: 0 },
      });
      const evenement = poste.appareil.creerEvenement(agence.ECRITURES.billetVendu.evenement, {
        billetId: poste.appareil.nouvelId(),
        departId: depart.id,
        siege: 1,
        classe: "classique",
        prix: 8000,
        bagage: 0,
        passager: { nom: "Après sinistre", telephone: null, pieceQuatreDerniers: null },
        paiement: { mode: "cash", recu: 8000, rendu: 0, reference: null },
        codeBillet: "7788",
        sms: false,
      } as never);
      const vente = await client.executer(agence.ECRITURES.billetVendu.operation, evenement);
      expect(vente.accuse.statut).toBe("accepte");
      // La vente est dans la base restaurée, pas dans la base d'origine.
      expect(
        lire<{ n: number }>(`select count(*)::int as n from billet`, baseRestauree)[0]!.n,
      ).toBe(empreintesAvant["billet"]!.n + 1);
      expect(lire<{ n: number }>(`select count(*)::int as n from billet`)[0]!.n).toBe(
        empreintesAvant["billet"]!.n,
      );
    });

    it("la base seule ne suffit pas : avec un autre poivre, les PIN restaurés ne marchent plus (les secrets se sauvegardent à part)", async () => {
      const { serveurPg, dossierApi } = pile();
      const port = await portLibre([]);
      const sortie = openSync(join(tmp, "api-sans-secrets.log"), "a");
      const api = spawn(process.execPath, [join(dossierApi, "dist/main.js")], {
        cwd: dossierApi,
        env: envApi({
          serveurPg,
          base: baseRestauree,
          portApi: port,
          origines: "http://127.0.0.1:1",
          surcharges: { AUTH_PEPPER: "un-autre-poivre-0123456789abcdef" },
        }),
        stdio: ["ignore", sortie, sortie],
      });
      closeSync(sortie);
      enfants.push(api);
      const urlBase = `http://127.0.0.1:${port}`;
      await attendre(`${urlBase}/health`);
      const connexion = await appeler("POST", "/auth/guichet/connexion", {
        urlBase,
        corps: {
          telephone: COMPTES.guichetier.telephone,
          pin: COMPTES.guichetier.secret,
          role: "guichetier",
        },
      });
      expect(connexion.statut).toBe(401);
    });
  },
);

describe.runIf(outilsAbsents.length > 0)("critère 5 : outils manquants", () => {
  it("ne peut pas être vérifié ici", () => {
    throw new Error(`Outils absents de cette machine : ${outilsAbsents.join(", ")}`);
  });
});
