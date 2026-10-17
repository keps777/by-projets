import { enMs } from "./temps";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
  type AlertePatron,
  type Decompte,
  type EtatSession,
  type GuichetAgence,
  type RefusCreation,
  type SessionStockee,
} from "./ports";
import { TOLERANCE_ECART_DEFAUT } from "./regles";

/** Versions en mémoire des ports de la caisse (tests, développement). */

export class SessionsMemoire extends SessionsCaisse {
  readonly durable = false;
  readonly lignes = new Map<string, SessionStockee>();

  async creer(session: SessionStockee): Promise<"ok" | RefusCreation> {
    const toutes = [...this.lignes.values()];
    if (this.lignes.has(session.id)) return "identifiant_pris";
    if (toutes.some((s) => s.numero === session.numero)) return "numero_pris";
    if (toutes.some((s) => s.etat === "ouverte" && s.agentId === session.agentId)) {
      return "agent_occupe";
    }
    if (toutes.some((s) => s.etat === "ouverte" && s.guichetId === session.guichetId)) {
      return "guichet_occupe";
    }
    // Comme l'index unique de la base : une ouverture ne peut venir que d'un seul événement.
    if (
      session.evenementOuvertureId !== "" &&
      toutes.some((s) => s.evenementOuvertureId === session.evenementOuvertureId)
    ) {
      return "identifiant_pris";
    }
    this.lignes.set(session.id, structuredClone(session));
    return "ok";
  }

  async trouver(id: string): Promise<SessionStockee | null> {
    const s = this.lignes.get(id);
    return s ? structuredClone(s) : null;
  }

  async transiter(
    id: string,
    depuis: EtatSession,
    changement: Partial<Omit<SessionStockee, "id">>,
  ): Promise<SessionStockee | null> {
    const s = this.lignes.get(id);
    if (!s || s.etat !== depuis) return null;
    const suivante = { ...s, ...structuredClone(changement) };
    this.lignes.set(id, suivante);
    return structuredClone(suivante);
  }

  async ouverteDeAgent(agentId: string): Promise<SessionStockee | null> {
    const s = [...this.lignes.values()].find((x) => x.agentId === agentId && x.etat === "ouverte");
    return s ? structuredClone(s) : null;
  }

  async deAgent(agentId: string, depuisIso?: string): Promise<SessionStockee[]> {
    return [...this.lignes.values()]
      .filter((s) => s.agentId === agentId)
      .filter((s) => depuisIso === undefined || enMs(s.ouverteA) >= enMs(depuisIso))
      .sort((a, b) => enMs(b.ouverteA) - enMs(a.ouverteA))
      .map((s) => structuredClone(s));
  }

  async deGare(gareId: string, depuisIso: string): Promise<SessionStockee[]> {
    return [...this.lignes.values()]
      .filter((s) => s.gareId === gareId)
      .filter((s) => s.etat === "cloturee" || enMs(s.ouverteA) >= enMs(depuisIso))
      .sort((a, b) => enMs(a.ouverteA) - enMs(b.ouverteA))
      .map((s) => structuredClone(s));
  }

  async ouvertes(): Promise<SessionStockee[]> {
    return [...this.lignes.values()]
      .filter((s) => s.etat === "ouverte")
      .map((s) => structuredClone(s));
  }
}

interface MouvementCash {
  agentId: string;
  guichetId: string;
  montant: number;
  at: string;
}

export class MouvementsMemoire extends MouvementsCaisse {
  readonly durable = false;
  private readonly billetsCash: MouvementCash[] = [];
  private readonly colisCash: MouvementCash[] = [];
  private readonly momo: MouvementCash[] = [];
  private readonly annulations = new Map<
    string,
    { sessionId: string; montant: number; at: string }
  >();

  /** Test : un billet payé en cash au guichet. */
  venteCash(m: MouvementCash): void {
    this.billetsCash.push(m);
  }

  /** Test : un colis payé en cash au guichet. */
  colisEnCash(m: MouvementCash): void {
    this.colisCash.push(m);
  }

  /** Test : un billet payé en MoMo ou Orange Money (hors caisse). */
  venteMomo(m: MouvementCash): void {
    this.momo.push(m);
  }

  /** Test : efface tous les mouvements. */
  vider(): void {
    this.billetsCash.length = 0;
    this.colisCash.length = 0;
    this.momo.length = 0;
    this.annulations.clear();
  }

  async decompte(
    session: Pick<SessionStockee, "id" | "agentId" | "guichetId" | "ouverteA">,
    jusqua: string,
  ): Promise<Decompte> {
    const debut = enMs(session.ouverteA);
    const fin = enMs(jusqua);
    const dans = (liste: MouvementCash[]) =>
      liste.filter(
        (m) =>
          m.agentId === session.agentId &&
          m.guichetId === session.guichetId &&
          enMs(m.at) >= debut &&
          enMs(m.at) <= fin,
      );
    const somme = (liste: { montant: number }[]) => ({
      nombre: liste.length,
      montant: liste.reduce((t, m) => t + m.montant, 0),
    });
    const annulations = [...this.annulations.values()].filter(
      (a) => a.sessionId === session.id && enMs(a.at) <= fin,
    );
    const momo = somme(dans(this.momo));
    return {
      billetsCash: somme(dans(this.billetsCash)),
      colisCash: somme(dans(this.colisCash)),
      annulationsValidees: somme(annulations),
      momo: { ventes: momo.nombre, montant: momo.montant },
    };
  }

  async enregistrerAnnulation(a: {
    demandeId: string;
    sessionId: string;
    montant: number;
    at: string;
  }): Promise<void> {
    if (!this.annulations.has(a.demandeId)) {
      this.annulations.set(a.demandeId, { sessionId: a.sessionId, montant: a.montant, at: a.at });
    }
  }
}

export class GuichetsMemoire extends GuichetsAgence {
  readonly durable = false;
  private readonly lignes = new Map<string, GuichetAgence>();

  /** Test / administration : déclare un guichet. */
  declarer(guichet: GuichetAgence): void {
    this.lignes.set(guichet.id, guichet);
  }

  async trouver(guichetId: string): Promise<GuichetAgence | null> {
    return this.lignes.get(guichetId) ?? null;
  }
}

export class ReglesMemoire extends ReglesAgence {
  readonly durable = false;
  private readonly tolerances = new Map<string | null, number>();

  definirTolerance(compagnieId: string | null, montant: number): void {
    this.tolerances.set(compagnieId, montant);
  }

  async tolerance(compagnieId: string | null): Promise<number> {
    return this.tolerances.get(compagnieId) ?? TOLERANCE_ECART_DEFAUT;
  }
}

export class AlertesPatronMemoire extends AlertesPatron {
  readonly durable = false;
  readonly lignes: AlertePatron[] = [];

  async alerter(alerte: AlertePatron): Promise<void> {
    this.lignes.push(structuredClone(alerte));
  }
}
