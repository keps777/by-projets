import { commandeInvalide, pinRequis } from "./erreurs";
import type { NotificationPartenaire } from "./modele";

/**
 * Lecture des corps de requête du financement. L'API ne peut pas importer zod à l'exécution : ces
 * lecteurs reprennent à la main les schémas de `@afrimove/contrats` (patron), et `validation.test.ts` les
 * compare à ces schémas sur des cas valides et invalides. Comme `z.strictObject`, un champ inconnu est
 * refusé (422 `COMMANDE_INVALIDE`, comme le mock du client). Une signature absente ou illisible répond
 * 401 `PIN_REQUIS`, avant toute autre lecture.
 */

export interface SignaturePin {
  pin: string;
  methode: "pin" | "empreinte";
  signeA: string;
}

const RE_ISO_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;

type Brut = Record<string, unknown>;

const estObjet = (v: unknown): v is Brut =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Lit la signature PIN d'un corps de commande. */
export function lireSignature(corps: unknown): SignaturePin {
  const brut = estObjet(corps) ? corps["signature"] : undefined;
  if (
    !estObjet(brut) ||
    Object.keys(brut).some((k) => !["pin", "methode", "signeA"].includes(k)) ||
    typeof brut["pin"] !== "string" ||
    !/^\d{6}$/.test(brut["pin"]) ||
    (brut["methode"] !== "pin" && brut["methode"] !== "empreinte") ||
    typeof brut["signeA"] !== "string" ||
    !RE_ISO_DOUALA.test(brut["signeA"]) ||
    Number.isNaN(Date.parse(brut["signeA"]))
  ) {
    throw pinRequis();
  }
  return { pin: brut["pin"], methode: brut["methode"], signeA: brut["signeA"] };
}

/** Un objet dont on lit les champs un à un ; les erreurs sont toutes signalées ensemble. */
class Lecteur {
  readonly erreurs: { chemin: string; message: string }[] = [];

  constructor(
    private readonly brut: Brut,
    champsPermis: readonly string[],
  ) {
    for (const cle of Object.keys(brut)) {
      if (!champsPermis.includes(cle)) this.erreurs.push({ chemin: cle, message: "Champ inconnu" });
    }
  }

  entierPositifOuNul(nom: string): number {
    const v = this.brut[nom];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      this.erreurs.push({ chemin: nom, message: "Entier positif ou nul attendu" });
      return 0;
    }
    return v;
  }

  chaine(nom: string): string {
    const v = this.brut[nom];
    if (typeof v !== "string" || v.length < 1) {
      this.erreurs.push({ chemin: nom, message: "Texte non vide attendu" });
      return "";
    }
    return v;
  }

  booleen(nom: string): boolean {
    const v = this.brut[nom];
    if (typeof v !== "boolean") {
      this.erreurs.push({ chemin: nom, message: "Booléen attendu" });
      return false;
    }
    return v;
  }

  motif(nom: string, re: RegExp, message: string): string {
    const v = this.brut[nom];
    if (typeof v !== "string" || !re.test(v)) {
      this.erreurs.push({ chemin: nom, message });
      return "";
    }
    return v;
  }

  fin(): void {
    if (this.erreurs.length > 0)
      throw commandeInvalide("Corps de la commande invalide", this.erreurs);
  }
}

function lecteur(corps: unknown, champs: readonly string[]): Lecteur {
  if (!estObjet(corps)) throw commandeInvalide("Corps de la commande invalide");
  return new Lecteur(corps, [...champs, "signature"]);
}

/* ------------------------------------------------------------------ commandes du patron */

export interface DemandeAvance {
  montant: number;
  signature: SignaturePin;
}

/** `DemanderAvanceSchema` : `{ montant, signature }`. */
export function lireDemandeAvance(corps: unknown): DemandeAvance {
  const signature = lireSignature(corps);
  const l = lecteur(corps, ["montant"]);
  const montant = l.entierPositifOuNul("montant");
  l.fin();
  return { montant, signature };
}

export interface RetraitDemande {
  dossierId: string;
  signature: SignaturePin;
}

/** `RetirerDemandeSchema` : `{ dossierId, signature }`. */
export function lireRetrait(corps: unknown): RetraitDemande {
  const signature = lireSignature(corps);
  const l = lecteur(corps, ["dossierId"]);
  const dossierId = l.chaine("dossierId");
  l.fin();
  return { dossierId, signature };
}

export interface LancementPaie {
  mois: string;
  signature: SignaturePin;
}

/** `LancerPaieSchema` : `{ mois: "AAAA-MM", signature }`. */
export function lireLancementPaie(corps: unknown): LancementPaie {
  const signature = lireSignature(corps);
  const l = lecteur(corps, ["mois"]);
  const mois = l.motif("mois", /^\d{4}-\d{2}$/, "Mois AAAA-MM attendu");
  l.fin();
  return { mois, signature };
}

export interface ReglageDeuxFois {
  actif: boolean;
  signature: SignaturePin;
}

/** Route ajoutée, absente des contrats : `{ actif, signature }`. */
export function lireReglageDeuxFois(corps: unknown): ReglageDeuxFois {
  const signature = lireSignature(corps);
  const l = lecteur(corps, ["actif"]);
  const actif = l.booleen("actif");
  l.fin();
  return { actif, signature };
}

/* ------------------------------------------------------------------ notification du partenaire */

const RE_TEXTE = /^.{1,200}$/s;

/**
 * Notification du partenaire (corps JSON déjà authentifié par `PartenaireFinancier.lireNotification`) :
 * `{ type: "accuse" | "verse" | "refuse", reference, at, ... }`. Format commun à tous les partenaires ; un
 * partenaire dont le format diffère le traduit dans son adaptateur.
 */
export function lireNotificationJson(brut: unknown): NotificationPartenaire | null {
  if (!estObjet(brut)) return null;
  const { type, reference, at } = brut;
  if (
    typeof reference !== "string" ||
    !RE_TEXTE.test(reference) ||
    typeof at !== "string" ||
    !RE_ISO_DOUALA.test(at)
  ) {
    return null;
  }
  if (type === "accuse") return { type, reference, at };
  if (type === "refuse") {
    const motif = brut["motif"];
    return typeof motif === "string" && RE_TEXTE.test(motif)
      ? { type, reference, at, motif }
      : null;
  }
  if (type === "verse") {
    const cout = brut["coutTotalPct"];
    const montant = brut["montant"];
    if (typeof cout !== "number" || !Number.isFinite(cout) || cout < 0 || cout > 100) return null;
    if (
      montant !== undefined &&
      (typeof montant !== "number" || !Number.isSafeInteger(montant) || montant <= 0)
    ) {
      return null;
    }
    return montant === undefined
      ? { type, reference, at, coutTotalPct: cout }
      : { type, reference, at, coutTotalPct: cout, montant };
  }
  return null;
}
