import { ETATS_ANNULABLES, ETATS_REPORTABLES, type EtatBillet } from "../caisse/regles";
import {
  DemandesAnnulation,
  EquipeGare,
  PinsEquipe,
  RegistreBillets,
  SourceGare,
  type BilletAnnulable,
  type DemandeAnnulationStockee,
  type EtatPinStocke,
  type GareVue,
  type MembreEquipe,
  type RoleEquipe,
} from "./ports";

/** Versions en mémoire des ports de la supervision (tests, développement). */

export class RegistreBilletsMemoire extends RegistreBillets {
  readonly durable = false;
  readonly lignes = new Map<string, BilletAnnulable>();
  /** Test : les transitions appliquées, dans l'ordre. */
  readonly transitions: { billetId: string; action: "annuler" | "reporter"; parId: string }[] = [];

  /** Test / administration : enregistre un billet. */
  ajouter(billet: BilletAnnulable): void {
    this.lignes.set(billet.billetId, structuredClone(billet));
  }

  async trouver(billetId: string): Promise<BilletAnnulable | null> {
    const b = this.lignes.get(billetId);
    return b ? structuredClone(b) : null;
  }

  async appliquer(
    billetId: string,
    action: "annuler" | "reporter",
    meta: { at: string; parId: string; motif: string | null },
  ): Promise<{ etat: EtatBillet; siegeLibere: boolean } | null> {
    const b = this.lignes.get(billetId);
    if (!b) return null;
    const permis = action === "annuler" ? ETATS_ANNULABLES : ETATS_REPORTABLES;
    if (!permis.includes(b.etat)) return null;
    const etat: EtatBillet = action === "annuler" ? "annule" : "reporte";
    const siegeLibere = true;
    this.lignes.set(billetId, { ...b, etat });
    this.transitions.push({ billetId, action, parId: meta.parId });
    return { etat, siegeLibere };
  }
}

export class DemandesAnnulationMemoire extends DemandesAnnulation {
  readonly durable = false;
  readonly lignes = new Map<string, DemandeAnnulationStockee>();

  async creer(
    demande: DemandeAnnulationStockee,
  ): Promise<"ok" | "deja_en_attente" | "identifiant_pris"> {
    if (this.lignes.has(demande.demandeId)) return "identifiant_pris";
    const existante = await this.enAttenteDuBillet(demande.billetId);
    if (existante) return "deja_en_attente";
    this.lignes.set(demande.demandeId, structuredClone(demande));
    return "ok";
  }

  async trouver(demandeId: string): Promise<DemandeAnnulationStockee | null> {
    const d = this.lignes.get(demandeId);
    return d ? structuredClone(d) : null;
  }

  async enAttenteDuBillet(billetId: string): Promise<DemandeAnnulationStockee | null> {
    const d = [...this.lignes.values()].find(
      (x) => x.billetId === billetId && x.statut === "en_attente",
    );
    return d ? structuredClone(d) : null;
  }

  async enAttenteDeGare(gareId: string): Promise<DemandeAnnulationStockee[]> {
    return [...this.lignes.values()]
      .filter((d) => d.gareId === gareId && d.statut === "en_attente")
      .sort((a, b) => Date.parse(a.demandeA) - Date.parse(b.demandeA))
      .map((d) => structuredClone(d));
  }

  async decider(
    demandeId: string,
    decision: {
      decision: DemandeAnnulationStockee["decision"] & string;
      montant: number;
      decideeA: string;
      decideeParId: string;
      evenementDecisionId: string;
    },
  ): Promise<boolean> {
    const d = this.lignes.get(demandeId);
    if (!d || d.statut !== "en_attente") return false;
    this.lignes.set(demandeId, {
      ...d,
      statut: "decidee",
      decision: decision.decision,
      montant: decision.montant,
      decideeA: decision.decideeA,
      decideeParId: decision.decideeParId,
      evenementDecisionId: decision.evenementDecisionId,
    });
    return true;
  }

  async rouvrir(demandeId: string): Promise<void> {
    const d = this.lignes.get(demandeId);
    if (!d) return;
    this.lignes.set(demandeId, {
      ...d,
      statut: "en_attente",
      decision: null,
      montant: null,
      decideeA: null,
      decideeParId: null,
      evenementDecisionId: null,
    });
  }
}

export class SourceGareMemoire extends SourceGare {
  readonly durable = false;
  private readonly gares = new Map<string, GareVue>();
  private readonly cadence = new Map<string, number>();
  private readonly annulations = new Map<
    string,
    { aujourdhui: number; dixJours: number; moyenneGuichets: number }
  >();

  /** Test / administration. */
  definirGare(gare: GareVue): void {
    this.gares.set(gare.id, structuredClone(gare));
  }

  definirCadenceSansNom(gareId: string, nombre: number): void {
    this.cadence.set(gareId, nombre);
  }

  definirAnnulations(
    agentId: string,
    valeurs: { aujourdhui: number; dixJours: number; moyenneGuichets: number },
  ): void {
    this.annulations.set(agentId, valeurs);
  }

  async gare(gareId: string): Promise<GareVue | null> {
    const g = this.gares.get(gareId);
    return g ? structuredClone(g) : null;
  }

  async cadenceSansNom(gareId: string): Promise<number> {
    return this.cadence.get(gareId) ?? 0;
  }

  async annulationsAgent(agentId: string) {
    return this.annulations.get(agentId) ?? { aujourdhui: 0, dixJours: 0, moyenneGuichets: 0 };
  }
}

export class EquipeMemoire extends EquipeGare {
  readonly durable = false;
  readonly lignes = new Map<string, MembreEquipe>();
  /**
   * Liaison avec le socle : en production, la désactivation écrit `personne.actif = false`. Les tests
   * y branchent `PersonnesMemoire.modifier` pour vérifier qu'un jeton déjà émis cesse de passer.
   */
  surDesactivation: ((personneId: string) => void) | null = null;
  surAffectation: ((personneId: string, role: RoleEquipe | null) => void) | null = null;

  /** Test / administration. */
  ajouter(membre: MembreEquipe): void {
    this.lignes.set(membre.personneId, structuredClone(membre));
  }

  async lister(gareId: string): Promise<MembreEquipe[]> {
    return [...this.lignes.values()]
      .filter((m) => m.gareId === gareId && m.actif)
      .map((m) => structuredClone(m));
  }

  async trouver(personneId: string): Promise<MembreEquipe | null> {
    const m = this.lignes.get(personneId);
    return m ? structuredClone(m) : null;
  }

  async changerAffectation(
    personneId: string,
    changement: { guichetId: string | null; role: RoleEquipe | null },
  ): Promise<void> {
    const m = this.lignes.get(personneId);
    if (!m) return;
    this.lignes.set(personneId, {
      ...m,
      guichetId: changement.guichetId ?? m.guichetId,
      role: changement.role ?? m.role,
    });
    this.surAffectation?.(personneId, changement.role);
  }

  async desactiver(personneId: string): Promise<void> {
    const m = this.lignes.get(personneId);
    if (!m) return;
    this.lignes.set(personneId, { ...m, actif: false });
    this.surDesactivation?.(personneId);
  }
}

export class PinsEquipeMemoire extends PinsEquipe {
  readonly durable = false;
  private readonly lignes = new Map<string, EtatPinStocke>();
  /**
   * Liaison avec le socle : en production, le haché est écrit dans `personne.pin_hache`. Les tests
   * y branchent `PersonnesMemoire.modifier`.
   */
  surDefinition: ((personneId: string, pinHache: string) => void) | null = null;

  async lire(personneId: string): Promise<EtatPinStocke> {
    return { provisoireJusqua: this.lignes.get(personneId)?.provisoireJusqua ?? null };
  }

  async definirProvisoire(personneId: string, pinHache: string, jusqua: Date): Promise<void> {
    this.lignes.set(personneId, { provisoireJusqua: jusqua });
    this.surDefinition?.(personneId, pinHache);
  }
}
