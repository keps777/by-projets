import { Injectable } from "@nestjs/common";
import { AnnuaireAgences, DetailsModules, ReglagesModules, type GareAnnuaire } from "./ports";
import {
  memePortee,
  type ExceptionModule,
  type PorteeException,
  type ReglageModule,
} from "./portee";

/** Marqueur des adaptateurs qui perdent leurs données au redémarrage. */
export interface StockageModules {
  readonly durable: boolean;
}

@Injectable()
export class ReglagesMemoire extends ReglagesModules implements StockageModules {
  readonly durable = false;
  private readonly parAgence = new Map<string, Map<string, ReglageModule>>();

  private ligne(agenceId: string): Map<string, ReglageModule> {
    let lignes = this.parAgence.get(agenceId);
    if (!lignes) {
      lignes = new Map();
      this.parAgence.set(agenceId, lignes);
    }
    return lignes;
  }

  /** Test : revient à l'état d'une base vide. */
  vider(): void {
    this.parAgence.clear();
  }

  async lire(agenceId: string): Promise<ReadonlyMap<string, ReglageModule>> {
    // Copie : comme des lignes relues en base.
    const copie = new Map<string, ReglageModule>();
    for (const [code, r] of this.parAgence.get(agenceId) ?? []) {
      copie.set(code, { actif: r.actif, exceptions: r.exceptions.map((e) => ({ ...e })) });
    }
    return copie;
  }

  async definirAgence(agenceId: string, code: string, actif: boolean): Promise<void> {
    this.ligne(agenceId).set(code, { actif, exceptions: [] });
  }

  async poserException(agenceId: string, code: string, exception: ExceptionModule): Promise<void> {
    const lignes = this.ligne(agenceId);
    const existant = lignes.get(code);
    const autres = (existant?.exceptions ?? []).filter(
      (e) => !memePortee(e.portee, exception.portee),
    );
    lignes.set(code, { actif: existant?.actif ?? null, exceptions: [...autres, exception] });
  }

  async retirerException(agenceId: string, code: string, portee: PorteeException): Promise<void> {
    const lignes = this.ligne(agenceId);
    const existant = lignes.get(code);
    if (!existant) return;
    lignes.set(code, {
      actif: existant.actif,
      exceptions: existant.exceptions.filter((e) => !memePortee(e.portee, portee)),
    });
  }
}

@Injectable()
export class AnnuaireMemoire extends AnnuaireAgences implements StockageModules {
  readonly durable = false;
  private readonly agences = new Map<string, GareAnnuaire[]>();

  /** Déclare une agence et ses gares (administration : AM-093). */
  declarer(agenceId: string, gares: readonly GareAnnuaire[]): void {
    this.agences.set(agenceId, [...gares]);
  }

  async agenceExiste(agenceId: string): Promise<boolean> {
    return this.agences.has(agenceId);
  }

  async gares(agenceId: string): Promise<readonly GareAnnuaire[]> {
    return this.agences.get(agenceId) ?? [];
  }
}

@Injectable()
export class DetailsAucun extends DetailsModules {
  async detail(): Promise<string | null> {
    return null;
  }
}
