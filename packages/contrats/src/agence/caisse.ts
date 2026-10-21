import { ETATS_SESSION } from "@afrimove/domain";
import { z } from "zod";
import {
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaPersonneRef,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ lectures */

export const SchemaLigneDecompte = z.object({
  nombre: z.number().int().min(0),
  montant: SchemaFcfaPositif,
});

export const SchemaCoupureComptee = z.object({
  /** 10 000, 5 000, 2 000, 1 000 ou 500 (voir `COUPURES` du domaine). */
  valeur: z.number().int().positive(),
  nombre: z.number().int().min(0),
});

export const SchemaEcartCaisse = z.object({
  /** compté − attendu : négatif = il manque de l'argent. */
  montant: SchemaFcfa,
  statut: z.enum(["exact", "dans_tolerance", "hors_tolerance"]),
  /** Tolérance de l'agence, en valeur absolue. */
  tolerance: SchemaFcfaPositif,
  /** Écart de la caisse d'hier de cet agent. */
  hier: SchemaFcfa,
  /** Somme des écarts de la semaine de cet agent. */
  semaine: SchemaFcfa,
});

/**
 * La session de caisse d'un agent : ce que l'app a compté, ce que l'agent compte, l'écart.
 * Planche « Caisse » (touche 2 : fermer ma caisse).
 */
export const SchemaCaisseSession = z.object({
  sessionId: SchemaId,
  /** K-GARE-AAMMJJ-GUICHET-N */
  numero: z.string().min(1),
  agent: SchemaPersonneRef,
  guichetRang: z.number().int().min(1),
  etat: z.enum(ETATS_SESSION),
  ouverteA: SchemaIsoDouala,
  fondDeCaisse: SchemaFcfaPositif,
  periode: z.object({ debut: SchemaIsoDouala, fin: SchemaIsoDouala }),
  /** Ce que l'app a compté depuis l'ouverture. Le MoMo n'entre pas dans la caisse. */
  decompte: z.object({
    billetsCash: SchemaLigneDecompte,
    colisCash: SchemaLigneDecompte,
    annulationsValidees: SchemaLigneDecompte,
    momo: z.object({ ventes: z.number().int().min(0), montant: SchemaFcfaPositif }),
  }),
  /** fond + billets cash + colis cash − annulations validées (voir `cashAttendu` du domaine). */
  cashAttendu: SchemaFcfaPositif,
  /** Ce que l'agent a compté : coupures puis pièces. */
  comptage: z.object({
    coupures: z.array(SchemaCoupureComptee),
    pieces: SchemaFcfaPositif,
    total: SchemaFcfaPositif,
  }),
  ecart: SchemaEcartCaisse,
});
export type CaisseSession = z.infer<typeof SchemaCaisseSession>;

export const SchemaParamsCaisseSession = z.object({ sessionId: SchemaId.optional() });
export type ParamsCaisseSession = z.infer<typeof SchemaParamsCaisseSession>;

/* ------------------------------------------------------------------ écritures */

/** Ouvrir la caisse : fond de caisse compté au début de la journée. */
export const EVENEMENT_CAISSE_OUVERTE = definirEvenement({
  type: "caisse.ouverte",
  numerote: false,
  donnees: z.object({
    sessionId: SchemaId,
    /** K-GARE-AAMMJJ-GUICHET-N, pris par `prochaineSession` du domaine. */
    numero: z.string().min(1),
    guichetId: SchemaId,
    fondDeCaisse: SchemaFcfaPositif,
  }),
  cible: (d) => ({ type: "session", id: d.sessionId }),
});

/** Compter la caisse : coupures puis pièces, enregistré avant la clôture. */
export const EVENEMENT_CAISSE_COMPTEE = definirEvenement({
  type: "caisse.comptee",
  numerote: false,
  donnees: z.object({
    sessionId: SchemaId,
    coupures: z.array(SchemaCoupureComptee),
    pieces: SchemaFcfaPositif,
    total: SchemaFcfaPositif,
  }),
  cible: (d) => ({ type: "session", id: d.sessionId }),
});

/** Clôturer la caisse (touche 3) : le superviseur la valide ensuite avec son PIN. */
export const EVENEMENT_CAISSE_CLOTUREE = definirEvenement({
  type: "caisse.cloturee",
  numerote: false,
  donnees: z.object({
    sessionId: SchemaId,
    cashCompte: SchemaFcfaPositif,
    cashAttendu: SchemaFcfaPositif,
    ecart: SchemaFcfa,
    /** Vrai pour la clôture automatique de minuit. */
    auto: z.boolean(),
  }),
  cible: (d) => ({ type: "session", id: d.sessionId }),
});

/** Réponse des écritures de caisse : l'accusé et la session à jour. */
export const SchemaResultatCaisse = SchemaResultatSimple.extend({ session: SchemaCaisseSession });
export type ResultatCaisse = z.infer<typeof SchemaResultatCaisse>;
