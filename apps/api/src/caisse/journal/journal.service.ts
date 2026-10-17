import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PersonnesRepository } from "../../socle/comptes/personnes.repository";
import { CONFIG, type AppConfig } from "../../socle/config/config";
import { Horloge } from "../../socle/horloge";
import { jourDouala } from "../temps";
import {
  JournalAgenceRepository,
  type EntreeJournalStockee,
  type FiltreJournal,
  type ValidationJournal,
} from "./ports";

/** Auteur des écritures faites par le système (clôture automatique de minuit). */
export const AUTEUR_SYSTEME = { id: "systeme", nom: "Système" } as const;

/** JSON canonique : clés triées à tous les niveaux, `undefined` ignoré. */
export function canonique(valeur: unknown): string {
  return JSON.stringify(trier(valeur));
}

function trier(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(trier);
  if (valeur !== null && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const cle of Object.keys(valeur as Record<string, unknown>).sort()) {
      const v = (valeur as Record<string, unknown>)[cle];
      if (v !== undefined) sortie[cle] = trier(v);
    }
    return sortie;
  }
  return valeur;
}

/** Ce qui entre dans l'empreinte d'une entrée : tout sauf l'empreinte elle-même. */
type ContenuEntree = Omit<EntreeJournalStockee, "seq" | "chaine" | "empreinte" | "precedente">;

function contenuSigne(e: ContenuEntree) {
  return {
    evenementId: e.evenementId,
    type: e.type,
    at: e.at,
    auteur: e.auteur,
    appareilId: e.appareilId,
    cible: e.cible,
    numeroPlage: e.numeroPlage,
    resume: e.resume,
    validePar: e.validePar,
    gareId: e.gareId,
    compagnieId: e.compagnieId,
  };
}

export function calculerEmpreinte(
  cle: Buffer,
  e: ContenuEntree,
  precedente: string | null,
): string {
  return createHmac("sha256", cle)
    .update(`${precedente ?? ""}\n${canonique(contenuSigne(e))}`)
    .digest("hex");
}

export interface EcritureJournal {
  evenement: {
    id: string;
    type: string;
    at: string;
    appareilId: string | null;
    cible: { type: string; id: string };
    numeroPlage: number | null;
  };
  /** Identifiant de la personne connectée (ou `systeme`). */
  auteurId: string;
  resume: string;
  validePar?: ValidationJournal | null;
  gareId: string | null;
  compagnieId: string | null;
}

export interface RapportJournal {
  valide: boolean;
  entreesVerifiees: number;
  /** `seq` de la première entrée dont l'empreinte ou le chaînage est faux. */
  premiereEnDefaut?: number;
}

export interface ParamsLectureJournal {
  personneId?: string;
  sessionId?: string;
  jour?: string;
  apres?: string;
  limite?: number;
}

export interface PorteeJournal {
  compagnieId: string | null;
  /** Renseignée pour un superviseur (sa gare) ; absente pour le patron (toute la compagnie). */
  gareId?: string | null;
}

export const LIMITE_JOURNAL_DEFAUT = 50;

export class CurseurJournalInvalide extends Error {
  constructor() {
    super("Curseur de journal invalide");
    this.name = "CurseurJournalInvalide";
  }
}

/**
 * Le journal signé : tout ce qui se passe à la caisse et en supervision est une entrée horodatée,
 * ajoutée, jamais effacée. Chaque entrée porte l'empreinte HMAC-SHA-256 de la précédente de sa
 * compagnie : retirer ou modifier une entrée, même directement en base, casse la chaîne.
 *
 * Les secrets n'y entrent jamais : ni PIN, ni code. La preuve d'un superviseur (`validePar`) n'est
 * que la signature de la validation.
 */
@Injectable()
export class JournalSigneService {
  private readonly cle: Buffer;

  constructor(
    private readonly repo: JournalAgenceRepository,
    private readonly personnes: PersonnesRepository,
    private readonly horloge: Horloge,
    @Inject(CONFIG) config: AppConfig,
  ) {
    // Clé dérivée : la chaîne du journal de l'agence n'a pas la même clé que celle de l'audit.
    this.cle = createHmac("sha256", config.cleAudit).update("journal.agence.v1").digest();
  }

  static chaineDe(compagnieId: string | null): string {
    return compagnieId ?? "sans-compagnie";
  }

  async ecrire(e: EcritureJournal): Promise<EntreeJournalStockee | null> {
    const auteur = await this.auteur(e.auteurId);
    return this.repo.ajouter(
      JournalSigneService.chaineDe(e.compagnieId),
      e.evenement.id,
      (precedente) => {
        const sansEmpreinte = {
          gareId: e.gareId,
          compagnieId: e.compagnieId,
          evenementId: e.evenement.id,
          type: e.evenement.type,
          at: e.evenement.at,
          auteur,
          appareilId: e.evenement.appareilId,
          cible: e.evenement.cible,
          numeroPlage: e.evenement.numeroPlage,
          resume: e.resume,
          validePar: e.validePar ?? null,
          precedente,
        };
        return {
          ...sansEmpreinte,
          empreinte: calculerEmpreinte(this.cle, sansEmpreinte, precedente),
        };
      },
    );
  }

  private async auteur(id: string): Promise<{ id: string; nom: string }> {
    if (id === AUTEUR_SYSTEME.id) return { ...AUTEUR_SYSTEME };
    const p = await this.personnes.trouverParId(id);
    return { id, nom: p?.nom || "Inconnu" };
  }

  /** Recalcule toute la chaîne d'une compagnie. */
  async verifier(compagnieId: string | null): Promise<RapportJournal> {
    const entrees = await this.repo.chaine(JournalSigneService.chaineDe(compagnieId));
    let precedente: string | null = null;
    for (const e of entrees) {
      const attendue = calculerEmpreinte(this.cle, e, precedente);
      const bonne =
        e.precedente === precedente &&
        e.empreinte.length === attendue.length &&
        timingSafeEqual(Buffer.from(e.empreinte), Buffer.from(attendue));
      if (!bonne) {
        return { valide: false, entreesVerifiees: entrees.indexOf(e), premiereEnDefaut: e.seq };
      }
      precedente = e.empreinte;
    }
    return { valide: true, entreesVerifiees: entrees.length };
  }

  /**
   * Une page du journal, la plus récente d'abord. Sans `sessionId`, le jour par défaut est
   * aujourd'hui (Douala) ; avec une session, tout son historique est renvoyé quel que soit le jour.
   */
  async lire(params: ParamsLectureJournal, portee: PorteeJournal) {
    const limite = Math.min(params.limite ?? LIMITE_JOURNAL_DEFAUT, 200);
    let avantSeq: number | undefined;
    if (params.apres !== undefined) {
      if (!/^\d{1,15}$/.test(params.apres)) throw new CurseurJournalInvalide();
      avantSeq = Number(params.apres);
    }
    const jour =
      params.jour ??
      (params.sessionId === undefined ? jourDouala(this.horloge.maintenant()) : undefined);
    const filtre: FiltreJournal = {
      compagnieId: portee.compagnieId,
      ...(portee.gareId !== undefined ? { gareId: portee.gareId } : {}),
      ...(params.personneId !== undefined ? { personneId: params.personneId } : {}),
      ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
      ...(jour !== undefined ? { jour } : {}),
      ...(avantSeq !== undefined ? { avantSeq } : {}),
      limite: limite + 1,
    };
    const lignes = await this.repo.lister(filtre);
    const page = lignes.slice(0, limite);
    const rapport = await this.verifier(portee.compagnieId);
    return {
      entrees: page.map((e) => ({
        evenementId: e.evenementId,
        type: e.type,
        at: e.at,
        auteur: e.auteur,
        appareilId: e.appareilId,
        cible: e.cible,
        numeroPlage: e.numeroPlage,
        resume: e.resume,
        validePar: e.validePar,
        empreinte: e.empreinte,
        precedente: e.precedente,
      })),
      suivant:
        lignes.length > limite && page.length > 0 ? String(page[page.length - 1]!.seq) : null,
      chaineValide: rapport.valide,
    };
  }
}
