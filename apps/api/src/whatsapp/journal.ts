import type {
  EssaiWhatsApp,
  MessageEntrant,
  MessageWhatsApp,
  ReferenceMetier,
  StatutWhatsApp,
  TypeWhatsApp,
} from "./types";

export interface FiltreMessages {
  /** Absent : toutes les compagnies. `null` : les messages sans compagnie. */
  compagnieId?: string | null;
  type?: TypeWhatsApp;
  statut?: StatutWhatsApp;
  reference?: ReferenceMetier;
  demandeurId?: string;
  /** Création à partir de cet instant (inclus). */
  du?: Date;
  /** Création avant cet instant (exclu). */
  au?: Date;
  /** Plus récents d'abord. Absent : pas de limite. */
  limite?: number;
}

export interface FiltreComptage {
  depuis: Date;
  demandeurId?: string;
  destinataireIndex?: string;
  types?: readonly TypeWhatsApp[];
}

/**
 * Port de persistance des messages, de leurs essais et des messages reçus. `journal-memoire.ts` en
 * est la version en mémoire ; `postgres.ts` est celle de PostgreSQL (tables `whatsapp_message`,
 * `whatsapp_essai`, `whatsapp_entrant`, migration `20261017000760_whatsapp`), choisie par
 * `API_STOCKAGE`.
 */
export abstract class JournalWhatsApp {
  /** `true` pour un adaptateur qui garde ses données après un redémarrage. */
  abstract readonly durable: boolean;

  /**
   * Crée le message, sauf si la clé d'idempotence existe déjà : le message existant est alors
   * rendu avec `cree: false`. Atomique (index unique sur `cle`).
   */
  abstract creer(message: MessageWhatsApp): Promise<{ cree: boolean; message: MessageWhatsApp }>;
  abstract trouver(id: string): Promise<MessageWhatsApp | null>;
  abstract trouverParCle(cle: string): Promise<MessageWhatsApp | null>;
  abstract trouverParFournisseur(idFournisseur: string): Promise<MessageWhatsApp | null>;

  /**
   * Fusionne `modifs` dans le message. Si `seulementSi` est donné, ne fait rien (renvoie `null`)
   * quand le statut actuel n'en fait pas partie : c'est ce qui rend les changements de statut sûrs
   * quand un accusé et un réessai se croisent (`UPDATE … WHERE statut = ANY(…)`).
   */
  abstract modifier(
    id: string,
    modifs: Partial<Omit<MessageWhatsApp, "id">>,
    seulementSi?: readonly StatutWhatsApp[],
  ): Promise<MessageWhatsApp | null>;

  /**
   * Passe `secours` de `aucun` à `en_cours`, une seule fois (`UPDATE … WHERE secours = 'aucun'`).
   * Rend le message si ce appel a obtenu le repli, `null` s'il était déjà demandé.
   */
  abstract reserverSecours(id: string): Promise<MessageWhatsApp | null>;

  /** Efface le texte de repli chiffré des messages créés avant `avant` ; rend leur nombre. */
  abstract effacerSecoursAvant(avant: Date): Promise<number>;

  abstract lister(filtre: FiltreMessages): Promise<MessageWhatsApp[]>;
  abstract compter(filtre: FiltreComptage): Promise<number>;

  abstract ajouterEssai(essai: EssaiWhatsApp): Promise<void>;
  abstract essais(messageId: string): Promise<EssaiWhatsApp[]>;

  /* ------------------------------------------------------------------------- messages reçus */

  /** Enregistre un message reçu ; `false` si l'identifiant WhatsApp existait déjà (doublon). */
  abstract enregistrerEntrant(entrant: MessageEntrant): Promise<boolean>;

  /** Dernier message reçu de ce numéro (ouvre la fenêtre de 24 h). */
  abstract dernierEntrant(expediteurIndex: string): Promise<MessageEntrant | null>;

  /**
   * Note la réponse du compte au plus ancien message de ce numéro resté sans réponse et reçu depuis
   * moins de `fenetreMs`. Rend ce message (avec son délai) ou `null`.
   */
  abstract marquerReponse(
    expediteurIndex: string,
    at: Date,
    fenetreMs: number,
  ): Promise<MessageEntrant | null>;

  /** Délais de réponse (ms) des messages reçus depuis `depuis` qui ont reçu une réponse. */
  abstract delaisReponse(depuis: Date): Promise<number[]>;
}
