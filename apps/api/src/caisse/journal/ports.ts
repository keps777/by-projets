/**
 * Ports du journal signé et de l'idempotence des écritures de l'agence.
 *
 * Les versions PostgreSQL ne sont pas écrites : elles demandent des tables que la migration du socle
 * n'a pas (`apps/api/prisma/**` est hors du périmètre d'AM-164). Le README de `src/caisse` liste les
 * tables attendues. `memoire.ts` en donne des versions en mémoire pour les tests ; le module refuse
 * de démarrer en production tant qu'un port est en mémoire.
 */

export interface ValidationJournal {
  superviseurId: string;
  methode: "pin" | "empreinte";
  signature: string;
}

/** Une entrée du journal telle que stockée (le contrat `EntreeJournal` + de quoi filtrer). */
export interface EntreeJournalStockee {
  /** Ordre d'écriture (séquence globale), sert de curseur. */
  seq: number;
  /** Une chaîne d'empreintes par compagnie. */
  chaine: string;
  gareId: string | null;
  compagnieId: string | null;
  evenementId: string;
  type: string;
  at: string;
  auteur: { id: string; nom: string };
  appareilId: string | null;
  cible: { type: string; id: string };
  numeroPlage: number | null;
  /** « Annulation du billet 0171 » : une phrase lisible. */
  resume: string;
  validePar: ValidationJournal | null;
  empreinte: string;
  precedente: string | null;
}

export interface FiltreJournal {
  compagnieId?: string | null;
  gareId?: string | null;
  /** Entrées où la personne agit, est visée ou valide. */
  personneId?: string;
  /** Entrées dont la cible est cette session de caisse. */
  sessionId?: string;
  /** AAAA-MM-JJ (Douala). */
  jour?: string;
  /** Entrées antérieures à ce `seq` (page suivante). */
  avantSeq?: number;
  limite: number;
}

/** Journal en ajout seul. Un identifiant d'événement n'y entre qu'une fois. */
export abstract class JournalAgenceRepository {
  /** `false` en mémoire : le module refuse de démarrer en production. */
  abstract readonly durable: boolean;

  /**
   * Ajoute une entrée en tête de la chaîne `chaine`. `construire` reçoit l'empreinte de l'entrée
   * précédente de cette chaîne (null pour la première) ; l'implémentation PostgreSQL doit lire la
   * tête et écrire dans la même transaction (verrou sur la chaîne). Répond `null` si l'identifiant
   * d'événement était déjà au journal : rien n'est écrit.
   */
  abstract ajouter(
    chaine: string,
    evenementId: string,
    construire: (precedente: string | null) => Omit<EntreeJournalStockee, "seq" | "chaine">,
  ): Promise<EntreeJournalStockee | null>;

  /** Du plus récent au plus ancien. */
  abstract lister(filtre: FiltreJournal): Promise<EntreeJournalStockee[]>;

  /** Toute la chaîne, de la plus ancienne à la plus récente (vérification). */
  abstract chaine(chaine: string): Promise<EntreeJournalStockee[]>;
}

export type EtatTraitement<R> =
  | { etat: "nouveau" }
  | { etat: "en_cours" }
  | { etat: "termine"; resultat: R; recuA: string };

/**
 * Événements déjà traités : la clé d'idempotence d'une écriture est l'UUID créé sur l'appareil.
 * `commencer` doit être atomique (index unique) : deux requêtes simultanées du même événement ne
 * passent pas toutes les deux.
 */
export abstract class EvenementsTraites {
  abstract readonly durable: boolean;
  abstract commencer(evenementId: string): Promise<EtatTraitement<unknown>>;
  abstract terminer(evenementId: string, resultat: unknown, recuA: string): Promise<void>;
  /** Le traitement a échoué : l'appareil peut renvoyer l'événement. */
  abstract abandonner(evenementId: string): Promise<void>;
}
