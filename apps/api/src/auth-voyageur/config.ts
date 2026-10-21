import { ConfigAuthVoyageurInvalide } from "./erreurs";

/**
 * Configuration de la connexion du voyageur (AM-023). Tout vient de variables d'environnement
 * `AUTH_VOYAGEUR_*`, validées d'un coup ; les valeurs par défaut sont celles du ticket.
 */

export const CONFIG_AUTH_VOYAGEUR = Symbol("CONFIG_AUTH_VOYAGEUR");

/** Le contrat n'accepte que des codes de 4 chiffres (`SchemaVerificationCode`). */
export const LONGUEUR_CODE = 4;

export interface ConfigAuthVoyageur {
  /** Durée de validité d'un code (5 min). */
  ttlCodeMs: number;
  /** Délai minimal entre deux envois pour un même numéro (40 s : « renvoyer dans 0:40 »). */
  intervalleEnvoiMs: number;
  /** Envois permis à un numéro sur la fenêtre (anti-abus : un SMS coûte 12 F). */
  envoisParFenetre: number;
  fenetreEnvoisMs: number;
  /** Mauvais codes permis (tous codes confondus) avant le blocage du numéro (5 essais). */
  essaisMax: number;
  /** Au-delà de cette durée sans échec, le compteur d'essais repart de zéro. */
  fenetreEchecsMs: number;
  /** Premier blocage ; il double à chaque blocage successif, jusqu'au plafond. */
  blocageBaseMs: number;
  blocageMaxMs: number;
  /** Domaine de la dernière ligne du SMS (`@<domaine> #<code>`) : l'origine de l'application web. */
  domaineWebOtp: string;
  /** Indicatifs qui peuvent recevoir un code (un SMS vers l'étranger coûte cher : fraude au SMS). */
  indicatifsAutorises: readonly string[];
  production: boolean;
}

const DOMAINE_PAR_DEFAUT = "afrimove.app";
const HOTE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function chargerConfigAuthVoyageur(
  env: Readonly<Record<string, string | undefined>> = process.env,
  production = false,
): ConfigAuthVoyageur {
  const erreurs: string[] = [];
  const lire = (nom: string): string | undefined => {
    const v = env[nom]?.trim();
    return v === undefined || v === "" ? undefined : v;
  };
  const entier = (nom: string, defaut: number, min: number, max: number): number => {
    const brut = lire(nom);
    if (brut === undefined) return defaut;
    const n = Number(brut);
    if (!/^\d+$/.test(brut) || n < min || n > max) {
      erreurs.push(`${nom} : entier entre ${min} et ${max} attendu`);
      return defaut;
    }
    return n;
  };

  const ttlCodeMs = entier("AUTH_VOYAGEUR_CODE_TTL_S", 300, 60, 900) * 1000;
  const intervalleEnvoiMs = entier("AUTH_VOYAGEUR_RENVOI_S", 40, 10, 300) * 1000;
  const envoisParFenetre = entier("AUTH_VOYAGEUR_ENVOIS_PAR_HEURE", 5, 1, 20);
  const essaisMax = entier("AUTH_VOYAGEUR_ESSAIS_MAX", 5, 1, 10);
  const blocageBaseMs = entier("AUTH_VOYAGEUR_BLOCAGE_MIN", 15, 1, 24 * 60) * 60_000;

  let domaineWebOtp = (lire("AUTH_VOYAGEUR_WEBOTP_DOMAINE") ?? "").toLowerCase();
  if (domaineWebOtp === "") {
    if (production) {
      erreurs.push(
        "AUTH_VOYAGEUR_WEBOTP_DOMAINE est obligatoire en production (l'hôte de l'application web, ex. app.exemple.cm)",
      );
    }
    domaineWebOtp = DOMAINE_PAR_DEFAUT;
  } else if (!HOTE.test(domaineWebOtp)) {
    erreurs.push(
      "AUTH_VOYAGEUR_WEBOTP_DOMAINE : un nom d'hôte seul est attendu (sans https://, sans chemin, sans port)",
    );
  }

  const indicatifs = (lire("AUTH_VOYAGEUR_INDICATIFS") ?? "+237")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  if (indicatifs.length === 0 || indicatifs.some((i) => !/^\+[1-9]\d{0,3}$/.test(i))) {
    erreurs.push("AUTH_VOYAGEUR_INDICATIFS : liste d'indicatifs séparés par des virgules (+237)");
  }

  if (erreurs.length > 0) throw new ConfigAuthVoyageurInvalide(erreurs);
  return {
    ttlCodeMs,
    intervalleEnvoiMs,
    envoisParFenetre,
    fenetreEnvoisMs: 60 * 60_000,
    essaisMax,
    fenetreEchecsMs: 60 * 60_000,
    blocageBaseMs,
    blocageMaxMs: 24 * 60 * 60_000,
    domaineWebOtp,
    indicatifsAutorises: indicatifs,
    production,
  };
}
