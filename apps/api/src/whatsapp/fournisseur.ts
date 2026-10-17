import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Port du fournisseur WhatsApp Business. La passerelle ne connaît que cette classe : le simulateur
 * (`fournisseur-simule.ts`) et le client HTTP (`fournisseur-http.ts`, forme de l'API Cloud de Meta)
 * l'implémentent de la même façon. Un fournisseur de solutions (BSP) qui expose une autre API
 * aurait son propre adaptateur.
 */

export type ContenuFournisseur =
  | {
      type: "gabarit";
      /** Nom du gabarit approuvé. */
      nom: string;
      langue: string;
      /** Valeurs de `{{1}}`, `{{2}}`… du corps. */
      parametres: string[];
      /** Valeur de `{{1}}` dans l'adresse du bouton, si le gabarit en a un. */
      boutonUrl: string | null;
    }
  | { type: "texte"; texte: string };

export interface DemandeFournisseur {
  /**
   * Identifiant du message côté AfriMove. Il est renvoyé tel quel par WhatsApp dans les accusés
   * (`biz_opaque_callback_data`) : c'est ainsi qu'un accusé qui précède l'enregistrement de l'envoi
   * retrouve son message.
   */
  reference: string;
  /** Format international `+237…`. */
  destinataire: string;
  contenu: ContenuFournisseur;
}

export interface ReponseFournisseur {
  /** Identifiant du message chez WhatsApp (`wamid…`) : clé des accusés de livraison. */
  idFournisseur: string;
}

/** Le message n'a pas pu partir cette fois, un autre essai peut réussir. */
export class ErreurFournisseurTemporaire extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurFournisseurTemporaire";
  }
}

/** Le message ne partira jamais par WhatsApp (numéro sans WhatsApp, gabarit refusé) : inutile de réessayer. */
export class ErreurFournisseurDefinitive extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurFournisseurDefinitive";
  }
}

export type EtatRecu = "envoye" | "remis" | "lu" | "echec";

/** Un accusé de WhatsApp sur un message envoyé. */
export interface RecuStatut {
  idFournisseur: string;
  /** Notre identifiant, si WhatsApp le renvoie. */
  reference: string | null;
  etat: EtatRecu;
  at: Date;
  /** Code court de l'erreur en cas d'échec (`131026`…). */
  code: string | null;
}

/** Un message reçu d'une personne. */
export interface RecuMessage {
  idFournisseur: string;
  /** Numéro de l'expéditeur, tel que WhatsApp le donne (chiffres, sans `+`). */
  de: string;
  /** `text`, `button`, `interactive`, `image`… */
  typeMessage: string;
  /** Texte, pour un message de type `text` ou une réponse à un bouton ; sinon `null`. */
  texte: string | null;
  at: Date;
}

export interface EvenementsWebhook {
  statuts: RecuStatut[];
  messages: RecuMessage[];
}

export interface RequeteWebhook {
  /** En-têtes en minuscules. */
  entetes: Readonly<Record<string, string | undefined>>;
  /** Corps exact reçu : la signature se calcule dessus. */
  corpsBrut: string | null;
}

/** Appel non authentique ou illisible. */
export class WebhookInvalide extends Error {
  constructor(
    readonly raison: "signature" | "format" | "abonnement",
    message: string,
  ) {
    super(message);
    this.name = "WebhookInvalide";
  }
}

export interface DemandeAbonnement {
  mode: string | undefined;
  jeton: string | undefined;
  challenge: string | undefined;
}

export type StatutGabaritCompte = "approuve" | "en_attente" | "refuse" | "suspendu";

export interface GabaritDuCompte {
  nom: string;
  langue: string;
  statut: StatutGabaritCompte;
}

export interface EtatCompteFournisseur {
  /** Nom d'affichage vérifié et numéro validé ; `null` si le fournisseur ne le dit pas. */
  verifie: boolean | null;
  nomAffiche: string | null;
  numeroAffiche: string | null;
  qualite: "haute" | "moyenne" | "basse" | "inconnue";
  gabarits: GabaritDuCompte[];
}

export abstract class FournisseurWhatsApp {
  /** Nom stable (journal des essais) : `simule`, `meta`… */
  abstract readonly nom: string;
  /** `true` pour un fournisseur qui envoie vraiment des messages. */
  abstract readonly reel: boolean;

  /**
   * Remet le message à WhatsApp. Rend l'identifiant du message quand il l'a **accepté** (pas
   * forcément remis au téléphone). Lève `ErreurFournisseurTemporaire` ou
   * `ErreurFournisseurDefinitive` ; toute autre erreur est traitée comme temporaire.
   */
  abstract envoyer(demande: DemandeFournisseur): Promise<ReponseFournisseur>;

  /** Vérifie l'authenticité de l'appel du webhook et en lit les accusés et messages. Lève `WebhookInvalide`. */
  abstract lireWebhook(requete: RequeteWebhook): EvenementsWebhook;

  /** Réponse à la vérification d'abonnement du webhook (GET) : le `challenge` à renvoyer. Lève `WebhookInvalide`. */
  abstract verifierAbonnement(demande: DemandeAbonnement): string;

  /** Compte vérifié ? qualité ? gabarits approuvés ? Lève une erreur si le fournisseur est injoignable. */
  abstract etatCompte(): Promise<EtatCompteFournisseur>;
}

/* ------------------------------------------------------------------------------------ signature */

export const ENTETE_SIGNATURE = "x-hub-signature-256";

/** `sha256=` suivi du HMAC-SHA-256 hexadécimal du corps exact, clé = secret de l'application. */
export function signerWebhook(secret: string, corpsBrut: string): string {
  return `sha256=${createHmac("sha256", secret).update(corpsBrut).digest("hex")}`;
}

/**
 * Contrôle la signature du corps exact (comparaison en temps constant). WhatsApp ne signe pas
 * d'horodatage : un appel rejoué est sans effet parce que les statuts n'avancent que dans un sens et
 * que les messages reçus sont dédoublonnés par identifiant. Lève `WebhookInvalide`.
 */
export function verifierSignatureWebhook(secret: string, requete: RequeteWebhook): string {
  const signature = requete.entetes[ENTETE_SIGNATURE];
  if (requete.corpsBrut === null || !signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    throw new WebhookInvalide("signature", "Signature absente ou corps illisible");
  }
  const attendue = Buffer.from(signerWebhook(secret, requete.corpsBrut).slice(7), "hex");
  const recue = Buffer.from(signature.slice(7), "hex");
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) {
    throw new WebhookInvalide("signature", "Signature invalide");
  }
  return requete.corpsBrut;
}

/** Compare deux textes en temps constant (jeton de vérification de l'abonnement). */
export function memeTexte(a: string, b: string): boolean {
  const ha = createHmac("sha256", "comparaison").update(a).digest();
  const hb = createHmac("sha256", "comparaison").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Vérification d'abonnement : `hub.mode=subscribe`, jeton identique, `challenge` simple. */
export function verifierAbonnementMeta(jetonAttendu: string, demande: DemandeAbonnement): string {
  if (
    demande.mode !== "subscribe" ||
    !demande.jeton ||
    !memeTexte(demande.jeton, jetonAttendu) ||
    !demande.challenge ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(demande.challenge)
  ) {
    throw new WebhookInvalide("abonnement", "Vérification d'abonnement refusée");
  }
  return demande.challenge;
}

/* ----------------------------------------------------------------------------------- lecture */

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ETATS: Readonly<Record<string, EtatRecu>> = {
  sent: "envoye",
  delivered: "remis",
  read: "lu",
  failed: "echec",
};

function instant(brut: unknown): Date | null {
  const n = typeof brut === "string" ? Number(brut) : brut;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

/**
 * Lecture du corps d'un webhook au format de l'API Cloud de Meta :
 * `{ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
 *   statuses: [{ id, status, timestamp, recipient_id, biz_opaque_callback_data?, errors?: [{ code }] }],
 *   messages: [{ id, from, timestamp, type, text?: { body } }] } }] }] }`.
 * Les statuts inconnus (`deleted`, `warning`) sont ignorés ; un élément mal formé fait refuser l'appel.
 */
export function lireCorpsWebhookMeta(corps: string): EvenementsWebhook {
  let json: unknown;
  try {
    json = JSON.parse(corps);
  } catch {
    throw new WebhookInvalide("format", "Corps JSON illisible");
  }
  if (!estObjet(json) || json["object"] !== "whatsapp_business_account") {
    throw new WebhookInvalide("format", "Objet inattendu");
  }
  const entrees = json["entry"];
  if (!Array.isArray(entrees) || entrees.length > 100) {
    throw new WebhookInvalide("format", "Liste d'entrées absente ou trop longue");
  }
  const resultat: EvenementsWebhook = { statuts: [], messages: [] };
  for (const entree of entrees as unknown[]) {
    const changements = estObjet(entree) ? entree["changes"] : undefined;
    if (!Array.isArray(changements) || changements.length > 100) {
      throw new WebhookInvalide("format", "Changements absents ou trop nombreux");
    }
    for (const changement of changements as unknown[]) {
      if (!estObjet(changement) || changement["field"] !== "messages") continue;
      const valeur = changement["value"];
      if (!estObjet(valeur)) throw new WebhookInvalide("format", "Valeur absente");
      const statuts = valeur["statuses"] ?? [];
      const messages = valeur["messages"] ?? [];
      if (
        !Array.isArray(statuts) ||
        !Array.isArray(messages) ||
        statuts.length + messages.length > 1000
      ) {
        throw new WebhookInvalide("format", "Listes de statuts ou de messages invalides");
      }
      for (const brut of statuts as unknown[]) {
        const s = estObjet(brut) ? brut : {};
        const etat = typeof s["status"] === "string" ? ETATS[s["status"]] : undefined;
        if (typeof s["status"] === "string" && etat === undefined && typeof s["id"] === "string") {
          continue; // statut qui n'intéresse pas la passerelle
        }
        const at = instant(s["timestamp"]);
        if (typeof s["id"] !== "string" || s["id"] === "" || !etat || !at) {
          throw new WebhookInvalide("format", "Statut mal formé");
        }
        const erreurs = s["errors"];
        const code0 = Array.isArray(erreurs) && estObjet(erreurs[0]) ? erreurs[0]["code"] : null;
        resultat.statuts.push({
          idFournisseur: s["id"],
          reference:
            typeof s["biz_opaque_callback_data"] === "string"
              ? s["biz_opaque_callback_data"].slice(0, 100)
              : null,
          etat,
          at,
          code:
            etat === "echec"
              ? typeof code0 === "number" || typeof code0 === "string"
                ? String(code0).slice(0, 20)
                : "inconnu"
              : null,
        });
      }
      for (const brut of messages as unknown[]) {
        const m = estObjet(brut) ? brut : {};
        const at = instant(m["timestamp"]);
        if (
          typeof m["id"] !== "string" ||
          m["id"] === "" ||
          typeof m["from"] !== "string" ||
          !/^\d{8,15}$/.test(m["from"]) ||
          typeof m["type"] !== "string" ||
          !at
        ) {
          throw new WebhookInvalide("format", "Message mal formé");
        }
        const texte = estObjet(m["text"]) ? m["text"]["body"] : undefined;
        const bouton = estObjet(m["button"]) ? m["button"]["text"] : undefined;
        const lu = typeof texte === "string" ? texte : typeof bouton === "string" ? bouton : null;
        resultat.messages.push({
          idFournisseur: m["id"],
          de: m["from"],
          typeMessage: m["type"].slice(0, 30),
          texte: lu === null ? null : lu.slice(0, 4096),
          at,
        });
      }
    }
  }
  return resultat;
}
