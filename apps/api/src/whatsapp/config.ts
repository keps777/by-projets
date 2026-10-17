import { MARQUEUR_VALEUR_DE_DEV } from "../socle/config/config";

/**
 * Configuration de la passerelle WhatsApp. Elle a son propre jeton (comme `CONFIG_SMS`) : tout vient
 * de variables d'environnement `WHATSAPP_*`, validées d'un coup, le démarrage échoue en listant
 * toutes les erreurs.
 */

export const CONFIG_WHATSAPP = Symbol("CONFIG_WHATSAPP");

export type SpecFournisseurWhatsApp =
  | { type: "simule" }
  | {
      type: "http";
      /** Racine de l'API, version comprise : `https://graph.facebook.com/v21.0`. */
      urlApi: string;
      /** Jeton d'accès (utilisateur système) de l'application Meta. */
      jeton: string;
      /** Identifiant du numéro d'envoi (« Phone number ID »). */
      numeroId: string;
      /** Identifiant du compte WhatsApp Business (« WABA ID »), pour lire les gabarits. */
      compteId: string;
      /** Secret de l'application : signe les appels du webhook (`x-hub-signature-256`). */
      secretApplication: string;
      /** Mot de passe de la vérification d'abonnement du webhook (GET). */
      jetonVerification: string;
    };

export interface ConfigWhatsApp {
  /** Code de langue des gabarits chez WhatsApp. */
  langue: string;
  /** Essais d'envoi au total (le premier compris) avant le repli par SMS. */
  tentativesMax: number;
  /** Attente avant le 2e essai ; elle double à chaque essai suivant. */
  reprisePremiereMs: number;
  /** Messages traités en parallèle. */
  concurrence: number;
  /** Intervalle de la file en mémoire ; 0 = pas de minuterie (les tests pilotent la file). */
  sondageMs: number;
  /** Durée maximale d'un appel à l'API. */
  delaiFournisseurMs: number;
  disjoncteur: { seuilEchecs: number; ouvertureMs: number };
  limites: {
    /** Messages qu'un compte peut demander en une heure (anti-abus des routes). */
    parDemandeurParHeure: number;
    /** Messages qu'un même numéro peut recevoir en une heure (hors rapport et réponses). */
    parDestinataireParHeure: number;
  };
  fournisseur: SpecFournisseurWhatsApp;
  /** Un message que WhatsApp ne remet pas est repris par SMS (si le canal de repli est branché). */
  secoursSms: boolean;
  /** Simulateur seulement : écrit le contenu des messages dans les journaux (jamais en production). */
  journaliserContenuSimule: boolean;
  rapport: {
    /** Heure de départ du rapport, heure de Douala, en minutes depuis minuit (21 h = 1260). */
    minutesDepart: number;
    /** Passé ce délai après le départ, un rapport non remis n'est plus envoyé. */
    validiteMs: number;
    /** Intervalle de la minuterie du planificateur ; 0 = aucune (les tests appellent `tick()`). */
    planificateurMs: number;
  };
  /** Durée d'observation du délai de réponse affiché (« répond en 2 min »). */
  fenetreDelaiReponseMs: number;
  production: boolean;
}

export class ConfigWhatsAppInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration WhatsApp invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigWhatsAppInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const JOUR_MS = 24 * 60 * 60_000;

export function chargerConfigWhatsApp(env: Env, enProduction = false): ConfigWhatsApp {
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
    erreurs.push(`${nom} : « true » ou « false »`);
    return defaut;
  };

  const langue = lire("WHATSAPP_LANGUE") ?? "fr";
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(langue)) {
    erreurs.push("WHATSAPP_LANGUE : code de langue WhatsApp (fr, en, fr_FR…)");
  }

  const typeFournisseur = lire("WHATSAPP_FOURNISSEUR") ?? "simule";
  let fournisseur: SpecFournisseurWhatsApp = { type: "simule" };
  if (typeFournisseur === "simule") {
    if (enProduction) erreurs.push("WHATSAPP_FOURNISSEUR=simule est interdit en production");
  } else if (typeFournisseur === "http") {
    const urlApi = lire("WHATSAPP_API_URL") ?? "";
    const jeton = lire("WHATSAPP_TOKEN") ?? "";
    const numeroId = lire("WHATSAPP_PHONE_ID") ?? "";
    const compteId = lire("WHATSAPP_WABA_ID") ?? "";
    const secretApplication = lire("WHATSAPP_APP_SECRET") ?? "";
    const jetonVerification = lire("WHATSAPP_VERIFY_TOKEN") ?? "";
    if (!/^https:\/\/[^\s/]+/.test(urlApi)) erreurs.push("WHATSAPP_API_URL : adresse https");
    if (jeton.length < 16) erreurs.push("WHATSAPP_TOKEN : 16 caractères au moins");
    if (!/^\d{5,20}$/.test(numeroId)) erreurs.push("WHATSAPP_PHONE_ID : identifiant numérique");
    if (!/^\d{5,20}$/.test(compteId)) erreurs.push("WHATSAPP_WABA_ID : identifiant numérique");
    if (secretApplication.length < 16) {
      erreurs.push("WHATSAPP_APP_SECRET : 16 caractères au moins");
    }
    if (jetonVerification.length < 16) {
      erreurs.push("WHATSAPP_VERIFY_TOKEN : 16 caractères au moins");
    }
    if (enProduction) {
      for (const [n, v] of [
        ["WHATSAPP_TOKEN", jeton],
        ["WHATSAPP_APP_SECRET", secretApplication],
        ["WHATSAPP_VERIFY_TOKEN", jetonVerification],
      ] as const) {
        if (v.toLowerCase().includes(MARQUEUR_VALEUR_DE_DEV)) {
          erreurs.push(`${n} porte une valeur d'exemple : interdit en production`);
        }
      }
    }
    fournisseur = {
      type: "http",
      urlApi,
      jeton,
      numeroId,
      compteId,
      secretApplication,
      jetonVerification,
    };
  } else {
    erreurs.push("WHATSAPP_FOURNISSEUR : « simule » ou « http »");
  }

  const journaliserContenuSimule = booleen("WHATSAPP_MOCK_LOG_CONTENU", false);
  if (enProduction && journaliserContenuSimule) {
    erreurs.push("WHATSAPP_MOCK_LOG_CONTENU est interdit en production");
  }

  const heure = lire("WHATSAPP_RAPPORT_HEURE") ?? "21:00";
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(heure);
  if (!m) erreurs.push("WHATSAPP_RAPPORT_HEURE : HH:MM (heure de Douala)");

  const config: ConfigWhatsApp = {
    langue,
    tentativesMax: entier("WHATSAPP_TENTATIVES_MAX", 4, 1, 12),
    reprisePremiereMs: entier("WHATSAPP_REPRISE_MS", 5000, 100, 600_000),
    concurrence: entier("WHATSAPP_CONCURRENCE", 5, 1, 100),
    sondageMs: entier("WHATSAPP_SONDAGE_MS", 250, 0, 60_000),
    delaiFournisseurMs: entier("WHATSAPP_DELAI_FOURNISSEUR_MS", 10_000, 500, 60_000),
    disjoncteur: {
      seuilEchecs: entier("WHATSAPP_DISJONCTEUR_SEUIL", 3, 1, 100),
      ouvertureMs: entier("WHATSAPP_DISJONCTEUR_OUVERTURE_MS", 30_000, 1000, 3_600_000),
    },
    limites: {
      parDemandeurParHeure: entier("WHATSAPP_LIMITE_DEMANDEUR_HEURE", 60, 1, 10_000),
      parDestinataireParHeure: entier("WHATSAPP_LIMITE_DESTINATAIRE_HEURE", 10, 1, 1000),
    },
    fournisseur,
    secoursSms: booleen("WHATSAPP_SECOURS_SMS", true),
    journaliserContenuSimule,
    rapport: {
      minutesDepart: m ? Number(m[1]) * 60 + Number(m[2]) : 21 * 60,
      validiteMs: entier("WHATSAPP_RAPPORT_VALIDITE_H", 6, 1, 23) * 60 * 60_000,
      planificateurMs: entier("WHATSAPP_PLANIFICATEUR_MS", 30_000, 0, 600_000),
    },
    fenetreDelaiReponseMs: entier("WHATSAPP_DELAI_REPONSE_JOURS", 7, 1, 90) * JOUR_MS,
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigWhatsAppInvalide(erreurs);
  return config;
}
