import type {
  AgentRef,
  AgregatReseau,
  BusRef,
  DepartFait,
  EcartCaisseFait,
  GareRef,
  LigneRef,
  OffrePublique,
  VenteCadenceFait,
} from "./modele";
import {
  FaitsCaisse,
  FaitsDeparts,
  OffresPubliques,
  ReferentielAnalyses,
  ReseauAnonyme,
} from "./ports";

/** Adaptateurs en mémoire : tests et développement. Aucun n'est durable. */

const dansLaFenetre = (jour: string, du: string, au: string): boolean => jour >= du && jour <= au;

function parCompagnie<T>(): Map<string, T[]> {
  return new Map<string, T[]>();
}

function ajouterA<T>(table: Map<string, T[]>, compagnieId: string, valeur: T): void {
  const liste = table.get(compagnieId) ?? [];
  liste.push(valeur);
  table.set(compagnieId, liste);
}

export class ReferentielMemoire extends ReferentielAnalyses {
  readonly durable = false;
  private readonly _lignes = parCompagnie<LigneRef>();
  private readonly _bus = parCompagnie<BusRef>();
  private readonly _agents = parCompagnie<AgentRef>();
  private readonly _gares = parCompagnie<GareRef>();
  /** Test : simule une panne de la source. */
  enPanne = false;

  ajouterLigne(compagnieId: string, ligne: LigneRef): this {
    ajouterA(this._lignes, compagnieId, ligne);
    return this;
  }
  ajouterBus(compagnieId: string, bus: BusRef): this {
    ajouterA(this._bus, compagnieId, bus);
    return this;
  }
  ajouterAgent(compagnieId: string, agent: AgentRef): this {
    ajouterA(this._agents, compagnieId, agent);
    return this;
  }
  ajouterGare(compagnieId: string, gare: GareRef): this {
    ajouterA(this._gares, compagnieId, gare);
    return this;
  }

  private lire<T>(table: Map<string, T[]>, compagnieId: string): T[] {
    if (this.enPanne) throw new Error("Référentiel indisponible");
    return [...(table.get(compagnieId) ?? [])];
  }
  async lignes(compagnieId: string) {
    return this.lire(this._lignes, compagnieId);
  }
  async bus(compagnieId: string) {
    return this.lire(this._bus, compagnieId);
  }
  async agents(compagnieId: string) {
    return this.lire(this._agents, compagnieId);
  }
  async gares(compagnieId: string) {
    return this.lire(this._gares, compagnieId);
  }
}

export class FaitsDepartsMemoire extends FaitsDeparts {
  readonly durable = false;
  private readonly faits = parCompagnie<DepartFait>();
  /** Test : nombre de lectures (pour vérifier qu'une requête ne relit pas la base en boucle). */
  lectures = 0;
  enPanne = false;

  ajouter(compagnieId: string, ...faits: DepartFait[]): this {
    for (const f of faits) ajouterA(this.faits, compagnieId, f);
    return this;
  }

  async entre(compagnieId: string, du: string, au: string): Promise<DepartFait[]> {
    this.lectures += 1;
    if (this.enPanne) throw new Error("Départs indisponibles");
    return (this.faits.get(compagnieId) ?? []).filter((f) => dansLaFenetre(f.jour, du, au));
  }
}

export class FaitsCaisseMemoire extends FaitsCaisse {
  readonly durable = false;
  private readonly _ecarts = parCompagnie<EcartCaisseFait>();
  private readonly _cadence = parCompagnie<VenteCadenceFait>();
  enPanne = false;

  ajouterEcart(compagnieId: string, ...faits: EcartCaisseFait[]): this {
    for (const f of faits) ajouterA(this._ecarts, compagnieId, f);
    return this;
  }
  ajouterCadence(compagnieId: string, ...faits: VenteCadenceFait[]): this {
    for (const f of faits) ajouterA(this._cadence, compagnieId, f);
    return this;
  }

  async ecarts(compagnieId: string, du: string, au: string): Promise<EcartCaisseFait[]> {
    if (this.enPanne) throw new Error("Caisse indisponible");
    return (this._ecarts.get(compagnieId) ?? []).filter((f) => dansLaFenetre(f.jour, du, au));
  }
  async ventesCadence(compagnieId: string, du: string, au: string): Promise<VenteCadenceFait[]> {
    if (this.enPanne) throw new Error("Caisse indisponible");
    return (this._cadence.get(compagnieId) ?? []).filter((f) => dansLaFenetre(f.jour, du, au));
  }
}

export class OffresPubliquesMemoire extends OffresPubliques {
  readonly durable = false;
  private readonly offres: Array<OffrePublique & { compagnieId: string }> = [];
  enPanne = false;

  /** `compagnieId` est celle qui publie l'offre (jamais rendue à une autre : seul le nom public l'est). */
  publier(compagnieId: string, ...offres: OffrePublique[]): this {
    for (const o of offres) this.offres.push({ ...o, compagnieId });
    return this;
  }

  async entre(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
  ): Promise<OffrePublique[]> {
    if (this.enPanne) throw new Error("Offres indisponibles");
    return this.offres
      .filter(
        (o) =>
          o.compagnieId !== compagnieId &&
          ligneCodes.includes(o.ligneCode) &&
          dansLaFenetre(o.jour, du, au),
      )
      .map(({ compagnieId: _ignoree, ...publique }) => publique);
  }
}

/** Ce qu'une autre compagnie a réellement vendu : privé, jamais rendu tel quel. */
export interface RemplissagePrive {
  compagnieId: string;
  ligneCode: string;
  creneau: string;
  jour: string;
  remplissagePct: number;
}

/**
 * Le réseau en mémoire : il connaît le remplissage de chaque compagnie (donnée privée) et ne rend que
 * des moyennes d'au moins `seuilCompagnies` autres compagnies, sans leur nom (comme le fera la requête SQL).
 */
export class ReseauMemoire extends ReseauAnonyme {
  readonly durable = false;
  private readonly donnees: RemplissagePrive[] = [];
  enPanne = false;

  ajouter(...faits: RemplissagePrive[]): this {
    this.donnees.push(...faits);
    return this;
  }

  async moyennes(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
    seuilCompagnies: number,
  ): Promise<AgregatReseau[]> {
    if (this.enPanne) throw new Error("Réseau indisponible");
    const groupes = new Map<string, RemplissagePrive[]>();
    for (const d of this.donnees) {
      if (d.compagnieId === compagnieId || !ligneCodes.includes(d.ligneCode)) continue;
      if (!dansLaFenetre(d.jour, du, au)) continue;
      const cle = `${d.ligneCode}|${d.creneau}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), d]);
    }
    const sortie: AgregatReseau[] = [];
    for (const lignes of groupes.values()) {
      const compagnies = new Set(lignes.map((l) => l.compagnieId)).size;
      if (compagnies < seuilCompagnies) continue;
      sortie.push({
        ligneCode: lignes[0]!.ligneCode,
        creneau: lignes[0]!.creneau,
        compagnies,
        remplissageMoyenPct:
          Math.round((lignes.reduce((s, l) => s + l.remplissagePct, 0) / lignes.length) * 10) / 10,
        jours: new Set(lignes.map((l) => l.jour)).size,
      });
    }
    return sortie;
  }
}
