import { MARQUEUR_VALEUR_DE_DEV } from "../socle/config/config";

/**
 * Configuration du service USSD. Elle a son propre jeton (comme `CONFIG_SMS`) : tout vient de
 * variables d'environnement `USSD_*`, validées d'un coup, le démarrage échoue en listant toutes les
 * erreurs.
 */

export const CONFIG_USSD = Symbol("CONFIG_USSD");

export const OPERATEURS_USSD = ["mtn", "orange"] as const;
export type OperateurUssd = (typeof OPERATEURS_USSD)[number];

export interface ConfigUssd {
  /** Code composé par le voyageur (affiché dans l'aperçu « Sans internet »). */
  codeService: string;
  /** Durée de vie d'une session sans réponse du voyageur. Les opérateurs coupent après 30 à 180 s. */
  sessionTtlMs: number;
  /** Trajet proposé quand le voyageur n'a encore jamais voyagé : codes de ville (`DLA`, `YDE`). */
  trajetDefaut: { depart: string; arrivee: string };
  /** Départs listés sur l'écran (3, comme la conversation WhatsApp). */
  nombreDeparts: number;
  /**
   * Code promotionnel de type `frais_offerts` qui retire les 250 F de frais de service : la planche
   * promet « zéro frais en plus », le prix payé est celui qui est affiché.
   */
  codeSansFrais: string;
  /** Début de l'adresse du billet dans le SMS ; l'identifiant du billet s'y ajoute. */
  baseLienBillet: string;
  /** Intervalle du suivi des achats (SMS du billet, réservations abandonnées) ; 0 = aucune minuterie. */
  balayageMs: number;
  /** Une réservation sans paiement demandé est libérée passé ce délai (au moins la durée de session). */
  abandonApresMs: number;
  /** Réponses invalides tolérées sur un même écran avant de fermer la session. */
  erreursMax: number;
  /** Jeton de chaque connecteur ; absent : le connecteur est inactif (404). */
  jetons: Readonly<Record<OperateurUssd, string | null>>;
  production: boolean;
}

export class ConfigUssdInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration USSD invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigUssdInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export const BASE_LIEN_BILLET_DEFAUT = "https://afrimove.app/b/";

export function chargerConfigUssd(env: Env, enProduction = false): ConfigUssd {
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

  const codeService = lire("USSD_CODE_SERVICE") ?? "*123#";
  if (!/^\*\d{2,6}#$/.test(codeService)) erreurs.push("USSD_CODE_SERVICE : forme *123#");

  const trajet = lire("USSD_TRAJET_DEFAUT") ?? "DLA>YDE";
  const t = /^([A-Z]{3})>([A-Z]{3})$/.exec(trajet);
  if (!t) erreurs.push("USSD_TRAJET_DEFAUT : deux codes de ville, par exemple DLA>YDE");
  else if (t[1] === t[2]) erreurs.push("USSD_TRAJET_DEFAUT : départ et arrivée doivent différer");

  const codeSansFrais = lire("USSD_CODE_SANS_FRAIS") ?? "USSD";
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(codeSansFrais)) {
    erreurs.push("USSD_CODE_SANS_FRAIS : 2 à 20 lettres ou chiffres");
  }

  const baseLienBillet = lire("USSD_BASE_LIEN_BILLET") ?? BASE_LIEN_BILLET_DEFAUT;
  if (
    !/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?\/$/.test(baseLienBillet) ||
    baseLienBillet.length > 40
  ) {
    erreurs.push("USSD_BASE_LIEN_BILLET : adresse https terminée par « / », 40 caractères au plus");
  }

  const sessionTtlMs = entier("USSD_SESSION_TTL_S", 120, 20, 600) * 1000;
  const jetons = { mtn: lire("USSD_MTN_JETON") ?? null, orange: lire("USSD_ORANGE_JETON") ?? null };
  for (const op of OPERATEURS_USSD) {
    const jeton = jetons[op];
    if (jeton === null) continue;
    const nom = `USSD_${op.toUpperCase()}_JETON`;
    if (jeton.length < 32) erreurs.push(`${nom} : 32 caractères au moins`);
    if (enProduction && jeton.toLowerCase().includes(MARQUEUR_VALEUR_DE_DEV)) {
      erreurs.push(`${nom} porte une valeur d'exemple : interdit en production`);
    }
  }
  if (enProduction && jetons.mtn === null && jetons.orange === null) {
    erreurs.push("USSD_MTN_JETON ou USSD_ORANGE_JETON est obligatoire en production");
  }
  if (jetons.mtn !== null && jetons.mtn === jetons.orange) {
    erreurs.push("USSD_MTN_JETON et USSD_ORANGE_JETON doivent différer");
  }

  const config: ConfigUssd = {
    codeService,
    sessionTtlMs,
    trajetDefaut: t ? { depart: t[1]!, arrivee: t[2]! } : { depart: "DLA", arrivee: "YDE" },
    nombreDeparts: entier("USSD_NOMBRE_DEPARTS", 3, 1, 5),
    codeSansFrais,
    baseLienBillet,
    balayageMs: entier("USSD_BALAYAGE_MS", 10_000, 0, 600_000),
    abandonApresMs: sessionTtlMs + entier("USSD_ABANDON_MARGE_S", 60, 0, 600) * 1000,
    erreursMax: entier("USSD_ERREURS_MAX", 3, 1, 10),
    jetons,
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigUssdInvalide(erreurs);
  return config;
}
