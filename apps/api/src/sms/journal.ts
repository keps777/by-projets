import type { EssaiSms, MessageSms, ReferenceMetier, StatutSms, TypeSms } from "./types";

export interface FiltreMessages {
  /** Absent : toutes les compagnies. `null` : les messages sans compagnie. */
  compagnieId?: string | null;
  type?: TypeSms;
  statut?: StatutSms;
  reference?: ReferenceMetier;
  demandeurId?: string;
  /** Création à partir de cet instant (inclus). */
  du?: Date;
  /** Création avant cet instant (exclu). */
  au?: Date;
  /** Plus récents d'abord. Absent : pas de limite (statistiques). */
  limite?: number;
}

export interface FiltreComptage {
  depuis: Date;
  demandeurId?: string;
  destinataireIndex?: string;
  types?: readonly TypeSms[];
}

/**
 * Port de persistance des messages et de leurs essais. `journal-memoire.ts` en est la version en
 * mémoire. **La version PostgreSQL n'est pas écrite** (tables `sms_message` et `sms_essai`, voir le
 * README du dossier : elles demandent `apps/api/prisma/**`, hors du périmètre d'AM-166).
 */
export abstract class JournalSms {
  /** `true` pour un adaptateur qui garde ses données après un redémarrage. */
  abstract readonly durable: boolean;

  /**
   * Crée le message, sauf si la clé d'idempotence existe déjà : le message existant est alors
   * rendu avec `cree: false`. Atomique (index unique sur `cle`).
   */
  abstract creer(message: MessageSms): Promise<{ cree: boolean; message: MessageSms }>;
  abstract trouver(id: string): Promise<MessageSms | null>;
  abstract trouverParCle(cle: string): Promise<MessageSms | null>;
  abstract trouverParFournisseur(
    fournisseur: string,
    idFournisseur: string,
  ): Promise<MessageSms | null>;

  /**
   * Fusionne `modifs` dans le message. Si `seulementSi` est donné, ne fait rien (renvoie `null`)
   * quand le statut actuel n'en fait pas partie : c'est ce qui rend les changements de statut sûrs
   * quand un accusé et un réessai se croisent (`UPDATE … WHERE statut = ANY(…)`).
   */
  abstract modifier(
    id: string,
    modifs: Partial<Omit<MessageSms, "id">>,
    seulementSi?: readonly StatutSms[],
  ): Promise<MessageSms | null>;

  abstract lister(filtre: FiltreMessages): Promise<MessageSms[]>;
  abstract compter(filtre: FiltreComptage): Promise<number>;

  abstract ajouterEssai(essai: EssaiSms): Promise<void>;
  abstract essais(messageId: string): Promise<EssaiSms[]>;
}
