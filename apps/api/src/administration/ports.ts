import type {
  ArretLigne,
  BusAdmin,
  ChangementEquipage,
  ClasseDepart,
  CommandeAppareil,
  CompagnieAdmin,
  DepartListe,
  EnrolementAppareil,
  EtatLigne,
  FiltreDeparts,
  GareAdmin,
  HoraireLigne,
  HoraireModifie,
  LigneAdmin,
  NouveauBus,
  NouveauDepart,
  PlanLigne,
  OptionsLigne,
  RapportEffacement,
  ReglageLigne,
  RessourceEquipage,
  SectionsLigne,
  Tarifs,
} from "./modeles";

/**
 * Ports de persistance de l'administration.
 *
 * La logique ne parle qu'à ces classes abstraites. `memoire.ts` en fournit des versions en mémoire (tests,
 * développement), `postgres.ts` des versions PostgreSQL (Prisma) ; `testing/contrat-ports.ts` fait passer le
 * même contrat aux deux. `AdministrationModule` choisit selon `API_STOCKAGE` et refuse de démarrer en production
 * avec un port en mémoire.
 */

/* ------------------------------------------------------------------ annuaire */

/** Les compagnies et leurs gares (tables `compagnie` et `gare`). */
export abstract class AnnuaireAdmin {
  abstract compagnie(id: string): Promise<CompagnieAdmin | null>;
  abstract gare(id: string): Promise<GareAdmin | null>;
  abstract gares(compagnieId: string): Promise<GareAdmin[]>;
}

/* ------------------------------------------------------------------ lignes */

export interface NouvelleLigne {
  compagnieId: string;
  code: string;
  origineGareId: string;
  destinationGareId: string;
  tarifs: Tarifs;
  dureeMinutes: number;
  /** Origine et terminus compris. */
  arrets: ArretLigne[];
  plan: PlanLigne;
  options: OptionsLigne;
}

/** Ce que « publier » écrit : tout l'état voulu de la ligne, en une transaction. */
export interface PublicationLigne extends Omit<EtatLigne, "arrets"> {
  /** Origine et terminus compris, kilomètres calculés. */
  arrets: ArretLigne[];
}

/** Un horaire modifié n'existe pas (ou plus) sur cette ligne. */
export class HoraireInconnu extends Error {
  constructor(readonly horaireId: string) {
    super(`Horaire inconnu : ${horaireId}`);
    this.name = "HoraireInconnu";
  }
}

/** Deux horaires actifs à la même heure sur la même ligne. */
export class HoraireEnDouble extends Error {
  constructor(readonly heure: string) {
    super(`Deux horaires actifs à ${heure}`);
    this.name = "HoraireEnDouble";
  }
}

export abstract class Lignes {
  abstract trouver(id: string): Promise<LigneAdmin | null>;
  abstract lister(compagnieId: string): Promise<LigneAdmin[]>;
  /** `null` si la compagnie a déjà une ligne de ce code. Crée aussi le plan et les options. */
  abstract creer(ligne: NouvelleLigne): Promise<LigneAdmin | null>;
  abstract horaires(ligneId: string): Promise<HoraireLigne[]>;
  /** Plan, options et modifications programmées ; `null` si la ligne n'a jamais été réglée. */
  abstract reglage(ligneId: string): Promise<ReglageLigne | null>;
  /**
   * Écrit l'état voulu (tarifs, arrêts, horaires, plan, options) et efface le brouillon, dans une transaction.
   * Un horaire sans `id` est créé, un horaire de la ligne absent de la liste est supprimé.
   * @throws HoraireInconnu, HoraireEnDouble
   */
  abstract publier(ligneId: string, publication: PublicationLigne): Promise<void>;
  /** Enregistre les sections modifiées pour qu'elles s'appliquent le jour `effetDu` (AAAA-MM-JJ). */
  abstract programmer(
    ligneId: string,
    sections: SectionsLigne,
    effetDu: string,
    plan: PlanLigne,
    options: OptionsLigne,
  ): Promise<void>;
  /** Les lignes dont le brouillon est arrivé à son jour d'effet (`effetDu` ≤ `jour`, AAAA-MM-JJ), de toutes les compagnies. */
  abstract echues(jour: string): Promise<LigneEchue[]>;
  /** Abandonne le brouillon d'une ligne (devenu impossible à appliquer) sans toucher à l'état publié. */
  abstract abandonnerBrouillon(ligneId: string): Promise<void>;
}

/** Une ligne dont une modification programmée attend d'être mise en vigueur. */
export interface LigneEchue {
  compagnieId: string;
  ligneId: string;
}

/* ------------------------------------------------------------------ bus */

export abstract class ParcBus {
  abstract trouver(id: string): Promise<BusAdmin | null>;
  abstract lister(compagnieId: string): Promise<BusAdmin[]>;
  /** `null` si l'immatriculation est déjà celle d'un bus de la compagnie. */
  abstract creer(bus: NouveauBus): Promise<BusAdmin | null>;
  /** `"immatriculation_prise"` si une autre bus de la compagnie la porte ; `null` si le bus n'existe pas. */
  abstract modifier(
    id: string,
    changement: Partial<Omit<NouveauBus, "compagnieId">>,
  ): Promise<BusAdmin | "immatriculation_prise" | null>;
  /** La plus grande capacité des bus de cette classe dans la compagnie (plan par défaut d'une ligne). */
  abstract capaciteMax(compagnieId: string, classe: ClasseDepart): Promise<number | null>;
}

/* ------------------------------------------------------------------ départs */

export type ResultatCreationDepart =
  | { ok: true }
  | { ok: false; raison: "numero_pris" }
  | { ok: false; raison: "occupe"; ressource: RessourceEquipage; departNumero: string };

export type ResultatEquipage =
  | { ok: true; depart: DepartListe }
  | { ok: false; raison: "inconnu" }
  | { ok: false; raison: "etat"; etat: string }
  | { ok: false; raison: "billets_vendus"; billets: number }
  | { ok: false; raison: "occupe"; ressource: RessourceEquipage; departNumero: string };

export abstract class Programme {
  abstract trouver(id: string): Promise<(DepartListe & { compagnieId: string }) | null>;
  abstract lister(filtre: FiltreDeparts): Promise<DepartListe[]>;
  /** Un numéro de départ est unique : `numero_pris` si le départ existe déjà (génération rejouée). */
  abstract creer(depart: NouveauDepart, compagnieId: string): Promise<ResultatCreationDepart>;
  /**
   * Change l'équipage et le quai d'un départ qui n'est pas parti, sans jamais affecter un bus, un chauffeur ou un
   * convoyeur déjà pris par un autre départ qui chevauche celui-ci. Les deux contrôles et l'écriture sont atomiques.
   */
  abstract equiper(id: string, changement: ChangementEquipage): Promise<ResultatEquipage>;
  /** Nombre de départs encore à faire (programmés, en vente, à l'embarquement ou retardés) qui roulent avec ce bus. */
  abstract departsAVenirDuBus(busId: string): Promise<number>;
}

/* ------------------------------------------------------------------ appareils */

export interface DeclarationAppareil {
  appareilId: string;
  compagnieId: string;
  gareId: string | null;
  libelle: string | null;
  codeHache: string;
  codeExpireA: string;
  creePar: string | null;
  creeA: string;
}

export type ResultatEnrolement =
  | { ok: true; enrolement: EnrolementAppareil }
  | { ok: false; raison: "inconnu" | "expire" };

/** Appareils déclarés par l'administration, enrôlés avec un code à usage unique. */
export abstract class RegistreAppareils {
  /**
   * Exécute `travail` à l'exclusion de toute autre déclaration d'appareil de la même compagnie (même sur une autre
   * instance du serveur) : deux guichets ne reçoivent pas le même rang, donc pas la même plage de numéros.
   */
  abstract exclusif<T>(compagnieId: string, travail: () => Promise<T>): Promise<T>;
  abstract declarer(declaration: DeclarationAppareil): Promise<void>;
  abstract trouver(appareilId: string): Promise<EnrolementAppareil | null>;
  abstract lister(filtre: { compagnieId: string; gareId?: string }): Promise<EnrolementAppareil[]>;
  /** Remplace le code d'enrôlement (téléphone de secours). `false` si l'appareil est inconnu. */
  abstract nouveauCode(appareilId: string, codeHache: string, expireA: string): Promise<boolean>;
  /**
   * Consomme le code et pose le secret de l'appareil, d'un seul tenant : de deux téléphones qui présentent le
   * même code en même temps, un seul passe.
   */
  abstract enroler(codeHache: string, secretHache: string, at: string): Promise<ResultatEnrolement>;
  /** Le secret présenté est-il celui de cet appareil (enrôlé et non retiré) ? */
  abstract secretValide(appareilId: string, secretHache: string): Promise<boolean>;
  /** Retire l'appareil du service : plus de code, plus de secret. */
  abstract retirer(appareilId: string): Promise<void>;
}

export type ResultatAcquittement = "ok" | "deja_acquittee" | "inconnue";

/** Ordres envoyés aux appareils (aujourd'hui : l'effacement à distance). */
export abstract class OrdresAppareils {
  /** `"deja_en_attente"` si un ordre du même type attend encore son accusé. */
  abstract emettre(ordre: CommandeAppareil): Promise<CommandeAppareil | "deja_en_attente">;
  abstract enAttente(appareilId: string): Promise<CommandeAppareil | null>;
  abstract trouver(id: string): Promise<CommandeAppareil | null>;
  abstract dernier(appareilId: string): Promise<CommandeAppareil | null>;
  /** L'accusé ne s'écrit qu'une fois. */
  abstract acquitter(
    id: string,
    at: string,
    rapport: RapportEffacement,
  ): Promise<ResultatAcquittement>;
}

/** Marque les adaptateurs en mémoire : le garde-fou de production les refuse. */
export interface StockageAdministration {
  readonly durable: boolean;
}

export type { HoraireModifie };
