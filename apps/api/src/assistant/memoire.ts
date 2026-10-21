import { Injectable } from "@nestjs/common";
import type { ActionProposee } from "../analyses/modele";
import { versIsoDouala } from "../rapport/temps";
import { Horloge } from "../socle/horloge";
import { effetDe } from "./effets";
import type { EchangeStocke, PropositionStockee } from "./modele";
import {
  AppliquerActions,
  ConversationsAssistant,
  PropositionsAssistant,
  type DemandeApplication,
} from "./ports";

/**
 * Adaptateurs en mémoire : pour les tests et le développement. Rien ne survit au redémarrage, donc
 * `VerificationAssistant` les refuse en production.
 */

@Injectable()
export class ConversationsMemoire extends ConversationsAssistant {
  readonly durable = false;
  /** Pour les tests : tout ce qui a été ajouté, dans l'ordre. */
  readonly tous: EchangeStocke[] = [];
  /** Pour les tests : simule une base indisponible. */
  enPanne = false;

  async derniers(
    compagnieId: string,
    utilisateurId: string,
    limite: number,
  ): Promise<EchangeStocke[]> {
    if (this.enPanne) throw new Error("conversations indisponibles");
    return this.tous
      .filter((e) => e.compagnieId === compagnieId && e.utilisateurId === utilisateurId)
      .slice(-limite)
      .map((e) => structuredClone(e));
  }

  async ajouter(echange: EchangeStocke): Promise<void> {
    if (this.enPanne) throw new Error("conversations indisponibles");
    this.tous.push(structuredClone(echange));
  }
}

@Injectable()
export class PropositionsMemoire extends PropositionsAssistant {
  readonly durable = false;
  private readonly lignes = new Map<string, PropositionStockee>();
  enPanne = false;

  private cle = (compagnieId: string, actionId: string): string =>
    `${compagnieId}\u0000${actionId}`;

  /** Pour les tests. */
  toutes(): PropositionStockee[] {
    return [...this.lignes.values()].map((p) => structuredClone(p));
  }

  async proposer(
    compagnieId: string,
    actions: readonly ActionProposee[],
    proposeeLe: Date,
    expireLe: Date,
  ): Promise<void> {
    if (this.enPanne) throw new Error("propositions indisponibles");
    for (const action of actions) {
      const cle = this.cle(compagnieId, action.id);
      const existante = this.lignes.get(cle);
      if (existante?.application && Date.parse(existante.expireLe) > proposeeLe.getTime()) continue;
      this.lignes.set(cle, {
        compagnieId,
        action: structuredClone(action),
        proposeeLe: versIsoDouala(proposeeLe),
        expireLe: versIsoDouala(expireLe),
        application: null,
      });
    }
  }

  async trouver(compagnieId: string, actionId: string): Promise<PropositionStockee | null> {
    if (this.enPanne) throw new Error("propositions indisponibles");
    const p = this.lignes.get(this.cle(compagnieId, actionId));
    return p ? structuredClone(p) : null;
  }

  async reserver(compagnieId: string, actionId: string, par: string, a: Date): Promise<boolean> {
    const p = this.lignes.get(this.cle(compagnieId, actionId));
    if (!p || p.application) return false;
    p.application = { par, a: versIsoDouala(a), journalId: null, effetA: null };
    return true;
  }

  async confirmer(
    compagnieId: string,
    actionId: string,
    journalId: string,
    effetA: string,
  ): Promise<void> {
    const p = this.lignes.get(this.cle(compagnieId, actionId));
    if (p?.application) {
      p.application.journalId = journalId;
      p.application.effetA = effetA;
    }
  }

  async liberer(compagnieId: string, actionId: string): Promise<void> {
    const p = this.lignes.get(this.cle(compagnieId, actionId));
    // Une application confirmée (ligne du journal posée) ne se libère plus : comme sur PostgreSQL.
    if (p && (p.application === null || p.application.journalId === null)) p.application = null;
  }
}

@Injectable()
export class AppliquerActionsMemoire extends AppliquerActions {
  readonly durable = false;
  /** Pour les tests : ce qui a été appliqué, dans l'ordre. */
  readonly appliquees: DemandeApplication[] = [];
  /** Pour les tests : fait échouer l'application suivante. */
  echec: Error | null = null;

  constructor(private readonly horloge: Horloge) {
    super();
  }

  async appliquer(demande: DemandeApplication): Promise<{ effetA: string }> {
    if (this.echec) throw this.echec;
    this.appliquees.push(structuredClone(demande));
    return { effetA: effetDe(demande.action, this.horloge.maintenant()) };
  }
}
