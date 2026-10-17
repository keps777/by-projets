import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../socle/db/prisma.service";

/**
 * Une session de caisse écrite directement en base, avec les deux copies (JSON qui fait foi et colonnes
 * interrogeables) que les CHECK `session_cloture_copie` et `session_validation_copie` veulent
 * cohérentes. Pour les tests d'intégration des analyses et de l'assistant, qui lisent les écarts.
 */

export interface OptionsSessionPg {
  compagnieId: string;
  gareId: string;
  guichetId: string;
  agentId: string;
  /** Le superviseur qui valide (obligatoire pour l'état `validee`). */
  superviseurId?: string;
  etat: "ouverte" | "cloturee" | "validee";
  /** Instant d'ouverture (UTC) : le jour de Douala en découle. */
  ouverteA: string;
  ecart?: number;
  rang?: number;
  tolerance?: number;
}

let compteur = 0;

export async function creerSessionPg(prisma: PrismaService, o: OptionsSessionPg) {
  compteur += 1;
  const ecart = o.ecart ?? 0;
  const cloture =
    o.etat === "ouverte"
      ? null
      : {
          at: o.ouverteA,
          auto: false,
          cashCompte: 25_000 + ecart,
          cashAttendu: 25_000,
          ecart,
          divergenceAppareil: false,
          comptageAbsent: false,
          decompte: {},
          evenementId: randomUUID(),
        };
  if (o.etat === "validee" && !o.superviseurId) throw new Error("superviseurId requis");
  const validation =
    o.etat === "validee"
      ? {
          at: o.ouverteA,
          superviseurId: o.superviseurId,
          superviseurNom: "Marie Ngo",
          ecart,
          commentaire: null,
          evenementId: randomUUID(),
        }
      : null;
  return prisma.sessionCaisse.create({
    data: {
      numero: `K-TST-${Date.parse(o.ouverteA)}-${compteur}`,
      guichetId: o.guichetId,
      agentId: o.agentId,
      fondDeCaisse: 25_000,
      ouverteA: new Date(o.ouverteA),
      etat: o.etat,
      guichetRang: o.rang ?? 1,
      gareId: o.gareId,
      compagnieId: o.compagnieId,
      tolerance: o.tolerance ?? 1_000,
      ...(cloture
        ? {
            cloture,
            clotureeA: new Date(cloture.at),
            clotureeAuto: false,
            cashCompte: cloture.cashCompte,
            cashAttendu: 25_000,
            ecart: cloture.ecart,
          }
        : {}),
      ...(validation
        ? { validation, valideeA: new Date(validation.at), valideeParId: o.superviseurId! }
        : {}),
    },
  });
}
