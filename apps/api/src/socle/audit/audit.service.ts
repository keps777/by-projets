import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "../auth/roles";
import { CONFIG, type AppConfig } from "../config/config";
import { AuditRepository, type FiltreAudit } from "./audit.repository";
import {
  EMPREINTE_INITIALE,
  calculerEmpreinte,
  verifierLot,
  type LigneAudit,
  type RapportChaine,
  type ResultatAudit,
} from "./chaine";

export interface EntreeAudit {
  acteur?: { id: string; role: Role; compagnieId: string | null } | null;
  /** Nom de l'action, en minuscules séparées par des points : `connexion.pin`, `acces.refuse`… */
  action: string;
  resultat: ResultatAudit;
  cible?: { type: string; id: string } | null;
  /** Données utiles à l'enquête. Les valeurs sensibles sont masquées avant l'écriture. */
  details?: Record<string, unknown>;
  at?: Date;
}

export const MASQUE = "[masqué]";

/** Clés dont la valeur ne doit jamais entrer dans le journal. */
const CLE_SENSIBLE =
  /(^pin|passe|password|secret|token|jeton|otp|^code|authorization|^telephone$|^numero$|chiffre|cookie)/i;

/** Copie `valeur` en masquant toute valeur dont la clé est sensible (récursif). */
export function masquer(valeur: unknown, profondeur = 0): unknown {
  if (profondeur > 6) return MASQUE;
  if (Array.isArray(valeur)) return valeur.map((v) => masquer(v, profondeur + 1));
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "bigint") return valeur.toString();
  if (valeur !== null && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      if (v === undefined) continue;
      sortie[cle] = CLE_SENSIBLE.test(cle) ? MASQUE : masquer(v, profondeur + 1);
    }
    return sortie;
  }
  return valeur;
}

/**
 * Journal d'audit en ajout seul : qui a fait quoi, quand, avec quel résultat.
 * Chaque ligne porte l'empreinte HMAC de la précédente (chaîne) : modifier ou retirer une ligne,
 * même directement en base, se détecte avec `verifierChaine()`.
 */
@Injectable()
export class AuditService {
  private readonly cle: Buffer;

  constructor(
    private readonly repo: AuditRepository,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.cle = config.cleAudit;
  }

  enregistrer(entree: EntreeAudit): Promise<LigneAudit> {
    // Passage par JSON : ce qui est haché est exactement ce que la base relira.
    const details = JSON.parse(JSON.stringify(masquer(entree.details ?? {}))) as Record<
      string,
      unknown
    >;
    const id = randomUUID();
    const at = entree.at ?? new Date();
    return this.repo.ajouter((hashPrecedent) => {
      const sansEmpreinte = {
        id,
        at,
        acteurId: entree.acteur?.id ?? null,
        acteurRole: entree.acteur?.role ?? null,
        compagnieId: entree.acteur?.compagnieId ?? null,
        action: entree.action,
        resultat: entree.resultat,
        cibleType: entree.cible?.type ?? null,
        cibleId: entree.cible?.id ?? null,
        details,
        hashPrecedent,
      };
      return { ...sansEmpreinte, hash: calculerEmpreinte(this.cle, sansEmpreinte) };
    });
  }

  lister(filtre: FiltreAudit): Promise<LigneAudit[]> {
    return this.repo.lister(filtre);
  }

  /** Relit tout le journal et recalcule la chaîne. */
  async verifierChaine(tailleLot = 500): Promise<RapportChaine> {
    let apres = 0n;
    let precedent = EMPREINTE_INITIALE;
    let total = 0;
    for (;;) {
      const lot = await this.repo.lireParLots(apres, tailleLot);
      if (lot.length === 0) return { valide: true, lignesVerifiees: total };
      const verdict = verifierLot(this.cle, precedent, lot);
      if (verdict.defaut !== undefined) {
        return { valide: false, lignesVerifiees: total, premiereLigneEnDefaut: verdict.defaut };
      }
      total += lot.length;
      precedent = verdict.suivant;
      apres = lot[lot.length - 1]?.seq ?? apres;
    }
  }
}
