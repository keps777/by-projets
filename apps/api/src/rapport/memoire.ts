import { Injectable } from "@nestjs/common";
import type {
  AnnulationFaite,
  BilletVendu,
  CaisseDuJour,
  ColisEnregistre,
  CompagnieRapport,
  ControleEnRoute,
  DepartDuJour,
  GareRapport,
  TrouNumerotation,
} from "./modele";
import {
  ActiviteColis,
  AnnulationsDuJour,
  CaissesDuJour,
  ControlesEnRoute,
  DepartsDuJour,
  RapportsSoir,
  ReferentielRapport,
  TrousNumerotation,
  VentesBillets,
  type StockeRapport,
} from "./ports";
import { estDansLeJour } from "./temps";

/**
 * Versions en mémoire des ports (tests, développement). Chacune se remplit par des méthodes qui ne
 * font pas partie du port, et peut être « mise en panne » (`enPanne = true`) pour vérifier que le
 * rapport part quand même.
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

export class IndisponibleEnMemoire extends Error {
  constructor(source: string) {
    super(`Source indisponible : ${source}`);
    this.name = "IndisponibleEnMemoire";
  }
}

/** Lignes rangées par compagnie et par jour. */
class LignesParJour<T> {
  private readonly lignes: Array<{ compagnieId: string; jour: string; valeur: T }> = [];
  ajouter(compagnieId: string, jour: string, valeurs: readonly T[]): void {
    for (const v of valeurs) this.lignes.push({ compagnieId, jour, valeur: copie(v) });
  }
  lire(compagnieId: string, jour: string): T[] {
    return this.lignes
      .filter((l) => l.compagnieId === compagnieId && l.jour === jour)
      .map((l) => copie(l.valeur));
  }
}

/** Lignes rangées par compagnie, filtrées sur une date qu'elles portent elles-mêmes. */
class LignesDatees<T> {
  private readonly lignes: Array<{ compagnieId: string; valeur: T }> = [];
  constructor(private readonly date: (valeur: T) => string) {}
  ajouter(compagnieId: string, valeurs: readonly T[]): void {
    for (const v of valeurs) this.lignes.push({ compagnieId, valeur: copie(v) });
  }
  lire(compagnieId: string, jour: string): T[] {
    return this.lignes
      .filter((l) => l.compagnieId === compagnieId && estDansLeJour(this.date(l.valeur), jour))
      .map((l) => copie(l.valeur));
  }
}

@Injectable()
export class ReferentielMemoire extends ReferentielRapport {
  readonly durable = false;
  enPanne = false;
  private readonly lesCompagnies: CompagnieRapport[] = [];
  private readonly lesGares = new Map<string, GareRapport[]>();

  ajouter(compagnie: CompagnieRapport, gares: readonly GareRapport[]): this {
    this.lesCompagnies.push(copie(compagnie));
    this.lesGares.set(compagnie.id, copie([...gares]));
    return this;
  }

  async compagnies(): Promise<CompagnieRapport[]> {
    this.verifier();
    return copie(this.lesCompagnies);
  }
  async compagnie(id: string): Promise<CompagnieRapport | null> {
    this.verifier();
    const c = this.lesCompagnies.find((x) => x.id === id);
    return c ? copie(c) : null;
  }
  async gares(compagnieId: string): Promise<GareRapport[]> {
    this.verifier();
    return copie(this.lesGares.get(compagnieId) ?? []);
  }
  private verifier(): void {
    if (this.enPanne) throw new IndisponibleEnMemoire("référentiel");
  }
}

@Injectable()
export class VentesBilletsMemoire extends VentesBillets {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesDatees<BilletVendu>((b) => b.venduA);
  ajouter(compagnieId: string, ...billets: BilletVendu[]): this {
    this.lignes.ajouter(compagnieId, billets);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<BilletVendu[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("ventes de billets");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class ActiviteColisMemoire extends ActiviteColis {
  readonly durable = false;
  enPanne = false;
  private readonly colis = new LignesDatees<ColisEnregistre>((c) => c.creeA);
  private readonly litiges = new Map<string, number>();
  ajouter(compagnieId: string, ...colis: ColisEnregistre[]): this {
    this.colis.ajouter(compagnieId, colis);
    return this;
  }
  definirLitiges(compagnieId: string, jour: string, nombre: number): this {
    this.litiges.set(`${compagnieId}|${jour}`, nombre);
    return this;
  }
  async enregistresLe(compagnieId: string, jour: string): Promise<ColisEnregistre[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("colis");
    return this.colis.lire(compagnieId, jour);
  }
  async litigesOuvertsLe(compagnieId: string, jour: string): Promise<number> {
    if (this.enPanne) throw new IndisponibleEnMemoire("litiges");
    return this.litiges.get(`${compagnieId}|${jour}`) ?? 0;
  }
}

@Injectable()
export class CaissesMemoire extends CaissesDuJour {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesParJour<CaisseDuJour>();
  ajouter(compagnieId: string, jour: string, ...caisses: CaisseDuJour[]): this {
    this.lignes.ajouter(compagnieId, jour, caisses);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<CaisseDuJour[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("caisses");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class DepartsMemoire extends DepartsDuJour {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesParJour<DepartDuJour>();
  ajouter(compagnieId: string, jour: string, ...departs: DepartDuJour[]): this {
    this.lignes.ajouter(compagnieId, jour, departs);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<DepartDuJour[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("départs");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class AnnulationsMemoire extends AnnulationsDuJour {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesDatees<AnnulationFaite>((a) => a.at);
  ajouter(compagnieId: string, ...annulations: AnnulationFaite[]): this {
    this.lignes.ajouter(compagnieId, annulations);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<AnnulationFaite[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("annulations");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class TrousMemoire extends TrousNumerotation {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesParJour<TrouNumerotation>();
  ajouter(compagnieId: string, jour: string, ...trous: TrouNumerotation[]): this {
    this.lignes.ajouter(compagnieId, jour, trous);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<TrouNumerotation[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("numérotation");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class ControlesMemoire extends ControlesEnRoute {
  readonly durable = false;
  enPanne = false;
  private readonly lignes = new LignesParJour<ControleEnRoute>();
  ajouter(compagnieId: string, jour: string, ...controles: ControleEnRoute[]): this {
    this.lignes.ajouter(compagnieId, jour, controles);
    return this;
  }
  async duJour(compagnieId: string, jour: string): Promise<ControleEnRoute[]> {
    if (this.enPanne) throw new IndisponibleEnMemoire("contrôles");
    return this.lignes.lire(compagnieId, jour);
  }
}

@Injectable()
export class RapportsSoirMemoire extends RapportsSoir {
  readonly durable = false;
  private readonly parCle = new Map<string, StockeRapport>();

  async trouver(compagnieId: string, jour: string): Promise<StockeRapport | null> {
    const s = this.parCle.get(`${compagnieId}|${jour}`);
    return s ? copie(s) : null;
  }

  async creer(entree: StockeRapport): Promise<{ rapport: StockeRapport; nouveau: boolean }> {
    const cle = `${entree.compagnieId}|${entree.jour}`;
    const existant = this.parCle.get(cle);
    if (existant) return { rapport: copie(existant), nouveau: false };
    this.parCle.set(cle, copie(entree));
    return { rapport: copie(entree), nouveau: true };
  }

  /** Nombre de rapports gardés (tests). */
  get taille(): number {
    return this.parCle.size;
  }
}
