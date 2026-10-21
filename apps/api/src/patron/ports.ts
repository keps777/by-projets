import type {
  ActivitePersonne,
  AlerteEcrite,
  ArretBus,
  ChangementMembre,
  CompagniePatron,
  ConfirmationMomo,
  DepartExploitation,
  DossierEnAttente,
  EvenementJournal,
  GarePatron,
  MembrePatron,
  NouveauMembre,
  OperateurMomo,
  PanneSignalee,
  PropositionEnAttente,
  ReglesLues,
} from "./modele";
import type { patron as c } from "@afrimove/contrats";

/**
 * Ports du module patron. Le module n'a pas de source de chiffres à lui : il **lit** ce que les autres
 * modules ont écrit (caisse, billetterie, colis, supervision, rapport du soir, GPS, assistant) et
 * n'écrit que ses réglages (équipe, règles, comptes mobile money). Les lignes, leurs horaires et leurs réglages
 * appartiennent au module administration (`LignesService`, lu par l'accueil des réglages). Ce qui existe déjà derrière
 * un port d'un autre module est lu par ce port (`SessionsCaisse`, `VentesBillets`, `ActiviteColis`,
 * `CaissesDuJour`, `DepartsDuJour`, `ReglesAgence`) ; les ports ci-dessous couvrent le reste.
 *
 * Chaque port a une version en mémoire (`memoire.ts`, tests et développement) et une version
 * PostgreSQL (`postgres.ts`). `durable = false` fait refuser le démarrage en production.
 *
 * Tous les ports reçoivent la compagnie du patron : **une requête ne sort jamais de sa compagnie**.
 */

export interface Durable {
  readonly durable: boolean;
}

/* ------------------------------------------------------------------ référentiel */

/** La compagnie, ses gares (avec leurs téléphones de guichet) et sa flotte. */
export abstract class ReferentielPatron implements Durable {
  abstract readonly durable: boolean;
  abstract compagnie(id: string): Promise<CompagniePatron | null>;
  /** Les gares de la compagnie, par ordre alphabétique. `maintenant` date « synchronisé récemment ». */
  abstract gares(compagnieId: string, maintenant: Date): Promise<GarePatron[]>;
  abstract nbBus(compagnieId: string): Promise<number>;
}

/* ------------------------------------------------------------------ exploitation du jour */

/** Départs du jour, bus en route, arrêts et pannes, propositions de l'assistant, colis en correspondance. */
export abstract class ExploitationPatron implements Durable {
  abstract readonly durable: boolean;
  /** Les départs de la gare ou de la compagnie dont l'heure tombe dans le jour de Douala `AAAA-MM-JJ`. */
  abstract departsDuJour(compagnieId: string, jour: string): Promise<DepartExploitation[]>;
  /** Bus distincts dont un départ est parti et n'est pas arrivé. */
  abstract busEnRoute(compagnieId: string): Promise<number>;
  /** Les bus arrêtés hors arrêt dont l'alerte est encore ouverte. */
  abstract arretsOuverts(compagnieId: string): Promise<ArretBus[]>;
  /** Les pannes signalées depuis `depuis`. */
  abstract pannesDepuis(compagnieId: string, depuis: Date): Promise<PanneSignalee[]>;
  /** Les propositions de l'assistant que le patron n'a pas encore appliquées et qui n'ont pas expiré. */
  abstract propositionsEnAttente(
    compagnieId: string,
    maintenant: Date,
  ): Promise<PropositionEnAttente[]>;
  /**
   * Par identifiant de ligne, le décalage de départ que l'assistant propose et que le patron n'a pas appliqué
   * (« 10:00 → 09:15 »), pour l'accueil des réglages.
   */
  abstract decalagesProposes(
    compagnieId: string,
    maintenant: Date,
  ): Promise<Record<string, string>>;
  /** Colis remis par une compagnie et pas encore reçus par la suivante, avec l'instant du plus ancien. */
  abstract colisEnCorrespondance(
    compagnieId: string,
  ): Promise<{ nombre: number; depuis: Date | null }>;
  /** Colis arrivés dans un relais et destinés à la gare (`en_relais`). */
  abstract colisAuRelais(gareId: string): Promise<number>;
  /** Les derniers événements du journal signé de la gare depuis `depuis`, du plus récent au plus ancien. */
  abstract journalDeGare(gareId: string, depuis: Date, limite: number): Promise<EvenementJournal[]>;
  /** Les dossiers de financement envoyés ou en analyse : la réponse du partenaire est attendue. */
  abstract dossiersFinancementEnAttente(compagnieId: string): Promise<DossierEnAttente[]>;
}

/** Les alertes écrites par la caisse et la supervision (`alerte_patron`), de la plus récente à la plus ancienne. */
export abstract class AlertesEcrites implements Durable {
  abstract readonly durable: boolean;
  abstract depuis(compagnieId: string, depuis: Date): Promise<AlerteEcrite[]>;
}

/* ------------------------------------------------------------------ équipe */

/** Les personnes de l'équipe, leurs réglages (`personne_reglage`) et ce qu'elles ont fait. */
export abstract class EquipePatron implements Durable {
  abstract readonly durable: boolean;
  /** L'équipe active (six rôles), toutes gares confondues. `maintenant` date « du jour » et « en service ». */
  abstract lister(compagnieId: string, maintenant: Date): Promise<MembrePatron[]>;
  /** Une personne de la compagnie, active ou non. */
  abstract trouver(
    compagnieId: string,
    personneId: string,
    maintenant: Date,
  ): Promise<MembrePatron | null>;
  abstract activite(personneId: string, depuis: Date): Promise<ActivitePersonne>;
  /** Le guichet de rang `rang` de la gare, s'il existe. */
  abstract guichetDeGare(gareId: string, rang: number): Promise<string | null>;
  /** Crée le compte et ses réglages d'un seul tenant. Lève `TelephoneDejaUtilise` si le numéro est pris. */
  abstract creer(membre: NouveauMembre): Promise<void>;
  abstract modifier(personneId: string, changement: ChangementMembre): Promise<void>;
  abstract desactiver(personneId: string): Promise<void>;
}

/* ------------------------------------------------------------------ règles et comptes mobile money */

export abstract class ReglesPatron implements Durable {
  abstract readonly durable: boolean;
  /** Les règles réglées ; la tolérance de caisse peut être `null` (règle par défaut de la caisse). */
  abstract lire(compagnieId: string): Promise<ReglesLues | null>;
  /** Écrit les règles et la tolérance d'écart (`compagnie.toleranceEcartCaisse`) d'un seul tenant. */
  abstract ecrire(
    compagnieId: string,
    regles: c.ReglesModifiables,
    par: string,
    a: Date,
  ): Promise<void>;

  /** Les numéros chiffrés des comptes marchands (`null` : jamais réglé). */
  abstract comptes(compagnieId: string): Promise<Record<OperateurMomo, string | null>>;
  /** Mémorise la demande de confirmation (la dernière remplace la précédente). */
  abstract demanderConfirmation(
    compagnieId: string,
    operateur: OperateurMomo,
    confirmation: Omit<ConfirmationMomo, "essais">,
  ): Promise<void>;
  abstract confirmation(
    compagnieId: string,
    operateur: OperateurMomo,
  ): Promise<ConfirmationMomo | null>;
  /** Compte un essai raté ; répond le nombre d'essais après celui-ci. */
  abstract compterEssai(compagnieId: string, operateur: OperateurMomo): Promise<number>;
  /** Pose le nouveau compte, garde l'ancien jusqu'à `ancienJusqua` et supprime la confirmation, d'un seul tenant. */
  abstract changerCompte(
    compagnieId: string,
    operateur: OperateurMomo,
    nouveauChiffre: string,
    ancienJusqua: Date,
    par: string,
    a: Date,
  ): Promise<void>;
}
