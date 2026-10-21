import { Injectable } from "@nestjs/common";
import {
  AttributionPlages,
  ControleNumeros,
  type AnomalieNumero,
  type AppareilSync,
  type EntreeNumero,
} from "../sync/ports";
import { NumerotationService } from "./numerotation.service";
import { PlagesAttribuees, RegistreNumeros, type StockageNumerotation } from "./ports";
import { plageDuPlan, type GenreNumero, type Plage } from "./regles";

/**
 * Remplaçant de `ControleNumerosMemoire` (AM-160) : mêmes méthodes, mais les numéros passent par le
 * registre d'AM-161 (unicité par gare, pas seulement par appareil).
 *
 * `durable` suit celui du registre et des plages : `VerificationStockageSync` refuse la production
 * tant qu'ils sont en mémoire.
 */
@Injectable()
export class ControleNumerosServeur extends ControleNumeros implements StockageNumerotation {
  constructor(
    private readonly numerotation: NumerotationService,
    private readonly registre: RegistreNumeros,
    private readonly plages: PlagesAttribuees,
  ) {
    super();
  }

  get durable(): boolean {
    const durable = (s: unknown) => (s as Partial<StockageNumerotation>).durable === true;
    return durable(this.registre) && durable(this.plages);
  }

  enregistrer(entree: EntreeNumero): Promise<AnomalieNumero[]> {
    return this.numerotation.enregistrer(entree);
  }

  trous(appareilId: string, jour: string, genre: GenreNumero, plage: Plage): Promise<number[]> {
    return this.numerotation.trous(appareilId, jour, genre, plage);
  }
}

/**
 * Remplaçant de `AttributionPlagesParRang` (AM-160). Ordre de préférence :
 * 1. la plage attribuée par l'administration (`PlagesService.attribuer`), qui a vérifié qu'elle ne
 *    recouvre aucune autre ;
 * 2. la plage écrite sur la fiche de l'appareil (`AppareilSync.plage`) ;
 * 3. celle du plan de numérotation pour son genre et son rang.
 */
@Injectable()
export class AttributionPlagesServeur extends AttributionPlages {
  constructor(private readonly plages: PlagesAttribuees) {
    super();
  }

  async plageDe(appareil: AppareilSync): Promise<Plage | null> {
    const attribuee = await this.plages.trouver(appareil.id);
    if (attribuee) return { ...attribuee.plage };
    if (appareil.plage) return appareil.plage;
    if (appareil.rang === null) return null;
    try {
      if (appareil.genre === "guichet") return plageDuPlan("guichet", appareil.rang, null);
      if (appareil.genre === "convoyeur" && appareil.nbConvoyeurs !== null) {
        return plageDuPlan("convoyeur", appareil.rang, appareil.nbConvoyeurs);
      }
    } catch {
      return null;
    }
    return null;
  }
}
