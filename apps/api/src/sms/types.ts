/**
 * Vocabulaire de la passerelle SMS (AM-166) : types de message, statuts de livraison, forme d'un
 * message au journal. Aucune dépendance Nest ici : ces types servent aux ports et aux tests.
 */

/** Les SMS que la plateforme sait envoyer (un gabarit par type, voir `gabarits.ts`). */
export const TYPES_SMS = [
  "billet",
  "code_retrait",
  "alerte_proche",
  "retard",
  "pin_provisoire",
  "code_connexion",
  "systeme",
] as const;
export type TypeSms = (typeof TYPES_SMS)[number];

/** Libellés pour l'administration (tableau des coûts). */
export const LIBELLES_TYPES_SMS: Readonly<Record<TypeSms, string>> = {
  billet: "Billet (QR, lien et code)",
  code_retrait: "Code de retrait du colis",
  alerte_proche: "Alerte au proche (arrivée)",
  retard: "Retard du bus",
  pin_provisoire: "PIN provisoire",
  code_connexion: "Code de connexion du voyageur",
  systeme: "Codes de connexion et messages système",
};

/**
 * Cycle de vie d'un message :
 *
 *  `en_file` → `envoye` (accepté par le fournisseur) → `livre` | `non_livre` (accusé de l'opérateur)
 *  `en_file` → `en_reprise` (un essai a échoué, un autre est programmé) → … → `echec`
 *  `en_file` | `en_reprise` → `expire` (le message n'a plus d'intérêt) | `annule`
 */
export const STATUTS_SMS = [
  "en_file",
  "en_reprise",
  "envoye",
  "livre",
  "non_livre",
  "echec",
  "expire",
  "annule",
] as const;
export type StatutSms = (typeof STATUTS_SMS)[number];

/** Statuts où le fournisseur a accepté le message : c'est à ce moment que le SMS est facturé. */
export const STATUTS_FACTURES: readonly StatutSms[] = ["envoye", "livre", "non_livre"];
/** Statuts où le message attend encore un envoi. */
export const STATUTS_EN_ATTENTE: readonly StatutSms[] = ["en_file", "en_reprise"];

export type EncodageSms = "gsm7" | "ucs2";

export interface ReferenceMetier {
  /** `billet`, `colis`, `depart`, `personne`… */
  type: string;
  id: string;
}

/**
 * Un message au journal (table `sms_message`). Le numéro est chiffré ; le texte n'est jamais
 * conservé ici (il peut contenir un code ou un PIN) : il n'existe que chiffré dans la charge utile
 * de la file, le temps de l'envoi.
 */
export interface MessageSms {
  id: string;
  type: TypeSms;
  /** Clé d'idempotence : la même clé ne crée jamais deux messages. */
  cle: string;
  reference: ReferenceMetier | null;
  compagnieId: string | null;
  demandeurId: string | null;
  destinataireChiffre: string;
  /** Index aveugle du numéro : retrouver et limiter les envois sans le déchiffrer. */
  destinataireIndex: string;
  /** Pour l'écran : `+237 ••••• 345`. */
  destinataireMasque: string;
  expediteur: string;
  statut: StatutSms;
  encodage: EncodageSms;
  caracteres: number;
  segments: number;
  /** Facturé à l'acceptation par le fournisseur ; 0 avant. */
  coutFcfa: number;
  /** Ce que coûtera le message s'il part. */
  coutEstimeFcfa: number;
  /** Essais d'envoi faits (un essai peut parcourir plusieurs fournisseurs). */
  tentatives: number;
  fournisseur: string | null;
  idFournisseur: string | null;
  /** Code court de la dernière erreur (jamais de texte du message). */
  derniereErreur: string | null;
  creeA: Date;
  /** Envoi différé (alerte 15 min avant l'arrivée…). */
  planifieA: Date | null;
  expireA: Date | null;
  envoyeA: Date | null;
  livreA: Date | null;
  /** Du moment voulu (création ou planification) à l'acceptation par le fournisseur. */
  delaiEnvoiMs: number | null;
}

/** Ce que l'API et les autres modules voient d'un message : sans le numéro chiffré ni son index. */
export type VueMessageSms = Omit<MessageSms, "destinataireChiffre" | "destinataireIndex">;

export function vueMessage(m: MessageSms): VueMessageSms {
  const { destinataireChiffre: _chiffre, destinataireIndex: _index, ...vue } = m;
  return vue;
}

export type ResultatEssai = "accepte" | "temporaire" | "definitif";

/** Un appel à un fournisseur (table `sms_essai`) : qui, quand, combien de temps, quel résultat. */
export interface EssaiSms {
  messageId: string;
  /** Numéro de l'essai d'envoi (1, 2, …) ; plusieurs lignes si le secours a pris le relais. */
  numero: number;
  fournisseur: string;
  at: Date;
  dureeMs: number;
  resultat: ResultatEssai;
  /** Code court (`delai_depasse`, `destinataire_invalide`…), `null` si accepté. */
  code: string | null;
}
