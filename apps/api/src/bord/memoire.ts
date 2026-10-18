import type {
  ConstatSiege,
  ControleStocke,
  DepenseBord,
  GenrePassage,
  IncidentBord,
  PassageRoute,
  RegularisationControle,
  RetardDepart,
  SiegeConstate,
  SignalementConvoyeur,
  VenteRoute,
} from "./modeles";
import {
  ControlesBord,
  DepensesBord,
  IncidentsBord,
  MessagesBord,
  PassagesRoute,
  RetardsDepart,
  VentesEnRoute,
  type DemandeConstat,
  type DemandeIncident,
  type DemandeRetard,
  type DemandeSmsBilletBord,
  type ResultatOuverture,
  type StockageBord,
} from "./ports";

/**
 * Versions en mémoire des ports du bord (tests, développement). `BordModule` refuse de démarrer en
 * production tant qu'un port est encore ici : `durable = false`.
 */

const copie = <T>(v: T): T => structuredClone(v);

export class VentesEnRouteMemoire extends VentesEnRoute implements StockageBord {
  readonly durable = false;
  private readonly lignes = new Map<string, VenteRoute>();

  async ajouter(vente: VenteRoute): Promise<boolean> {
    if (this.lignes.has(vente.billetId)) return false;
    this.lignes.set(vente.billetId, copie(vente));
    return true;
  }

  async duDepart(departId: string): Promise<VenteRoute[]> {
    return [...this.lignes.values()]
      .filter((v) => v.departId === departId)
      .sort((a, b) => a.venduA.localeCompare(b.venduA))
      .map(copie);
  }
}

export class PassagesRouteMemoire extends PassagesRoute implements StockageBord {
  readonly durable = false;
  private readonly lignes = new Map<string, PassageRoute>();

  async ajouter(passage: PassageRoute): Promise<boolean> {
    if (this.lignes.has(passage.id)) return false;
    this.lignes.set(passage.id, copie(passage));
    return true;
  }

  async duDepart(departId: string, genre?: GenrePassage): Promise<PassageRoute[]> {
    return [...this.lignes.values()]
      .filter((p) => p.departId === departId && (genre === undefined || p.genre === genre))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(copie);
  }
}

export class DepensesBordMemoire extends DepensesBord implements StockageBord {
  readonly durable = false;
  private readonly lignes = new Map<string, DepenseBord>();

  async ajouter(depense: DepenseBord): Promise<boolean> {
    if (this.lignes.has(depense.id)) return false;
    this.lignes.set(depense.id, copie(depense));
    return true;
  }

  async duDepart(departId: string): Promise<DepenseBord[]> {
    return [...this.lignes.values()]
      .filter((d) => d.departId === departId)
      .sort((a, b) => Date.parse(a.saisieA) - Date.parse(b.saisieA))
      .map(copie);
  }
}

export class IncidentsBordMemoire extends IncidentsBord implements StockageBord {
  readonly durable = false;
  private readonly lignes = new Map<string, IncidentBord>();

  async ajouter(incident: IncidentBord): Promise<boolean> {
    if (this.lignes.has(incident.id)) return false;
    this.lignes.set(incident.id, copie(incident));
    return true;
  }

  async duDepart(departId: string): Promise<IncidentBord[]> {
    return [...this.lignes.values()]
      .filter((i) => i.departId === departId)
      .sort((a, b) => Date.parse(a.signaleA) - Date.parse(b.signaleA))
      .map(copie);
  }
}

export class RetardsDepartMemoire extends RetardsDepart implements StockageBord {
  readonly durable = false;
  private readonly lignes = new Map<string, RetardDepart>();

  async noter(departId: string, minutes: number): Promise<void> {
    this.lignes.set(departId, { departId, minutes });
  }

  async lire(departId: string): Promise<RetardDepart | null> {
    const l = this.lignes.get(departId);
    return l ? copie(l) : null;
  }
}

export class ControlesBordMemoire extends ControlesBord implements StockageBord {
  readonly durable = false;
  private readonly controles = new Map<string, ControleStocke>();
  private readonly sieges = new Map<string, SiegeConstate>();
  private readonly regularisationsParBillet = new Map<string, RegularisationControle>();
  private readonly signalementsParEvenement = new Map<string, SignalementConvoyeur>();

  async trouver(id: string): Promise<ControleStocke | null> {
    const c = this.controles.get(id);
    return c ? copie(c) : null;
  }

  async ouvertDe(controleurId: string): Promise<ControleStocke | null> {
    const c = [...this.controles.values()].find(
      (x) => x.controleurId === controleurId && x.clotureA === null,
    );
    return c ? copie(c) : null;
  }

  async ouvrir(controle: ControleStocke): Promise<ResultatOuverture> {
    // Sans attente entre la lecture et l'écriture : deux ouvertures simultanées n'en créent pas deux.
    const ouvert = [...this.controles.values()].find(
      (x) => x.controleurId === controle.controleurId && x.clotureA === null,
    );
    if (ouvert) return { controle: copie(ouvert), cree: false };
    this.controles.set(controle.id, copie(controle));
    return { controle: copie(controle), cree: true };
  }

  async constats(controleId: string): Promise<SiegeConstate[]> {
    return [...this.sieges.values()]
      .filter((s) => s.controleId === controleId)
      .sort((a, b) => a.siege - b.siege)
      .map(copie);
  }

  async constater(controleId: string, siege: number, constat: ConstatSiege, at: string) {
    this.sieges.set(`${controleId}:${siege}`, { controleId, siege, constat, at });
  }

  async regulariser(r: RegularisationControle): Promise<boolean> {
    if (this.regularisationsParBillet.has(r.billetId)) return false;
    this.regularisationsParBillet.set(r.billetId, copie(r));
    return true;
  }

  async regularisations(controleId: string): Promise<RegularisationControle[]> {
    return [...this.regularisationsParBillet.values()]
      .filter((r) => r.controleId === controleId)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(copie);
  }

  async signaler(s: SignalementConvoyeur): Promise<boolean> {
    if (this.signalementsParEvenement.has(s.evenementId)) return false;
    this.signalementsParEvenement.set(s.evenementId, copie(s));
    return true;
  }

  async signalements(controleId: string): Promise<SignalementConvoyeur[]> {
    return [...this.signalementsParEvenement.values()]
      .filter((s) => s.controleId === controleId)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map(copie);
  }

  async marquerPatronPrevenu(evenementId: string): Promise<void> {
    const s = this.signalementsParEvenement.get(evenementId);
    if (s) s.patronPrevenu = true;
  }

  async clore(
    id: string,
    a: { clotureA: string; liste: number; tetes: number; ecart: number },
  ): Promise<ControleStocke | null> {
    const c = this.controles.get(id);
    if (!c || c.clotureA !== null) return null;
    Object.assign(c, a);
    return copie(c);
  }

  async marquerEnvoye(id: string): Promise<void> {
    const c = this.controles.get(id);
    if (c && c.clotureA !== null) c.envoyeAuPatron = true;
  }

  async duDepart(departId: string): Promise<ControleStocke[]> {
    return [...this.controles.values()]
      .filter((c) => c.departId === departId)
      .sort((a, b) => Date.parse(a.ouvertA) - Date.parse(b.ouvertA))
      .map(copie);
  }
}

/**
 * Messages gardés en mémoire (tests) : rien ne part. Par défaut, tout « part » ; `echec` simule une
 * panne de SMS.
 */
export class MessagesBordMemoire extends MessagesBord {
  readonly billets: DemandeSmsBilletBord[] = [];
  readonly retards: DemandeRetard[] = [];
  readonly incidents: DemandeIncident[] = [];
  readonly constats: DemandeConstat[] = [];
  echec = false;
  /** La gare a-t-elle un responsable à prévenir ? */
  garePrevenue = true;

  async envoyerBillet(d: DemandeSmsBilletBord): Promise<boolean> {
    if (this.echec) return false;
    this.billets.push(d);
    return true;
  }

  async prevenirRetard(d: DemandeRetard) {
    if (this.echec) return { voyageurs: 0, gare: false };
    this.retards.push(d);
    return { voyageurs: d.voyageurs.length, gare: this.garePrevenue };
  }

  async prevenirIncident(d: DemandeIncident) {
    if (this.echec) return { voyageurs: 0, gare: false };
    this.incidents.push(d);
    return { voyageurs: d.voyageurs.length, gare: this.garePrevenue };
  }

  async prevenirPatron(d: DemandeConstat): Promise<boolean> {
    if (this.echec) return false;
    this.constats.push(d);
    return true;
  }
}
