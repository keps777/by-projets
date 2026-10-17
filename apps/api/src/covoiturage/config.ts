/**
 * Configuration du covoiturage. Tout vient de variables d'environnement `COVOITURAGE_*`, validées
 * d'un coup (toutes les erreurs sont signalées ensemble).
 */

export const CONFIG_COVOITURAGE = Symbol("CONFIG_COVOITURAGE");

/**
 * Identifiant de la « compagnie » qui reçoit l'argent d'un covoiturage chez l'agrégateur : un compte
 * de séquestre d'AfriMove, vidé vers le conducteur à l'arrivée. Ce n'est la compagnie de personne ;
 * aucun guichetier ne peut donc encaisser une réservation de covoiturage (les routes de la gare
 * comparent la compagnie de la commande à celle du guichetier).
 */
export const COMPAGNIE_SEQUESTRE_DEFAUT = "00000000-0000-4000-8000-0000000c0707";

export interface ConfigCovoiturage {
  /** Intervalle du balayage ; 0 = pas de minuterie (les tests pilotent le balayage). */
  balayageMs: number;
  /** Le conducteur est payé au plus tard cette durée après l'arrivée prévue. */
  liberationApresArriveeMin: number;
  /** Annulation par le passager sans retenue jusqu'à cette durée avant le départ. */
  annulationGratuiteAvantMin: number;
  /** Part du prix gardée par le conducteur quand le passager annule plus tard (0 à 100). */
  retenueTardivePct: number;
  /** On ne réserve plus, et on ne publie plus, à moins de cette durée du départ. */
  fermetureAvantDepartMin: number;
  /** Durée pendant laquelle les places d'une réservation sont retenues pour le paiement. */
  retenueMinutes: number;
  /** On ne publie pas plus loin que ce nombre de jours. */
  horizonJours: number;
  /** Prix maximal d'une place quand le référentiel ne connaît pas le trajet. */
  prixMaxInconnuFcfa: number;
  /** Compagnie de séquestre vue par les paiements (voir `COMPAGNIE_SEQUESTRE_DEFAUT`). */
  compagnieSequestreId: string;
  /** Compte de séquestre chez l'agrégateur : s'il est donné, il est enregistré au démarrage. */
  compteSequestre: string | null;
  /** Essais d'un versement, le premier compris ; l'attente double à chaque essai. */
  versementEssaisMax: number;
  versementReprisePremiereMs: number;
  /** Branche les réservations de covoiturage sur les paiements au démarrage. */
  abonnerPaiements: boolean;
  production: boolean;
}

export class ConfigCovoiturageInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration du covoiturage invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigCovoiturageInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export function chargerConfigCovoiturage(env: Env, enProduction = false): ConfigCovoiturage {
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

  const compagnieSequestreId = lire("COVOITURAGE_COMPAGNIE_ID") ?? COMPAGNIE_SEQUESTRE_DEFAUT;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      compagnieSequestreId,
    )
  ) {
    erreurs.push("COVOITURAGE_COMPAGNIE_ID : UUID attendu");
  }
  const compteSequestre = lire("COVOITURAGE_COMPTE_SEQUESTRE") ?? null;
  if (compteSequestre !== null && !/^[A-Za-z0-9_.:-]{1,64}$/.test(compteSequestre)) {
    erreurs.push(
      "COVOITURAGE_COMPTE_SEQUESTRE : 64 caractères au plus (lettres, chiffres, _ . : -)",
    );
  }

  const config: ConfigCovoiturage = {
    balayageMs: entier("COVOITURAGE_BALAYAGE_MS", 60_000, 0, 3_600_000),
    liberationApresArriveeMin: entier("COVOITURAGE_LIBERATION_APRES_MIN", 120, 0, 24 * 60),
    annulationGratuiteAvantMin: entier("COVOITURAGE_ANNULATION_GRATUITE_MIN", 120, 0, 7 * 24 * 60),
    retenueTardivePct: entier("COVOITURAGE_RETENUE_TARDIVE_PCT", 50, 0, 100),
    fermetureAvantDepartMin: entier("COVOITURAGE_FERMETURE_MIN", 30, 0, 24 * 60),
    retenueMinutes: entier("COVOITURAGE_RETENUE_MIN", 15, 1, 120),
    horizonJours: entier("COVOITURAGE_HORIZON_JOURS", 60, 1, 365),
    prixMaxInconnuFcfa: entier("COVOITURAGE_PRIX_MAX_FCFA", 20_000, 100, 1_000_000),
    compagnieSequestreId,
    compteSequestre,
    versementEssaisMax: entier("COVOITURAGE_VERSEMENT_ESSAIS_MAX", 8, 1, 30),
    versementReprisePremiereMs: entier("COVOITURAGE_VERSEMENT_REPRISE_MS", 60_000, 100, 3_600_000),
    abonnerPaiements: booleen("COVOITURAGE_ABONNER_PAIEMENTS", true),
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigCovoiturageInvalide(erreurs);
  return config;
}
