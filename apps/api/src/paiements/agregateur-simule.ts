import { Logger } from "@nestjs/common";
import {
  AgregateurPaiement,
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  lireCorpsNotifications,
  signerNotification,
  verifierSignature,
  type DemandeEncaissement,
  type DemandeRemboursementAgregateur,
  type EtatTransaction,
  type NotificationAgregateur,
  type RequeteNotification,
  type ReponseEncaissement,
  type ReponseRemboursement,
  type StatutTransaction,
} from "./agregateur";
import type { OperateurMobile } from "./modeles";

/** Ce que le simulateur fait au prochain appel d'encaissement. */
export type ScenarioEncaissement =
  /** L'agrégateur accepte ; `etat` remplace l'issue par défaut du simulateur. */
  | { type: "ok"; etat?: EtatTransaction }
  | { type: "refuse"; code?: string }
  | { type: "temporaire"; code?: string }
  /** L'agrégateur accepte (le client reçoit la demande), mais la réponse se perd. */
  | { type: "reponse_perdue" };

export type ScenarioRemboursement =
  | { type: "ok"; etat?: EtatTransaction }
  | { type: "refuse"; code?: string }
  | { type: "temporaire"; code?: string };

export interface OptionsAgregateurSimule {
  nom?: string;
  secretWebhook?: string;
  /** Issue d'un encaissement sans scénario : en attente de confirmation (défaut), réussi ou échoué. */
  issue?: EtatTransaction;
  maintenant?: () => Date;
  /** Attente simulée : en test, avance l'horloge fixe au lieu de dormir. */
  dormir?: (ms: number) => Promise<void> | void;
}

export interface TransactionSimulee {
  reference: string;
  idFournisseur: string;
  demande: DemandeEncaissement;
  etat: EtatTransaction;
  referenceOperateur: string | null;
  operateur: OperateurMobile | null;
  code: string | null;
  at: Date;
}

export interface RemboursementSimule {
  reference: string;
  idFournisseur: string;
  demande: DemandeRemboursementAgregateur;
  etat: EtatTransaction;
  referenceOperateur: string | null;
  at: Date;
}

const TAUX_MILLIEMES: Readonly<Record<string, number>> = {
  CAD: 440_000,
  EUR: 655_957,
  USD: 600_000,
};

/**
 * Agrégateur simulé, programmable : sert au développement (aucun argent ne bouge) et aux tests
 * (refus, pannes, réponse perdue, notifications signées). Respecte l'idempotence du port : une même
 * référence rend toujours la même transaction et n'est comptée qu'une fois.
 */
export class AgregateurSimule extends AgregateurPaiement {
  readonly nom: string;
  readonly reel = false;
  /** Transactions acceptées, par référence. */
  readonly transactions = new Map<string, TransactionSimulee>();
  readonly remboursements = new Map<string, RemboursementSimule>();
  /** Nombre d'appels à `initier` / `rembourser`, réussis ou non. */
  appelsEncaissement = 0;
  appelsRemboursement = 0;
  latenceMs = 0;

  private readonly logger = new Logger("AgregateurSimule");
  private readonly secret: string;
  private readonly issue: EtatTransaction;
  private readonly maintenant: () => Date;
  private readonly dormir: (ms: number) => Promise<void> | void;
  private readonly scenarios: ScenarioEncaissement[] = [];
  private readonly scenariosRemboursement: ScenarioRemboursement[] = [];
  private panne: { code: string; definitive: boolean } | null = null;
  private compteur = 0;

  constructor(options: OptionsAgregateurSimule = {}) {
    super();
    this.nom = options.nom ?? "simule";
    this.secret = options.secretWebhook ?? "secret-simule-pour-les-tests-uniquement";
    this.issue = options.issue ?? "en_attente";
    this.maintenant = options.maintenant ?? (() => new Date());
    this.dormir = options.dormir ?? (() => undefined);
  }

  programmer(...scenarios: ScenarioEncaissement[]): this {
    this.scenarios.push(...scenarios);
    return this;
  }

  programmerRemboursement(...scenarios: ScenarioRemboursement[]): this {
    this.scenariosRemboursement.push(...scenarios);
    return this;
  }

  /** Tous les appels échouent (temporairement par défaut) jusqu'à `retablir`. */
  mettreEnPanne(code = "agregateur_indisponible", definitive = false): this {
    this.panne = { code, definitive };
    return this;
  }

  retablir(): this {
    this.panne = null;
    return this;
  }

  private verifierPanne(): void {
    if (!this.panne) return;
    if (this.panne.definitive) throw new ErreurAgregateurDefinitive(this.panne.code);
    throw new ErreurAgregateurTemporaire(this.panne.code);
  }

  async initier(demande: DemandeEncaissement): Promise<ReponseEncaissement> {
    this.appelsEncaissement += 1;
    if (this.latenceMs > 0) await this.dormir(this.latenceMs);
    const scenario = this.scenarios.shift();
    if (scenario?.type === "temporaire") {
      throw new ErreurAgregateurTemporaire(scenario.code ?? "agregateur_indisponible");
    }
    if (scenario?.type === "refuse") {
      throw new ErreurAgregateurDefinitive(scenario.code ?? "refuse");
    }
    if (!scenario) this.verifierPanne();

    let transaction = this.transactions.get(demande.reference);
    if (!transaction) {
      const etat = scenario?.type === "ok" && scenario.etat ? scenario.etat : this.issue;
      const operateur: OperateurMobile | null =
        demande.moyen === "mtn_momo" ? "mtn" : demande.moyen === "orange_money" ? "orange" : null;
      const numero = ++this.compteur;
      transaction = {
        reference: demande.reference,
        idFournisseur: `${this.nom}-enc-${numero}`,
        demande,
        etat,
        referenceOperateur:
          etat === "reussi"
            ? `${operateur === "orange" ? "OM" : operateur === "mtn" ? "MP" : "CB"}${String(numero).padStart(8, "0")}`
            : null,
        operateur,
        code: etat === "echoue" ? "refuse" : null,
        at: this.maintenant(),
      };
      this.transactions.set(demande.reference, transaction);
      this.logger.log(`Encaissement simulé ${transaction.idFournisseur} (${demande.moyen})`);
    }
    if (scenario?.type === "reponse_perdue") {
      throw new ErreurAgregateurTemporaire("delai_depasse", "réponse perdue");
    }
    return {
      idFournisseur: transaction.idFournisseur,
      etat: transaction.etat,
      urlAuthentification:
        demande.moyen === "carte"
          ? `https://3ds.simule.invalid/${transaction.idFournisseur}`
          : null,
      referenceOperateur: transaction.referenceOperateur,
      operateur: transaction.operateur,
      code: transaction.code,
    };
  }

  async consulter(reference: string): Promise<StatutTransaction | null> {
    this.verifierPanne();
    const t = this.transactions.get(reference);
    if (!t) return null;
    return {
      idFournisseur: t.idFournisseur,
      etat: t.etat,
      montantFcfa: t.demande.montantFcfa,
      referenceOperateur: t.referenceOperateur,
      operateur: t.operateur,
      code: t.code,
      at: t.at,
    };
  }

  async rembourser(demande: DemandeRemboursementAgregateur): Promise<ReponseRemboursement> {
    this.appelsRemboursement += 1;
    const scenario = this.scenariosRemboursement.shift();
    if (scenario?.type === "temporaire") {
      throw new ErreurAgregateurTemporaire(scenario.code ?? "agregateur_indisponible");
    }
    if (scenario?.type === "refuse") {
      throw new ErreurAgregateurDefinitive(scenario.code ?? "refuse");
    }
    if (!scenario) this.verifierPanne();
    let r = this.remboursements.get(demande.reference);
    if (!r) {
      const etat = scenario?.type === "ok" && scenario.etat ? scenario.etat : "reussi";
      const numero = ++this.compteur;
      r = {
        reference: demande.reference,
        idFournisseur: `${this.nom}-remb-${numero}`,
        demande,
        etat,
        referenceOperateur: etat === "reussi" ? `RB${String(numero).padStart(8, "0")}` : null,
        at: this.maintenant(),
      };
      this.remboursements.set(demande.reference, r);
    }
    return {
      idFournisseur: r.idFournisseur,
      etat: r.etat,
      referenceOperateur: r.referenceOperateur,
      code: r.etat === "echoue" ? "refuse" : null,
    };
  }

  async tauxMillieme(devise: string): Promise<number | null> {
    return TAUX_MILLIEMES[devise] ?? null;
  }

  lireNotifications(requete: RequeteNotification): NotificationAgregateur[] {
    return lireCorpsNotifications(verifierSignature(this.secret, requete));
  }

  /** Test : l'opérateur a répondu. Change l'état vu par `consulter` (la notification se fabrique à part). */
  terminer(
    reference: string,
    etat: "reussi" | "echoue",
    options: { referenceOperateur?: string; code?: string } = {},
  ): TransactionSimulee {
    const t = this.transactions.get(reference);
    if (!t) throw new Error(`Transaction simulée inconnue : ${reference}`);
    t.etat = etat;
    t.at = this.maintenant();
    if (etat === "reussi") {
      t.referenceOperateur =
        options.referenceOperateur ??
        t.referenceOperateur ??
        `${t.operateur === "orange" ? "OM" : t.operateur === "mtn" ? "MP" : "CB"}${String(++this.compteur).padStart(8, "0")}`;
      t.code = null;
    } else {
      t.code = options.code ?? "refuse";
    }
    return t;
  }

  /** Fabrique l'appel (signé) que ferait l'agrégateur pour annoncer ces événements. */
  fabriquerNotification(
    evenements: ReadonlyArray<{
      id: string;
      type?: "encaissement" | "remboursement";
      transaction: string;
      reference?: string;
      etat: "reussi" | "echoue";
      montant?: number;
      referenceOperateur?: string;
      operateur?: OperateurMobile;
      code?: string;
      at?: Date;
    }>,
    options: { horodatage?: Date; secret?: string } = {},
  ): Pick<RequeteNotification, "entetes" | "corpsBrut"> {
    const corpsBrut = JSON.stringify({
      evenements: evenements.map((e) => ({
        id: e.id,
        type: e.type ?? "encaissement",
        transaction: e.transaction,
        ...(e.reference ? { reference: e.reference } : {}),
        etat: e.etat,
        ...(e.montant !== undefined ? { montant: e.montant } : {}),
        ...(e.referenceOperateur ? { referenceOperateur: e.referenceOperateur } : {}),
        ...(e.operateur ? { operateur: e.operateur } : {}),
        ...(e.code ? { code: e.code } : {}),
        at: (e.at ?? this.maintenant()).toISOString(),
      })),
    });
    const horodatage = Math.floor((options.horodatage ?? this.maintenant()).getTime() / 1000);
    return {
      corpsBrut,
      entetes: {
        [ENTETE_HORODATAGE]: String(horodatage),
        [ENTETE_SIGNATURE]: signerNotification(
          options.secret ?? this.secret,
          horodatage,
          corpsBrut,
        ),
        "content-type": "application/json",
      },
    };
  }

  /**
   * Test : termine la transaction (comme le ferait l'opérateur) et fabrique la notification de
   * réussite correspondante, montant compris.
   */
  notificationDeReussite(
    reference: string,
    options: { evenementId?: string; montant?: number } = {},
  ): Pick<RequeteNotification, "entetes" | "corpsBrut"> {
    const t = this.terminer(reference, "reussi");
    return this.fabriquerNotification([
      {
        id: options.evenementId ?? `evt-${t.idFournisseur}-reussi`,
        transaction: t.idFournisseur,
        reference,
        etat: "reussi",
        montant: options.montant ?? t.demande.montantFcfa,
        ...(t.referenceOperateur ? { referenceOperateur: t.referenceOperateur } : {}),
        ...(t.operateur ? { operateur: t.operateur } : {}),
        at: t.at,
      },
    ]);
  }
}
