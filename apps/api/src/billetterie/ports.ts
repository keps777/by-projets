import type {
  Billet,
  Commande,
  Compagnie,
  Depart,
  DepartComplet,
  EvenementTraite,
  Gare,
  Guichet,
  PlanStocke,
  ScanStocke,
  StatutCommande,
} from "./modeles";
import type { CleJwk, ContenuQr } from "./qr";
import type { EtatBillet, EtatDepart } from "./regles";
import type { FiltresDeparts } from "./schemas";

/**
 * Ports de la billetterie : tout ce qu'elle lit ou écrit passe par ces classes abstraites.
 * `memoire.ts` en donne des versions en mémoire (tests, développement) ; les adaptateurs PostgreSQL
 * (tables décrites dans le README) et ceux des autres tickets les remplacent dans le module.
 * `BilletterieModule` refuse de démarrer en production tant qu'un port est encore en mémoire.
 */

/* ------------------------------------------------------------------ catalogue */

export interface FiltreDepartsCatalogue {
  compagnieId?: string;
  gareOrigineId?: string;
  /** Code de la ville d'origine (« DLA »). */
  villeOrigine?: string;
  villeDestination?: string;
  ligneId?: string;
  /** Départs dont l'heure est dans [`de`, `avant`[ (ISO). */
  de?: string;
  avant?: string;
  etats?: readonly EtatDepart[];
}

/** Lignes, départs, bus, gares : administrés par ailleurs (patron, superviseur), lus ici. */
export abstract class Catalogue {
  abstract compagnie(id: string): Promise<Compagnie | null>;
  abstract gare(id: string): Promise<Gare | null>;
  abstract guichet(id: string): Promise<Guichet | null>;
  /** Le nom d'une ville d'après son code (« DLA » → « Douala »). */
  abstract ville(code: string): Promise<string | null>;
  /** Le guichet où travaille cette personne aujourd'hui. */
  abstract guichetDe(personneId: string): Promise<Guichet | null>;
  abstract depart(id: string): Promise<DepartComplet | null>;
  abstract departs(filtre: FiltreDepartsCatalogue): Promise<DepartComplet[]>;
  /**
   * Change l'état et les champs d'un départ si son état est encore `attendu` (comparer et
   * remplacer : deux changements simultanés ne s'écrasent pas). `null` si l'état a changé.
   */
  abstract changerDepart(
    id: string,
    attendu: EtatDepart,
    changement: Partial<Omit<Depart, "id">>,
  ): Promise<Depart | null>;
}

/* ------------------------------------------------------------------ billets */

export type ResultatAjoutBillet = "ok" | "id_pris" | "numero_pris" | "code_pris";

export abstract class Billets {
  /**
   * Refuse un identifiant, un numéro, ou un code déjà pris dans le départ par un billet non annulé
   * (index uniques en base).
   */
  abstract ajouter(billet: Billet): Promise<ResultatAjoutBillet>;
  abstract trouver(id: string): Promise<Billet | null>;
  abstract parNumero(numero: string): Promise<Billet | null>;
  abstract parEvenement(evenementId: string): Promise<Billet | null>;
  abstract parCode(departId: string, code: string): Promise<Billet | null>;
  abstract duDepart(departId: string): Promise<Billet[]>;
  abstract duGuichetEtJour(guichetId: string, aammjj: string): Promise<Billet[]>;
  abstract deLAcheteur(acheteurId: string): Promise<Billet[]>;
  /**
   * Applique `changement` si le billet est encore dans l'un des états `de` (comparer et remplacer :
   * c'est ce qui rend un double scan impossible même si deux appareils scannent au même instant).
   * `null` si le billet a changé d'état entre-temps ou n'existe pas.
   */
  abstract transitionner(
    id: string,
    de: readonly EtatBillet[],
    changement: Partial<Omit<Billet, "id" | "numero">>,
  ): Promise<Billet | null>;
}

/* ------------------------------------------------------------------ sièges */

export type ResultatSiege =
  | { ok: true; version: number }
  | { ok: false; raison: "pris" | "bloque_par_autre" };

export interface BlocageExpire {
  departId: string;
  siege: number;
  par: string;
  commandeId: string | null;
  version: number;
}

/**
 * Inventaire des sièges d'un départ. Chaque opération est **atomique** : un siège ne peut pas être
 * occupé deux fois (index unique partiel `(depart_id, siege)` en base).
 */
export abstract class Inventaire {
  abstract plan(departId: string): Promise<PlanStocke>;
  /** Bloque un siège libre (ou déjà bloqué par `par` : la fin est repoussée). */
  abstract bloquer(a: {
    departId: string;
    siege: number;
    par: string;
    commandeId: string | null;
    jusqua: string;
    maintenant: string;
  }): Promise<ResultatSiege>;
  /**
   * Lève les blocages « libres » de `par` sur ce départ (ceux qui ne tiennent pas à une commande),
   * sauf sur les sièges de `sauf` : choisir un autre siège libère le précédent.
   */
  abstract leverBlocages(
    departId: string,
    par: string,
    sauf?: readonly number[],
  ): Promise<{ siege: number; version: number }[]>;
  /** Lève les blocages d'une commande (annulée ou expirée). */
  abstract leverCommande(
    departId: string,
    commandeId: string,
  ): Promise<{ siege: number; version: number }[]>;
  /** Occupe le siège pour un billet. Un blocage de `par` est consommé, celui d'un autre refuse. */
  abstract occuper(a: {
    departId: string;
    siege: number;
    billetId: string;
    par: string | null;
    maintenant: string;
  }): Promise<ResultatSiege>;
  /** Rend le siège à la vente, seulement s'il est encore occupé par ce billet. */
  abstract liberer(
    departId: string,
    siege: number,
    billetId: string,
  ): Promise<{ version: number } | null>;
  /** Supprime les blocages dont la fin est passée. */
  abstract expirer(maintenant: string): Promise<BlocageExpire[]>;
}

/* ------------------------------------------------------------------ commandes, scans, journal */

export abstract class Commandes {
  abstract ajouter(commande: Commande): Promise<void>;
  abstract trouver(id: string): Promise<Commande | null>;
  abstract duDepart(departId: string, statut: StatutCommande): Promise<Commande[]>;
  abstract enAttenteExpirees(maintenant: string): Promise<Commande[]>;
  /** Comparer et remplacer sur le statut. `null` si la commande a changé entre-temps. */
  abstract transitionner(
    id: string,
    de: readonly StatutCommande[],
    changement: Partial<Omit<Commande, "id">>,
  ): Promise<Commande | null>;
}

export abstract class Scans {
  abstract ajouter(scan: ScanStocke): Promise<void>;
  abstract duDepart(departId: string): Promise<ScanStocke[]>;
  abstract parEvenement(evenementId: string): Promise<ScanStocke | null>;
}

/** Réponses déjà données, par identifiant d'événement : un événement rejoué n'est jamais rejoué. */
export abstract class EvenementsTraites {
  abstract trouver(id: string): Promise<EvenementTraite | null>;
  /** `false` si l'identifiant y était déjà (deux requêtes identiques simultanées). */
  abstract memoriser(entree: EvenementTraite): Promise<boolean>;
}

/* ------------------------------------------------------------------ préférences du voyageur */

export abstract class PreferencesVoyageur {
  abstract compagniesPreferees(voyageurId: string): Promise<ReadonlySet<string>>;
  abstract definirPreferee(
    voyageurId: string,
    compagnieId: string,
    preferee: boolean,
  ): Promise<void>;
  /** Les filtres mémorisés pour ce trajet. */
  abstract filtres(
    voyageurId: string,
    depart: string,
    arrivee: string,
  ): Promise<FiltresDeparts | null>;
  abstract enregistrerFiltres(
    voyageurId: string,
    depart: string,
    arrivee: string,
    filtres: FiltresDeparts,
  ): Promise<void>;
}

/* ------------------------------------------------------------------ services d'autres tickets */

export interface Promotion {
  code: string;
  /** « frais_offerts » : les frais de service de 250 F sont offerts. */
  type: "frais_offerts";
}

/** Codes promotionnels (administrés par ailleurs). */
export abstract class Promotions {
  abstract trouver(code: string): Promise<Promotion | null>;
}

export interface Proche {
  id: string;
  nom: string;
  telephone: string | null;
}

/** Les proches d'un voyageur (comptes, AM-013). */
export abstract class ProchesVoyageur {
  abstract trouver(voyageurId: string, procheId: string): Promise<Proche | null>;
}

export interface ConversionFcfa {
  devise: string;
  /** Unité mineure (centimes) : 1290 = 12,90 $ CA. */
  montantMineur: number;
  approximatif: boolean;
}

/** Conversion d'un montant en francs CFA vers la devise de paiement d'un proche à l'étranger. */
export abstract class ConversionDevises {
  /** `null` si la devise n'est pas prise en charge. */
  abstract convertir(montantFcfa: number, devise: string): Promise<ConversionFcfa | null>;
}

/**
 * Numérotation des ventes en ligne (4001–9999), côté serveur et sans trou. Version PostgreSQL :
 * `NumerotationEnLigneServeur` (`postgres.ts`), sur le registre des numéros d'AM-161.
 */
export abstract class NumerotationEnLigne {
  /**
   * Lève `PlageEpuisee` quand 9999 est atteint. `reference` (l'identifiant du billet) rend l'appel
   * rejouable avec la version PostgreSQL : la même référence reçoit toujours le même numéro.
   */
  abstract prochaine(a: {
    compagnieId: string;
    gareId: string;
    aammjj: string;
    reference?: string;
  }): Promise<number>;
}

/** Signature des QR : la clé privée ne quitte jamais le serveur. */
export abstract class SignataireQr {
  abstract signer(contenu: ContenuQr): Promise<string>;
  abstract clePublique(): Promise<CleJwk>;
  abstract verifier(qr: string): Promise<ContenuQr | null>;
}

/** Colis chargés dans la soute d'un départ (**AM-163**). */
export abstract class ColisDuDepart {
  abstract etat(departId: string): Promise<{ charges: number; colisACharger: number }>;
}

/* ------------------------------------------------------------------ avis et temps réel */

/** Ce qui s'est passé : les autres modules (paiements, SMS, caisse) s'y abonnent. */
export type AvisBilletterie =
  | {
      type: "billet.emis";
      billetId: string;
      numero: string;
      departId: string;
      canal: string;
      /** Le passager est joignable : le SMS part avec le QR et le code. */
      telephone: string | null;
      /** Le voyageur connecté qui a acheté le billet en ligne (son téléphone est dans son compte). */
      acheteurId: string | null;
    }
  | {
      type: "billet.annule";
      billetId: string;
      numero: string;
      departId: string;
      raison: "voyageur" | "agence" | "depart_annule";
      retenue: number;
      remboursement: number;
      acheteurId: string | null;
    }
  | { type: "billet.embarque"; billetId: string; numero: string; departId: string; at: string }
  | { type: "billet.reporte"; ancienBilletId: string; billetId: string; departId: string }
  | { type: "billet.non_presente"; billetId: string; numero: string; departId: string }
  | { type: "depart.etat_change"; departId: string; de: EtatDepart; vers: EtatDepart }
  | {
      type: "depart.fusionne";
      departId: string;
      dansDepartId: string;
      deplaces: { billetId: string; ancienSiege: number | null; nouveauSiege: number | null }[];
    }
  | { type: "commande.expiree"; commandeId: string; voyageurId: string }
  | { type: "commande.payee"; commandeId: string; voyageurId: string; billetIds: string[] };

export abstract class AvisBillets {
  abstract publier(avis: AvisBilletterie): void | Promise<void>;
}

/** Diffusion temps réel entre les instances de l'API (mémoire ici ; Redis ou NOTIFY en base ensuite). */
export abstract class DiffusionTempsReel {
  abstract publier(canal: string, message: unknown): void;
  abstract souscrire(canal: string, ecouteur: (message: unknown) => void): () => void;
}
