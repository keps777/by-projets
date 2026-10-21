/**
 * Vocabulaire de la passerelle WhatsApp Business (AM-167) : types de message, statuts de livraison,
 * forme d'un message et d'un message entrant au journal. Aucune dépendance Nest ici.
 */

/**
 * Les messages que la plateforme sait envoyer. Chaque type, sauf `reponse`, correspond à un gabarit
 * approuvé par WhatsApp (voir `gabarits.ts`). `reponse` est un texte libre, permis seulement dans
 * les 24 heures qui suivent un message reçu de la personne.
 */
export const TYPES_WHATSAPP = [
  "rapport_soir",
  "billet",
  "colis",
  "alerte_proche",
  "alerte_retard",
  "reponse",
] as const;
export type TypeWhatsApp = (typeof TYPES_WHATSAPP)[number];

export const LIBELLES_TYPES_WHATSAPP: Readonly<Record<TypeWhatsApp, string>> = {
  rapport_soir: "Rapport du soir (21 h)",
  billet: "Billet (lien et code)",
  colis: "Code de retrait du colis",
  alerte_proche: "Alerte au proche (arrivée)",
  alerte_retard: "Retard du bus",
  reponse: "Réponse à un message reçu",
};

/**
 * Cycle de vie d'un message :
 *
 *  `en_file` → `envoye` (accepté par WhatsApp) → `remis` (sur le téléphone) → `lu`
 *  `en_file` | `envoye` → `non_remis` (accusé d'échec : numéro sans WhatsApp, téléphone injoignable)
 *  `en_file` → `en_reprise` (un essai a échoué, un autre est programmé) → … → `echec`
 *  `en_file` | `en_reprise` → `expire` (le message n'a plus d'intérêt) | `annule`
 */
export const STATUTS_WHATSAPP = [
  "en_file",
  "en_reprise",
  "envoye",
  "remis",
  "lu",
  "non_remis",
  "echec",
  "expire",
  "annule",
] as const;
export type StatutWhatsApp = (typeof STATUTS_WHATSAPP)[number];

/** Statuts où le message attend encore un essai d'envoi. */
export const STATUTS_EN_ATTENTE: readonly StatutWhatsApp[] = ["en_file", "en_reprise"];
/** Statuts où WhatsApp a accepté le message. */
export const STATUTS_ACCEPTES: readonly StatutWhatsApp[] = ["envoye", "remis", "lu"];

/**
 * Repli par SMS quand WhatsApp ne peut pas remettre le message :
 * `aucun` (pas de repli), `en_cours` (demandé), `sms` (confié à la passerelle SMS), `echec_sms`
 * (le repli lui-même a échoué : le message est perdu, l'audit le dit).
 */
export type EtatSecours = "aucun" | "en_cours" | "sms" | "echec_sms";

export interface ReferenceMetier {
  /** `rapport_soir`, `billet`, `colis`, `depart`… */
  type: string;
  id: string;
}

/**
 * Un message au journal (table `whatsapp_message`). Le numéro est chiffré. Le contenu (chiffres du
 * rapport, code de retrait, lien du billet) n'est jamais conservé en clair : il n'existe que chiffré
 * dans la charge utile de la file et, le temps d'attendre l'accusé de livraison, sous forme de texte
 * de repli chiffré (`secoursChiffre`, effacé dès que le message est remis).
 */
export interface MessageWhatsApp {
  id: string;
  type: TypeWhatsApp;
  /** Clé d'idempotence : la même clé ne crée jamais deux messages. */
  cle: string;
  /** Nom du gabarit chez WhatsApp ; `null` pour une réponse en texte libre. */
  gabarit: string | null;
  reference: ReferenceMetier | null;
  compagnieId: string | null;
  demandeurId: string | null;
  destinataireChiffre: string;
  /** Index aveugle du numéro : retrouver et limiter les envois sans le déchiffrer. */
  destinataireIndex: string;
  /** Pour l'écran : `+237 ••••• 345`. */
  destinataireMasque: string;
  statut: StatutWhatsApp;
  /** Essais d'envoi faits. */
  tentatives: number;
  /** Identifiant du message chez WhatsApp (`wamid…`) : clé des accusés. */
  idFournisseur: string | null;
  /** Code court de la dernière erreur (jamais de texte du message). */
  derniereErreur: string | null;
  secours: EtatSecours;
  /** Identifiant du SMS de repli dans la passerelle SMS. */
  secoursSmsId: string | null;
  /** Texte du SMS de repli, chiffré ; `null` s'il n'y a pas de repli ou s'il n'a plus d'objet. */
  secoursChiffre: string | null;
  creeA: Date;
  /** Envoi différé. */
  planifieA: Date | null;
  expireA: Date | null;
  envoyeA: Date | null;
  remisA: Date | null;
  luA: Date | null;
  /** Du moment voulu (création ou planification) à l'acceptation par WhatsApp. */
  delaiEnvoiMs: number | null;
}

/** Ce que l'API et les autres modules voient d'un message. */
export type VueMessageWhatsApp = Omit<
  MessageWhatsApp,
  "destinataireChiffre" | "destinataireIndex" | "secoursChiffre"
>;

export function vueMessage(m: MessageWhatsApp): VueMessageWhatsApp {
  const {
    destinataireChiffre: _chiffre,
    destinataireIndex: _index,
    secoursChiffre: _secours,
    ...vue
  } = m;
  return vue;
}

export type ResultatEssai = "accepte" | "temporaire" | "definitif";

/** Un appel à WhatsApp (table `whatsapp_essai`). */
export interface EssaiWhatsApp {
  messageId: string;
  numero: number;
  fournisseur: string;
  at: Date;
  dureeMs: number;
  resultat: ResultatEssai;
  /** Code court (`delai_depasse`, `pas_sur_whatsapp`…), `null` si accepté. */
  code: string | null;
}

/**
 * Un message reçu d'une personne (table `whatsapp_entrant`). Le texte n'est pas conservé : il est
 * remis au `GestionnaireEntrants` (l'assistant) puis oublié. On garde de quoi mesurer le délai de
 * réponse du compte (« répond en 2 min »).
 */
export interface MessageEntrant {
  id: string;
  idFournisseur: string;
  expediteurIndex: string;
  expediteurMasque: string;
  /** `text`, `button`, `interactive`, `image`… tel que WhatsApp le nomme. */
  typeMessage: string;
  recuA: Date;
  /** Première réponse en texte libre du compte ; `null` tant qu'on n'a pas répondu. */
  repondueA: Date | null;
  delaiReponseMs: number | null;
}
