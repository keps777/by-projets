import { SecoursIndisponible } from "./erreurs";
import type { TypeGabarit } from "./gabarits";
import type { RapportSoirEntree } from "./rapport";
import type { ReferenceMetier } from "./types";

/**
 * Ports vers le reste de la plateforme. Le module n'importe aucun autre module métier : le
 * coordinateur branche les adaptateurs réels (passerelle SMS, rapport du soir du patron, annuaire de
 * l'équipe) dans `AppModule` ; `memoire.ts` en fournit des versions pour les tests.
 */

/* ----------------------------------------------------------------------------- repli par SMS */

export interface DemandeSecoursSms {
  type: TypeGabarit;
  /**
   * Variables validées du message (billet, colis, alertes) : mêmes champs que les gabarits de la
   * passerelle SMS (`billet`, `code_retrait`, `alerte_proche`, `retard`). Les dates sont des chaînes
   * ISO. `null` pour le rapport du soir, qui n'a pas de gabarit SMS.
   */
  variables: unknown;
  /** SMS de repli pour un message sans gabarit SMS (rapport du soir) : une ligne, sans adresse web. */
  texte: string;
  /** Format international `+237…`. */
  destinataire: string;
  /** Idempotence : le même repli demandé deux fois n'envoie qu'un SMS. */
  cle: string;
  compagnieId: string | null;
  reference: ReferenceMetier | null;
}

/**
 * Canal de repli : un message que WhatsApp ne remet pas part par SMS. Adaptateur réel = la passerelle
 * SMS (`PasserelleSmsService.envoyer`, AM-166).
 */
export abstract class SecoursSms {
  /** `false` tant que le canal n'est pas branché : le module refuse alors de démarrer en production. */
  abstract readonly branche: boolean;
  abstract envoyer(demande: DemandeSecoursSms): Promise<{ messageId: string }>;
}

export class SecoursSmsAucun extends SecoursSms {
  readonly branche = false;
  async envoyer(): Promise<{ messageId: string }> {
    throw new SecoursIndisponible();
  }
}

/* ------------------------------------------------------------------------ rapport du soir */

export interface CompagnieRapport {
  id: string;
  /** Nom affiché : « Alpha Voyages ». */
  nom: string;
}

/** Données du rapport de 21 h. Adaptateur réel : le module patron (vue `/patron/rapports/soir`). */
export abstract class SourceRapportSoir {
  /** `false` pour la version vide fournie par défaut. */
  abstract readonly reel: boolean;
  /** Compagnies qui reçoivent un rapport chaque soir. */
  abstract compagnies(): Promise<CompagnieRapport[]>;
  abstract compagnie(id: string): Promise<CompagnieRapport | null>;
  /** Rapport du jour (`AAAA-MM-JJ`) ; `null` s'il n'est pas (encore) disponible. */
  abstract rapport(compagnieId: string, jour: string): Promise<RapportSoirEntree | null>;
}

export interface DestinataireRapport {
  personneId: string;
  nom: string;
  role: "patron" | "superviseur";
  /** Numéro WhatsApp de la personne, en clair (déchiffré par l'adaptateur). */
  telephone: string;
}

/** Qui reçoit le rapport : le patron et les superviseurs de la compagnie. Adaptateur réel : `personne`. */
export abstract class AnnuaireRapport {
  abstract readonly reel: boolean;
  abstract destinataires(compagnieId: string): Promise<DestinataireRapport[]>;
}

/* --------------------------------------------------------------------- messages reçus */

export interface EntrantRecu {
  /** Identifiant du message reçu au journal. */
  id: string;
  /** Format international `+237…`. */
  de: string;
  /** Texte du message (ou du bouton touché) ; `null` pour une image, un vocal… */
  texte: string | null;
  typeMessage: string;
  recuA: Date;
}

/**
 * Reçoit les messages des personnes (question posée au rapport : « Pourquoi le 09:30 Oméga part si
 * vide ? »). Adaptateur réel : l'assistant, qui répond avec `PasserelleWhatsAppService.repondre`.
 * Une erreur est journalisée mais ne fait jamais échouer le webhook.
 */
export abstract class GestionnaireEntrants {
  abstract traiter(entrant: EntrantRecu): Promise<void>;
}

export class GestionnaireEntrantsAucun extends GestionnaireEntrants {
  async traiter(): Promise<void> {
    /* personne n'écoute : le message est seulement compté */
  }
}
