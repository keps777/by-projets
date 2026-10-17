import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Port du fournisseur (agrégateur SMS). La passerelle ne connaît que cette classe : le simulateur
 * (`fournisseur-simule.ts`), le client HTTP générique (`fournisseur-http.ts`) et, plus tard,
 * l'adaptateur de l'agrégateur retenu l'implémentent de la même façon.
 */

export interface DemandeFournisseur {
  /**
   * Identifiant du message côté AfriMove, renvoyé tel quel au fournisseur. Il sert à **ne pas
   * facturer deux fois** : si un essai expire alors que le fournisseur avait déjà accepté, le
   * réessai porte la même référence et le fournisseur doit répondre avec le même identifiant.
   */
  reference: string;
  /** Expéditeur alphanumérique (« AfriMove »). */
  expediteur: string;
  /** Format international `+237…`. */
  destinataire: string;
  texte: string;
}

export interface ReponseFournisseur {
  /** Identifiant du message chez le fournisseur : clé des accusés de livraison. */
  idFournisseur: string;
}

/** Le message n'a pas pu partir cette fois, un autre essai ou le fournisseur de secours peut réussir. */
export class ErreurFournisseurTemporaire extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurFournisseurTemporaire";
  }
}

/** Le message ne partira jamais (numéro invalide, expéditeur refusé) : inutile de réessayer. */
export class ErreurFournisseurDefinitive extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurFournisseurDefinitive";
  }
}

export type EtatRecu = "envoye" | "livre" | "non_livre";

/** Un accusé de l'opérateur, lu dans l'appel (webhook) du fournisseur. */
export interface RecuLivraison {
  idFournisseur: string;
  /** Référence AfriMove, si le fournisseur la renvoie (utile si l'accusé précède l'enregistrement). */
  reference: string | null;
  etat: EtatRecu;
  at: Date;
  /** Code court de l'opérateur en cas de non-livraison (`telephone_eteint`…). */
  code: string | null;
}

export interface RequeteRecu {
  /** En-têtes en minuscules. */
  entetes: Readonly<Record<string, string | undefined>>;
  /** Corps exact reçu : la signature se calcule dessus. */
  corpsBrut: string | null;
  maintenant: Date;
}

/** Accusé non authentique, périmé ou illisible. */
export class RecuInvalide extends Error {
  constructor(
    readonly raison: "signature" | "horodatage" | "format",
    message: string,
  ) {
    super(message);
    this.name = "RecuInvalide";
  }
}

export abstract class FournisseurSms {
  /** Nom stable (clé dans l'URL du webhook et au journal) : `simule`, `agregateur`… */
  abstract readonly nom: string;
  /** `true` pour un fournisseur qui envoie vraiment des SMS. */
  abstract readonly reel: boolean;

  /**
   * Remet le message au fournisseur. Rend l'identifiant du fournisseur quand il l'a **accepté**
   * (pas forcément remis au téléphone). Lève `ErreurFournisseurTemporaire` ou
   * `ErreurFournisseurDefinitive` ; toute autre erreur est traitée comme temporaire.
   */
  abstract envoyer(demande: DemandeFournisseur): Promise<ReponseFournisseur>;

  /** Vérifie l'authenticité de l'appel et en lit les accusés. Lève `RecuInvalide`. */
  abstract lireRecus(requete: RequeteRecu): RecuLivraison[];
}

/* ------------------------------------------------------------------------------------ signature */

/** Tolérance sur l'horodatage signé d'un accusé : au-delà, on le refuse (rejeu d'un vieil appel). */
export const TOLERANCE_HORODATAGE_MS = 5 * 60_000;

export const ENTETE_SIGNATURE = "x-sms-signature";
export const ENTETE_HORODATAGE = "x-sms-horodatage";

/** HMAC-SHA-256 hexadécimal de `<horodatage en secondes>.<corps>`. */
export function signerRecu(secret: string, horodatageSecondes: number, corpsBrut: string): string {
  return createHmac("sha256", secret).update(`${horodatageSecondes}.${corpsBrut}`).digest("hex");
}

/** Contrôle la signature et la fraîcheur d'un accusé. Lève `RecuInvalide`. */
export function verifierSignatureRecu(secret: string, requete: RequeteRecu): string {
  const signature = requete.entetes[ENTETE_SIGNATURE];
  const horodatage = requete.entetes[ENTETE_HORODATAGE];
  if (requete.corpsBrut === null || !signature || !horodatage || !/^\d{9,12}$/.test(horodatage)) {
    throw new RecuInvalide("signature", "Signature absente ou corps illisible");
  }
  const attendue = Buffer.from(signerRecu(secret, Number(horodatage), requete.corpsBrut), "hex");
  const recue = /^[0-9a-f]{64}$/i.test(signature) ? Buffer.from(signature, "hex") : null;
  if (!recue || recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) {
    throw new RecuInvalide("signature", "Signature invalide");
  }
  if (
    Math.abs(requete.maintenant.getTime() - Number(horodatage) * 1000) > TOLERANCE_HORODATAGE_MS
  ) {
    throw new RecuInvalide("horodatage", "Horodatage hors tolérance");
  }
  return requete.corpsBrut;
}

/**
 * Lecture commune du corps d'un accusé :
 * `{ "messages": [{ "id", "reference?", "etat": "envoye"|"livre"|"non_livre", "at", "code?" }] }`.
 * Le format réel dépend de l'agrégateur retenu ; l'adaptateur de celui-ci remplace cette fonction.
 */
export function lireCorpsRecus(corps: string): RecuLivraison[] {
  let json: unknown;
  try {
    json = JSON.parse(corps);
  } catch {
    throw new RecuInvalide("format", "Corps JSON illisible");
  }
  const liste = (json as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(liste) || liste.length > 500) {
    throw new RecuInvalide("format", "Liste de messages absente ou trop longue");
  }
  return liste.map((brut: unknown) => {
    const m = (brut ?? {}) as Record<string, unknown>;
    const etat = m["etat"];
    const at = typeof m["at"] === "string" ? new Date(m["at"]) : null;
    if (
      typeof m["id"] !== "string" ||
      m["id"] === "" ||
      (etat !== "envoye" && etat !== "livre" && etat !== "non_livre") ||
      !at ||
      !Number.isFinite(at.getTime())
    ) {
      throw new RecuInvalide("format", "Accusé mal formé");
    }
    return {
      idFournisseur: m["id"],
      reference: typeof m["reference"] === "string" ? m["reference"] : null,
      etat,
      at,
      code: typeof m["code"] === "string" ? m["code"].slice(0, 40) : null,
    };
  });
}
