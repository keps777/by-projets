import {
  agence,
  creerHorlogeManuelle,
  type ClientHttp,
  type HorlogeManuelle,
} from "@afrimove/api-client";
import type { agence as contrats } from "@afrimove/contrats";
import { randomUUID } from "node:crypto";
import { aammjjDouala } from "@afrimove/domain";
import { PIN_SUPERVISEUR } from "./config";
import { appeler, type Session } from "./api";
import { appareilDeGuichet, clientHttp, referentiel, type DepartCree } from "./journee";

export type ModePaiement = "cash" | "momo" | "orange_money";

export const TARIF = { classique: 8000, vip: 12000, bagage: 500 } as const;

export interface VenteDemandee {
  depart: DepartCree | string;
  siege: number;
  nom?: string | null;
  telephone?: string | null;
  piece?: string | null;
  mode?: ModePaiement;
  bagage?: boolean;
  /** Cash : montant donné par le client (défaut : le compte juste). */
  recu?: number;
  codeBillet?: string;
  sms?: boolean;
}

/** Un événement de l'agence tel qu'il part de l'appareil. */
export type Evt = Record<string, any>;

/** Coupures du pays, de la plus grande à la plus petite. */
const COUPURES = [10_000, 5_000, 2_000, 1_000, 500];

/** Un comptage de caisse qui donne `total` : le plus de grosses coupures possible, le reste en pièces. */
export function comptage(
  total: number,
  pieces = 0,
): {
  coupures: Array<{ valeur: number; nombre: number }>;
  pieces: number;
  total: number;
} {
  let reste = total - pieces;
  const coupures = COUPURES.map((valeur) => {
    const nombre = Math.floor(reste / valeur);
    reste -= nombre * valeur;
    return { valeur, nombre };
  });
  // Ce qui ne tient pas dans une coupure (moins de 500 F) est compté en pièces.
  return { coupures, pieces: pieces + reste, total };
}

export type BilletVendu = contrats.ResultatVente["billet"] & { accuse: contrats.Accuse };

/**
 * Un téléphone d'agent branché sur la vraie API : le vrai client HTTP de l'application, et l'appareil qui crée les
 * événements (UUID, heure de Douala, numéro de plage), comme dans l'application.
 */
export class Poste {
  readonly client: ClientHttp;
  readonly appareil: ReturnType<typeof appareilDeGuichet>;
  readonly horloge: HorlogeManuelle;
  private codes = 0;

  constructor(
    readonly session: Session,
    readonly rang: number,
    debut: number = Date.now(),
  ) {
    this.horloge = creerHorlogeManuelle(debut);
    this.client = clientHttp(session);
    this.appareil = appareilDeGuichet(session, rang, this.horloge);
  }

  /** Un code de billet à 4 chiffres, distinct pour ce poste (les codes d'un départ sont uniques). */
  prochainCode(): string {
    this.codes += 1;
    return String(1000 + ((this.rang * 211 + this.codes * 7) % 9000)).padStart(4, "0");
  }

  async vendre(v: VenteDemandee): Promise<BilletVendu> {
    const departId = typeof v.depart === "string" ? v.depart : v.depart.id;
    const bagage = v.bagage ? TARIF.bagage : 0;
    const du = TARIF.classique + bagage;
    const mode = v.mode ?? "cash";
    const recu = mode === "cash" ? (v.recu ?? du) : du;
    const evenement = this.appareil.creerEvenement(agence.ECRITURES.billetVendu.evenement, {
      billetId: this.appareil.nouvelId(),
      departId,
      siege: v.siege,
      classe: "classique",
      prix: TARIF.classique,
      bagage,
      passager: {
        nom: v.nom === undefined ? `Voyageur ${v.siege}` : v.nom,
        telephone: v.telephone ?? null,
        pieceQuatreDerniers: v.piece ?? null,
      },
      paiement: {
        mode,
        recu,
        rendu: mode === "cash" ? recu - du : 0,
        reference: mode === "orange_money" ? `OM-${v.siege}-${randomUUID().slice(0, 6)}` : null,
      },
      codeBillet: v.codeBillet ?? this.prochainCode(),
      sms: v.sms ?? false,
    } as never);
    const r = await this.client.executer(agence.ECRITURES.billetVendu.operation, evenement);
    return { ...r.billet, accuse: r.accuse };
  }

  async scannerQr(departId: string, qr: string) {
    const evenement = this.appareil.creerEvenement(agence.ECRITURES.quaiScanne.evenement, {
      departId,
      qr,
    });
    return {
      evenement,
      reponse: await this.client.executer(agence.ECRITURES.quaiScanne.operation, evenement),
    };
  }

  async saisirCode(departId: string, codeBillet: string) {
    const evenement = this.appareil.creerEvenement(agence.ECRITURES.quaiCodeSaisi.evenement, {
      departId,
      codeBillet,
    });
    return {
      evenement,
      reponse: await this.client.executer(agence.ECRITURES.quaiCodeSaisi.operation, evenement),
    };
  }

  /** Avance l'horloge de l'appareil jusqu'à l'instant `ms` (jamais en arrière). */
  async aHeure(ms: number): Promise<void> {
    const delta = ms - this.horloge.maintenant();
    if (delta > 0) await this.horloge.avancer(delta);
  }

  /** Numéro de la session de caisse du jour de l'appareil : K-GARE-AAMMJJ-GUICHET-N. */
  numeroSession(n = 1): string {
    return `K-DLA-${aammjjDouala(this.horloge.maintenant())}-${this.rang}-${n}`;
  }

  async ouvrirCaisse(
    fondDeCaisse: number,
    sessionId = this.appareil.nouvelId(),
  ): Promise<{ sessionId: string; numero: string }> {
    const numero = this.numeroSession();
    const evenement = this.appareil.creerEvenement(agence.ECRITURES.caisseOuverte.evenement, {
      sessionId,
      numero,
      guichetId: referentiel().guichets[this.rang]!,
      fondDeCaisse,
    });
    await this.client.executer(agence.ECRITURES.caisseOuverte.operation, evenement);
    return { sessionId, numero };
  }

  /** Compte la caisse (coupures puis pièces) et la clôture avec l'attendu calculé par l'appareil. */
  async fermerCaisse(sessionId: string, compte: number, attendu: number, pieces = 0) {
    const c = comptage(compte, pieces);
    await this.client.executer(
      agence.ECRITURES.caisseComptee.operation,
      this.appareil.creerEvenement(agence.ECRITURES.caisseComptee.evenement, {
        sessionId,
        coupures: c.coupures,
        pieces: c.pieces,
        total: c.total,
      }),
    );
    return this.client.executer(
      agence.ECRITURES.caisseCloturee.operation,
      this.appareil.creerEvenement(agence.ECRITURES.caisseCloturee.evenement, {
        sessionId,
        cashCompte: compte,
        cashAttendu: attendu,
        ecart: compte - attendu,
        auto: false,
      }),
    );
  }

  demandeAnnulation(billetId: string, motif: string): { demandeId: string; evenement: Evt } {
    const demandeId = this.appareil.nouvelId();
    const evenement = this.appareil.creerEvenement(agence.ECRITURES.annulationDemandee.evenement, {
      demandeId,
      billetId,
      motif,
    }) as Evt;
    return { demandeId, evenement };
  }

  /**
   * Superviseur : l'événement de validation, prêt à signer. `validePar` n'a pas encore sa signature : elle vient du
   * serveur, une fois le PIN mis (`signerParPin`).
   */
  evenementValide(
    definition: { type: string; cible: (d: any) => unknown },
    donnees: Record<string, unknown>,
  ): Evt {
    return this.appareil.creerEvenement(
      definition as never,
      {
        ...donnees,
        validePar: { superviseurId: this.session.id, methode: "pin" },
      } as never,
    ) as Evt;
  }

  /** « Je mets mon PIN » : le serveur rend la preuve, qui ne vaut que pour cet événement. */
  async signerParPin(evenement: Evt, pin = PIN_SUPERVISEUR): Promise<Evt> {
    const r = await appeler<{ signature: string }>("POST", "/agence/superviseur/pin", {
      jeton: this.session.jeton,
      corps: { pin, evenement },
    });
    if (r.statut !== 200) {
      throw new Error(`Preuve du PIN refusée : ${r.statut} ${JSON.stringify(r.corps)}`);
    }
    return {
      ...evenement,
      donnees: {
        ...evenement["donnees"],
        validePar: { ...evenement["donnees"].validePar, signature: r.corps.signature },
      },
    };
  }
}
