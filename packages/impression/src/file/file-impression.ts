import { champsBillet, genererBillet, type DonneesBillet } from "../gabarits/billet";
import { champsEtiquette, genererEtiquette, type DonneesEtiquette } from "../gabarits/etiquette";
import type { StockageCle, Transport } from "../transport/transport";

export type TypeDocument = "billet" | "etiquette";

interface Commun {
  id: string;
  /** Identité du document : numéro du billet ou référence du colis. Deux impressions d'une même clé sont des copies. */
  cle: string;
  creeA: number;
  /** Tentatives d'envoi qui ont échoué. */
  tentatives: number;
  derniereErreur: string | null;
  /** Vrai pour une réimpression (copie d'un document déjà imprimé). */
  reimpression: boolean;
  /**
   * - `en_attente` : à imprimer (ou à relancer).
   * - `imprime` : sorti de l'imprimante, gardé pour la réimpression.
   * - `echec` : le gabarit n'a pas pu être généré (données invalides) ; jamais relancé tout seul.
   */
  statut: "en_attente" | "imprime" | "echec";
  imprimeA: number | null;
}

export type TravailImpression =
  | (Commun & { type: "billet"; donnees: DonneesBillet })
  | (Commun & { type: "etiquette"; donnees: DonneesEtiquette });

export interface InstantaneFile {
  travaux: readonly TravailImpression[];
  /** Travail en cours d'envoi à l'imprimante. */
  enCours: string | null;
  /** Nombre de travaux qui attendent l'imprimante. */
  enAttente: number;
}

/** Issue d'une demande d'impression : même vocabulaire que `ResultatImpression` du contrat d'API. */
export type StatutImpression = "imprime" | "en_attente_imprimante";

export interface ResultatDemande {
  travail: TravailImpression;
  statut: StatutImpression;
}

export interface OptionsFile {
  transport: Transport;
  /** Où la file survit au rechargement de la page. */
  stockage: StockageCle;
  cle?: string;
  maintenant?: () => number;
  planifier?: (action: () => void, ms: number) => () => void;
  /** Attentes successives avant de retenter ; la dernière se répète tant que l'imprimante est absente. */
  delaisRelanceMs?: number[];
  /** Nombre de documents imprimés gardés pour la réimpression. */
  historiqueMax?: number;
  generer?: (travail: TravailImpression) => Uint8Array;
  identifiant?: () => string;
}

export const CLE_FILE_IMPRESSION = "afrimove.impression.file";

const planifierParDefaut = (action: () => void, ms: number) => {
  const t = setTimeout(action, ms);
  return () => clearTimeout(t);
};

let compteur = 0;
const identifiantParDefaut = () => {
  compteur += 1;
  const hasard =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `imp-${compteur}-${hasard}`;
};

export function genererTravail(travail: TravailImpression): Uint8Array {
  return travail.type === "billet"
    ? genererBillet(travail.donnees)
    : genererEtiquette(travail.donnees);
}

function estTravail(valeur: unknown): valeur is TravailImpression {
  if (typeof valeur !== "object" || valeur === null) return false;
  const v = valeur as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["cle"] === "string" &&
    (v["type"] === "billet" || v["type"] === "etiquette") &&
    (v["statut"] === "en_attente" || v["statut"] === "imprime" || v["statut"] === "echec") &&
    typeof v["donnees"] === "object" &&
    v["donnees"] !== null
  );
}

/**
 * File d'impression hors ligne. Une demande est d'abord écrite dans le stockage, puis envoyée : si
 * l'imprimante est absente ou si l'envoi échoue, le travail reste en file, dans l'ordre, et repart de lui-même
 * dès que l'imprimante répond de nouveau (changement d'état du transport) ou au bout d'une attente
 * croissante. Les documents imprimés sont gardés pour la réimpression.
 */
export class FileImpression {
  private travaux: TravailImpression[] = [];
  private enCours: string | null = null;
  private instantaneCourant: InstantaneFile = { travaux: [], enCours: null, enAttente: 0 };
  private readonly ecouteurs = new Set<() => void>();
  private traitement: Promise<void> | null = null;
  private rejouer = false;
  /** Relances déjà faites parce que l'imprimante était absente (fait grandir l'attente). */
  private essaisAbsence = 0;
  private annulerRelance: (() => void) | null = null;
  private ecriture: Promise<void> = Promise.resolve();
  private charge: Promise<void> | null = null;
  private desabonnerTransport: (() => void) | null = null;
  private dernierEtat: string;

  private readonly transport: Transport;
  private readonly stockage: StockageCle;
  private readonly cle: string;
  private readonly maintenant: () => number;
  private readonly planifier: (action: () => void, ms: number) => () => void;
  private readonly delais: number[];
  private readonly historiqueMax: number;
  private readonly generer: (travail: TravailImpression) => Uint8Array;
  private readonly identifiant: () => string;

  constructor(options: OptionsFile) {
    this.transport = options.transport;
    this.stockage = options.stockage;
    this.cle = options.cle ?? CLE_FILE_IMPRESSION;
    this.maintenant = options.maintenant ?? Date.now;
    this.planifier = options.planifier ?? planifierParDefaut;
    this.delais = options.delaisRelanceMs ?? [2000, 5000, 10_000, 30_000];
    this.historiqueMax = options.historiqueMax ?? 20;
    this.generer = options.generer ?? genererTravail;
    this.identifiant = options.identifiant ?? identifiantParDefaut;
    this.dernierEtat = this.transport.instantane().etat;
  }

  /**
   * Relit la file depuis le stockage (une seule fois), écoute l'imprimante et relance ce qui attendait.
   * On peut l'appeler de nouveau après `arreter()` pour reprendre l'écoute.
   */
  async demarrer(): Promise<void> {
    this.charge ??= this.lireStockage();
    await this.charge;
    if (this.desabonnerTransport) return;
    this.dernierEtat = this.transport.instantane().etat;
    this.desabonnerTransport = this.transport.abonner(() => this.surChangementDeLiaison());
    this.publier();
    if (this.travaux.some((t) => t.statut === "en_attente")) void this.traiter();
  }

  /** Arrête d'écouter l'imprimante et annule la relance programmée. */
  arreter(): void {
    this.desabonnerTransport?.();
    this.desabonnerTransport = null;
    this.annulerRelance?.();
    this.annulerRelance = null;
  }

  instantane(): InstantaneFile {
    return this.instantaneCourant;
  }

  abonner(ecouteur: () => void): () => void {
    this.ecouteurs.add(ecouteur);
    return () => {
      this.ecouteurs.delete(ecouteur);
    };
  }

  /**
   * Met un document en file et tente de l'imprimer tout de suite. La promesse se résout à la fin de cette
   * première tentative : `imprime`, ou `en_attente_imprimante` si le travail reste en file pour plus tard.
   */
  async imprimer(
    type: "billet",
    donnees: DonneesBillet,
    options?: { cle?: string; reimpression?: boolean },
  ): Promise<ResultatDemande>;
  async imprimer(
    type: "etiquette",
    donnees: DonneesEtiquette,
    options?: { cle?: string; reimpression?: boolean },
  ): Promise<ResultatDemande>;
  async imprimer(
    type: TypeDocument,
    donnees: DonneesBillet | DonneesEtiquette,
    options: { cle?: string; reimpression?: boolean } = {},
  ): Promise<ResultatDemande> {
    await this.demarrer();
    const cle =
      options.cle ??
      (type === "billet"
        ? (donnees as DonneesBillet).numero
        : (donnees as DonneesEtiquette).reference);
    const reimpression = options.reimpression ?? false;
    // Un appui répété avant la sortie du papier ne fait pas deux billets : c'est le même travail.
    const existant = this.travaux.find(
      (t) => t.cle === cle && t.type === type && t.statut === "en_attente" && !reimpression,
    );
    const travail: TravailImpression =
      existant ??
      ({
        id: this.identifiant(),
        type,
        cle,
        // Seuls les champs du gabarit sont gardés (et écrits dans le stockage) : jamais un code de retrait.
        donnees:
          type === "billet"
            ? champsBillet(donnees as DonneesBillet)
            : champsEtiquette(donnees as DonneesEtiquette),
        creeA: this.maintenant(),
        tentatives: 0,
        derniereErreur: null,
        reimpression,
        statut: "en_attente",
        imprimeA: null,
      } as TravailImpression);
    if (!existant) {
      this.travaux = [...this.travaux, travail];
      this.publier();
      await this.sauvegarder();
    }
    await this.traiter();
    const apres = this.travaux.find((t) => t.id === travail.id) ?? travail;
    return {
      travail: apres,
      statut: apres.statut === "imprime" ? "imprime" : "en_attente_imprimante",
    };
  }

  /** Imprime une copie d'un document déjà dans la file ou l'historique. */
  async reimprimer(id: string): Promise<ResultatDemande> {
    await this.demarrer();
    const source = this.travaux.find((t) => t.id === id);
    if (!source) throw new Error(`Impression introuvable : ${id}`);
    return source.type === "billet"
      ? this.imprimer("billet", source.donnees, { cle: source.cle, reimpression: true })
      : this.imprimer("etiquette", source.donnees, { cle: source.cle, reimpression: true });
  }

  /** Retire un travail de la file (annulation) ; ne fait rien pour un document déjà imprimé. */
  async abandonner(id: string): Promise<void> {
    await this.demarrer();
    const avant = this.travaux.length;
    this.travaux = this.travaux.filter((t) => !(t.id === id && t.statut !== "imprime"));
    if (this.travaux.length !== avant) {
      this.publier();
      await this.sauvegarder();
    }
  }

  /**
   * Envoie les travaux en attente, dans l'ordre, jusqu'à la première défaillance. Un seul passage à la fois ;
   * une demande arrivée pendant un passage en provoque un second.
   */
  traiter(): Promise<void> {
    if (this.traitement) {
      this.rejouer = true;
      return this.traitement;
    }
    const passage = (async () => {
      do {
        this.rejouer = false;
        await this.passer();
      } while (this.rejouer);
    })().finally(() => {
      this.traitement = null;
    });
    this.traitement = passage;
    return passage;
  }

  private async passer(): Promise<void> {
    for (;;) {
      const suivant = this.travaux.find((t) => t.statut === "en_attente");
      if (!suivant) {
        this.annulerRelance?.();
        this.annulerRelance = null;
        return;
      }
      if (this.transport.instantane().etat !== "ok") {
        const revenue = await this.transport.reconnecter().catch(() => false);
        if (!revenue && this.transport.instantane().etat !== "ok") {
          this.programmerRelance(this.essaisAbsence);
          this.essaisAbsence += 1;
          return;
        }
      }
      let octets: Uint8Array;
      try {
        octets = this.generer(suivant);
      } catch (erreur) {
        this.modifier(suivant.id, {
          statut: "echec",
          derniereErreur: erreur instanceof Error ? erreur.message : String(erreur),
        });
        await this.sauvegarder();
        continue;
      }
      this.enCours = suivant.id;
      this.publier();
      try {
        await this.transport.envoyer(octets);
      } catch (erreur) {
        this.enCours = null;
        this.modifier(suivant.id, {
          tentatives: suivant.tentatives + 1,
          derniereErreur: erreur instanceof Error ? erreur.message : String(erreur),
        });
        await this.sauvegarder();
        this.programmerRelance(suivant.tentatives + 1);
        return;
      }
      this.essaisAbsence = 0;
      this.enCours = null;
      this.modifier(suivant.id, {
        statut: "imprime",
        imprimeA: this.maintenant(),
        derniereErreur: null,
      });
      this.limiterHistorique();
      await this.sauvegarder();
    }
  }

  private programmerRelance(tentatives: number): void {
    this.annulerRelance?.();
    const attente = this.delais[Math.min(tentatives, this.delais.length - 1)] ?? 5000;
    this.annulerRelance = this.planifier(() => {
      this.annulerRelance = null;
      void this.traiter();
    }, attente);
  }

  private surChangementDeLiaison(): void {
    const etat = this.transport.instantane().etat;
    const precedent = this.dernierEtat;
    this.dernierEtat = etat;
    this.publier();
    if (etat === "ok" && precedent !== "ok") {
      this.essaisAbsence = 0;
      this.annulerRelance?.();
      this.annulerRelance = null;
      if (this.travaux.some((t) => t.statut === "en_attente")) void this.traiter();
    }
  }

  private modifier(id: string, changement: Partial<Commun>): void {
    this.travaux = this.travaux.map((t) =>
      t.id === id ? ({ ...t, ...changement } as TravailImpression) : t,
    );
    this.publier();
  }

  private limiterHistorique(): void {
    const imprimes = this.travaux.filter((t) => t.statut === "imprime");
    const aOter = imprimes.length - this.historiqueMax;
    if (aOter <= 0) return;
    const retires = new Set(imprimes.slice(0, aOter).map((t) => t.id));
    this.travaux = this.travaux.filter((t) => !retires.has(t.id));
    this.publier();
  }

  private publier(): void {
    this.instantaneCourant = {
      travaux: this.travaux,
      enCours: this.enCours,
      enAttente: this.travaux.filter((t) => t.statut === "en_attente").length,
    };
    for (const ecouteur of [...this.ecouteurs]) ecouteur();
  }

  private async lireStockage(): Promise<void> {
    try {
      const brut = await this.stockage.lire(this.cle);
      if (!brut) return;
      const lu = JSON.parse(brut) as { travaux?: unknown };
      if (Array.isArray(lu.travaux)) this.travaux = lu.travaux.filter(estTravail);
    } catch {
      // Stockage illisible : on repart d'une file vide plutôt que de bloquer le guichet.
      this.travaux = [];
    }
  }

  private sauvegarder(): Promise<void> {
    const instantane = JSON.stringify({ version: 1, travaux: this.travaux });
    this.ecriture = this.ecriture
      .then(() => this.stockage.ecrire(this.cle, instantane))
      .catch(() => undefined);
    return this.ecriture;
  }
}
