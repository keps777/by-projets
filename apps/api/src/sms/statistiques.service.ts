import { Inject, Injectable } from "@nestjs/common";
import { CONFIG_SMS, type ConfigSms } from "./config";
import { JournalSms } from "./journal";
import {
  LIBELLES_TYPES_SMS,
  STATUTS_EN_ATTENTE,
  STATUTS_FACTURES,
  TYPES_SMS,
  type MessageSms,
  type TypeSms,
} from "./types";

export interface LigneCoutSms {
  /** Messages demandés sur la période. */
  messages: number;
  /** Acceptés par le fournisseur (donc facturés), livrés ou non. */
  envoyes: number;
  livres: number;
  nonLivres: number;
  /** Échecs définitifs, messages expirés ou annulés : jamais facturés. */
  perdus: number;
  enAttente: number;
  /** Morceaux de SMS facturés. */
  segments: number;
  coutFcfa: number;
  /** Médiane de la demande à l'acceptation, en ms ; `null` sans envoi. */
  delaiMedianMs: number | null;
}

export interface RapportCoutsSms {
  du: string | null;
  au: string | null;
  coutParSegmentFcfa: number;
  parType: Array<LigneCoutSms & { type: TypeSms; libelle: string }>;
  total: LigneCoutSms;
  delaiP95Ms: number | null;
  objectifDelaiMedianMs: number;
  /** `null` tant qu'aucun SMS n'est parti sur la période. */
  objectifAtteint: boolean | null;
}

export interface FiltreCouts {
  compagnieId?: string | null;
  du?: Date;
  au?: Date;
}

/** Médiane (moyenne des deux valeurs centrales si le nombre est pair) ; `null` si vide. */
export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : Math.round((t[m - 1]! + t[m]!) / 2);
}

/** Percentile par rang le plus proche (p entre 0 et 1) ; `null` si vide. */
export function percentile(valeurs: readonly number[], p: number): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.max(0, Math.ceil(p * t.length) - 1))]!;
}

function ligne(messages: readonly MessageSms[]): LigneCoutSms {
  const factures = messages.filter((m) => STATUTS_FACTURES.includes(m.statut));
  return {
    messages: messages.length,
    envoyes: factures.length,
    livres: messages.filter((m) => m.statut === "livre").length,
    nonLivres: messages.filter((m) => m.statut === "non_livre").length,
    perdus: messages.filter((m) => ["echec", "expire", "annule"].includes(m.statut)).length,
    enAttente: messages.filter((m) => STATUTS_EN_ATTENTE.includes(m.statut)).length,
    segments: factures.reduce((n, m) => n + m.segments, 0),
    coutFcfa: factures.reduce((n, m) => n + m.coutFcfa, 0),
    delaiMedianMs: mediane(delais(messages)),
  };
}

const delais = (messages: readonly MessageSms[]): number[] =>
  messages.map((m) => m.delaiEnvoiMs).filter((d): d is number => d !== null);

/**
 * Coût et délai d'envoi par type de SMS : ce que lit l'administration. Le coût est celui des
 * messages acceptés par le fournisseur (un échec ou une reprise ne coûte rien) ; il vaut
 * `morceaux × prix du morceau`. Les montants viennent du journal, pas d'un recalcul.
 */
@Injectable()
export class StatistiquesSmsService {
  constructor(
    private readonly journal: JournalSms,
    @Inject(CONFIG_SMS) private readonly config: ConfigSms,
  ) {}

  async couts(filtre: FiltreCouts = {}): Promise<RapportCoutsSms> {
    const messages = await this.journal.lister({
      ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
      ...(filtre.du ? { du: filtre.du } : {}),
      ...(filtre.au ? { au: filtre.au } : {}),
    });
    const total = ligne(messages);
    return {
      du: filtre.du?.toISOString() ?? null,
      au: filtre.au?.toISOString() ?? null,
      coutParSegmentFcfa: this.config.coutParSegmentFcfa,
      parType: TYPES_SMS.map((type) => ({
        type,
        libelle: LIBELLES_TYPES_SMS[type],
        ...ligne(messages.filter((m) => m.type === type)),
      })),
      total,
      delaiP95Ms: percentile(delais(messages), 0.95),
      objectifDelaiMedianMs: this.config.objectifDelaiMedianMs,
      objectifAtteint:
        total.delaiMedianMs === null
          ? null
          : total.delaiMedianMs < this.config.objectifDelaiMedianMs,
    };
  }
}
