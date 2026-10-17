import { MARQUEUR_VALEUR_DE_DEV } from "../socle/config/config";

/**
 * Configuration de la passerelle SMS. Elle a son propre jeton : `AppConfig` (socle) ne porte que
 * `sms.driver = "mock"`. Tout vient de variables d'environnement `SMS_*`, validées d'un coup.
 */

export const CONFIG_SMS = Symbol("CONFIG_SMS");

export type SpecFournisseur =
  | { type: "simule"; nom: string }
  | { type: "http"; nom: string; urlApi: string; cleApi: string; secretWebhook: string };

export interface ConfigSms {
  /** Expéditeur affiché sur le téléphone (alphanumérique, 11 caractères au plus). */
  expediteur: string;
  /** Prix d'un morceau de SMS : « 12 F / SMS » (AM-166). */
  coutParSegmentFcfa: number;
  /** Objectif de délai médian entre la demande et l'acceptation par le fournisseur. */
  objectifDelaiMedianMs: number;
  /** Essais d'envoi au total (le premier compris). */
  tentativesMax: number;
  /** Attente avant le 2e essai ; elle double à chaque essai suivant (3 s, 6 s, 12 s…). */
  reprisePremiereMs: number;
  /** Messages traités en parallèle. */
  concurrence: number;
  /** Intervalle de la file en mémoire ; 0 = pas de minuterie (les tests pilotent la file). */
  sondageMs: number;
  /** Durée maximale d'un appel au fournisseur. */
  delaiFournisseurMs: number;
  disjoncteur: { seuilEchecs: number; ouvertureMs: number };
  limites: {
    /** SMS qu'un compte peut demander en une heure (anti-abus des routes). */
    parDemandeurParHeure: number;
    /** SMS qu'un même numéro peut recevoir en une heure, tous types confondus. */
    parDestinataireParHeure: number;
    /** « Renvoyer » un billet déjà envoyé : combien de fois au plus. */
    renvoisBilletMax: number;
  };
  /** Noms d'hôtes autorisés dans les liens des SMS (vide = tout hôte en https). */
  hotesLiens: readonly string[];
  fournisseurs: { principal: SpecFournisseur; secours: SpecFournisseur | null };
  /** Simulateur seulement : écrit le texte des SMS dans les journaux (jamais en production). */
  journaliserContenuSimule: boolean;
  production: boolean;
}

export class ConfigSmsInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration SMS invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigSmsInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export function chargerConfigSms(env: Env, enProduction = false): ConfigSms {
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

  const expediteur = lire("SMS_EXPEDITEUR") ?? "AfriMove";
  if (!/^(?=.*[A-Za-z])[A-Za-z0-9]{1,11}$/.test(expediteur)) {
    erreurs.push("SMS_EXPEDITEUR : 1 à 11 lettres ou chiffres, sans espace, au moins une lettre");
  }

  const fournisseur = (prefixe: string, nomParDefaut: string, defaut: string | null) => {
    const type = lire(`${prefixe}FOURNISSEUR`) ?? defaut ?? "aucun";
    const nom =
      lire(`${prefixe}FOURNISSEUR_NOM`) ??
      (type === "simule" && prefixe === "SMS_" ? "simule" : nomParDefaut);
    if (!/^[a-z][a-z0-9_-]{0,23}$/.test(nom)) {
      erreurs.push(
        `${prefixe}FOURNISSEUR_NOM : minuscules, chiffres, _ ou -, 24 caractères au plus`,
      );
    }
    if (type === "aucun") return null;
    if (type === "simule") {
      if (enProduction) erreurs.push(`${prefixe}FOURNISSEUR=simule est interdit en production`);
      return { type: "simule", nom } satisfies SpecFournisseur;
    }
    if (type !== "http") {
      erreurs.push(`${prefixe}FOURNISSEUR : « simule », « http » ou « aucun »`);
      return null;
    }
    const urlApi = lire(`${prefixe}API_URL`) ?? "";
    const cleApi = lire(`${prefixe}API_KEY`) ?? "";
    const secretWebhook = lire(`${prefixe}WEBHOOK_SECRET`) ?? "";
    if (!/^https:\/\/[^\s/]+/.test(urlApi)) erreurs.push(`${prefixe}API_URL : adresse https`);
    if (cleApi.length < 16) erreurs.push(`${prefixe}API_KEY : 16 caractères au moins`);
    if (secretWebhook.length < 32)
      erreurs.push(`${prefixe}WEBHOOK_SECRET : 32 caractères au moins`);
    if (enProduction) {
      for (const [n, v] of [
        [`${prefixe}API_KEY`, cleApi],
        [`${prefixe}WEBHOOK_SECRET`, secretWebhook],
      ] as const) {
        if (v.toLowerCase().includes(MARQUEUR_VALEUR_DE_DEV)) {
          erreurs.push(`${n} porte une valeur d'exemple : interdit en production`);
        }
      }
    }
    return { type: "http", nom, urlApi, cleApi, secretWebhook } satisfies SpecFournisseur;
  };

  const principal = fournisseur("SMS_", "agregateur", "simule") ?? {
    type: "simule",
    nom: "simule",
  };
  const secours = fournisseur("SMS_SECOURS_", "secours", null);
  if (secours && secours.nom === principal.nom) {
    erreurs.push("SMS_SECOURS_FOURNISSEUR_NOM doit différer du nom du fournisseur principal");
  }

  const journaliserContenuSimule = ["true", "1", "oui"].includes(
    (lire("SMS_MOCK_LOG_CODES") ?? "false").toLowerCase(),
  );
  if (enProduction && journaliserContenuSimule) {
    erreurs.push("SMS_MOCK_LOG_CODES est interdit en production");
  }

  const hotesLiens = (lire("SMS_HOTES_LIENS") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (hotesLiens.some((h) => !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h))) {
    erreurs.push("SMS_HOTES_LIENS : noms d'hôtes séparés par des virgules (sans https://)");
  }
  if (enProduction && hotesLiens.length === 0) {
    erreurs.push(
      "SMS_HOTES_LIENS est obligatoire en production (domaines des liens de billet et d'application)",
    );
  }

  const config: ConfigSms = {
    expediteur,
    coutParSegmentFcfa: entier("SMS_COUT_SEGMENT_FCFA", 12, 0, 1000),
    objectifDelaiMedianMs: entier("SMS_OBJECTIF_DELAI_MEDIAN_MS", 5000, 100, 600_000),
    tentativesMax: entier("SMS_TENTATIVES_MAX", 6, 1, 12),
    reprisePremiereMs: entier("SMS_REPRISE_MS", 3000, 100, 600_000),
    concurrence: entier("SMS_CONCURRENCE", 10, 1, 100),
    sondageMs: entier("SMS_SONDAGE_MS", 250, 0, 60_000),
    delaiFournisseurMs: entier("SMS_DELAI_FOURNISSEUR_MS", 8000, 500, 60_000),
    disjoncteur: {
      seuilEchecs: entier("SMS_DISJONCTEUR_SEUIL", 3, 1, 100),
      ouvertureMs: entier("SMS_DISJONCTEUR_OUVERTURE_MS", 30_000, 1000, 3_600_000),
    },
    limites: {
      parDemandeurParHeure: entier("SMS_LIMITE_DEMANDEUR_HEURE", 60, 1, 10_000),
      parDestinataireParHeure: entier("SMS_LIMITE_DESTINATAIRE_HEURE", 10, 1, 1000),
      renvoisBilletMax: entier("SMS_RENVOIS_BILLET_MAX", 2, 0, 20),
    },
    hotesLiens,
    fournisseurs: { principal, secours },
    journaliserContenuSimule,
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigSmsInvalide(erreurs);
  return config;
}
