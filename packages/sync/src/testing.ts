import { versIsoDouala } from "@afrimove/domain";
import { agence as c } from "@afrimove/contrats";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type {
  ConflitServeur,
  EvenementFile,
  LotEvenements,
  Octroi,
  ReponseLot,
  VerificateurPin,
} from "./protocole";
import type { HorlogeSync } from "./reseau";
import { ErreurTransport } from "./transport";
import type { TransportSync } from "./transport";
import type { CleJwk } from "./signature";

/**
 * Aides de test, hors du bundle de l'application (non exportées par `index.ts`) : horloge pilotable,
 * IndexedDB factice et faux serveur avec pannes programmables. Utilisées aussi par les tests
 * d'intégration de l'API (`apps/api/src/sync`).
 */

export class HorlogeManuelle implements HorlogeSync {
  private minuteries: { echeance: number; fn: () => void; annulee: boolean }[] = [];

  constructor(private temps: number) {}

  maintenant(): number {
    return this.temps;
  }

  planifier(ms: number, fn: () => void): () => void {
    const m = { echeance: this.temps + ms, fn, annulee: false };
    this.minuteries.push(m);
    return () => {
      m.annulee = true;
    };
  }

  /** Avance le temps et déclenche, dans l'ordre, les minuteries échues. */
  avancer(ms: number): void {
    const but = this.temps + ms;
    for (;;) {
      const prochaine = this.minuteries
        .filter((m) => !m.annulee && m.echeance <= but)
        .sort((a, b) => a.echeance - b.echeance)[0];
      if (!prochaine) break;
      this.temps = Math.max(this.temps, prochaine.echeance);
      prochaine.annulee = true;
      prochaine.fn();
    }
    this.temps = but;
    this.minuteries = this.minuteries.filter((m) => !m.annulee);
  }

  minuteriesEnAttente(): number {
    return this.minuteries.filter((m) => !m.annulee).length;
  }
}

/** Une IndexedDB neuve et isolée (fake-indexeddb), à passer à `OptionsMoteur.dexie`. */
export function indexedDbFactice() {
  return { indexedDB: new IDBFactory(), IDBKeyRange };
}

export const HEURE = 3_600_000;
export const MINUTE = 60_000;
/** 5 janvier 2027, 05:30 à Douala. */
export const DEBUT_TEST = Date.parse("2027-01-05T05:30:00+01:00");

/* ------------------------------------------------------------------ données d'événements */

export const PAIEMENT_CASH = { mode: "cash" as const, recu: 5000, rendu: 1000, reference: null };

export function donneesVente(billetId: string, departId: string, siege: number | null) {
  return {
    billetId,
    departId,
    siege,
    classe: "classique" as const,
    prix: 4000,
    bagage: 0,
    passager: { nom: "Tchoumi Paul", telephone: null, pieceQuatreDerniers: null },
    paiement: PAIEMENT_CASH,
    codeBillet: "6204",
    sms: false,
  };
}

export function donneesCadence(billetId: string, departId: string, siege: number) {
  return {
    billetId,
    departId,
    siege,
    prix: 4000,
    paiement: PAIEMENT_CASH,
    codeBillet: "6204",
    telephone: null,
  };
}

export const VENTE = c.EVENEMENT_BILLET_VENDU;
export const CADENCE = c.EVENEMENT_BILLET_VENDU_CADENCE;

/* ------------------------------------------------------------------ faux serveur */

export interface OptionsServeurFactice {
  horloge: HorlogeSync;
}

/**
 * Un serveur minimal en mémoire, côté transport : dédoublonne par UUID, garde l'ordre d'arrivée et
 * accepte tout. Les pannes se programment : `horsService`, `panneApres` (le serveur traite encore N
 * événements, d'un ou plusieurs envois, puis la connexion tombe), `perdreReponse` (tout est traité mais la réponse se perd :
 * le cas d'une application tuée pendant l'envoi).
 */
export class ServeurFactice implements TransportSync {
  readonly journal: EvenementFile[] = [];
  readonly lots: LotEvenements[] = [];
  appels = 0;
  horsService = false;
  panneApres: number | null = null;
  perdreReponse = false;
  /** Au-delà de ce nombre d'événements par lot, le serveur répond 413 (corps trop gros). */
  tailleMax: number | null = null;
  naturePanne: "reseau" | "serveur" | "authentification" = "reseau";
  octroi: Octroi | null = null;
  conflits: ConflitServeur[] = [];
  parts: Record<string, number[]> = {};
  plage: { debut: number; fin: number } | null = null;
  verificateursPin: VerificateurPin[] = [];
  rejeter = new Map<string, string>();
  cles = new Map<string, CleJwk>();

  constructor(private readonly options: OptionsServeurFactice) {}

  private ids = new Set<string>();

  async enroler(appareilId: string, cle: CleJwk): Promise<void> {
    this.cles.set(appareilId, cle);
  }

  async envoyer(lot: LotEvenements): Promise<ReponseLot> {
    this.appels += 1;
    if (this.horsService) throw new ErreurTransport(this.naturePanne, "Serveur injoignable");
    if (this.tailleMax !== null && lot.evenements.length > this.tailleMax) {
      throw new ErreurTransport("refus", "Corps trop gros", 413);
    }
    this.lots.push(lot);
    const recuA = versIsoDouala(this.options.horloge.maintenant());
    const resultats: ReponseLot["resultats"] = [];
    for (const ligne of lot.evenements) {
      if (this.panneApres !== null) {
        if (this.panneApres <= 0) {
          this.panneApres = null;
          throw new ErreurTransport("reseau", "Connexion coupée en cours d'envoi");
        }
        this.panneApres -= 1;
      }
      const raison = this.rejeter.get(ligne.evenement.id);
      if (raison) {
        resultats.push({
          evenementId: ligne.evenement.id,
          statut: "rejete",
          recuA,
          code: raison,
          message: raison,
        });
      } else if (this.ids.has(ligne.evenement.id)) {
        resultats.push({ evenementId: ligne.evenement.id, statut: "deja_recu", recuA });
      } else {
        this.ids.add(ligne.evenement.id);
        this.journal.push(ligne.evenement);
        resultats.push({ evenementId: ligne.evenement.id, statut: "accepte", recuA });
      }
    }
    if (this.perdreReponse) {
      this.perdreReponse = false;
      throw new ErreurTransport("reseau", "Réponse perdue (application tuée pendant l'envoi)");
    }
    return {
      serveurA: recuA,
      resultats,
      appareil: {
        derniereSyncA: recuA,
        plage: this.plage,
        partsHorsLigne: this.parts,
        octroi: this.octroi,
        verificateursPin: this.verificateursPin,
      },
      conflits: this.conflits,
    };
  }
}
