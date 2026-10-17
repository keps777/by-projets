import { adapterGsm, analyserTexte, type AnalyseSms } from "./gsm";
import type { TypeSms } from "./types";

/**
 * Gabarits des SMS, en français. Un gabarit fixe le texte : l'appelant ne fournit que des variables,
 * validées une à une (un code est un code, un lien est en https, un nom ne contient ni saut de ligne
 * ni adresse). C'est ce qui empêche un écran ou une API de faire envoyer n'importe quel message, à
 * n'importe qui, aux frais d'AfriMove. Seul le type `systeme` (codes de connexion) porte un texte
 * libre, et il n'est jamais joignable par une route HTTP.
 *
 * Le rendu passe par `adapterGsm` : les caractères hors alphabet GSM (ê, ï, ç…) perdent leur accent
 * plutôt que de faire basculer le message en UCS-2 (70 caractères par SMS au lieu de 160).
 */

export interface VariablesBillet {
  compagnie: string;
  origine: string;
  destination: string;
  departA: Date;
  siege: string;
  /** Code à 4 chiffres pour embarquer sans scanner. */
  code: string;
  /** Lien vers le billet et son QR. */
  lien: string;
}

export interface VariablesCodeRetrait {
  compagnie: string;
  numeroColis: string;
  lieu: string;
  /** Code de retrait à 6 chiffres. */
  code: string;
}

export interface VariablesAlerteProche {
  voyageur: string;
  gare: string;
  arriveeA: Date;
  compagnie: string;
}

export interface VariablesRetard {
  compagnie: string;
  origine: string;
  destination: string;
  departA: Date;
  minutes: number;
  arriveeA?: Date | null;
}

export interface VariablesPinProvisoire {
  /** PIN à 6 chiffres. */
  pin: string;
  lien: string;
}

export interface VariablesSysteme {
  texte: string;
}

export interface VariablesParType {
  billet: VariablesBillet;
  code_retrait: VariablesCodeRetrait;
  alerte_proche: VariablesAlerteProche;
  retard: VariablesRetard;
  pin_provisoire: VariablesPinProvisoire;
  systeme: VariablesSysteme;
}

export class VariablesInvalides extends Error {
  constructor(
    readonly type: TypeSms,
    readonly erreurs: readonly string[],
  ) {
    super(`Variables invalides pour le SMS « ${type} » : ${erreurs.join(" ; ")}`);
    this.name = "VariablesInvalides";
  }
}

/* ------------------------------------------------------------------------------------ lecture */

type Objet = Record<string, unknown>;

class Lecteur {
  readonly erreurs: string[] = [];
  constructor(private readonly brut: Objet) {}

  /** Texte court d'une ligne : espaces et sauts de ligne ramenés à un espace, pas d'adresse web. */
  texte(nom: string, max: number): string {
    const v = this.brut[nom];
    if (typeof v !== "string") {
      this.erreurs.push(`${nom} est obligatoire`);
      return "";
    }
    const net = v
      .replace(/[\p{C}\s]+/gu, " ")
      .trim()
      .normalize("NFC");
    if (net === "") this.erreurs.push(`${nom} est obligatoire`);
    else if (net.length > max) this.erreurs.push(`${nom} : ${max} caractères au plus`);
    else if (/:\/\/|www\./i.test(net)) this.erreurs.push(`${nom} ne peut pas contenir d'adresse`);
    return net;
  }

  code(nom: string, chiffres: number): string {
    const v = this.brut[nom];
    if (typeof v !== "string" || !new RegExp(`^\\d{${chiffres}}$`).test(v)) {
      this.erreurs.push(`${nom} : ${chiffres} chiffres`);
      return "";
    }
    return v;
  }

  lien(nom: string): string {
    const v = this.brut[nom];
    if (typeof v !== "string" || v.length > 80 || !/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/.test(v)) {
      this.erreurs.push(`${nom} : lien https de 80 caractères au plus, sans espace`);
      return "";
    }
    return v;
  }

  entier(nom: string, min: number, max: number): number {
    const v = this.brut[nom];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      this.erreurs.push(`${nom} : entier entre ${min} et ${max}`);
      return 0;
    }
    return v;
  }

  /** `Date`, ou chaîne ISO avec décalage (`…Z`, `…+01:00`) : une heure sans fuseau est ambiguë. */
  date(nom: string, optionnel = false): Date | null {
    const v = this.brut[nom];
    if ((v === undefined || v === null) && optionnel) return null;
    let d: Date | null = null;
    if (v instanceof Date) d = v;
    else if (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)
    ) {
      d = new Date(v);
    }
    if (!d || !Number.isFinite(d.getTime())) {
      this.erreurs.push(`${nom} : date ISO avec fuseau (ex. 2027-01-05T08:30:00+01:00)`);
      return null;
    }
    return d;
  }
}

function lire(type: TypeSms, brut: unknown): Lecteur {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new VariablesInvalides(type, ["les variables doivent former un objet"]);
  }
  return new Lecteur(brut as Objet);
}

function terminer<T>(type: TypeSms, l: Lecteur, valeur: T): T {
  if (l.erreurs.length > 0) throw new VariablesInvalides(type, l.erreurs);
  return valeur;
}

/* ------------------------------------------------------------------------------------ formats */

const DECALAGE_DOUALA_MS = 60 * 60_000;
const p2 = (n: number): string => String(n).padStart(2, "0");

/** `08h30`, heure de Douala (UTC+1, sans heure d'été). */
export function heureDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return `${p2(d.getUTCHours())}h${p2(d.getUTCMinutes())}`;
}

/** `05/01 à 08h30`, heure de Douala. */
export function jourHeureDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} à ${heureDouala(instant)}`;
}

/* ------------------------------------------------------------------------------------ gabarits */

export interface GabaritSms<T extends TypeSms> {
  type: T;
  /** Le texte contient un code, un PIN ou un lien personnel : jamais journalisé ni conservé. */
  sensible: boolean;
  /** Durée pendant laquelle le message a un sens ; passé ce délai, il n'est plus envoyé. */
  validiteMs: number | null;
  valider(brut: unknown): VariablesParType[T];
  rendre(variables: VariablesParType[T]): string;
}

const HEURE_MS = 60 * 60_000;

export const GABARITS: { [T in TypeSms]: GabaritSms<T> } = {
  billet: {
    type: "billet",
    sensible: true,
    validiteMs: null,
    valider(brut) {
      const l = lire("billet", brut);
      return terminer("billet", l, {
        compagnie: l.texte("compagnie", 30),
        origine: l.texte("origine", 24),
        destination: l.texte("destination", 24),
        departA: l.date("departA") ?? new Date(0),
        siege: l.texte("siege", 6),
        code: l.code("code", 4),
        lien: l.lien("lien"),
      });
    },
    rendre: (v) =>
      `${v.compagnie} : billet ${v.origine} > ${v.destination}, ${jourHeureDouala(v.departA)}, ` +
      `siège ${v.siege}. Code ${v.code}. Billet et QR : ${v.lien}`,
  },
  code_retrait: {
    type: "code_retrait",
    sensible: true,
    validiteMs: null,
    valider(brut) {
      const l = lire("code_retrait", brut);
      return terminer("code_retrait", l, {
        compagnie: l.texte("compagnie", 30),
        numeroColis: l.texte("numeroColis", 30),
        lieu: l.texte("lieu", 40),
        code: l.code("code", 6),
      });
    },
    rendre: (v) =>
      `${v.compagnie} : colis ${v.numeroColis} à retirer à ${v.lieu}. ` +
      `Code de retrait : ${v.code}. Ne le donnez qu'à la remise du colis.`,
  },
  alerte_proche: {
    type: "alerte_proche",
    sensible: false,
    validiteMs: null,
    valider(brut) {
      const l = lire("alerte_proche", brut);
      return terminer("alerte_proche", l, {
        voyageur: l.texte("voyageur", 30),
        gare: l.texte("gare", 30),
        arriveeA: l.date("arriveeA") ?? new Date(0),
        compagnie: l.texte("compagnie", 30),
      });
    },
    rendre: (v) =>
      `AfriMove : ${v.voyageur} arrive à ${v.gare} vers ${heureDouala(v.arriveeA)} (bus ${v.compagnie}).`,
  },
  retard: {
    type: "retard",
    sensible: false,
    validiteMs: null,
    valider(brut) {
      const l = lire("retard", brut);
      return terminer("retard", l, {
        compagnie: l.texte("compagnie", 30),
        origine: l.texte("origine", 24),
        destination: l.texte("destination", 24),
        departA: l.date("departA") ?? new Date(0),
        minutes: l.entier("minutes", 1, 720),
        arriveeA: l.date("arriveeA", true),
      });
    },
    rendre: (v) =>
      `${v.compagnie} : le bus ${v.origine} > ${v.destination} de ${heureDouala(v.departA)} ` +
      `aura ${v.minutes} min de retard.` +
      (v.arriveeA ? ` Arrivée vers ${heureDouala(v.arriveeA)}.` : ""),
  },
  pin_provisoire: {
    type: "pin_provisoire",
    sensible: true,
    // « PIN provisoire par SMS, valable 1 h » (SuperviseurEquipe, ConfigPersonne)
    validiteMs: HEURE_MS,
    valider(brut) {
      const l = lire("pin_provisoire", brut);
      return terminer("pin_provisoire", l, { pin: l.code("pin", 6), lien: l.lien("lien") });
    },
    rendre: (v) =>
      `AfriMove : votre PIN provisoire est ${v.pin}. Valable 1 h. ` +
      `Changez-le à votre première connexion : ${v.lien}`,
  },
  systeme: {
    type: "systeme",
    sensible: true,
    validiteMs: 5 * 60_000,
    valider(brut) {
      const l = lire("systeme", brut);
      return terminer("systeme", l, { texte: l.texte("texte", 320) });
    },
    rendre: (v) => v.texte,
  },
};

export interface RenduSms extends AnalyseSms {
  type: TypeSms;
  texte: string;
  sensible: boolean;
  validiteMs: number | null;
}

/** Longueur maximale d'un message : trois morceaux GSM. Au-delà, le gabarit est mal écrit. */
export const SEGMENTS_MAX = 3;

/** Valide les variables puis rend le texte final (adapté à l'alphabet GSM) avec son découpage. */
export function rendreSms<T extends TypeSms>(type: T, brut: unknown): RenduSms {
  const gabarit = GABARITS[type] as unknown as GabaritSms<T>;
  const variables = gabarit.valider(brut);
  const texte = adapterGsm(gabarit.rendre(variables));
  const analyse = analyserTexte(texte);
  if (analyse.segments > SEGMENTS_MAX) {
    throw new VariablesInvalides(type, [
      `le message ferait ${analyse.segments} SMS (${SEGMENTS_MAX} au plus) : raccourcir les valeurs`,
    ]);
  }
  return {
    type,
    texte,
    ...analyse,
    sensible: gabarit.sensible,
    validiteMs: gabarit.validiteMs,
  };
}
