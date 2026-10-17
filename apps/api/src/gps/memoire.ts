import { Injectable } from "@nestjs/common";
import { distanceM } from "./geo";
import type {
  AlerteArret,
  BilletSuivi,
  EtatSuivi,
  MissionSuivie,
  OffreMontee,
  PointArret,
  Position,
  PrevenirProche,
  ProcheSuivi,
  TrajetBus,
} from "./modeles";
import {
  AlertesArret,
  AvisSuivi,
  BilletsSuivis,
  DiffusionGps,
  EtatsSuivi,
  MissionsSuivies,
  OffresDeMontee,
  Positions,
  PrevenirProches,
  ProchesASuivre,
  ReseauTransport,
  type AvisProche,
} from "./ports";
import { enMs } from "./temps";

/**
 * Adaptateurs en mémoire des ports : tests et développement. Aucun n'est durable : `GpsModule`
 * refuse de démarrer en production tant que l'un d'eux sert (`durable = false`).
 */
export interface StockageGps {
  readonly durable: boolean;
}

const copie = <T>(v: T): T => structuredClone(v);

/* ------------------------------------------------------------------ lu chez les autres */

@Injectable()
export class ReseauMemoire extends ReseauTransport implements StockageGps {
  readonly durable = false;
  private readonly trajets = new Map<string, TrajetBus>();
  private readonly arrets = new Map<string, PointArret>();

  ajouterTrajet(t: TrajetBus): void {
    this.trajets.set(t.departId, copie(t));
  }

  /** Test : change l'état d'un départ (le bus part, arrive…). */
  changerTrajet(departId: string, changement: Partial<TrajetBus>): void {
    const t = this.trajets.get(departId);
    if (!t) throw new Error(`départ inconnu : ${departId}`);
    this.trajets.set(departId, { ...t, ...copie(changement) });
  }

  ajouterArret(a: PointArret): void {
    this.arrets.set(a.id, copie(a));
  }

  async trajet(departId: string) {
    const t = this.trajets.get(departId);
    return t ? copie(t) : null;
  }

  async trajetsEnRoute(compagnieId: string) {
    return [...this.trajets.values()]
      .filter(
        (t) => t.compagnie.id === compagnieId && (t.etat === "embarquement" || t.etat === "parti"),
      )
      .map(copie);
  }

  async arret(arretId: string) {
    const a = this.arrets.get(arretId);
    return a ? copie(a) : null;
  }

  async arretLePlusProche(latitude: number, longitude: number, rayonM: number) {
    let meilleur: { a: PointArret; d: number } | null = null;
    for (const a of this.arrets.values()) {
      const d = distanceM(a, { latitude, longitude });
      if (d <= rayonM && (meilleur === null || d < meilleur.d)) meilleur = { a, d };
    }
    return meilleur ? copie(meilleur.a) : null;
  }

  async trajetsPres(point: { latitude: number; longitude: number }, rayonM: number) {
    return [...this.trajets.values()]
      .filter(
        (t) =>
          ["en_vente", "embarquement", "parti", "retarde"].includes(t.etat) &&
          t.arrets.some((a) => distanceM(a, point) <= rayonM),
      )
      .map(copie);
  }
}

@Injectable()
export class BilletsMemoire extends BilletsSuivis implements StockageGps {
  readonly durable = false;
  private readonly billets = new Map<string, BilletSuivi>();

  ajouter(b: BilletSuivi): void {
    this.billets.set(b.billetId, copie(b));
  }

  async billet(billetId: string) {
    const b = this.billets.get(billetId);
    return b ? copie(b) : null;
  }
}

@Injectable()
export class ProchesMemoire extends ProchesASuivre implements StockageGps {
  readonly durable = false;
  private readonly proches = new Map<string, ProcheSuivi[]>();

  ajouter(voyageurId: string, p: ProcheSuivi): void {
    this.proches.set(voyageurId, [...(this.proches.get(voyageurId) ?? []), copie(p)]);
  }

  async trouver(voyageurId: string, procheId: string) {
    const p = (this.proches.get(voyageurId) ?? []).find((x) => x.id === procheId);
    return p ? copie(p) : null;
  }

  async proposition(voyageurId: string) {
    const p = this.proches.get(voyageurId)?.[0];
    return p ? copie(p) : null;
  }
}

@Injectable()
export class MissionsMemoire extends MissionsSuivies implements StockageGps {
  readonly durable = false;
  private readonly missions = new Map<string, MissionSuivie>();

  ajouter(m: MissionSuivie): void {
    this.missions.set(m.colisId, copie(m));
  }

  changer(colisId: string, changement: Partial<MissionSuivie>): void {
    const m = this.missions.get(colisId);
    if (!m) throw new Error(`mission inconnue : ${colisId}`);
    this.missions.set(colisId, { ...m, ...copie(changement) });
  }

  async mission(colisId: string) {
    const m = this.missions.get(colisId);
    return m ? copie(m) : null;
  }
}

@Injectable()
export class OffresMemoire extends OffresDeMontee implements StockageGps {
  readonly durable = false;
  private readonly offres = new Map<string, OffreMontee>();

  definir(departId: string, arretId: string, o: OffreMontee): void {
    this.offres.set(`${departId}|${arretId}`, copie(o));
  }

  async offre(departId: string, arretId: string) {
    const o = this.offres.get(`${departId}|${arretId}`);
    return o ? copie(o) : null;
  }
}

/* ------------------------------------------------------------------ écrit par le module */

@Injectable()
export class PositionsMemoire extends Positions implements StockageGps {
  readonly durable = false;
  private readonly lignes = new Map<string, Position>();

  async ajouter(p: Position) {
    const cle = `${p.sujet}|${p.auteurId}|${p.instant}`;
    if (this.lignes.has(cle)) return false;
    this.lignes.set(cle, copie(p));
    return true;
  }

  private duSujet(sujet: string): Position[] {
    return [...this.lignes.values()]
      .filter((p) => p.sujet === sujet)
      .sort((a, b) => enMs(a.instant) - enMs(b.instant));
  }

  async derniere(sujet: string) {
    const l = this.duSujet(sujet);
    const p = l[l.length - 1];
    return p ? copie(p) : null;
  }

  async recentes(sujet: string, nombre: number) {
    return this.duSujet(sujet).slice(-nombre).map(copie);
  }

  /** Test : nombre de positions gardées pour un sujet. */
  compter(sujet: string): number {
    return this.duSujet(sujet).length;
  }
}

@Injectable()
export class EtatsSuiviMemoire extends EtatsSuivi implements StockageGps {
  readonly durable = false;
  private readonly etats = new Map<string, EtatSuivi>();

  async lire(departId: string) {
    const e = this.etats.get(departId);
    return e ? copie(e) : null;
  }

  async ecrire(etat: EtatSuivi) {
    const stockee = this.etats.get(etat.departId)?.version ?? 0;
    if (stockee !== etat.version - 1) return false;
    this.etats.set(etat.departId, copie(etat));
    return true;
  }
}

@Injectable()
export class AlertesMemoire extends AlertesArret implements StockageGps {
  readonly durable = false;
  private readonly alertes = new Map<string, AlerteArret>();

  async ouvrir(alerte: AlerteArret) {
    const ouverte = [...this.alertes.values()].some(
      (a) => a.departId === alerte.departId && a.resolueA === null,
    );
    if (ouverte) return null;
    this.alertes.set(alerte.id, copie(alerte));
    return copie(alerte);
  }

  async resoudre(id: string, a: string) {
    const alerte = this.alertes.get(id);
    if (!alerte || alerte.resolueA !== null) return null;
    const close = { ...alerte, resolueA: a };
    this.alertes.set(id, close);
    return copie(close);
  }

  async trouver(id: string) {
    const a = this.alertes.get(id);
    return a ? copie(a) : null;
  }

  async ouvertes(compagnieId: string) {
    return [...this.alertes.values()]
      .filter((a) => a.compagnieId === compagnieId && a.resolueA === null)
      .sort((a, b) => enMs(a.ouverteA) - enMs(b.ouverteA))
      .map(copie);
  }

  /** Test : toutes les alertes, ouvertes ou non. */
  toutes(): AlerteArret[] {
    return [...this.alertes.values()].map(copie);
  }
}

@Injectable()
export class PrevenirMemoire extends PrevenirProches implements StockageGps {
  readonly durable = false;
  private readonly lignes = new Map<string, PrevenirProche>();
  private readonly cle = (billetId: string, procheId: string): string => `${billetId}|${procheId}`;

  async enregistrer(p: Omit<PrevenirProche, "envoyeA" | "creeA"> & { creeA: string }) {
    const k = this.cle(p.billetId, p.procheId);
    const avant = this.lignes.get(k);
    const ligne: PrevenirProche = {
      ...p,
      creeA: avant?.creeA ?? p.creeA,
      envoyeA: avant?.envoyeA ?? null,
    };
    this.lignes.set(k, ligne);
    return copie(ligne);
  }

  async deBillet(billetId: string) {
    return [...this.lignes.values()].filter((p) => p.billetId === billetId).map(copie);
  }

  async enAttente(departId: string) {
    return [...this.lignes.values()]
      .filter((p) => p.departId === departId && p.actif && p.envoyeA === null)
      .map(copie);
  }

  async marquerEnvoye(billetId: string, procheId: string, a: string) {
    const p = this.lignes.get(this.cle(billetId, procheId));
    if (!p || p.envoyeA !== null) return false;
    this.lignes.set(this.cle(billetId, procheId), { ...p, envoyeA: a });
    return true;
  }

  async desactiver(billetId: string, procheId: string) {
    const p = this.lignes.get(this.cle(billetId, procheId));
    if (!p) return null;
    const maj = { ...p, actif: false };
    this.lignes.set(this.cle(billetId, procheId), maj);
    return copie(maj);
  }
}

/* ------------------------------------------------------------------ avis et temps réel */

@Injectable()
export class AvisMemoire extends AvisSuivi implements StockageGps {
  readonly durable = false;
  /** Chaque appel de `prevenirProche`, doublons compris. */
  readonly appels: AvisProche[] = [];
  /** Les SMS distincts (la clé d'idempotence écarte les doublons, comme la passerelle SMS). */
  readonly prochesPrevenus: AvisProche[] = [];
  readonly alertes: AlerteArret[] = [];
  /** Test : fait échouer les prochains envois de SMS au proche. */
  echecs = 0;

  async prevenirProche(avis: AvisProche) {
    if (this.echecs > 0) {
      this.echecs -= 1;
      throw new Error("passerelle SMS indisponible");
    }
    this.appels.push(copie(avis));
    // Idempotence : la clé identifie le SMS.
    if (!this.prochesPrevenus.some((a) => a.cle === avis.cle))
      this.prochesPrevenus.push(copie(avis));
  }

  async alerteArret(alerte: AlerteArret) {
    this.alertes.push(copie(alerte));
  }
}

@Injectable()
export class DiffusionMemoire extends DiffusionGps implements StockageGps {
  readonly durable = false;
  private readonly ecouteurs = new Map<string, Set<(message: unknown) => void>>();

  publier(canal: string, message: unknown): void {
    for (const ecouteur of [...(this.ecouteurs.get(canal) ?? [])]) ecouteur(message);
  }

  souscrire(canal: string, ecouteur: (message: unknown) => void): () => void {
    const s = this.ecouteurs.get(canal) ?? new Set();
    s.add(ecouteur);
    this.ecouteurs.set(canal, s);
    return () => {
      s.delete(ecouteur);
    };
  }

  nombreAbonnes(canal: string): number {
    return this.ecouteurs.get(canal)?.size ?? 0;
  }
}
