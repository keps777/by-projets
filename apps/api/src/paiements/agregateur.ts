import { createHmac, timingSafeEqual } from "node:crypto";
import type { Beneficiaire, MoyenEnLigne, OperateurMobile } from "./modeles";

/**
 * Port de l'agrégateur de paiement agréé (push MoMo, Orange Money, cartes). Le module ne connaît que
 * cette classe : le simulateur (`agregateur-simule.ts`), le client HTTP générique
 * (`agregateur-http.ts`) et, plus tard, l'adaptateur de l'agrégateur retenu l'implémentent de la
 * même façon.
 *
 * Deux règles tiennent à ce port :
 *  - **idempotence** : `reference` (identifiant du paiement ou du remboursement chez AfriMove) est
 *    renvoyée telle quelle ; rejouer un appel avec la même référence ne déclenche jamais un second
 *    prélèvement ni un second remboursement ;
 *  - **répartition à la source** : l'agrégateur crédite directement le compte de la compagnie (prix
 *    du billet) et celui d'AfriMove (frais). AfriMove ne reçoit jamais le prix du billet.
 */

export interface LigneRepartition {
  beneficiaire: Beneficiaire;
  /** Compte du bénéficiaire chez l'agrégateur. */
  compteId: string;
  montantFcfa: number;
}

export interface DemandeEncaissement {
  reference: string;
  moyen: MoyenEnLigne;
  montantFcfa: number;
  /** Carte étrangère : montant débité dans la devise du payeur (unité mineure). */
  devise: { code: string; montantMineur: number } | null;
  /** Mobile : numéro qui reçoit la demande de confirmation, format `+237…`. */
  telephone: string | null;
  /** Carte : jeton produit par le prestataire. Jamais un numéro de carte. */
  jetonCarte: string | null;
  /** Texte court sans donnée personnelle (« Alpha Voyages · Douala → Yaoundé »). */
  libelle: string;
  repartition: LigneRepartition[];
}

export type EtatTransaction = "en_attente" | "reussi" | "echoue";

export interface ReponseEncaissement {
  idFournisseur: string;
  etat: EtatTransaction;
  /** Carte : adresse d'authentification 3-D Secure. */
  urlAuthentification: string | null;
  referenceOperateur: string | null;
  operateur: OperateurMobile | null;
  /** Code court de l'agrégateur si l'état est `echoue`. */
  code: string | null;
}

export interface StatutTransaction {
  idFournisseur: string;
  etat: EtatTransaction;
  montantFcfa: number | null;
  referenceOperateur: string | null;
  operateur: OperateurMobile | null;
  code: string | null;
  at: Date;
}

export interface DemandeRemboursementAgregateur {
  /** Identifiant du remboursement chez AfriMove. */
  reference: string;
  idFournisseurPaiement: string;
  montantFcfa: number;
  /** Part reprise à chaque bénéficiaire. */
  lignes: Array<{ beneficiaire: Beneficiaire; montantFcfa: number }>;
}

export interface ReponseRemboursement {
  idFournisseur: string;
  etat: EtatTransaction;
  referenceOperateur: string | null;
  code: string | null;
}

/** Un événement annoncé par l'agrégateur (webhook). */
export interface NotificationAgregateur {
  /** Identifiant unique de l'événement : sert à ignorer les doublons. */
  evenementId: string;
  type: "encaissement" | "remboursement";
  idFournisseur: string;
  /** Notre référence (paiement ou remboursement), si l'agrégateur la renvoie. */
  reference: string | null;
  etat: "reussi" | "echoue";
  montantFcfa: number | null;
  referenceOperateur: string | null;
  operateur: OperateurMobile | null;
  code: string | null;
  at: Date;
}

/** L'opération n'a pas pu aboutir cette fois ; réessayer plus tard peut réussir. */
export class ErreurAgregateurTemporaire extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurAgregateurTemporaire";
  }
}

/** L'agrégateur refuse pour de bon (carte refusée, numéro invalide, solde insuffisant). */
export class ErreurAgregateurDefinitive extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ErreurAgregateurDefinitive";
  }
}

export interface RequeteNotification {
  /** En-têtes en minuscules. */
  entetes: Readonly<Record<string, string | undefined>>;
  /** Corps exact reçu : la signature se calcule dessus. */
  corpsBrut: string | null;
  maintenant: Date;
}

/** Notification non authentique, périmée ou illisible. */
export class NotificationInvalide extends Error {
  constructor(
    readonly raison: "signature" | "horodatage" | "format",
    message: string,
  ) {
    super(message);
    this.name = "NotificationInvalide";
  }
}

export abstract class AgregateurPaiement {
  /** Nom stable : clé dans l'URL du webhook et au journal. */
  abstract readonly nom: string;
  /** `true` pour un agrégateur qui déplace vraiment de l'argent. */
  abstract readonly reel: boolean;

  /**
   * Lance l'encaissement. Rend l'état connu de l'agrégateur : le plus souvent `en_attente` (le
   * client confirme sur son téléphone ou à sa banque), parfois déjà `reussi` ou `echoue`. Lève
   * `ErreurAgregateurDefinitive` (refus) ou `ErreurAgregateurTemporaire` ; toute autre erreur est
   * traitée comme temporaire.
   */
  abstract initier(demande: DemandeEncaissement): Promise<ReponseEncaissement>;

  /** État d'une transaction d'après notre référence ; `null` si l'agrégateur ne la connaît pas. */
  abstract consulter(reference: string): Promise<StatutTransaction | null>;

  abstract rembourser(demande: DemandeRemboursementAgregateur): Promise<ReponseRemboursement>;

  /** Taux du jour : FCFA pour 1 unité de la devise, en millièmes (440 000 = 440 F). `null` : devise inconnue. */
  abstract tauxMillieme(devise: string): Promise<number | null>;

  /** Vérifie l'authenticité de l'appel et en lit les événements. Lève `NotificationInvalide`. */
  abstract lireNotifications(requete: RequeteNotification): NotificationAgregateur[];
}

/* ------------------------------------------------------------------------------------ signature */

/** Tolérance sur l'horodatage signé : au-delà, l'appel est refusé (rejeu d'un vieil appel). */
export const TOLERANCE_HORODATAGE_MS = 5 * 60_000;

export const ENTETE_SIGNATURE = "x-paiement-signature";
export const ENTETE_HORODATAGE = "x-paiement-horodatage";

/** HMAC-SHA-256 hexadécimal de `<horodatage en secondes>.<corps>`. */
export function signerNotification(
  secret: string,
  horodatageSecondes: number,
  corpsBrut: string,
): string {
  return createHmac("sha256", secret).update(`${horodatageSecondes}.${corpsBrut}`).digest("hex");
}

/** Contrôle la signature et la fraîcheur d'un appel. Lève `NotificationInvalide`. */
export function verifierSignature(secret: string, requete: RequeteNotification): string {
  const signature = requete.entetes[ENTETE_SIGNATURE];
  const horodatage = requete.entetes[ENTETE_HORODATAGE];
  if (requete.corpsBrut === null || !signature || !horodatage || !/^\d{9,12}$/.test(horodatage)) {
    throw new NotificationInvalide("signature", "Signature absente ou corps illisible");
  }
  const attendue = Buffer.from(
    signerNotification(secret, Number(horodatage), requete.corpsBrut),
    "hex",
  );
  const recue = /^[0-9a-f]{64}$/i.test(signature) ? Buffer.from(signature, "hex") : null;
  if (!recue || recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) {
    throw new NotificationInvalide("signature", "Signature invalide");
  }
  if (
    Math.abs(requete.maintenant.getTime() - Number(horodatage) * 1000) > TOLERANCE_HORODATAGE_MS
  ) {
    throw new NotificationInvalide("horodatage", "Horodatage hors tolérance");
  }
  return requete.corpsBrut;
}

/**
 * Lecture commune du corps d'une notification :
 * `{ "evenements": [{ "id", "type": "encaissement"|"remboursement", "transaction", "reference?",
 * "etat": "reussi"|"echoue", "montant?", "referenceOperateur?", "operateur?": "mtn"|"orange",
 * "code?", "at" }] }`. Le format réel dépend de l'agrégateur retenu ; son adaptateur remplace
 * cette fonction.
 */
export function lireCorpsNotifications(corps: string): NotificationAgregateur[] {
  let json: unknown;
  try {
    json = JSON.parse(corps);
  } catch {
    throw new NotificationInvalide("format", "Corps JSON illisible");
  }
  const liste = (json as { evenements?: unknown } | null)?.evenements;
  if (!Array.isArray(liste) || liste.length > 200) {
    throw new NotificationInvalide("format", "Liste d'événements absente ou trop longue");
  }
  return liste.map((brut: unknown) => {
    const e = (brut ?? {}) as Record<string, unknown>;
    const at = typeof e["at"] === "string" ? new Date(e["at"]) : null;
    const montant = e["montant"];
    if (
      typeof e["id"] !== "string" ||
      e["id"] === "" ||
      e["id"].length > 128 ||
      (e["type"] !== "encaissement" && e["type"] !== "remboursement") ||
      typeof e["transaction"] !== "string" ||
      e["transaction"] === "" ||
      (e["etat"] !== "reussi" && e["etat"] !== "echoue") ||
      !at ||
      !Number.isFinite(at.getTime()) ||
      (montant !== undefined && (typeof montant !== "number" || !Number.isInteger(montant)))
    ) {
      throw new NotificationInvalide("format", "Événement mal formé");
    }
    return {
      evenementId: e["id"],
      type: e["type"],
      idFournisseur: e["transaction"],
      reference: typeof e["reference"] === "string" ? e["reference"] : null,
      etat: e["etat"],
      montantFcfa: typeof montant === "number" ? montant : null,
      referenceOperateur:
        typeof e["referenceOperateur"] === "string" ? e["referenceOperateur"].slice(0, 80) : null,
      operateur: e["operateur"] === "mtn" || e["operateur"] === "orange" ? e["operateur"] : null,
      code: typeof e["code"] === "string" ? e["code"].slice(0, 40) : null,
      at,
    };
  });
}
