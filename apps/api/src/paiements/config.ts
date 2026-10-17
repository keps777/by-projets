import { MARQUEUR_VALEUR_DE_DEV } from "../socle/config/config";
import type { EtatTransaction } from "./agregateur";

/**
 * Configuration des paiements. Tout vient de variables d'environnement `PAIEMENTS_*`, validées d'un
 * coup (toutes les erreurs sont signalées ensemble).
 */

export const CONFIG_PAIEMENTS = Symbol("CONFIG_PAIEMENTS");

export type SpecAgregateur =
  | { type: "aucun" }
  | { type: "simule"; nom: string; issue: EtatTransaction }
  | { type: "http"; nom: string; urlApi: string; cleApi: string; secretWebhook: string };

export interface ConfigPaiements {
  agregateur: SpecAgregateur;
  /** Durée maximale d'un appel à l'agrégateur. */
  delaiAgregateurMs: number;
  /** Attente de la confirmation d'un paiement mobile (push MoMo, Orange Money). */
  delaiMobileMs: number;
  /** Attente d'une carte (authentification 3-D Secure comprise). */
  delaiCarteMs: number;
  /** Un paiement en attente depuis plus de ce délai est interrogé auprès de l'agrégateur (webhook perdu). */
  consultationApresMs: number;
  /** Intervalle du balayage ; 0 = pas de minuterie (les tests pilotent le balayage). */
  balayageMs: number;
  disjoncteur: { seuilEchecs: number; ouvertureMs: number };
  /** Essais d'un remboursement, le premier compris ; l'attente double à chaque essai. */
  remboursementEssaisMax: number;
  remboursementReprisePremiereMs: number;
  /** Mode dégradé au démarrage (le réglage enregistré par AfriMove prend ensuite le relais). */
  modeDegradeInitial: boolean;
  /** Compte d'AfriMove chez l'agrégateur : reçoit les frais, jamais le prix du billet. */
  compteAfrimove: string;
  /** Début des adresses envoyées à un proche (le jeton s'ajoute à la fin). */
  urlLienProche: string;
  /** Branche l'écoute des avis de la billetterie (remboursement d'un billet annulé). */
  abonnerAvis: boolean;
  production: boolean;
}

export class ConfigPaiementsInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration des paiements invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigPaiementsInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export function chargerConfigPaiements(env: Env, enProduction = false): ConfigPaiements {
  const erreurs: string[] = [];
  const lire = (nom: string): string | undefined => {
    const v = env[nom]?.trim();
    return v === undefined || v === "" ? undefined : v;
  };
  const entier = (nom: string, defaut: number, min: number, max: number): number => {
    const v = lire(nom);
    if (v === undefined) return defaut;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      erreurs.push(`${nom} doit être un entier entre ${min} et ${max}`);
      return defaut;
    }
    return n;
  };
  const booleen = (nom: string, defaut: boolean): boolean => {
    const v = lire(nom)?.toLowerCase();
    if (v === undefined) return defaut;
    if (["true", "1", "oui"].includes(v)) return true;
    if (["false", "0", "non"].includes(v)) return false;
    erreurs.push(`${nom} : true ou false`);
    return defaut;
  };

  // Sans réglage, la production n'a pas d'agrégateur (mode dégradé permanent) plutôt qu'un simulateur.
  const type = lire("PAIEMENTS_FOURNISSEUR") ?? (enProduction ? "aucun" : "simule");
  const nom = lire("PAIEMENTS_FOURNISSEUR_NOM") ?? (type === "simule" ? "simule" : "agregateur");
  if (!/^[a-z][a-z0-9_-]{0,23}$/.test(nom)) {
    erreurs.push("PAIEMENTS_FOURNISSEUR_NOM : minuscules, chiffres, _ ou -, 24 caractères au plus");
  }
  let agregateur: SpecAgregateur = { type: "aucun" };
  if (type === "simule") {
    if (enProduction) erreurs.push("PAIEMENTS_FOURNISSEUR=simule est interdit en production");
    const issue = lire("PAIEMENTS_SIMULE_ISSUE") ?? "reussi";
    if (!["reussi", "echoue", "en_attente"].includes(issue)) {
      erreurs.push("PAIEMENTS_SIMULE_ISSUE : reussi, echoue ou en_attente");
    }
    agregateur = { type: "simule", nom, issue: issue as EtatTransaction };
  } else if (type === "http") {
    const urlApi = lire("PAIEMENTS_API_URL") ?? "";
    const cleApi = lire("PAIEMENTS_API_KEY") ?? "";
    const secretWebhook = lire("PAIEMENTS_WEBHOOK_SECRET") ?? "";
    if (!/^https:\/\/[^\s/]+/.test(urlApi)) erreurs.push("PAIEMENTS_API_URL : adresse https");
    if (cleApi.length < 16) erreurs.push("PAIEMENTS_API_KEY : 16 caractères au moins");
    if (secretWebhook.length < 32) {
      erreurs.push("PAIEMENTS_WEBHOOK_SECRET : 32 caractères au moins");
    }
    if (enProduction) {
      for (const [n, v] of [
        ["PAIEMENTS_API_KEY", cleApi],
        ["PAIEMENTS_WEBHOOK_SECRET", secretWebhook],
      ] as const) {
        if (v.toLowerCase().includes(MARQUEUR_VALEUR_DE_DEV)) {
          erreurs.push(`${n} porte une valeur d'exemple : interdit en production`);
        }
      }
    }
    agregateur = { type: "http", nom, urlApi, cleApi, secretWebhook };
  } else if (type !== "aucun") {
    erreurs.push("PAIEMENTS_FOURNISSEUR : « simule », « http » ou « aucun »");
  }

  const compteAfrimove = lire("PAIEMENTS_COMPTE_AFRIMOVE") ?? "afrimove";
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(compteAfrimove)) {
    erreurs.push("PAIEMENTS_COMPTE_AFRIMOVE : 64 caractères au plus (lettres, chiffres, _ . : -)");
  }
  const urlLienProche = (lire("PAIEMENTS_URL_LIEN_PROCHE") ?? "https://afrimove.app/payer").replace(
    /\/+$/,
    "",
  );
  if (!/^https:\/\/[^\s/]+/.test(urlLienProche)) {
    erreurs.push("PAIEMENTS_URL_LIEN_PROCHE : adresse https");
  }
  if (enProduction && lire("PAIEMENTS_URL_LIEN_PROCHE") === undefined) {
    erreurs.push("PAIEMENTS_URL_LIEN_PROCHE est obligatoire en production");
  }

  const config: ConfigPaiements = {
    agregateur,
    delaiAgregateurMs: entier("PAIEMENTS_DELAI_AGREGATEUR_MS", 10_000, 500, 60_000),
    delaiMobileMs: entier("PAIEMENTS_DELAI_MOBILE_MS", 180_000, 10_000, 3_600_000),
    delaiCarteMs: entier("PAIEMENTS_DELAI_CARTE_MS", 600_000, 10_000, 3_600_000),
    consultationApresMs: entier("PAIEMENTS_CONSULTATION_APRES_MS", 20_000, 0, 3_600_000),
    balayageMs: entier("PAIEMENTS_BALAYAGE_MS", 30_000, 0, 3_600_000),
    disjoncteur: {
      seuilEchecs: entier("PAIEMENTS_DISJONCTEUR_SEUIL", 3, 1, 100),
      ouvertureMs: entier("PAIEMENTS_DISJONCTEUR_OUVERTURE_MS", 30_000, 1000, 3_600_000),
    },
    remboursementEssaisMax: entier("PAIEMENTS_REMBOURSEMENT_ESSAIS_MAX", 8, 1, 30),
    remboursementReprisePremiereMs: entier(
      "PAIEMENTS_REMBOURSEMENT_REPRISE_MS",
      30_000,
      100,
      3_600_000,
    ),
    modeDegradeInitial: booleen("PAIEMENTS_MODE_DEGRADE", false),
    compteAfrimove,
    urlLienProche,
    abonnerAvis: booleen("PAIEMENTS_ABONNER_AVIS", true),
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigPaiementsInvalide(erreurs);
  return config;
}
