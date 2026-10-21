import { Injectable } from "@nestjs/common";
import type {
  AnnulationComptable,
  Cloture,
  ColisSansDepot,
  DecisionRapprochement,
  EnvoiCabinet,
  FichierGenere,
  IdExport,
  LigneReleve,
  PaiementExpire,
  ParametresComptables,
  SessionComptable,
  VenteComptable,
  VenteProche,
} from "./modele";
import {
  ActionRefusee,
  ActionsRapprochement,
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FaitsRapprochement,
  FichiersApercus,
  MessagerieCabinet,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
  type MessageCabinet,
  type ResultatAction,
  type ResultatDecision,
  type Volatil,
} from "./ports";
import { enMs, moisDe } from "./temps";

/**
 * Adaptateurs en mémoire des ports : tests et développement. Ils perdent tout au redémarrage
 * (`durable = false`) : `VerificationPortsComptable` refuse donc de démarrer en production tant qu'un
 * port en est encore là.
 */

const dans = (instant: string, du: string, avant: string): boolean =>
  enMs(instant) >= enMs(du) && enMs(instant) < enMs(avant);

/* ------------------------------------------------------------------ lectures */

@Injectable()
export class VentesMemoire extends VentesComptables implements Volatil {
  readonly durable = false as const;
  readonly parCompagnie = new Map<string, VenteComptable[]>();

  /** Test : ajoute des ventes à une compagnie. */
  ajouter(compagnieId: string, ...ventes: VenteComptable[]): void {
    this.parCompagnie.set(compagnieId, [...(this.parCompagnie.get(compagnieId) ?? []), ...ventes]);
  }

  async ventes(compagnieId: string, du: string, avant: string): Promise<VenteComptable[]> {
    return (this.parCompagnie.get(compagnieId) ?? [])
      .filter((v) => dans(v.at, du, avant))
      .map((v) => ({ ...v }));
  }

  async referencesConnues(
    compagnieId: string,
    references: readonly string[],
  ): Promise<Set<string>> {
    const voulues = new Set(references);
    const trouvees = new Set<string>();
    for (const v of this.parCompagnie.get(compagnieId) ?? []) {
      if (v.referenceOperateur !== null && voulues.has(v.referenceOperateur)) {
        trouvees.add(v.referenceOperateur);
      }
    }
    return trouvees;
  }

  async moisAvecActivite(compagnieId: string): Promise<string[]> {
    const mois = new Set((this.parCompagnie.get(compagnieId) ?? []).map((v) => moisDe(v.at)));
    return [...mois].sort().reverse();
  }
}

@Injectable()
export class SessionsMemoire extends SessionsComptables implements Volatil {
  readonly durable = false as const;
  readonly parCompagnie = new Map<string, SessionComptable[]>();

  ajouter(compagnieId: string, ...sessions: SessionComptable[]): void {
    this.parCompagnie.set(compagnieId, [
      ...(this.parCompagnie.get(compagnieId) ?? []),
      ...sessions,
    ]);
  }

  async sessions(compagnieId: string, du: string, avant: string): Promise<SessionComptable[]> {
    return (this.parCompagnie.get(compagnieId) ?? []).filter((s) => dans(s.ouverteA, du, avant));
  }
}

@Injectable()
export class AnnulationsMemoire extends AnnulationsComptables implements Volatil {
  readonly durable = false as const;
  readonly parCompagnie = new Map<string, AnnulationComptable[]>();

  ajouter(compagnieId: string, ...annulations: AnnulationComptable[]): void {
    this.parCompagnie.set(compagnieId, [
      ...(this.parCompagnie.get(compagnieId) ?? []),
      ...annulations,
    ]);
  }

  async decidees(compagnieId: string, du: string, avant: string): Promise<AnnulationComptable[]> {
    return (this.parCompagnie.get(compagnieId) ?? []).filter((a) => dans(a.at, du, avant));
  }
}

@Injectable()
export class RelevesMemoire extends RelevesOperateur implements Volatil {
  readonly durable = false as const;
  readonly parCompagnie = new Map<string, LigneReleve[]>();

  ajouter(compagnieId: string, ...lignes: LigneReleve[]): void {
    this.parCompagnie.set(compagnieId, [...(this.parCompagnie.get(compagnieId) ?? []), ...lignes]);
  }

  async lignes(compagnieId: string, du: string, avant: string): Promise<LigneReleve[]> {
    return (this.parCompagnie.get(compagnieId) ?? [])
      .filter((l) => dans(l.recueA, du, avant))
      .sort((a, b) => enMs(a.recueA) - enMs(b.recueA) || a.reference.localeCompare(b.reference))
      .map((l) => ({ ...l }));
  }
}

/** Les faits que les tests posent à la main, par numéro de téléphone. */
@Injectable()
export class FaitsMemoire extends FaitsRapprochement implements Volatil {
  readonly durable = false as const;
  readonly ventes = new Map<string, VenteProche[]>();
  readonly expires = new Map<string, PaiementExpire[]>();
  readonly colis = new Map<string, ColisSansDepot[]>();
  readonly connus = new Set<string>();

  async ventesAutour(
    _compagnieId: string,
    telephone: string,
    autour: string,
    fenetreMinutes: number,
  ): Promise<VenteProche[]> {
    return (this.ventes.get(telephone) ?? []).filter(
      (v) => Math.abs(enMs(v.at) - enMs(autour)) <= fenetreMinutes * 60_000,
    );
  }

  async paiementsExpires(
    _compagnieId: string,
    telephone: string,
    avant: string,
    depuisMinutes: number,
  ): Promise<PaiementExpire[]> {
    return (this.expires.get(telephone) ?? []).filter(
      (p) =>
        enMs(p.expireA) <= enMs(avant) && enMs(avant) - enMs(p.expireA) <= depuisMinutes * 60_000,
    );
  }

  async colisSansDepot(
    _compagnieId: string,
    telephone: string,
    montant: number,
  ): Promise<ColisSansDepot[]> {
    return (this.colis.get(telephone) ?? []).filter((c) => c.montant === montant);
  }

  async numeroConnu(_compagnieId: string, telephone: string): Promise<boolean> {
    return this.connus.has(telephone);
  }
}

@Injectable()
export class FacturesPayeesMemoire extends FacturesPayees implements Volatil {
  readonly durable = false as const;
  /** compagnie -> dimanche -> jour du paiement */
  readonly payees_ = new Map<string, Map<string, string>>();

  /** Test : la facture de la semaine qui finit ce dimanche est payée ce jour-là. */
  payer(compagnieId: string, dimanche: string, jour: string): void {
    const m = this.payees_.get(compagnieId) ?? new Map<string, string>();
    m.set(dimanche, jour);
    this.payees_.set(compagnieId, m);
  }

  async payees(compagnieId: string, dimanches: readonly string[]): Promise<Map<string, string>> {
    const m = this.payees_.get(compagnieId) ?? new Map<string, string>();
    return new Map(
      dimanches.flatMap((d) => (m.has(d) ? [[d, m.get(d)!] as [string, string]] : [])),
    );
  }
}

/* ------------------------------------------------------------------ écritures */

@Injectable()
export class ParametresMemoire extends ParametresRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ParametresComptables>();

  definir(parametres: ParametresComptables): void {
    this.lignes.set(parametres.compagnieId, parametres);
  }

  async lire(compagnieId: string): Promise<ParametresComptables | null> {
    return this.lignes.get(compagnieId) ?? null;
  }

  async toutes(): Promise<ParametresComptables[]> {
    return [...this.lignes.values()];
  }
}

@Injectable()
export class ClotureMemoire extends Clotures implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, Cloture>();

  private cle(compagnieId: string, mois: string): string {
    return `${compagnieId}|${mois}`;
  }

  async trouver(compagnieId: string, mois: string): Promise<Cloture | null> {
    return this.lignes.get(this.cle(compagnieId, mois)) ?? null;
  }

  async existe(compagnieId: string, mois: string): Promise<boolean> {
    return this.lignes.has(this.cle(compagnieId, mois));
  }

  async mois(compagnieId: string): Promise<string[]> {
    return [...this.lignes.values()]
      .filter((c) => c.compagnieId === compagnieId)
      .map((c) => c.mois)
      .sort()
      .reverse();
  }

  async verrouiller(cloture: Cloture): Promise<boolean> {
    const cle = this.cle(cloture.compagnieId, cloture.mois);
    if (this.lignes.has(cle)) return false;
    this.lignes.set(cle, cloture);
    return true;
  }

  async marquerRecu(compagnieId: string, mois: string, recuA: string): Promise<void> {
    const c = this.lignes.get(this.cle(compagnieId, mois));
    if (c && c.envoiRecuA === null)
      this.lignes.set(this.cle(compagnieId, mois), { ...c, envoiRecuA: recuA });
  }

  async envoisEnAttente(limite: number): Promise<Cloture[]> {
    return [...this.lignes.values()]
      .filter((c) => c.envoiDemande && c.envoiRecuA === null)
      .sort((a, b) => enMs(a.clotureA) - enMs(b.clotureA))
      .slice(0, limite);
  }
}

@Injectable()
export class DecisionsMemoire extends DecisionsRapprochement implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, DecisionRapprochement>();

  /** Les clôtures : le mois verrouillé refuse l'écriture dans la même « transaction » (le même tour). */
  constructor(private readonly clotures: Clotures) {
    super();
  }

  private cle(compagnieId: string, mois: string, reference: string): string {
    return `${compagnieId}|${mois}|${reference}`;
  }

  async lister(compagnieId: string, mois: string): Promise<DecisionRapprochement[]> {
    return [...this.lignes.values()]
      .filter((d) => d.compagnieId === compagnieId && d.mois === mois)
      .sort((a, b) => enMs(a.decideA) - enMs(b.decideA) || a.reference.localeCompare(b.reference));
  }

  async trouver(
    compagnieId: string,
    mois: string,
    reference: string,
  ): Promise<DecisionRapprochement | null> {
    return this.lignes.get(this.cle(compagnieId, mois, reference)) ?? null;
  }

  async enregistrer(decision: DecisionRapprochement): Promise<ResultatDecision> {
    if (await this.clotures.trouver(decision.compagnieId, decision.mois)) {
      return { resultat: "mois_verrouille" };
    }
    const cle = this.cle(decision.compagnieId, decision.mois, decision.reference);
    const existante = this.lignes.get(cle);
    if (existante) return { resultat: "existe", existante };
    this.lignes.set(cle, decision);
    return { resultat: "ok" };
  }

  async confirmer(
    compagnieId: string,
    mois: string,
    reference: string,
    referenceExecution: string,
  ): Promise<void> {
    const cle = this.cle(compagnieId, mois, reference);
    const d = this.lignes.get(cle);
    // Seule transition permise, comme en base : en attente vers faite. Déjà faite, rien ne change.
    if (d && d.execution === "en_attente") {
      this.lignes.set(cle, { ...d, execution: "faite", referenceExecution });
    }
  }

  async retirer(compagnieId: string, mois: string, reference: string): Promise<void> {
    const cle = this.cle(compagnieId, mois, reference);
    // Une décision exécutée ne se retire pas : l'argent est parti.
    if (this.lignes.get(cle)?.execution === "en_attente") this.lignes.delete(cle);
  }

  async enAttente(limite: number): Promise<DecisionRapprochement[]> {
    return [...this.lignes.values()]
      .filter((d) => d.execution === "en_attente")
      .sort((a, b) => enMs(a.decideA) - enMs(b.decideA))
      .slice(0, limite);
  }
}

@Injectable()
export class FichiersApercusMemoire extends FichiersApercus implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, FichierGenere>();

  async memoriser(compagnieId: string, mois: string, fichier: FichierGenere): Promise<void> {
    this.lignes.set(`${compagnieId}|${mois}|${fichier.id}`, fichier);
  }

  async dernier(compagnieId: string, mois: string, id: IdExport): Promise<FichierGenere | null> {
    return this.lignes.get(`${compagnieId}|${mois}|${id}`) ?? null;
  }
}

@Injectable()
export class EnvoisMemoire extends EnvoisCabinet implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, EnvoiCabinet>();

  async enregistrer(envoi: EnvoiCabinet): Promise<boolean> {
    if (this.lignes.has(envoi.cle)) return false;
    this.lignes.set(envoi.cle, envoi);
    return true;
  }

  async trouver(cle: string): Promise<EnvoiCabinet | null> {
    return this.lignes.get(cle) ?? null;
  }

  async derniers(compagnieId: string, limite: number): Promise<EnvoiCabinet[]> {
    return [...this.lignes.values()]
      .filter((e) => e.compagnieId === compagnieId)
      .sort((a, b) => enMs(b.envoyeA) - enMs(a.envoyeA))
      .slice(0, limite);
  }

  async marquerRecu(cle: string, recuA: string): Promise<void> {
    const e = this.lignes.get(cle);
    if (e && e.recuA === null) this.lignes.set(cle, { ...e, recuA });
  }
}

/* ------------------------------------------------------------------ effets */

export interface AppelAction {
  type: "rembourser" | "rattacher" | "reclamer";
  cle: string;
  reference: string;
}

/**
 * Remboursement, rattachement et réclamation simulés. Idempotent par clé comme les vrais : rejouer une clé
 * rend la même référence sans recompter. `refuser` et `panne` simulent un refus définitif ou un résultat inconnu.
 */
@Injectable()
export class ActionsMemoire extends ActionsRapprochement implements Volatil {
  readonly durable = false as const;
  readonly appels: AppelAction[] = [];
  private readonly faites = new Map<string, ResultatAction>();
  /** Références pour lesquelles l'opérateur refuse pour de bon. */
  readonly refusees = new Set<string>();
  /** Tant que vrai, toute action échoue avec un résultat inconnu (réseau). */
  panne = false;

  private jouer(type: AppelAction["type"], cle: string, reference: string): ResultatAction {
    if (this.panne) throw new Error("Réseau indisponible");
    if (this.refusees.has(reference)) throw new ActionRefusee("Refusé par l'opérateur");
    const deja = this.faites.get(cle);
    if (deja) return deja;
    this.appels.push({ type, cle, reference });
    const resultat = { reference: `${type.toUpperCase()}-${this.faites.size + 1}` };
    this.faites.set(cle, resultat);
    return resultat;
  }

  async rembourser(d: { cle: string; reference: string }): Promise<ResultatAction> {
    return this.jouer("rembourser", d.cle, d.reference);
  }

  async rattacher(d: { cle: string; reference: string }): Promise<ResultatAction> {
    return this.jouer("rattacher", d.cle, d.reference);
  }

  async reclamer(d: { cle: string; reference: string }): Promise<ResultatAction> {
    return this.jouer("reclamer", d.cle, d.reference);
  }
}

/** Messagerie simulée : garde les messages envoyés. */
@Injectable()
export class MessagerieMemoire extends MessagerieCabinet implements Volatil {
  readonly durable = false as const;
  readonly envoyes: MessageCabinet[] = [];
  /** Instant de l'accusé de réception rendu, `null` : pas encore reçu. */
  accuse: string | null = null;
  panne = false;

  async envoyer(message: MessageCabinet): Promise<{ recuA: string | null }> {
    if (this.panne) throw new Error("Messagerie indisponible");
    if (!this.envoyes.some((m) => m.cle === message.cle)) this.envoyes.push(message);
    return { recuA: this.accuse };
  }
}
