import { Injectable } from "@nestjs/common";
import type {
  BilletCorrespondanceStocke,
  BilletEmis,
  ColisInterAgencesStocke,
  CompagnieRef,
  ContestationStockee,
  ConventionStockee,
  DepartInterAgences,
  InvitationStockee,
  ReglementStocke,
  StatutContestation,
} from "./modele";
import {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  BilletsEmis,
  ColisInterAgences,
  CompteursReferences,
  Contestations,
  ConventionsRepository,
  DepartsInterAgences,
  InvitationsCompagnies,
  ReglementRefuse,
  Reglements,
  ReglementsMobile,
  type DemandeReglement,
  type FiltreEchanges,
  type ResultatAjoutConvention,
  type Volatil,
} from "./ports";
import { enMs } from "./temps";

/**
 * Adaptateurs en mémoire des ports : tests et développement. Chaque lecture renvoie une copie (le
 * code appelant ne peut pas modifier l'état par accident, comme avec une vraie base) ; les écritures
 * conditionnelles reproduisent les contraintes décrites dans le README (version, unicité, état attendu).
 */

const copie = <T>(valeur: T): T => structuredClone(valeur);

/** Comparaison d'octets, comme l'ordre d'un identifiant ou d'une clé en base. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const paire = (a: string, b: string): string => [a, b].sort().join("|");
const OUVERTES = new Set(["proposee", "active", "suspendue"]);

@Injectable()
export class ConventionsMemoire extends ConventionsRepository implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ConventionStockee>();

  async ajouter(convention: ConventionStockee): Promise<ResultatAjoutConvention> {
    if (this.lignes.has(convention.id)) return "paire_deja_ouverte";
    const cle = paire(convention.compagnieA, convention.compagnieB);
    for (const c of this.lignes.values()) {
      if (OUVERTES.has(c.statut) && paire(c.compagnieA, c.compagnieB) === cle) {
        return "paire_deja_ouverte";
      }
    }
    this.lignes.set(convention.id, copie({ ...convention, version: 1 }));
    return "ajoutee";
  }

  async trouver(id: string) {
    const c = this.lignes.get(id);
    return c ? copie(c) : null;
  }

  async lister(compagnieId: string) {
    return [...this.lignes.values()]
      .filter((c) => c.compagnieA === compagnieId || c.compagnieB === compagnieId)
      .sort((a, b) => enMs(b.proposeeLe) - enMs(a.proposeeLe) || cmp(a.id, b.id))
      .map(copie);
  }

  async entre(compagnieA: string, compagnieB: string) {
    const cle = paire(compagnieA, compagnieB);
    return [...this.lignes.values()]
      .filter((c) => paire(c.compagnieA, c.compagnieB) === cle)
      .sort((a, b) => enMs(a.proposeeLe) - enMs(b.proposeeLe) || cmp(a.id, b.id))
      .map(copie);
  }

  async toutes() {
    return [...this.lignes.values()]
      .sort((a, b) => enMs(a.proposeeLe) - enMs(b.proposeeLe) || cmp(a.id, b.id))
      .map(copie);
  }

  async remplacer(convention: ConventionStockee, versionAttendue: number) {
    const actuelle = this.lignes.get(convention.id);
    if (!actuelle || actuelle.version !== versionAttendue) return false;
    this.lignes.set(convention.id, copie({ ...convention, version: versionAttendue + 1 }));
    return true;
  }
}

function filtrerEchanges<T extends { conventionId: string; troncons: { compagnieId: string }[] }>(
  lignes: Iterable<T>,
  filtre: FiltreEchanges = {},
): T[] {
  return [...lignes].filter(
    (l) =>
      (filtre.conventionId === undefined || l.conventionId === filtre.conventionId) &&
      (filtre.compagnieId === undefined ||
        l.troncons.some((t) => t.compagnieId === filtre.compagnieId)),
  );
}

@Injectable()
export class ColisInterAgencesMemoire extends ColisInterAgences implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ColisInterAgencesStocke>();

  async ajouter(plan: ColisInterAgencesStocke) {
    if (this.lignes.has(plan.colisId)) return false;
    this.lignes.set(plan.colisId, copie({ ...plan, version: 1 }));
    return true;
  }

  async trouver(colisId: string) {
    const p = this.lignes.get(colisId);
    return p ? copie(p) : null;
  }

  async lister(filtre?: FiltreEchanges) {
    return filtrerEchanges(this.lignes.values(), filtre)
      .sort((a, b) => enMs(a.creeLe) - enMs(b.creeLe) || cmp(a.colisId, b.colisId))
      .map(copie);
  }

  async remplacer(plan: ColisInterAgencesStocke, versionAttendue: number) {
    const actuel = this.lignes.get(plan.colisId);
    if (!actuel || actuel.version !== versionAttendue) return false;
    this.lignes.set(plan.colisId, copie({ ...plan, version: versionAttendue + 1 }));
    return true;
  }
}

@Injectable()
export class BilletsCorrespondanceMemoire extends BilletsCorrespondance implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, BilletCorrespondanceStocke>();

  async ajouter(billet: BilletCorrespondanceStocke) {
    for (const b of this.lignes.values()) {
      if (b.id === billet.id || b.numero === billet.numero) return false;
    }
    this.lignes.set(billet.id, copie({ ...billet, version: 1 }));
    return true;
  }

  async trouver(id: string) {
    const b = this.lignes.get(id);
    return b ? copie(b) : null;
  }

  async trouverParNumero(numero: string) {
    const b = [...this.lignes.values()].find((x) => x.numero === numero);
    return b ? copie(b) : null;
  }

  async lister(filtre?: FiltreEchanges) {
    return filtrerEchanges(this.lignes.values(), filtre)
      .sort((a, b) => enMs(a.creeLe) - enMs(b.creeLe) || cmp(a.id, b.id))
      .map(copie);
  }

  async remplacer(billet: BilletCorrespondanceStocke, versionAttendue: number) {
    const actuel = this.lignes.get(billet.id);
    if (!actuel || actuel.version !== versionAttendue) return false;
    this.lignes.set(billet.id, copie({ ...billet, version: versionAttendue + 1 }));
    return true;
  }
}

@Injectable()
export class ReglementsMemoire extends Reglements implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ReglementStocke>();

  async ajouter(reglement: ReglementStocke) {
    if (this.lignes.has(reglement.cle)) return false;
    // Comme la base : une opération déjà réglée par un autre règlement ne se règle pas une seconde fois.
    const reglees = new Set([...this.lignes.values()].flatMap((r) => r.lignes.map((l) => l.cle)));
    const doublon = reglement.lignes.find((l) => reglees.has(l.cle));
    if (doublon) throw new Error(`Opération déjà réglée : ${doublon.cle}`);
    this.lignes.set(reglement.cle, copie(reglement));
    return true;
  }

  async trouver(cle: string) {
    const r = this.lignes.get(cle);
    return r ? copie(r) : null;
  }

  async lister(conventionId?: string) {
    return [...this.lignes.values()]
      .filter((r) => conventionId === undefined || r.conventionId === conventionId)
      .sort((a, b) => enMs(a.paiementLe) - enMs(b.paiementLe) || cmp(a.cle, b.cle))
      .map(copie);
  }

  async remplacer(reglement: ReglementStocke, etatAttendu: ReglementStocke["etat"]) {
    const actuel = this.lignes.get(reglement.cle);
    if (!actuel || actuel.etat !== etatAttendu) return false;
    this.lignes.set(reglement.cle, copie(reglement));
    return true;
  }
}

@Injectable()
export class ContestationsMemoire extends Contestations implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, ContestationStockee>();

  async ajouter(contestation: ContestationStockee) {
    if (this.lignes.has(contestation.reference)) return false;
    this.lignes.set(contestation.reference, copie(contestation));
    return true;
  }

  async trouver(reference: string) {
    const c = this.lignes.get(reference);
    return c ? copie(c) : null;
  }

  async lister(
    filtre: { conventionId?: string; compagnieId?: string; statut?: StatutContestation } = {},
  ) {
    return [...this.lignes.values()]
      .filter(
        (c) =>
          (filtre.conventionId === undefined || c.conventionIds.includes(filtre.conventionId)) &&
          (filtre.compagnieId === undefined || c.compagnieId === filtre.compagnieId) &&
          (filtre.statut === undefined || c.statut === filtre.statut),
      )
      .sort((a, b) => enMs(a.deposeeLe) - enMs(b.deposeeLe) || cmp(a.reference, b.reference))
      .map(copie);
  }

  async remplacer(contestation: ContestationStockee, statutAttendu: StatutContestation) {
    const actuelle = this.lignes.get(contestation.reference);
    if (!actuelle || actuelle.statut !== statutAttendu) return false;
    this.lignes.set(contestation.reference, copie(contestation));
    return true;
  }
}

@Injectable()
export class InvitationsMemoire extends InvitationsCompagnies implements Volatil {
  readonly durable = false as const;
  readonly lignes = new Map<string, InvitationStockee>();

  async parCle(cle: string) {
    const i = this.lignes.get(cle);
    return i ? copie(i) : null;
  }

  async ajouterOuExistante(invitation: InvitationStockee) {
    const existante = this.lignes.get(invitation.cle);
    if (existante) return { invitation: copie(existante), nouvelle: false };
    this.lignes.set(invitation.cle, copie(invitation));
    return { invitation: copie(invitation), nouvelle: true };
  }
}

@Injectable()
export class CompteursReferencesMemoire extends CompteursReferences implements Volatil {
  readonly durable = false as const;
  private readonly valeurs = new Map<string, number>();

  async prochain(prefixe: string) {
    const suivant = (this.valeurs.get(prefixe) ?? 0) + 1;
    this.valeurs.set(prefixe, suivant);
    return suivant;
  }
}

/** Annuaire des compagnies tenu à la main : `compagnies.set(id, { id, nom, momo })`. */
@Injectable()
export class AnnuaireCompagniesMemoire extends AnnuaireCompagnies implements Volatil {
  readonly durable = false as const;
  readonly compagnies = new Map<string, CompagnieRef>();

  async trouver(id: string) {
    const c = this.compagnies.get(id);
    return c ? copie(c) : null;
  }
}

@Injectable()
export class DepartsMemoire extends DepartsInterAgences implements Volatil {
  readonly durable = false as const;
  readonly departs = new Map<string, DepartInterAgences>();

  async trouver(id: string) {
    const d = this.departs.get(id);
    return d ? copie(d) : null;
  }

  async prochain(critere: {
    compagnieId: string;
    origine: string;
    destination: string;
    apres: string;
  }) {
    const suivants = [...this.departs.values()]
      .filter(
        (d) =>
          d.compagnieId === critere.compagnieId &&
          d.origine === critere.origine &&
          d.destination === critere.destination &&
          enMs(d.heureDepart) > enMs(critere.apres),
      )
      .sort((a, b) => enMs(a.heureDepart) - enMs(b.heureDepart));
    return suivants[0] ? copie(suivants[0]) : null;
  }
}

@Injectable()
export class BilletsEmisMemoire extends BilletsEmis implements Volatil {
  readonly durable = false as const;
  readonly billets = new Map<string, BilletEmis>();

  async trouver(reference: string) {
    const b =
      this.billets.get(reference) ?? [...this.billets.values()].find((x) => x.numero === reference);
    return b ? copie(b) : null;
  }
}

/** Opérateur simulé : garde les règlements demandés, idempotents par clé. `refuser` simule un refus définitif. */
@Injectable()
export class ReglementsMobileMemoire extends ReglementsMobile implements Volatil {
  readonly durable = false as const;
  readonly envoyes = new Map<string, DemandeReglement & { reference: string }>();
  /** Nombre d'appels, rejeux compris. */
  appels = 0;
  /** Si défini, le prochain appel échoue avec cette erreur. */
  echec: Error | null = null;

  async regler(demande: DemandeReglement) {
    this.appels += 1;
    if (this.echec) {
      const e = this.echec;
      this.echec = null;
      throw e;
    }
    const deja = this.envoyes.get(demande.cle);
    if (deja) return { reference: deja.reference };
    if (demande.montant <= 0) throw new ReglementRefuse("Montant nul");
    const reference = `MOMO-${String(this.envoyes.size + 1).padStart(6, "0")}`;
    this.envoyes.set(demande.cle, { ...copie(demande), reference });
    return { reference };
  }
}
