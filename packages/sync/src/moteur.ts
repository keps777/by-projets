import {
  BLOCAGE_PIN_MINUTES,
  LIMITE_HORS_LIGNE_HEURES,
  GenerateurNumeros,
  aammjjDouala,
  debloquerTemporairement,
  enMs,
  numeroBillet,
  numeroColis,
  numeroSession,
  pinBloque,
  statutAppareil,
  versIsoDouala,
} from "@afrimove/domain";
import type { EtatGenerateur, Plage } from "@afrimove/domain";
import { agence as c } from "@afrimove/contrats";
import type { DexieOptions } from "dexie";
import { BaseSync, META, ecrireMeta, lireMeta } from "./base";
import type { ConflitLocal, EntreeFile } from "./base";
import type { EvenementFile, Octroi, ReponseLot } from "./protocole";
import { horlogeSysteme, reseauNavigateur, sansConcurrence } from "./reseau";
import type { HorlogeSync, ReseauSync } from "./reseau";
import {
  PartInconnue,
  SiegeDejaVendu,
  SiegeHorsPart,
  siegeOccupeParEvenement,
  siegesPris,
} from "./sieges";
import { genererCleAppareil, pinCorrespond, signer } from "./signature";
import type { CleAppareil, CleJwk } from "./signature";
import { ErreurTransport } from "./transport";
import type { TransportSync } from "./transport";

// `any` : la définition est contravariante en ses données (voir api-client).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DefinitionEvenementQuelconque = c.DefinitionEvenement<string, any, boolean>;

/** Types qui prennent leur numéro dans le compteur des colis (les autres : celui des billets). */
const TYPES_COLIS: ReadonlySet<string> = new Set(["colis.enregistre"]);

const MS_PAR_MINUTE = 60_000;

/* ------------------------------------------------------------------ erreurs */

/** L'appareil est bloqué : plus de 12 h sans synchronisation, en attente du PIN d'un superviseur. */
export class AppareilBloque extends Error {
  constructor(
    readonly horsLigneMinutes: number,
    readonly retire: boolean,
  ) {
    super(
      retire
        ? "Cet appareil a été remplacé par un téléphone de secours : plus aucune vente n'est possible"
        : "Appareil bloqué : hors ligne depuis plus de 12 h. Un superviseur doit le débloquer avec son PIN",
    );
    this.name = "AppareilBloque";
  }
}

export class DonneesInvalides extends Error {
  constructor(
    readonly type: string,
    readonly details: unknown,
  ) {
    super(`Données invalides pour l'événement ${type}`);
    this.name = "DonneesInvalides";
  }
}

export class PinInvalide extends Error {
  constructor(readonly essaisRestants: number) {
    super(`PIN incorrect (${essaisRestants} essai${essaisRestants > 1 ? "s" : ""} restant)`);
    this.name = "PinInvalide";
  }
}

export class PinBloque extends Error {
  constructor(readonly jusqua: string) {
    super(`Trop d'essais : PIN bloqué jusqu'à ${jusqua}`);
    this.name = "PinBloque";
  }
}

export class SuperviseurInconnu extends Error {
  constructor(readonly superviseurId: string) {
    super(
      `Aucun vérificateur de PIN pour le superviseur ${superviseurId} sur cet appareil : synchroniser une fois, ou débloquer depuis l'app du superviseur`,
    );
    this.name = "SuperviseurInconnu";
  }
}

/* ------------------------------------------------------------------ état */

export interface ErreurSync {
  nature: "reseau" | "authentification" | "serveur" | "refus" | "interne";
  message: string;
  code?: string;
  a: string;
}

/** Ce que les écrans affichent : la pastille SYNC / HORS LIGNE et le blocage. */
export interface EtatSync {
  /** Même vocabulaire que `SchemaSynchro` de `@afrimove/contrats` (agence). */
  etat: "sync" | "en_attente" | "hors_ligne";
  /** Texte de la pastille. */
  libelle: "SYNC" | "HORS LIGNE";
  enLigne: boolean;
  synchronisationEnCours: boolean;
  /** Dernière synchronisation réussie ; `null` si jamais. */
  derniereSyncA: string | null;
  evenementsEnAttente: number;
  /** Événements refusés par le serveur : à regarder, jamais renvoyés. */
  evenementsRejetes: number;
  horsLigneMinutes: number;
  bloque: boolean;
  /** Instant à partir duquel l'appareil est bloqué sans synchronisation (dernière synchro + 12 h). */
  bloqueDepuis: string;
  debloqueJusqua: string | null;
  /** L'appareil a été remplacé par un téléphone de secours. */
  retire: boolean;
  conflitsNonVus: number;
  derniereErreur: ErreurSync | null;
}

export interface ResultatSynchro {
  /** `ignore` : une autre synchronisation tient le verrou, ou pas de réseau. */
  statut: "termine" | "interrompu" | "hors_ligne" | "ignore";
  envoyes: number;
  acquittes: number;
  rejetes: number;
  restants: number;
  erreur?: ErreurSync;
}

/* ------------------------------------------------------------------ options */

const TAILLE_LOT_DEFAUT = 25;

export interface OptionsMoteur {
  appareilId: string;
  /** La personne connectée sur l'appareil. */
  auteurId: string;
  /** Code agence de 3 lettres : « ALP ». */
  agence: string;
  /** Code gare de 3 lettres : « DLA ». */
  gare: string;
  /** Plage de numéros de départ (le serveur peut la remplacer à la synchronisation). */
  plage: Plage;
  transport: TransportSync;
  horloge?: HorlogeSync;
  reseau?: ReseauSync;
  /** Nom de la base IndexedDB. Défaut : `afrimove-sync-<appareilId>`. */
  nomBase?: string;
  /** Fabrique IndexedDB alternative (tests : `fake-indexeddb`). */
  dexie?: Pick<DexieOptions, "indexedDB" | "IDBKeyRange">;
  genererUuid?: () => string;
  /** Événements par lot. Défaut 25 (le serveur en accepte 100, et son corps JSON est plafonné). */
  tailleLot?: number;
  /** Premier délai de relance après un échec (ms), doublé à chaque échec. Défaut 5 000. */
  relanceMs?: number;
  /** Plafond du délai de relance (ms). Défaut 120 000. */
  relanceMaxMs?: number;
  /**
   * Envoyer tout seul : après chaque événement quand le réseau est là, au retour du réseau et par
   * relances minutées. Défaut `true`. À `false`, seul `synchroniser()` envoie (service worker,
   * essais).
   */
  synchroAutomatique?: boolean;
}

export interface EvenementEnregistre<E extends DefinitionEvenementQuelconque> {
  evenement: c.EvenementDe<E>;
  /** AGENCE-GARE-AAMMJJ-NNNN ou C-GARE-AAMMJJ-NNNN pour un type numéroté ; sinon `null`. */
  numero: string | null;
}

function uuidParDefaut(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const octets = crypto.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6]! & 0x0f) | 0x40;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Verrou {
  depuis: string;
  /** Remplacé par un téléphone de secours : plus jamais de vente. */
  retire?: boolean;
}

interface EssaisPin {
  faux: number;
  bloqueJusqua: number | null;
}

const GENERATEUR_VIDE = (): EtatGenerateur => ({ billets: {}, colis: {}, sessions: {} });

/* ------------------------------------------------------------------ moteur */

/**
 * Le moteur hors ligne d'un appareil.
 *
 * 1. Chaque geste devient un événement (`enregistrer`) : UUID, heure, numéro de la plage, signature.
 *    L'événement et le compteur de numéros sont écrits **dans la même transaction** IndexedDB : si
 *    l'application est tuée, soit les deux sont là, soit aucun (pas de trou dans la plage).
 * 2. La file s'envoie dans l'ordre (`synchroniser`). Une ligne n'est marquée acquittée qu'à la
 *    réponse du serveur : une application tuée pendant l'envoi renvoie au démarrage, et le serveur
 *    répond `deja_recu` si l'envoi précédent était passé.
 * 3. Plus de 12 h sans synchronisation, l'appareil se bloque jusqu'au PIN d'un superviseur.
 */
export class MoteurSync {
  readonly base: BaseSync;
  private readonly horloge: HorlogeSync;
  private readonly reseau: ReseauSync;
  private readonly uuid: () => string;
  private readonly ecouteurs = new Set<() => void>();
  private cle!: CleAppareil;
  private auteurId: string;
  private cacheEtat: EtatSync | null = null;
  private enCours: Promise<ResultatSynchro> | null = null;
  private serveurJoignable = true;
  private derniereErreur: ErreurSync | null = null;
  private echecs = 0;
  private annulerRelance: (() => void) | null = null;
  private annulerRevalidation: (() => void) | null = null;
  private desabonnerReseau: (() => void) | null = null;
  private ferme = false;
  private readonly synchroAuto: boolean;

  private constructor(readonly options: OptionsMoteur) {
    this.base = new BaseSync(
      options.nomBase ?? `afrimove-sync-${options.appareilId}`,
      options.dexie,
    );
    this.horloge = options.horloge ?? horlogeSysteme();
    this.reseau = options.reseau ?? reseauNavigateur();
    this.uuid = options.genererUuid ?? uuidParDefaut;
    this.auteurId = options.auteurId;
    this.synchroAuto = options.synchroAutomatique ?? true;
  }

  static async ouvrir(options: OptionsMoteur): Promise<MoteurSync> {
    const moteur = new MoteurSync(options);
    await moteur.initialiser();
    return moteur;
  }

  get appareilId(): string {
    return this.options.appareilId;
  }

  /** Clé publique à enregistrer sur le serveur (`enroler`). */
  get clePublique(): CleJwk {
    return this.cle.publique;
  }

  private maintenantIso(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  private async initialiser(): Promise<void> {
    await this.base.open();
    const maintenant = this.horloge.maintenant();
    // La clé est fabriquée d'abord, puis le premier qui écrit gagne : deux onglets qui s'ouvrent
    // ensemble se retrouvent avec la même clé.
    const candidate = await genererCleAppareil();
    await this.base.transaction("rw", this.base.meta, async () => {
      if ((await lireMeta(this.base, META.installeA)) === undefined) {
        await ecrireMeta(this.base, META.installeA, versIsoDouala(maintenant));
      }
      if ((await lireMeta(this.base, META.plage)) === undefined) {
        await ecrireMeta(this.base, META.plage, this.options.plage);
      }
      if ((await lireMeta(this.base, META.cle)) === undefined) {
        await ecrireMeta(this.base, META.cle, candidate);
      }
    });
    this.cle = (await lireMeta<CleAppareil>(this.base, META.cle))!;
    await this.reconcilierGenerateur();
    this.desabonnerReseau = this.reseau.ecouter((enLigne) => {
      if (enLigne) {
        this.serveurJoignable = true;
        if (this.synchroAuto) void this.synchroniser().catch(() => undefined);
      }
      void this.rafraichirEtat();
    });
    await this.rafraichirEtat();
  }

  /** Arrête les minuteries et ferme la base. Les événements écrits restent sur l'appareil. */
  async arreter(): Promise<void> {
    this.ferme = true;
    this.annulerRelance?.();
    this.annulerRevalidation?.();
    this.desabonnerReseau?.();
    this.ecouteurs.clear();
    if (this.enCours) await this.enCours.catch(() => undefined);
    this.base.close();
  }

  /* -------------------------------------------------------------- numéros */

  /**
   * Les compteurs sont écrits avec chaque événement, mais la file reste la vérité : à l'ouverture,
   * chaque compteur est ramené au-dessus du plus grand numéro réellement présent dans la file. Un
   * numéro n'est donc jamais repris, même si l'état exporté a été perdu.
   */
  private async reconcilierGenerateur(): Promise<void> {
    await this.base.transaction("rw", this.base.file, this.base.meta, async () => {
      const etat =
        (await lireMeta<EtatGenerateur>(this.base, META.generateur)) ?? GENERATEUR_VIDE();
      let change = false;
      await this.base.file.each((entree) => {
        const n = entree.evenement.numeroPlage;
        if (n === null || n === undefined) return;
        const jour = aammjjDouala(entree.evenement.at);
        const compteurs = TYPES_COLIS.has(entree.evenement.type) ? etat.colis : etat.billets;
        if ((compteurs[jour] ?? 0) < n + 1) {
          compteurs[jour] = n + 1;
          change = true;
        }
      });
      if (change) await ecrireMeta(this.base, META.generateur, etat);
    });
  }

  /** Numéro de document d'un événement numéroté. */
  numeroDe(evenement: { type: string; at: string; numeroPlage: number | null }): string | null {
    if (evenement.numeroPlage === null) return null;
    const base = {
      gare: this.options.gare,
      at: evenement.at,
      sequence: evenement.numeroPlage,
    };
    return TYPES_COLIS.has(evenement.type)
      ? numeroColis(base)
      : numeroBillet({ ...base, agence: this.options.agence });
  }

  /** Numéro de la prochaine session de caisse du guichet (K-GARE-AAMMJJ-GUICHET-N). */
  async prochaineSession(guichetRang: number): Promise<string> {
    const at = this.horloge.maintenant();
    return this.base.transaction("rw", this.base.meta, async () => {
      const etat =
        (await lireMeta<EtatGenerateur>(this.base, META.generateur)) ?? GENERATEUR_VIDE();
      const jour = aammjjDouala(at);
      const ordre = (etat.sessions[jour] ?? 0) + 1;
      etat.sessions[jour] = ordre;
      await ecrireMeta(this.base, META.generateur, etat);
      return numeroSession({ gare: this.options.gare, at, guichetRang, ordre });
    });
  }

  /** Numéros de billet qui restent aujourd'hui dans la plage. */
  async billetsRestants(): Promise<number> {
    const plage = (await lireMeta<Plage>(this.base, META.plage)) ?? this.options.plage;
    const etat = (await lireMeta<EtatGenerateur>(this.base, META.generateur)) ?? GENERATEUR_VIDE();
    return new GenerateurNumeros({
      agence: this.options.agence,
      gare: this.options.gare,
      plage,
      etat,
    }).billetsRestants(this.horloge.maintenant());
  }

  async plage(): Promise<Plage> {
    return (await lireMeta<Plage>(this.base, META.plage)) ?? this.options.plage;
  }

  /* -------------------------------------------------------------- écriture */

  definirAuteur(auteurId: string): void {
    this.auteurId = auteurId;
  }

  private enLigne(): boolean {
    return this.reseau.enLigne() && this.serveurJoignable;
  }

  /**
   * Enregistre un geste : crée l'événement (UUID, heure de Douala, numéro de la plage), l'écrit
   * dans la file locale et lance l'envoi si le réseau est là. La promesse se résout **quand
   * l'événement est durable** sur l'appareil : c'est le moment d'imprimer le billet.
   *
   * Refus : `AppareilBloque` (plus de 12 h hors ligne), `DonneesInvalides`, `PlageEpuisee`
   * (domaine), et hors ligne `PartInconnue` / `SiegeHorsPart` / `SiegeDejaVendu` pour une vente
   * avec siège.
   */
  async enregistrer<E extends DefinitionEvenementQuelconque>(
    definition: E,
    donnees: c.DonneesDe<E>,
    options: { ignorerBlocage?: boolean } = {},
  ): Promise<EvenementEnregistre<E>> {
    const maintenant = this.horloge.maintenant();
    if (!options.ignorerBlocage) await this.verifierNonBloque(maintenant);
    const lu = (
      definition.donnees as {
        safeParse(v: unknown): { success: boolean; data?: unknown; error?: { issues: unknown } };
      }
    ).safeParse(donnees);
    if (!lu.success) throw new DonneesInvalides(definition.type, lu.error?.issues);
    const donneesValides = lu.data as c.DonneesDe<E>;
    const at = versIsoDouala(maintenant);
    const id = this.uuid();
    const horsLigne = !this.enLigne();

    const { evenement, numero, ordre } = await this.base.transaction(
      "rw",
      this.base.file,
      this.base.meta,
      async () => {
        const siege = siegeOccupeParEvenement({ type: definition.type, donnees: donneesValides });
        if (siege && horsLigne) await this.verifierPart(siege);

        let numeroPlage: number | null = null;
        let numeroDoc: string | null = null;
        if (definition.numerote) {
          const plage = (await lireMeta<Plage>(this.base, META.plage)) ?? this.options.plage;
          const etat =
            (await lireMeta<EtatGenerateur>(this.base, META.generateur)) ?? GENERATEUR_VIDE();
          const generateur = new GenerateurNumeros({
            agence: this.options.agence,
            gare: this.options.gare,
            plage,
            etat,
          });
          const pris = TYPES_COLIS.has(definition.type)
            ? generateur.prochainColis(at)
            : generateur.prochainBillet(at);
          numeroPlage = pris.sequence;
          numeroDoc = pris.numero;
          await ecrireMeta(this.base, META.generateur, generateur.exporter());
        }

        const nouvel: EvenementFile = {
          id,
          type: definition.type,
          at,
          appareilId: this.options.appareilId,
          auteurId: this.auteurId,
          cible: definition.cible(donneesValides),
          numeroPlage,
          donnees: donneesValides,
        };
        const cle = await this.base.file.add({
          id,
          evenement: nouvel,
          signature: null,
          statut: "en_attente",
          tentatives: 0,
          creeA: maintenant,
          acquitteA: null,
          resultat: null,
          erreur: null,
        } as unknown as EntreeFile);
        return { evenement: nouvel, numero: numeroDoc, ordre: cle };
      },
    );

    // Signature : si elle échoue ici, elle sera faite à l'envoi ; l'événement est déjà durable.
    try {
      const signature = await signer(this.cle.privee, evenement);
      await this.base.file.update(ordre, { signature });
    } catch {
      /* signée à l'envoi */
    }

    await this.rafraichirEtat();
    if (this.synchroAuto && this.enLigne()) void this.synchroniser().catch(() => undefined);
    return { evenement: evenement as unknown as c.EvenementDe<E>, numero };
  }

  private async verifierPart(siege: {
    departId: string;
    billetId: string;
    siege: number;
  }): Promise<void> {
    const parts = (await lireMeta<Record<string, number[]>>(this.base, META.partsHorsLigne)) ?? {};
    const part = parts[siege.departId];
    if (!part) throw new PartInconnue(siege.departId);
    if (!part.includes(siege.siege)) throw new SiegeHorsPart(siege.departId, siege.siege);
    const evenements: EvenementFile[] = (await this.base.file.toArray()).map((e) => e.evenement);
    if (siegesPris(siege.departId, evenements).has(siege.siege)) {
      throw new SiegeDejaVendu(siege.departId, siege.siege);
    }
  }

  /**
   * Enregistre la part de sièges de cet appareil pour des départs (départ → sièges). Le serveur
   * l'envoie à chaque synchronisation ; l'application peut aussi la poser depuis le plan de sièges
   * qu'elle vient de lire (`repartirPartsHorsLigne` du domaine). Remplace la part de chaque départ cité.
   */
  async definirPartsHorsLigne(parts: Record<string, readonly number[]>): Promise<void> {
    await this.base.transaction("rw", this.base.meta, async () => {
      const actuelles =
        (await lireMeta<Record<string, number[]>>(this.base, META.partsHorsLigne)) ?? {};
      const copie: Record<string, number[]> = { ...actuelles };
      for (const [departId, sieges] of Object.entries(parts)) copie[departId] = [...sieges];
      await ecrireMeta(this.base, META.partsHorsLigne, copie);
    });
  }

  /** Sièges que cet appareil peut encore vendre hors ligne sur ce départ ; `null` si la part est inconnue. */
  async siegesVendablesHorsLigne(departId: string): Promise<number[] | null> {
    const parts = (await lireMeta<Record<string, number[]>>(this.base, META.partsHorsLigne)) ?? {};
    const part = parts[departId];
    if (!part) return null;
    const evenements: EvenementFile[] = (await this.base.file.toArray()).map((e) => e.evenement);
    const pris = siegesPris(departId, evenements);
    return part.filter((s) => !pris.has(s));
  }

  /* -------------------------------------------------------------- blocage */

  private async lireBlocage(maintenant: number): Promise<{
    bloque: boolean;
    retire: boolean;
    horsLigneMinutes: number;
    bloqueDepuis: string;
    debloqueJusqua: string | null;
  }> {
    // Une seule transaction : les lectures et l'éventuelle pose du verrou forment un instantané
    // cohérent, même pendant qu'une synchronisation applique sa réponse.
    return this.base.transaction("rw", this.base.meta, async () => {
      const derniere = await lireMeta<string>(this.base, META.derniereSyncA);
      const installee =
        (await lireMeta<string>(this.base, META.installeA)) ?? versIsoDouala(maintenant);
      const debloqueJusqua = (await lireMeta<string>(this.base, META.debloqueJusqua)) ?? null;
      let verrou = await lireMeta<Verrou | null>(this.base, META.verrou);
      const statut = statutAppareil({
        derniereSyncA: derniere ?? installee,
        maintenant,
        debloqueJusqua: debloqueJusqua ?? undefined,
      });
      // Le blocage est mémorisé : une synchronisation seule ne le lève pas, seul le PIN d'un superviseur.
      if (statut.horsLigneMinutes > LIMITE_HORS_LIGNE_HEURES * 60 && !verrou) {
        verrou = { depuis: versIsoDouala(maintenant) };
        await ecrireMeta(this.base, META.verrou, verrou);
      }
      const debloque = debloqueJusqua !== null && maintenant < enMs(debloqueJusqua);
      const retire = verrou?.retire === true;
      const bloque = retire || (verrou != null && !debloque);
      return {
        bloque,
        retire,
        horsLigneMinutes: statut.horsLigneMinutes,
        bloqueDepuis: statut.bloqueDepuis,
        debloqueJusqua,
      };
    });
  }

  private async verifierNonBloque(maintenant: number): Promise<void> {
    const blocage = await this.lireBlocage(maintenant);
    if (blocage.bloque) {
      void this.rafraichirEtat();
      throw new AppareilBloque(blocage.horsLigneMinutes, blocage.retire);
    }
  }

  /** Provisionne les vérificateurs de PIN des superviseurs (reçus à la synchronisation). */
  async provisionnerVerificateurs(
    verificateurs: { superviseurId: string; sel: string; iterations: number; hache: string }[],
  ): Promise<void> {
    await this.base.verificateurs.bulkPut(verificateurs);
  }

  /**
   * Déblocage sur place par le PIN d'un superviseur, sans réseau : le PIN est contrôlé contre le
   * vérificateur gardé sur l'appareil (jamais le PIN lui-même), 3 essais faux bloquent la saisie 15
   * minutes. Accorde 4 h, écrit l'événement `appareil.debloque` signé, et le blocage tombe
   * définitivement à la prochaine synchronisation complète.
   */
  async debloquerAvecPin(superviseurId: string, pin: string): Promise<{ debloqueJusqua: string }> {
    const maintenant = this.horloge.maintenant();
    const verrou = await lireMeta<Verrou | null>(this.base, META.verrou);
    if (verrou?.retire) throw new AppareilBloque(0, true);

    const essais = (await lireMeta<EssaisPin>(this.base, META.essaisPin)) ?? {
      faux: 0,
      bloqueJusqua: null,
    };
    if (essais.bloqueJusqua !== null && maintenant < essais.bloqueJusqua) {
      throw new PinBloque(versIsoDouala(essais.bloqueJusqua));
    }
    const verificateur = await this.base.verificateurs.get(superviseurId);
    if (!verificateur) throw new SuperviseurInconnu(superviseurId);

    if (!(await pinCorrespond(verificateur, pin))) {
      const faux = essais.faux + 1;
      const bloque = pinBloque(faux);
      await ecrireMeta(this.base, META.essaisPin, {
        faux: bloque ? 0 : faux,
        bloqueJusqua: bloque ? maintenant + BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE : null,
      } satisfies EssaisPin);
      if (bloque)
        throw new PinBloque(versIsoDouala(maintenant + BLOCAGE_PIN_MINUTES * MS_PAR_MINUTE));
      throw new PinInvalide(3 - faux);
    }

    await ecrireMeta(this.base, META.essaisPin, {
      faux: 0,
      bloqueJusqua: null,
    } satisfies EssaisPin);
    const jusqua = debloquerTemporairement(maintenant);
    await this.base.transaction("rw", this.base.meta, async () => {
      await ecrireMeta(this.base, META.debloqueJusqua, jusqua);
      await ecrireMeta(this.base, META.octroiAttendu, true);
    });
    const at = versIsoDouala(maintenant);
    const signature = await signer(this.cle.privee, {
      appareilId: this.options.appareilId,
      option: "debloquer_4h",
      superviseurId,
      at,
    });
    await this.enregistrer(
      c.EVENEMENT_APPAREIL_DEBLOQUE,
      {
        appareilId: this.options.appareilId,
        option: "debloquer_4h",
        validePar: { superviseurId, methode: "pin", signature },
      },
      { ignorerBlocage: true },
    );
    await this.rafraichirEtat();
    return { debloqueJusqua: jusqua };
  }

  /* -------------------------------------------------------------- synchronisation */

  /**
   * Envoie la file dans l'ordre, par lots, et applique la réponse du serveur. Sans événement à
   * envoyer, fait quand même un aller-retour (nouvelle plage, part de sièges, déblocage, conflits).
   * Ne lève jamais pour une panne réseau : l'état est dans `ResultatSynchro` et `etat()`.
   */
  synchroniser(): Promise<ResultatSynchro> {
    if (this.ferme) {
      return Promise.resolve({
        statut: "ignore",
        envoyes: 0,
        acquittes: 0,
        rejetes: 0,
        restants: 0,
      });
    }
    if (this.enCours) return this.enCours;
    const travail = this.executerSynchro().finally(() => {
      this.enCours = null;
      void this.rafraichirEtat();
    });
    this.enCours = travail;
    void this.rafraichirEtat();
    return travail;
  }

  private async executerSynchro(): Promise<ResultatSynchro> {
    const bilan: ResultatSynchro = {
      statut: "termine",
      envoyes: 0,
      acquittes: 0,
      rejetes: 0,
      restants: 0,
    };
    if (!this.reseau.enLigne()) {
      bilan.statut = "hors_ligne";
      bilan.restants = await this.compterEnAttente();
      return bilan;
    }
    const verrou = await sansConcurrence(`afrimove-sync-${this.options.appareilId}`, () =>
      this.boucleEnvoi(bilan),
    );
    if (!verrou.obtenu) {
      bilan.statut = "ignore";
      bilan.restants = await this.compterEnAttente();
    }
    return bilan;
  }

  private async boucleEnvoi(bilan: ResultatSynchro): Promise<void> {
    let taille = this.tailleLotCourante ?? this.options.tailleLot ?? TAILLE_LOT_DEFAUT;
    let premier = true;
    for (;;) {
      const entrees = await this.prochainsLots(taille);
      if (entrees.length === 0 && !premier) break;
      premier = false;
      try {
        await this.signerManquantes(entrees);
        const reponse = await this.options.transport.envoyer({
          appareilId: this.options.appareilId,
          envoyeA: this.maintenantIso(),
          evenements: entrees.map((e) => ({
            ordre: e.ordre,
            evenement: e.evenement,
            signature: e.signature!,
          })),
        });
        bilan.envoyes += entrees.length;
        this.serveurJoignable = true;
        this.derniereErreur = null;
        this.echecs = 0;
        const { acquittes, rejetes } = await this.appliquerReponse(entrees, reponse);
        bilan.acquittes += acquittes;
        bilan.rejetes += rejetes;
      } catch (e) {
        // Corps refusé pour sa taille (413) : on envoie des lots deux fois plus petits, sans compter un échec.
        if (e instanceof ErreurTransport && e.statut === 413 && taille > 1) {
          taille = Math.max(1, Math.floor(taille / 2));
          this.tailleLotCourante = taille;
          continue;
        }
        bilan.statut = "interrompu";
        bilan.erreur = this.noterEchec(e);
        break;
      }
      if (entrees.length < taille) break;
    }
    bilan.restants = await this.compterEnAttente();
    if (bilan.statut === "termine" && bilan.restants === 0) await this.leverBlocageSiOctroi();
    if (bilan.statut === "interrompu") this.planifierRelance();
    else this.annulerRelance?.();
  }

  /** Taille de lot réduite après un refus 413 (corps trop gros) ; valable jusqu'à la fermeture. */
  private tailleLotCourante: number | null = null;

  private async prochainsLots(taille: number): Promise<EntreeFile[]> {
    return this.base.file
      .where("[statut+ordre]")
      .between(["en_attente", -Infinity], ["en_attente", Infinity])
      .limit(taille)
      .toArray();
  }

  private async signerManquantes(entrees: EntreeFile[]): Promise<void> {
    for (const entree of entrees) {
      if (entree.signature !== null) continue;
      entree.signature = await signer(this.cle.privee, entree.evenement);
      await this.base.file.update(entree.ordre, { signature: entree.signature });
    }
  }

  private noterEchec(e: unknown): ErreurSync {
    const a = this.maintenantIso();
    let erreur: ErreurSync;
    if (e instanceof ErreurTransport) {
      erreur = {
        nature: e.nature,
        message: e.message,
        a,
        ...(e.code !== undefined ? { code: e.code } : {}),
      };
      if (e.nature === "reseau" || e.nature === "serveur") this.serveurJoignable = false;
    } else {
      erreur = { nature: "interne", message: e instanceof Error ? e.message : String(e), a };
    }
    this.derniereErreur = erreur;
    this.echecs += 1;
    return erreur;
  }

  private planifierRelance(): void {
    this.annulerRelance?.();
    if (this.ferme) return;
    if (!this.synchroAuto) return;
    if (
      this.derniereErreur?.nature === "authentification" ||
      this.derniereErreur?.nature === "refus"
    )
      return;
    const base = this.options.relanceMs ?? 5_000;
    const plafond = this.options.relanceMaxMs ?? 120_000;
    const delai = Math.min(plafond, base * 2 ** Math.max(0, this.echecs - 1));
    this.annulerRelance = this.horloge.planifier(delai, () => {
      this.annulerRelance = null;
      // Le réseau peut être revenu sans événement `online` : on retente, ça ne coûte rien.
      this.serveurJoignable = true;
      void this.synchroniser().catch(() => undefined);
    });
  }

  private async compterEnAttente(): Promise<number> {
    return this.base.file.where("statut").equals("en_attente").count();
  }

  private async appliquerReponse(
    entrees: EntreeFile[],
    reponse: ReponseLot,
  ): Promise<{ acquittes: number; rejetes: number }> {
    const maintenant = this.horloge.maintenant();
    let acquittes = 0;
    let rejetes = 0;
    const octroi = reponse.appareil.octroi;
    await this.base.transaction(
      "rw",
      [this.base.file, this.base.meta, this.base.conflits, this.base.verificateurs],
      async () => {
        const parId = new Map(reponse.resultats.map((r) => [r.evenementId, r]));
        for (const entree of entrees) {
          const r = parId.get(entree.id);
          if (!r) {
            await this.base.file.update(entree.ordre, { tentatives: entree.tentatives + 1 });
            continue;
          }
          if (r.statut === "rejete") {
            rejetes += 1;
            await this.base.file.update(entree.ordre, {
              statut: "rejete",
              tentatives: entree.tentatives + 1,
              erreur: { code: r.code ?? "rejete", message: r.message ?? "Refusé par le serveur" },
            });
          } else {
            acquittes += 1;
            await this.base.file.update(entree.ordre, {
              statut: "acquitte",
              acquitteA: maintenant,
              resultat: r.statut,
              erreur: null,
            });
          }
        }
        await ecrireMeta(this.base, META.derniereSyncA, reponse.appareil.derniereSyncA);

        if (reponse.appareil.plage) await this.appliquerPlage(reponse.appareil.plage, maintenant);
        const parts =
          (await lireMeta<Record<string, number[]>>(this.base, META.partsHorsLigne)) ?? {};
        await ecrireMeta(this.base, META.partsHorsLigne, {
          ...parts,
          ...reponse.appareil.partsHorsLigne,
        });
        for (const conflit of reponse.conflits) {
          if (!(await this.base.conflits.get(conflit.evenementId))) {
            await this.base.conflits.put({ ...conflit, vuA: null });
          }
        }
        if (reponse.appareil.verificateursPin.length > 0) {
          await this.base.verificateurs.bulkPut(reponse.appareil.verificateursPin);
        }
        if (octroi) await this.appliquerOctroi(octroi);
      },
    );
    return { acquittes, rejetes };
  }

  /** Un octroi plus récent que le dernier appliqué ; les rejouer ne fait rien. */
  private async appliquerOctroi(octroi: Octroi): Promise<void> {
    const dernier = (await lireMeta<string>(this.base, "octroiVu")) ?? "";
    if (octroi.accordeA <= dernier) return;
    await ecrireMeta(this.base, "octroiVu", octroi.accordeA);
    if (octroi.option === "telephone_secours") {
      await ecrireMeta(this.base, META.verrou, {
        depuis: this.maintenantIso(),
        retire: true,
      } satisfies Verrou);
      return;
    }
    if (octroi.debloqueJusqua)
      await ecrireMeta(this.base, META.debloqueJusqua, octroi.debloqueJusqua);
    await ecrireMeta(this.base, META.octroiAttendu, true);
  }

  /**
   * Un superviseur a débloqué l'appareil (octroi reçu ou PIN saisi sur place) et la file est
   * vidée : l'appareil repart à neuf, le blocage tombe.
   */
  private async leverBlocageSiOctroi(): Promise<void> {
    await this.base.transaction("rw", this.base.meta, async () => {
      if ((await lireMeta<boolean>(this.base, META.octroiAttendu)) !== true) return;
      const verrou = await lireMeta<Verrou | null>(this.base, META.verrou);
      if (verrou?.retire) return;
      await ecrireMeta(this.base, META.verrou, null);
      await ecrireMeta(this.base, META.octroiAttendu, false);
      await ecrireMeta(this.base, META.debloqueJusqua, null);
    });
  }

  private async appliquerPlage(plage: Plage, maintenant: number): Promise<void> {
    const actuelle = (await lireMeta<Plage>(this.base, META.plage)) ?? this.options.plage;
    if (actuelle.debut === plage.debut && actuelle.fin === plage.fin) return;
    const etat = (await lireMeta<EtatGenerateur>(this.base, META.generateur)) ?? GENERATEUR_VIDE();
    const jour = aammjjDouala(maintenant);
    const compteurs = [etat.billets[jour], etat.colis[jour]];
    const compatible = compteurs.every(
      (v) => v === undefined || (v >= plage.debut && v <= plage.fin + 1),
    );
    if (!compatible) {
      this.derniereErreur = {
        nature: "interne",
        code: "plage_incompatible",
        message: `Nouvelle plage ${plage.debut}–${plage.fin} refusée : des numéros d'aujourd'hui sont déjà pris hors de cette plage`,
        a: this.maintenantIso(),
      };
      return;
    }
    await ecrireMeta(this.base, META.plage, plage);
  }

  /* -------------------------------------------------------------- conflits */

  async conflits(): Promise<ConflitLocal[]> {
    return this.base.conflits.toArray();
  }

  /** L'agent a vu les alertes « à replacer » (toutes, ou celles de ces événements). */
  async marquerConflitsVus(evenementIds?: string[]): Promise<void> {
    const maintenant = this.horloge.maintenant();
    const tous = await this.base.conflits.toArray();
    for (const conflit of tous) {
      if (conflit.vuA === null && (!evenementIds || evenementIds.includes(conflit.evenementId))) {
        await this.base.conflits.update(conflit.evenementId, { vuA: maintenant });
      }
    }
    await this.rafraichirEtat();
  }

  /* -------------------------------------------------------------- file */

  /** La file, dans l'ordre de rejeu. */
  async lireFile(filtre?: { statut?: EntreeFile["statut"] }): Promise<EntreeFile[]> {
    const toutes = await this.base.file.orderBy("ordre").toArray();
    return filtre?.statut ? toutes.filter((e) => e.statut === filtre.statut) : toutes;
  }

  /**
   * Supprime les lignes acquittées plus vieilles que `avantMs`. Les compteurs de numéros vivent
   * dans `meta` : purger ne peut pas faire reprendre un numéro. Les lignes en attente ou rejetées
   * ne sont jamais purgées.
   */
  async purger(avantMs: number): Promise<number> {
    const aSupprimer = (await this.base.file.where("statut").equals("acquitte").toArray())
      .filter((e) => (e.acquitteA ?? 0) < avantMs)
      .map((e) => e.ordre);
    await this.base.file.bulkDelete(aSupprimer);
    return aSupprimer.length;
  }

  /* -------------------------------------------------------------- état observable */

  /** Dernier état connu, synchrone (pour `useSyncExternalStore`). */
  instantane(): EtatSync | null {
    return this.cacheEtat;
  }

  /** État frais. */
  async etat(): Promise<EtatSync> {
    return (await this.rafraichirEtat())!;
  }

  abonner(rappel: () => void): () => void {
    this.ecouteurs.add(rappel);
    return () => this.ecouteurs.delete(rappel);
  }

  private async calculerEtat(): Promise<EtatSync> {
    const maintenant = this.horloge.maintenant();
    const blocage = await this.lireBlocage(maintenant);
    const enAttente = await this.compterEnAttente();
    const rejetes = await this.base.file.where("statut").equals("rejete").count();
    const derniereSyncA = (await lireMeta<string>(this.base, META.derniereSyncA)) ?? null;
    const conflitsNonVus = (await this.base.conflits.toArray()).filter(
      (x) => x.vuA === null,
    ).length;
    const enLigne = this.enLigne();
    const etat: EtatSync["etat"] = !enLigne
      ? "hors_ligne"
      : enAttente > 0 || this.enCours !== null
        ? "en_attente"
        : "sync";
    return {
      etat,
      libelle: enLigne ? "SYNC" : "HORS LIGNE",
      enLigne,
      synchronisationEnCours: this.enCours !== null,
      derniereSyncA,
      evenementsEnAttente: enAttente,
      evenementsRejetes: rejetes,
      horsLigneMinutes: Math.floor(blocage.horsLigneMinutes),
      bloque: blocage.bloque,
      bloqueDepuis: blocage.bloqueDepuis,
      debloqueJusqua: blocage.debloqueJusqua,
      retire: blocage.retire,
      conflitsNonVus,
      derniereErreur: this.derniereErreur,
    };
  }

  /** Les recalculs s'enchaînent : le dernier demandé est aussi le dernier écrit (pas d'état périmé). */
  private chaineEtat: Promise<unknown> = Promise.resolve();

  private rafraichirEtat(): Promise<EtatSync | null> {
    const suite = this.chaineEtat.then(
      () => this.recalculerEtat(),
      () => this.recalculerEtat(),
    );
    this.chaineEtat = suite;
    return suite;
  }

  private async recalculerEtat(): Promise<EtatSync | null> {
    if (this.ferme) return this.cacheEtat;
    let nouvel: EtatSync;
    try {
      nouvel = await this.calculerEtat();
    } catch {
      return this.cacheEtat; // base fermée pendant l'arrêt
    }
    const change = JSON.stringify(nouvel) !== JSON.stringify(this.cacheEtat);
    this.cacheEtat = change ? nouvel : this.cacheEtat;
    this.planifierRevalidation(nouvel);
    if (change) for (const rappel of [...this.ecouteurs]) rappel();
    return this.cacheEtat;
  }

  /** Le temps passe sans événement : on se réveille à l'instant où le blocage commence ou finit. */
  private planifierRevalidation(etat: EtatSync): void {
    this.annulerRevalidation?.();
    this.annulerRevalidation = null;
    const maintenant = this.horloge.maintenant();
    const bornes = [etat.debloqueJusqua, etat.bloque ? null : etat.bloqueDepuis]
      .filter((x): x is string => x !== null)
      .map((x) => enMs(x))
      .filter((ms) => ms > maintenant);
    if (bornes.length === 0 || this.ferme) return;
    const prochaine = Math.min(...bornes);
    this.annulerRevalidation = this.horloge.planifier(prochaine - maintenant + 1, () => {
      this.annulerRevalidation = null;
      void this.rafraichirEtat();
    });
  }

  /** Enregistre la clé publique de l'appareil auprès du serveur (première installation). */
  async enroler(): Promise<void> {
    if (!this.options.transport.enroler) throw new Error("Ce transport ne sait pas enrôler");
    await this.options.transport.enroler(this.options.appareilId, this.cle.publique);
  }
}
