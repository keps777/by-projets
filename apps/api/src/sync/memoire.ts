import { Injectable } from "@nestjs/common";
import type { CleJwk } from "./signature";
import {
  AlertesSync,
  AppareilsSync,
  AttributionPlages,
  ControleNumeros,
  JournalSync,
  ProvisionnementSync,
  SiegesSync,
  type AlerteSync,
  type AnomalieNumero,
  type AppareilSync,
  type ConflitStocke,
  type EntreeJournal,
  type EntreeNumero,
  type NouvelAppareil,
} from "./ports";
import { plageConvoyeur, plageGuichet, type GenreNumero, type Plage } from "./regles";
import { cleSiege, type OperationSiege } from "./sieges";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage : `SyncModule` refuse de démarrer en production avec elles (`durable = false`).
 */

export interface StockageSync {
  /** `true` pour un adaptateur qui garde ses données après un redémarrage. */
  readonly durable: boolean;
}

@Injectable()
export class AppareilsMemoire extends AppareilsSync implements StockageSync {
  readonly durable = false;
  readonly lignes = new Map<string, AppareilSync>();

  async trouver(id: string) {
    const a = this.lignes.get(id);
    return a ? { ...a } : null;
  }

  async declarer(appareil: NouvelAppareil) {
    const existant = this.lignes.get(appareil.id);
    const fiche: AppareilSync = {
      cle: null,
      genre: "autre",
      rang: null,
      nbConvoyeurs: null,
      plage: null,
      gareId: null,
      compagnieId: null,
      derniereSyncA: null,
      dernierOrdre: 0,
      octroi: null,
      retire: false,
      ...existant,
      ...appareil,
    };
    this.lignes.set(fiche.id, fiche);
    return { ...fiche };
  }

  async enregistrerCle(id: string, cle: CleJwk) {
    const a = this.lignes.get(id);
    if (a) a.cle = cle;
  }

  async mettreAJour(id: string, changement: Parameters<AppareilsSync["mettreAJour"]>[1]) {
    const a = this.lignes.get(id);
    if (a) Object.assign(a, changement);
  }
}

@Injectable()
export class JournalMemoire extends JournalSync implements StockageSync {
  readonly durable = false;
  readonly lignes: EntreeJournal[] = [];
  private readonly ids = new Set<string>();

  async existe(id: string) {
    return this.ids.has(id);
  }

  async ajouter(entree: Omit<EntreeJournal, "seq">) {
    if (this.ids.has(entree.evenement.id)) return null;
    this.ids.add(entree.evenement.id);
    const ligne: EntreeJournal = { ...entree, seq: this.lignes.length + 1 };
    this.lignes.push(ligne);
    return ligne;
  }

  async lister(filtre: { appareilId?: string; type?: string; depuisSeq?: number } = {}) {
    return this.lignes.filter(
      (l) =>
        (filtre.appareilId === undefined || l.evenement.appareilId === filtre.appareilId) &&
        (filtre.type === undefined || l.evenement.type === filtre.type) &&
        (filtre.depuisSeq === undefined || l.seq > filtre.depuisSeq),
    );
  }
}

@Injectable()
export class SiegesMemoire extends SiegesSync implements StockageSync {
  readonly durable = false;
  private readonly ops = new Map<string, OperationSiege[]>();
  private readonly billets = new Map<string, { departId: string; siege: number }>();
  private readonly lesConflits = new Map<string, ConflitStocke>();

  async ajouterOperation(departId: string, siege: number, operation: OperationSiege) {
    const cle = cleSiege(departId, siege);
    const liste = this.ops.get(cle) ?? [];
    if (liste.some((o) => o.evenementId === operation.evenementId)) return false;
    liste.push(operation);
    this.ops.set(cle, liste);
    return true;
  }

  async operations(departId: string, siege: number) {
    return [...(this.ops.get(cleSiege(departId, siege)) ?? [])];
  }

  async billet(billetId: string) {
    return this.billets.get(billetId) ?? null;
  }

  async definirBillet(billetId: string, departId: string, siege: number) {
    this.billets.set(billetId, { departId, siege });
  }

  async conflit(evenementId: string) {
    const c = this.lesConflits.get(evenementId);
    return c ? { ...c } : null;
  }

  async conflitsDuSiege(departId: string, siege: number) {
    return [...this.lesConflits.values()]
      .filter((c) => c.departId === departId && c.siege === siege)
      .map((c) => ({ ...c }));
  }

  async enregistrerConflit(conflit: ConflitStocke) {
    const nouveau = !this.lesConflits.has(conflit.evenementId);
    this.lesConflits.set(conflit.evenementId, { ...conflit });
    return nouveau;
  }

  async leverConflit(evenementId: string) {
    return this.lesConflits.delete(evenementId);
  }

  async conflitsDeAppareil(appareilId: string, depuisIso: string) {
    return [...this.lesConflits.values()]
      .filter((c) => c.appareilId === appareilId && c.detecteA >= depuisIso)
      .map((c) => ({ ...c }));
  }
}

@Injectable()
export class AlertesMemoire extends AlertesSync implements StockageSync {
  readonly durable = false;
  readonly lignes: AlerteSync[] = [];

  async ajouter(alerte: AlerteSync) {
    // Une alerte porte un identifiant unique : la recevoir deux fois ne la double pas.
    if (this.lignes.some((a) => a.id === alerte.id)) return;
    this.lignes.push(alerte);
  }

  async lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    ouvertesSeulement?: boolean;
  }) {
    return this.lignes.filter(
      (a) =>
        (filtre.gareId === undefined || a.gareId === filtre.gareId) &&
        (filtre.compagnieId === undefined || a.compagnieId === filtre.compagnieId) &&
        (!filtre.ouvertesSeulement || a.resolueA === null),
    );
  }
}

@Injectable()
export class ProvisionnementMemoire extends ProvisionnementSync implements StockageSync {
  readonly durable = false;
  readonly parts = new Map<string, Record<string, number[]>>();
  readonly verificateurs: {
    superviseurId: string;
    sel: string;
    iterations: number;
    hache: string;
  }[] = [];

  async partsHorsLigne(appareil: AppareilSync) {
    return { ...(this.parts.get(appareil.id) ?? {}) };
  }

  async verificateursPin() {
    return [...this.verificateurs];
  }
}

/**
 * Contrôle minimal des numéros : un doublon (même appareil, même jour, même genre, même numéro,
 * autre événement) et un numéro hors de la plage de l'appareil. AM-161 y ajoute l'attribution des
 * plages, l'alerte nominative sur un trou et le compteur du jour.
 */
@Injectable()
export class ControleNumerosMemoire extends ControleNumeros implements StockageSync {
  readonly durable = false;
  private readonly vus = new Map<string, Map<number, string>>();

  private cle(appareilId: string, jour: string, genre: GenreNumero): string {
    return `${appareilId}|${jour}|${genre}`;
  }

  async enregistrer(entree: EntreeNumero): Promise<AnomalieNumero[]> {
    const anomalies: AnomalieNumero[] = [];
    const cle = this.cle(entree.appareilId, entree.jour, entree.genre);
    const numeros = this.vus.get(cle) ?? new Map<number, string>();
    const existant = numeros.get(entree.numeroPlage);
    if (existant !== undefined && existant !== entree.evenementId) {
      anomalies.push({
        type: "numero_en_double",
        numeroPlage: entree.numeroPlage,
        evenementIdExistant: existant,
      });
    } else {
      numeros.set(entree.numeroPlage, entree.evenementId);
    }
    this.vus.set(cle, numeros);
    if (
      entree.plage &&
      (entree.numeroPlage < entree.plage.debut || entree.numeroPlage > entree.plage.fin)
    ) {
      anomalies.push({ type: "numero_hors_plage", numeroPlage: entree.numeroPlage });
    }
    return anomalies;
  }

  async trous(appareilId: string, jour: string, genre: GenreNumero, plage: Plage) {
    const numeros = this.vus.get(this.cle(appareilId, jour, genre));
    if (!numeros) return [];
    const dedans = [...numeros.keys()].filter((n) => n >= plage.debut && n <= plage.fin);
    if (dedans.length === 0) return [];
    const max = Math.max(...dedans);
    const trous: number[] = [];
    for (let n = plage.debut; n <= max; n++) if (!numeros.has(n)) trous.push(n);
    return trous;
  }
}

/** Plage d'un appareil : celle qui lui a été attribuée, sinon celle de son rang (plan de numérotation). */
@Injectable()
export class AttributionPlagesParRang extends AttributionPlages {
  async plageDe(appareil: AppareilSync): Promise<Plage | null> {
    if (appareil.plage) return appareil.plage;
    try {
      if (appareil.genre === "guichet" && appareil.rang !== null)
        return plageGuichet(appareil.rang);
      if (
        appareil.genre === "convoyeur" &&
        appareil.rang !== null &&
        appareil.nbConvoyeurs !== null
      ) {
        return plageConvoyeur(appareil.rang, appareil.nbConvoyeurs);
      }
    } catch {
      return null;
    }
    return null;
  }
}
