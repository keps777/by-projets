import type {
  Beneficiaire,
  LienPaiement,
  Paiement,
  ReglageMode,
  Remboursement,
  StatutPaiement,
  StatutRemboursement,
} from "./modeles";

/**
 * Ports des paiements : tout ce que le module lit ou écrit passe par ces classes abstraites.
 * `memoire.ts` en donne des versions en mémoire (tests, développement) ; les adaptateurs PostgreSQL
 * (tables décrites dans le README) les remplacent à l'intégration. `PaiementsModule` refuse de
 * démarrer en production tant qu'un port de stockage est encore en mémoire.
 *
 * Les ports « comparer et remplacer » (`transitionner`, `ouvrir`, `confirmer`, `ajouter`) sont ce qui
 * garde les paiements cohérents quand deux appels se croisent : un webhook rejoué, deux appareils,
 * deux instances de l'API. En base, ce sont des `UPDATE … WHERE statut = ANY(…)` et des index
 * uniques partiels.
 */

/** Marque d'un adaptateur qui perd ses données au redémarrage. */
export interface StockagePaiements {
  readonly durable: boolean;
}

/* ------------------------------------------------------------------ paiements */

export type ResultatOuverture =
  | { cree: true }
  /** Un paiement est déjà en attente pour cette commande, ou la clé d'idempotence est connue. */
  | { cree: false; raison: "en_cours" | "cle_connue"; existant: Paiement };

export interface FiltrePaiements {
  du?: Date;
  /** Exclu. */
  au?: Date;
  compagnieId?: string;
  statut?: StatutPaiement;
  limite: number;
}

export abstract class Paiements {
  /**
   * Enregistre le paiement sauf si la commande a déjà un paiement `en_attente` ou si `cle` existe
   * (index uniques partiels `(commande_id) WHERE statut = 'en_attente'` et `(cle)`).
   */
  abstract ouvrir(paiement: Paiement): Promise<ResultatOuverture>;
  abstract trouver(id: string): Promise<Paiement | null>;
  abstract parIdFournisseur(fournisseur: string, idFournisseur: string): Promise<Paiement | null>;
  abstract parCle(cle: string): Promise<Paiement | null>;
  abstract duCommande(commandeId: string): Promise<Paiement[]>;
  /**
   * Applique `changement` si le paiement est encore dans l'un des statuts `de` ; `null` sinon
   * (déjà changé, ou inconnu).
   */
  abstract transitionner(
    id: string,
    de: readonly StatutPaiement[],
    changement: Partial<Omit<Paiement, "id">>,
  ): Promise<Paiement | null>;
  /** Change des champs sans condition d'état (identifiants, cause, confirmation…). */
  abstract modifier(
    id: string,
    changement: Partial<Omit<Paiement, "id">>,
  ): Promise<Paiement | null>;
  /**
   * `a_faire` → `faite` avec les billets émis. Faux si une autre ligne de la même commande est déjà
   * `faite` (index unique partiel `(commande_id) WHERE confirmation = 'faite'`) : c'est ce qui
   * empêche qu'un paiement reçu deux fois produise deux jeux de billets.
   */
  abstract confirmer(id: string, billetIds: string[]): Promise<boolean>;
  /** Paiements `en_attente` créés avant `avant`, les plus anciens d'abord. */
  abstract enAttenteDepuis(avant: Date, limite: number): Promise<Paiement[]>;
  /** Paiements reçus (`reussi`) dont la commande n'est pas encore traitée. */
  abstract aConfirmer(limite: number): Promise<Paiement[]>;
  abstract lister(filtre: FiltrePaiements): Promise<Paiement[]>;
}

/* ------------------------------------------------------------------ remboursements */

export type ResultatAjoutRemboursement = "ok" | "cle_connue" | "plafond_depasse";

export abstract class Remboursements {
  /**
   * Enregistre le remboursement si sa clé est nouvelle et si, avec les remboursements déjà demandés
   * ou faits (hors échoués), chaque bénéficiaire reste dans son plafond (sa part du paiement). Une
   * seule transaction : deux demandes simultanées ne dépassent jamais le paiement.
   */
  abstract ajouter(
    remboursement: Remboursement,
    plafonds: Readonly<Record<Beneficiaire, number>>,
  ): Promise<ResultatAjoutRemboursement>;
  abstract trouver(id: string): Promise<Remboursement | null>;
  abstract parCle(cle: string): Promise<Remboursement | null>;
  abstract parIdFournisseur(idFournisseur: string): Promise<Remboursement | null>;
  abstract dePaiement(paiementId: string): Promise<Remboursement[]>;
  abstract transitionner(
    id: string,
    de: readonly StatutRemboursement[],
    changement: Partial<Omit<Remboursement, "id">>,
  ): Promise<Remboursement | null>;
  /** Remboursements `demande` dont le prochain essai est échu. */
  abstract aReprendre(maintenant: Date, limite: number): Promise<Remboursement[]>;
}

/** Événements de l'agrégateur déjà traités : un événement rejoué est ignoré. */
export abstract class NotificationsTraitees {
  /** Vrai si l'événement est nouveau (index unique `(fournisseur, evenement_id)`). */
  abstract memoriser(fournisseur: string, evenementId: string, at: Date): Promise<boolean>;
  abstract connue(fournisseur: string, evenementId: string): Promise<boolean>;
}

/** Liens de paiement envoyés à un proche. Seule l'empreinte du jeton est gardée. */
export abstract class LiensPaiement {
  /** Révoque les liens encore valables de la commande puis enregistre celui-ci. */
  abstract remplacer(lien: LienPaiement): Promise<void>;
  abstract parEmpreinte(empreinte: string): Promise<LienPaiement | null>;
}

/**
 * Compte de chaque compagnie chez l'agrégateur (sous-compte qui reçoit le prix des billets). Sans
 * compte, la compagnie ne peut pas être payée en ligne : refuser vaut mieux qu'encaisser pour elle.
 */
export abstract class ComptesReversement {
  abstract compte(compagnieId: string): Promise<string | null>;
  abstract definir(compagnieId: string, compteId: string | null): Promise<void>;
}

/** Réglage du mode dégradé (une seule ligne). `null` : jamais réglé, la configuration décide. */
export abstract class ReglagesPaiements {
  abstract lire(): Promise<ReglageMode | null>;
  abstract definir(reglage: ReglageMode): Promise<void>;
}

/* ------------------------------------------------------------------ ce que les paiements lisent ailleurs */

export interface CommandeAPayer {
  id: string;
  voyageurId: string;
  compagnieId: string;
  /** « Alpha Voyages · Douala → Yaoundé · 14:00 » : aucune donnée personnelle. */
  libelle: string;
  lignes: ReadonlyArray<{ code: string; libelle: string; montant: number }>;
  total: number;
  conversion: { devise: string; montantMineur: number; approximatif: boolean } | null;
  statut: "en_attente_paiement" | "payee" | "expiree" | "annulee";
  expireA: Date;
  nombreSieges: number;
  billetIds: string[];
}

/** Les commandes de la billetterie, vues des paiements (adaptateur : `CommandesBilletterie`). */
export abstract class CommandesAPayer {
  abstract trouver(commandeId: string): Promise<CommandeAPayer | null>;
  /**
   * Confirme le paiement de la commande et rend les billets émis. Idempotent. Lève 409
   * `SIEGES_PERDUS` ou `COMMANDE_ANNULEE` quand la commande ne peut plus être honorée : le paiement
   * doit alors être remboursé.
   */
  abstract confirmer(commandeId: string, moyen: string): Promise<string[]>;
}

/** Envoi du lien au proche (adaptateur : `NotifieurSms`, par la passerelle SMS). */
export abstract class NotifieurPaiements {
  abstract envoyerLien(a: {
    telephone: string;
    texte: string;
    cle: string;
    compagnieId: string;
    demandeurId: string;
    commandeId: string;
  }): Promise<void>;
}

/** Ce que les paiements savent des comptes voyageurs (adaptateur : `AnnuaireComptes`). */
export abstract class AnnuaireVoyageurs {
  abstract telephone(voyageurId: string): Promise<string | null>;
  abstract prenom(voyageurId: string): Promise<string | null>;
}
