import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_SCRIPTS = resolve(ICI, "..");
const DOSSIER_FAUX = join(ICI, "stubs");

export function commandeDisponible(nom: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${nom}`], { encoding: "utf8" }).status === 0;
}

export type Env = Record<string, string | undefined>;

export interface Resultat {
  code: number;
  sortie: string;
  erreur: string;
}

/** Heure fixe des tests : dimanche 18 octobre 2026, 1 h UTC (= 2 h à Douala). */
export const MAINTENANT = "2026-10-18T01:00:00Z";

/**
 * Un bac à sable par test : faux fournisseurs (dossiers), faux rclone / age / curl / PostgreSQL sur le
 * PATH, dossier de travail à part. Les vrais scripts sont lancés tels quels, dans de vrais processus.
 */
export class BacASable {
  readonly racine = mkdtempSync(join(tmpdir(), "afrimove-sauv-"));
  readonly distants = join(this.racine, "distants");
  readonly travail = join(this.racine, "travail");
  readonly spool = join(this.racine, "spool");
  readonly etatPg = join(this.racine, "etat-pg");
  readonly journalFaux = join(this.racine, "journal-faux.log");
  readonly bin = join(this.racine, "bin");
  /** Variables d'environnement passées aux scripts ; un test peut les modifier avant de lancer. */
  env: Record<string, string>;

  constructor(options: { ageReel?: boolean } = {}) {
    mkdirSync(this.bin, { recursive: true });
    mkdirSync(this.distants, { recursive: true });
    mkdirSync(this.spool, { recursive: true });
    writeFileSync(this.journalFaux, "");
    for (const faux of ["rclone", "curl", "pgexec"]) this.poserFaux(faux);
    if (!options.ageReel) this.poserFaux("age");
    this.env = {
      PATH: `${this.bin}:${process.env.PATH ?? ""}`,
      HOME: this.racine,
      SAUVEGARDES_ENV: join(this.racine, "absent.env"),
      RACINE_DISTANTS: this.distants,
      JOURNAL_STUBS: this.journalFaux,
      ETAT_PGFAUX: this.etatPg,
      FOURNISSEUR_A: "sauv-a:prod",
      FOURNISSEUR_B: "sauv-b:prod",
      AGE_DESTINATAIRES: "age1cleaaaa age1clebbbb",
      PG_COMMANDE: join(this.bin, "pgexec"),
      DOSSIER_TRAVAIL: this.travail,
      SPOOL_WAL: this.spool,
      MAINTENANT,
    };
  }

  private poserFaux(nom: string) {
    const destination = join(this.bin, nom);
    writeFileSync(destination, readFileSync(join(DOSSIER_FAUX, nom)));
    chmodSync(destination, 0o755);
  }

  /** Variables de base + celles du test ; `undefined` retire la variable. */
  private fusionner(env: Env): Record<string, string> {
    const fusion: Record<string, string | undefined> = { ...this.env, ...env };
    for (const cle of Object.keys(fusion)) if (fusion[cle] === undefined) delete fusion[cle];
    return fusion as Record<string, string>;
  }

  /** Lance un script du dossier `infra/sauvegardes`. */
  lancer(script: string, args: string[] = [], env: Env = {}): Resultat {
    const r = spawnSync("bash", [join(DOSSIER_SCRIPTS, script), ...args], {
      env: this.fusionner(env),
      encoding: "utf8",
      cwd: this.racine,
    });
    return { code: r.status ?? -1, sortie: r.stdout, erreur: r.stderr };
  }

  /** Lance archiver-wal.sh avec sh (comme dans le conteneur Alpine). */
  lancerSh(script: string, args: string[], env: Env = {}): Resultat {
    const r = spawnSync("sh", [join(DOSSIER_SCRIPTS, script), ...args], {
      env: this.fusionner(env),
      encoding: "utf8",
      cwd: this.racine,
    });
    return { code: r.status ?? -1, sortie: r.stdout, erreur: r.stderr };
  }

  chemin(fournisseur: "a" | "b", ...suite: string[]): string {
    return join(this.distants, `sauv-${fournisseur}`, "prod", ...suite);
  }

  /** Fichiers d'un dossier d'un fournisseur (vide si le dossier n'existe pas). */
  fichiers(fournisseur: "a" | "b", dossier: string): string[] {
    const d = this.chemin(fournisseur, dossier);
    return existsSync(d) ? readdirSync(d).sort() : [];
  }

  /** Pose un fichier chez un fournisseur. */
  poser(fournisseur: "a" | "b", dossier: string, nom: string, contenu = "x"): void {
    const d = this.chemin(fournisseur, dossier);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, nom), contenu);
  }

  /** Pose une sauvegarde complète factice (données + empreinte) d'horodatage donné. */
  poserComplet(fournisseur: "a" | "b", horodatage: string): void {
    this.poser(fournisseur, "complet", `afrimove-${horodatage}.dump.age`, "chiffré");
    this.poser(fournisseur, "complet", `afrimove-${horodatage}.dump.age.sha256`, "empreinte");
  }

  journalDesFaux(): string {
    return readFileSync(this.journalFaux, "utf8");
  }

  /** Date d'un fichier du spool (comme le ferait PostgreSQL en l'écrivant à cette heure). */
  dater(fichier: string, iso: string): void {
    const t = new Date(iso);
    utimesSync(fichier, t, t);
  }

  existe(chemin: string): boolean {
    return existsSync(chemin);
  }

  taille(chemin: string): number {
    return statSync(chemin).size;
  }

  /** Écrit une fausse identité age qui correspond à la clé donnée (faux age uniquement). */
  identiteFausse(cle: string): string {
    const chemin = join(this.racine, `identite-${cle}.txt`);
    writeFileSync(chemin, `CLE-FAUSSE ${cle}\n`);
    return chemin;
  }

  nettoyer(): void {
    rmSync(this.racine, { recursive: true, force: true });
  }
}
