import { estLangue, type Langue } from "./langues";
import { VillesInvalides, villesAvecSupplement, type Ville } from "./villes";

/**
 * Configuration de l'achat par WhatsApp. Elle a son propre jeton (comme `CONFIG_USSD`) : tout vient
 * de variables d'environnement `WHATSAPP_ACHAT_*`, validées d'un coup, le démarrage échoue en
 * listant toutes les erreurs. La connexion à WhatsApp (jeton, numéro, webhook) reste dans les
 * variables `WHATSAPP_*` de la passerelle (AM-167).
 */

export const CONFIG_ACHAT_WHATSAPP = Symbol("CONFIG_ACHAT_WHATSAPP");

export interface ConfigAchatWhatsApp {
  /** Langue de la première réponse quand le message n'a pas d'indice. */
  langueDefaut: Langue;
  /** Durée de vie d'une conversation sans réponse (la place retenue ne dure que 15 minutes). */
  sessionTtlMs: number;
  /** Trajet proposé à qui n'a jamais voyagé et n'a pas dit sa ville : codes de ville. */
  trajetDefaut: { depart: string; arrivee: string };
  /** Départs listés (3, comme la conversation de la planche). */
  nombreDeparts: number;
  /** Sièges montrés quand le voyageur demande à changer de siège. */
  siegesProposes: number;
  /**
   * Code promotionnel de type `frais_offerts` qui retire les 250 F de frais de service : la planche
   * annonce « 4 000 F par MoMo », le prix payé est le prix affiché.
   */
  codeSansFrais: string;
  /** Début de l'adresse du billet, pour le gabarit « billet » si la fenêtre de 24 h est fermée. */
  baseLienBillet: string;
  /** Intervalle du suivi des achats (billet payé, paiement échoué, places abandonnées) ; 0 = aucune minuterie. */
  balayageMs: number;
  /** Une réservation sans paiement demandé est libérée passé ce délai (au moins la durée de session). */
  abandonApresMs: number;
  /** Réponses qu'on ne comprend pas, de suite, avant de rendre la main. */
  erreursMax: number;
  /** Les messages vocaux sont lus (si une transcription est branchée). */
  vocal: boolean;
  /** Durée maximale de la transcription d'un vocal. */
  delaiVocalMs: number;
  /** Villes reconnues dans les messages. */
  villes: readonly Ville[];
  production: boolean;
}

export class ConfigAchatWhatsAppInvalide extends Error {
  constructor(readonly erreurs: readonly string[]) {
    super(`Configuration de l'achat WhatsApp invalide :\n - ${erreurs.join("\n - ")}`);
    this.name = "ConfigAchatWhatsAppInvalide";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

export const BASE_LIEN_BILLET_DEFAUT = "https://afrimove.app/b/";

export function chargerConfigAchatWhatsApp(env: Env, enProduction = false): ConfigAchatWhatsApp {
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
    erreurs.push(`${nom} doit valoir true ou false`);
    return defaut;
  };

  const langue = lire("WHATSAPP_ACHAT_LANGUE_DEFAUT") ?? "fr";
  if (!estLangue(langue)) erreurs.push("WHATSAPP_ACHAT_LANGUE_DEFAUT : fr, en ou pcm");

  const trajet = lire("WHATSAPP_ACHAT_TRAJET_DEFAUT") ?? "DLA>YDE";
  const t = /^([A-Z]{3})>([A-Z]{3})$/.exec(trajet);
  if (!t) erreurs.push("WHATSAPP_ACHAT_TRAJET_DEFAUT : deux codes de ville, par exemple DLA>YDE");
  else if (t[1] === t[2]) {
    erreurs.push("WHATSAPP_ACHAT_TRAJET_DEFAUT : départ et arrivée doivent différer");
  }

  const codeSansFrais = lire("WHATSAPP_ACHAT_CODE_SANS_FRAIS") ?? "WHATSAPP";
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(codeSansFrais)) {
    erreurs.push("WHATSAPP_ACHAT_CODE_SANS_FRAIS : 2 à 20 lettres ou chiffres");
  }

  const baseLienBillet = lire("WHATSAPP_ACHAT_BASE_LIEN_BILLET") ?? BASE_LIEN_BILLET_DEFAUT;
  if (
    !/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?\/$/.test(baseLienBillet) ||
    baseLienBillet.length > 40
  ) {
    erreurs.push(
      "WHATSAPP_ACHAT_BASE_LIEN_BILLET : adresse https terminée par « / », 40 caractères au plus",
    );
  }

  let villes: readonly Ville[] = [];
  try {
    villes = villesAvecSupplement(lire("WHATSAPP_ACHAT_VILLES"));
  } catch (e) {
    if (!(e instanceof VillesInvalides)) throw e;
    erreurs.push(`WHATSAPP_ACHAT_VILLES : ${e.erreur}`);
  }

  const sessionTtlMs = entier("WHATSAPP_ACHAT_SESSION_TTL_MIN", 15, 2, 120) * 60_000;
  const config: ConfigAchatWhatsApp = {
    langueDefaut: estLangue(langue) ? langue : "fr",
    sessionTtlMs,
    trajetDefaut: t ? { depart: t[1]!, arrivee: t[2]! } : { depart: "DLA", arrivee: "YDE" },
    nombreDeparts: entier("WHATSAPP_ACHAT_NOMBRE_DEPARTS", 3, 1, 5),
    siegesProposes: entier("WHATSAPP_ACHAT_SIEGES_PROPOSES", 8, 2, 12),
    codeSansFrais,
    baseLienBillet,
    balayageMs: entier("WHATSAPP_ACHAT_BALAYAGE_MS", 3_000, 0, 600_000),
    abandonApresMs: sessionTtlMs + entier("WHATSAPP_ACHAT_ABANDON_MARGE_S", 60, 0, 600) * 1000,
    erreursMax: entier("WHATSAPP_ACHAT_ERREURS_MAX", 3, 1, 10),
    vocal: booleen("WHATSAPP_ACHAT_VOCAL", true),
    delaiVocalMs: entier("WHATSAPP_ACHAT_DELAI_VOCAL_MS", 8_000, 1_000, 30_000),
    villes,
    production: enProduction,
  };
  if (erreurs.length > 0) throw new ConfigAchatWhatsAppInvalide(erreurs);
  return config;
}
