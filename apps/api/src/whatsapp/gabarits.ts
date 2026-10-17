import {
  CORPS_RAPPORT_SOIR,
  erreursRapport,
  formaterRapport,
  nettoyer,
  remplirCorps,
  type RapportSoirEntree,
} from "./rapport";
import { heureDouala, jourHeureDouala } from "./temps";
import type { TypeWhatsApp } from "./types";

/**
 * Gabarits WhatsApp, en français. WhatsApp n'autorise un message à l'initiative de l'entreprise que
 * s'il suit un gabarit **approuvé à l'avance** (texte fixe, variables numérotées) : le texte ci-dessous
 * (`corps`) est celui à soumettre à la validation, mot pour mot. L'appelant ne fournit que des
 * variables, validées une à une : c'est ce qui empêche une route ou un écran de faire envoyer
 * n'importe quel message, à n'importe qui.
 *
 * Règles de WhatsApp reprises ici (à confirmer avec le compte sandbox) : le corps ne commence ni ne
 * finit par une variable, aucune variable n'est vide ni ne contient de saut de ligne, le corps rempli
 * tient en 1 024 caractères.
 */

/** Début de l'adresse d'un billet : celle du bouton du gabarit « billet », approuvée chez WhatsApp. */
export const BASE_LIEN_BILLET = "https://afrimove.app/b/";
/** Adresse du bouton du gabarit « rapport du soir » ; `{{1}}` = le jour du rapport. */
export const MODELE_LIEN_RAPPORT = "https://afrimove.app/patron/rapport?jour={{1}}";

export const LIBELLE_BOUTON_RAPPORT = "Ouvrir le détail dans l'app";
export const LIBELLE_BOUTON_BILLET = "Ouvrir mon billet";

export type TypeGabarit = Exclude<TypeWhatsApp, "reponse">;

export interface VariablesRapportSoir {
  /** Nom de la compagnie, tel qu'il s'affiche (« Alpha Voyages »). */
  compagnie: string;
  rapport: RapportSoirEntree;
}

export interface VariablesBillet {
  compagnie: string;
  origine: string;
  destination: string;
  departA: Date;
  siege: string;
  /** Code à 4 chiffres pour embarquer sans scanner. */
  code: string;
  /** Lien du billet : `https://afrimove.app/b/<identifiant>`. */
  lien: string;
}

export interface VariablesColis {
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

export interface VariablesAlerteRetard {
  compagnie: string;
  origine: string;
  destination: string;
  departA: Date;
  minutes: number;
  arriveeA?: Date | null;
}

export interface VariablesParType {
  rapport_soir: VariablesRapportSoir;
  billet: VariablesBillet;
  colis: VariablesColis;
  alerte_proche: VariablesAlerteProche;
  alerte_retard: VariablesAlerteRetard;
}

export class VariablesInvalides extends Error {
  constructor(
    readonly type: TypeWhatsApp,
    readonly erreurs: readonly string[],
  ) {
    super(`Variables invalides pour le message « ${type} » : ${erreurs.join(" ; ")}`);
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
    const net = nettoyer(v.replace(/\s+/g, " "));
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

  /** Lien d'un billet : l'adresse approuvée dans le gabarit, suivie d'un identifiant simple. */
  lienBillet(nom: string): { lien: string; identifiant: string } {
    const v = this.brut[nom];
    if (typeof v === "string" && v.startsWith(BASE_LIEN_BILLET)) {
      const identifiant = v.slice(BASE_LIEN_BILLET.length);
      if (/^[A-Za-z0-9_-]{4,40}$/.test(identifiant)) return { lien: v, identifiant };
    }
    this.erreurs.push(`${nom} : ${BASE_LIEN_BILLET}<identifiant du billet>`);
    return { lien: "", identifiant: "" };
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

function lire(type: TypeWhatsApp, brut: unknown): Lecteur {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new VariablesInvalides(type, ["les variables doivent former un objet"]);
  }
  return new Lecteur(brut as Objet);
}

function terminer<T>(type: TypeWhatsApp, l: Lecteur, valeur: T): T {
  if (l.erreurs.length > 0) throw new VariablesInvalides(type, l.erreurs);
  return valeur;
}

/* ------------------------------------------------------------------------------------ gabarits */

export interface ContenuRendu {
  /** Valeurs de `{{1}}`, `{{2}}`… */
  parametres: string[];
  /** Fin de l'adresse du bouton, si le gabarit en a un. */
  boutonUrl: string | null;
  /** SMS envoyé si WhatsApp ne remet pas le message ; `null` : pas de repli. */
  texteSecours: string | null;
}

export interface GabaritWhatsApp<T extends TypeGabarit> {
  type: T;
  /** Nom du gabarit chez WhatsApp (minuscules, chiffres, `_`). */
  nom: string;
  /** Catégorie déclarée à WhatsApp : « utility » (message de service, non promotionnel). */
  categorie: "utility";
  /** Le message porte un code, un lien personnel ou des chiffres d'activité : jamais journalisé. */
  sensible: boolean;
  /** Durée pendant laquelle le message a un sens ; passé ce délai, il n'est plus envoyé. */
  validiteMs: number | null;
  /** Texte soumis à WhatsApp, avec `{{1}}`… */
  corps: string;
  bouton: { libelle: string; urlModele: string } | null;
  valider(brut: unknown): VariablesParType[T];
  rendre(variables: VariablesParType[T]): ContenuRendu;
}

const HEURE_MS = 60 * 60_000;

export const GABARITS: { [T in TypeGabarit]: GabaritWhatsApp<T> } = {
  rapport_soir: {
    type: "rapport_soir",
    nom: "afrimove_rapport_soir",
    categorie: "utility",
    sensible: true,
    // Le rapport de 21 h n'a plus d'objet le lendemain matin ; la durée exacte vient de la config.
    validiteMs: null,
    corps: CORPS_RAPPORT_SOIR,
    bouton: { libelle: LIBELLE_BOUTON_RAPPORT, urlModele: MODELE_LIEN_RAPPORT },
    valider(brut) {
      const l = lire("rapport_soir", brut);
      const compagnie = l.texte("compagnie", 30);
      const rapport = (brut as Objet)["rapport"];
      const erreurs = [...l.erreurs, ...erreursRapport(rapport)];
      if (erreurs.length > 0) throw new VariablesInvalides("rapport_soir", erreurs);
      return { compagnie, rapport: rapport as RapportSoirEntree };
    },
    rendre: (v) => {
      const f = formaterRapport(v.compagnie, v.rapport);
      return { parametres: f.parametres, boutonUrl: f.bouton, texteSecours: f.texteSecours };
    },
  },
  billet: {
    type: "billet",
    nom: "afrimove_billet",
    categorie: "utility",
    sensible: true,
    validiteMs: null,
    corps:
      "Votre billet {{1}} : {{2}} → {{3}}, départ le {{4}}, siège {{5}}.\n" +
      "Code d'embarquement : {{6}}\n" +
      "Présentez le QR du billet à la montée.",
    bouton: { libelle: LIBELLE_BOUTON_BILLET, urlModele: `${BASE_LIEN_BILLET}{{1}}` },
    valider(brut) {
      const l = lire("billet", brut);
      return terminer("billet", l, {
        compagnie: l.texte("compagnie", 30),
        origine: l.texte("origine", 24),
        destination: l.texte("destination", 24),
        departA: l.date("departA") ?? new Date(0),
        siege: l.texte("siege", 6),
        code: l.code("code", 4),
        lien: l.lienBillet("lien").lien,
      });
    },
    rendre: (v) => ({
      parametres: [
        v.compagnie,
        v.origine,
        v.destination,
        jourHeureDouala(v.departA),
        v.siege,
        v.code,
      ],
      boutonUrl: v.lien.slice(BASE_LIEN_BILLET.length),
      texteSecours:
        `${v.compagnie} : billet ${v.origine} > ${v.destination}, ${jourHeureDouala(v.departA)}, ` +
        `siège ${v.siege}. Code ${v.code}. Billet et QR : ${v.lien}`,
    }),
  },
  colis: {
    type: "colis",
    nom: "afrimove_colis_retrait",
    categorie: "utility",
    sensible: true,
    validiteMs: null,
    corps:
      "Colis {{1}} de {{2}} : à retirer à {{3}}.\n" +
      "Code de retrait : {{4}}\n" +
      "Ne le donnez qu'à la remise du colis.",
    bouton: null,
    valider(brut) {
      const l = lire("colis", brut);
      return terminer("colis", l, {
        compagnie: l.texte("compagnie", 30),
        numeroColis: l.texte("numeroColis", 30),
        lieu: l.texte("lieu", 40),
        code: l.code("code", 6),
      });
    },
    rendre: (v) => ({
      parametres: [v.numeroColis, v.compagnie, v.lieu, v.code],
      boutonUrl: null,
      texteSecours:
        `${v.compagnie} : colis ${v.numeroColis} à retirer à ${v.lieu}. ` +
        `Code de retrait : ${v.code}. Ne le donnez qu'à la remise du colis.`,
    }),
  },
  alerte_proche: {
    type: "alerte_proche",
    nom: "afrimove_alerte_proche",
    categorie: "utility",
    sensible: false,
    validiteMs: 3 * HEURE_MS,
    corps: "AfriMove : {{1}} arrive à {{2}} vers {{3}} (bus {{4}}).\nMessage automatique.",
    bouton: null,
    valider(brut) {
      const l = lire("alerte_proche", brut);
      return terminer("alerte_proche", l, {
        voyageur: l.texte("voyageur", 30),
        gare: l.texte("gare", 30),
        arriveeA: l.date("arriveeA") ?? new Date(0),
        compagnie: l.texte("compagnie", 30),
      });
    },
    rendre: (v) => ({
      parametres: [v.voyageur, v.gare, heureDouala(v.arriveeA), v.compagnie],
      boutonUrl: null,
      texteSecours: `AfriMove : ${v.voyageur} arrive à ${v.gare} vers ${heureDouala(v.arriveeA)} (bus ${v.compagnie}).`,
    }),
  },
  alerte_retard: {
    type: "alerte_retard",
    nom: "afrimove_alerte_retard",
    categorie: "utility",
    sensible: false,
    validiteMs: 6 * HEURE_MS,
    corps:
      "Retard : le bus {{1}} {{2}} → {{3}} de {{4}} aura {{5}} min de retard. {{6}}\n" +
      "Merci de votre patience.",
    bouton: null,
    valider(brut) {
      const l = lire("alerte_retard", brut);
      return terminer("alerte_retard", l, {
        compagnie: l.texte("compagnie", 30),
        origine: l.texte("origine", 24),
        destination: l.texte("destination", 24),
        departA: l.date("departA") ?? new Date(0),
        minutes: l.entier("minutes", 1, 720),
        arriveeA: l.date("arriveeA", true),
      });
    },
    rendre: (v) => {
      const arrivee = v.arriveeA
        ? `Arrivée vers ${heureDouala(v.arriveeA)}.`
        : "L'heure d'arrivée vous sera communiquée.";
      return {
        parametres: [
          v.compagnie,
          v.origine,
          v.destination,
          heureDouala(v.departA),
          String(v.minutes),
          arrivee,
        ],
        boutonUrl: null,
        texteSecours:
          `${v.compagnie} : le bus ${v.origine} > ${v.destination} de ${heureDouala(v.departA)} ` +
          `aura ${v.minutes} min de retard.` +
          (v.arriveeA ? ` Arrivée vers ${heureDouala(v.arriveeA)}.` : ""),
      };
    },
  },
};

export const TYPES_GABARIT = Object.keys(GABARITS) as TypeGabarit[];

export function estTypeGabarit(type: TypeWhatsApp): type is TypeGabarit {
  return type in GABARITS;
}

/** Nombre de variables d'un corps : la plus grande valeur de `{{n}}`. */
export function nombreVariables(corps: string): number {
  return Math.max(0, ...[...corps.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
}

/** Longueur maximale du corps rempli (limite de WhatsApp). */
export const LONGUEUR_CORPS_WHATSAPP = 1024;

export interface RenduWhatsApp extends ContenuRendu {
  type: TypeGabarit;
  nom: string;
  /**
   * Variables validées, pour le repli par SMS : la passerelle SMS a un gabarit pour le billet, le
   * colis et les alertes (mêmes variables). `null` pour le rapport, qui n'a pas de gabarit SMS : le
   * repli est alors le texte `texteSecours`.
   */
  variablesSecours: unknown;
  /** Message tel que le destinataire le lit (corps rempli) : tests et simulateur. */
  texte: string;
  sensible: boolean;
  validiteMs: number | null;
}

/** Valide les variables puis rend les paramètres du gabarit, son bouton et le texte de repli. */
export function rendreWhatsApp<T extends TypeGabarit>(type: T, brut: unknown): RenduWhatsApp {
  const gabarit = GABARITS[type] as unknown as GabaritWhatsApp<T>;
  const variables = gabarit.valider(brut);
  const rendu = gabarit.rendre(variables);
  const attendu = nombreVariables(gabarit.corps);
  if (rendu.parametres.length !== attendu) {
    throw new Error(`Gabarit ${gabarit.nom} : ${attendu} variables attendues`);
  }
  const parametres = rendu.parametres.map((p) => nettoyer(p));
  const vide = parametres.findIndex((p) => p === "");
  if (vide >= 0) throw new VariablesInvalides(type, [`la variable ${vide + 1} est vide`]);
  const texte = remplirCorps(gabarit.corps, parametres);
  if (texte.length > LONGUEUR_CORPS_WHATSAPP) {
    throw new VariablesInvalides(type, [
      `le message ferait ${texte.length} caractères (${LONGUEUR_CORPS_WHATSAPP} au plus)`,
    ]);
  }
  return {
    ...rendu,
    parametres,
    type,
    nom: gabarit.nom,
    variablesSecours: type === "rapport_soir" ? null : variables,
    texte,
    sensible: gabarit.sensible,
    validiteMs: gabarit.validiteMs,
  };
}
