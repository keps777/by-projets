import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../auth/roles";

/** Empreinte de la « ligne zéro » : la première ligne du journal s'accroche à elle. */
export const EMPREINTE_INITIALE = "0".repeat(64);

export type ResultatAudit = "succes" | "refus" | "echec";

export interface LigneAudit {
  /** Numéro d'ordre attribué par la base (absent avant l'écriture). */
  seq?: bigint;
  id: string;
  at: Date;
  acteurId: string | null;
  acteurRole: Role | null;
  compagnieId: string | null;
  action: string;
  resultat: ResultatAudit;
  cibleType: string | null;
  cibleId: string | null;
  details: Record<string, unknown>;
  hashPrecedent: string;
  hash: string;
}

export type LigneAuditSansEmpreinte = Omit<LigneAudit, "seq" | "hash">;

/** JSON canonique : clés triées, sans `undefined`. Deux valeurs égales donnent le même texte. */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== "object") return JSON.stringify(valeur) ?? "null";
  if (Array.isArray(valeur)) return `[${valeur.map((v) => jsonCanonique(v)).join(",")}]`;
  const entrees = Object.entries(valeur as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entrees.map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonique(v)}`).join(",")}}`;
}

export function calculerEmpreinte(cle: Buffer, ligne: LigneAuditSansEmpreinte): string {
  const contenu = jsonCanonique({
    id: ligne.id,
    at: ligne.at.toISOString(),
    acteurId: ligne.acteurId,
    acteurRole: ligne.acteurRole,
    compagnieId: ligne.compagnieId,
    action: ligne.action,
    resultat: ligne.resultat,
    cibleType: ligne.cibleType,
    cibleId: ligne.cibleId,
    details: ligne.details,
  });
  return createHmac("sha256", cle).update(`${ligne.hashPrecedent}\u0000${contenu}`).digest("hex");
}

export interface RapportChaine {
  valide: boolean;
  lignesVerifiees: number;
  /** Numéro de la première ligne dont l'empreinte ou le chaînage ne correspond pas. */
  premiereLigneEnDefaut?: bigint;
}

/** Vérifie un lot de lignes consécutives (par `seq` croissant) à partir de l'empreinte attendue. */
export function verifierLot(
  cle: Buffer,
  precedent: string,
  lignes: readonly LigneAudit[],
): { suivant: string; defaut?: bigint } {
  let attendu = precedent;
  for (const ligne of lignes) {
    const recalcule = calculerEmpreinte(cle, ligne);
    const a = Buffer.from(recalcule);
    const b = Buffer.from(ligne.hash);
    if (ligne.hashPrecedent !== attendu || a.length !== b.length || !timingSafeEqual(a, b)) {
      return { suivant: attendu, defaut: ligne.seq ?? 0n };
    }
    attendu = ligne.hash;
  }
  return { suivant: attendu };
}
