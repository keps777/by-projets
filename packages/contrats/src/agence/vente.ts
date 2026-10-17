import { z } from "zod";
import {
  SchemaBilletImprimable,
  SchemaClasse,
  SchemaCodeBillet,
  SchemaDepartResume,
  SchemaEtatSiege,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaPaiement,
  SchemaPieceQuatreDerniers,
  SchemaSequence,
  SchemaSynchro,
  SchemaTelephone,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ vente en un écran */

export const SchemaPassagerSaisi = z.object({
  nom: z.string().min(1),
  telephone: SchemaTelephone.nullable(),
  pieceQuatreDerniers: SchemaPieceQuatreDerniers.nullable(),
});
export type PassagerSaisi = z.infer<typeof SchemaPassagerSaisi>;

export const SchemaPlanSieges = z.object({
  colonnes: z.number().int().min(1),
  cases: z.array(z.object({ numero: z.number().int().min(1), etat: SchemaEtatSiege })),
});
export type PlanSiegesVente = z.infer<typeof SchemaPlanSieges>;

/** Saisie en cours d'une vente, reprise après une coupure (gardée sur l'appareil). */
export const SchemaBrouillonVente = z.object({
  passager: SchemaPassagerSaisi,
  bagage: z.boolean(),
  paiement: SchemaPaiement,
  sms: z.boolean(),
  /** Total à encaisser : tarif + bagage. */
  montant: SchemaFcfaPositif,
});
export type BrouillonVente = z.infer<typeof SchemaBrouillonVente>;

export const SchemaParamsVenteContexte = z.object({ guichetId: SchemaId.optional() });
export type ParamsVenteContexte = z.infer<typeof SchemaParamsVenteContexte>;

/** Tout ce qu'il faut pour vendre un billet en un écran (planche « Vente »). */
export const SchemaVenteContexte = z.object({
  guichet: z.object({ id: SchemaId, rang: z.number().int().min(1) }),
  /** Le numéro que prendra le prochain billet dans la plage de l'appareil. */
  prochainNumero: z.object({ sequence: SchemaSequence, numero: z.string().min(1) }),
  departs: z.array(SchemaDepartResume),
  /** Départs ouverts à la vente qui ne tiennent pas dans la liste (« + 11 »). */
  autresDeparts: z.number().int().min(0),
  departChoisiId: SchemaId,
  siege: z.object({
    /** Siège attribué automatiquement ; la touche d'un autre siège le change. */
    propose: z.number().int().min(1),
    libres: z.number().int().min(0),
    plan: SchemaPlanSieges,
  }),
  tarifs: z.object({
    classique: SchemaFcfaPositif,
    vip: SchemaFcfaPositif,
    bagage: SchemaFcfaPositif,
  }),
  brouillon: SchemaBrouillonVente.nullable(),
});
export type VenteContexte = z.infer<typeof SchemaVenteContexte>;

/** Vendre un billet au guichet : siège, voyageur, paiement, impression. Numéroté dans la plage. */
export const EVENEMENT_BILLET_VENDU = definirEvenement({
  type: "billet.vendu",
  numerote: true,
  donnees: z.object({
    /** Identifiant du billet, créé sur l'appareil. */
    billetId: SchemaId,
    departId: SchemaId,
    siege: z.number().int().min(1).nullable(),
    classe: SchemaClasse,
    /** Tarif de la classe. */
    prix: SchemaFcfaPositif,
    /** Supplément bagage (0 sans bagage) : le voyageur paie `prix + bagage`. */
    bagage: SchemaFcfaPositif,
    passager: SchemaPassagerSaisi,
    paiement: SchemaPaiement,
    /** Code de 4 chiffres tiré sur l'appareil (unique dans le départ). */
    codeBillet: SchemaCodeBillet,
    sms: z.boolean(),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

export const SchemaResultatVente = SchemaResultatSimple.extend({
  billet: SchemaBilletImprimable,
});
export type ResultatVente = z.infer<typeof SchemaResultatVente>;

/* ------------------------------------------------------------------ mode cadence */

export const SchemaParamsCadenceEtat = z.object({ departId: SchemaId.optional() });
export type ParamsCadenceEtat = z.infer<typeof SchemaParamsCadenceEtat>;

/** Mode cadence : une file de 40, un billet à chaque touche (planche « Cadence »). */
export const SchemaCadenceEtat = z.object({
  depart: SchemaDepartResume.extend({ placesRestantes: z.number().int().min(0) }),
  dernierBillet: z
    .object({
      billetId: SchemaId,
      sequence: SchemaSequence,
      siege: z.number().int().min(1),
      /** Null tant que le nom n'a pas été complété au quai. */
      nom: z.string().nullable(),
      venduA: SchemaIsoDouala,
    })
    .nullable(),
  prochain: z.object({ prix: SchemaFcfaPositif, siege: z.number().int().min(1) }),
  modesPaiement: z.array(z.enum(["cash", "momo"])),
  vendusEnCadence: z.number().int().min(0),
  annulations: z.number().int().min(0),
  synchro: SchemaSynchro,
});
export type CadenceEtat = z.infer<typeof SchemaCadenceEtat>;

export const SchemaParamsCadenceBillet = z.object({ billetId: SchemaId });
export type ParamsCadenceBillet = z.infer<typeof SchemaParamsCadenceBillet>;

/** La suite d'une vente de cadence : le billet imprimé et ce que l'app a fait (planche « CadenceBillet »). */
export const SchemaCadenceBillet = z.object({
  billet: SchemaBilletImprimable,
  vente: z.object({
    /** Durée de la vente, en millisecondes (« 1,8 s »). */
    dureeMs: z.number().int().min(0),
    paiement: SchemaPaiement,
    placesRestantes: z.number().int().min(0),
  }),
  recapitulatif: z.object({
    /** Le numéro est dans la plage de l'appareil, sans trou. */
    plageSansTrou: z.boolean(),
    siegeBloque: z.number().int().min(1),
    imprime: z.boolean(),
    caisseCash: SchemaFcfaPositif,
    sms: z.enum(["envoye", "pas_de_numero"]),
    synchro: z.enum(["faite", "au_retour_du_reseau"]),
  }),
  suivant: z.object({ siege: z.number().int().min(1), prix: SchemaFcfaPositif }),
});
export type CadenceBillet = z.infer<typeof SchemaCadenceBillet>;

/**
 * Vendre un billet en cadence : numéroté et imprimé sans nom ni pièce, à compléter au quai.
 * Une vente « × 2 places » envoie deux événements.
 */
export const EVENEMENT_BILLET_VENDU_CADENCE = definirEvenement({
  type: "billet.vendu_cadence",
  numerote: true,
  donnees: z.object({
    billetId: SchemaId,
    departId: SchemaId,
    siege: z.number().int().min(1),
    prix: SchemaFcfaPositif,
    paiement: SchemaPaiement,
    codeBillet: SchemaCodeBillet,
    /** Numéro pour envoyer le SMS, facultatif. */
    telephone: SchemaTelephone.nullable(),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

export const SchemaResultatCadence = SchemaResultatSimple.extend({
  billet: SchemaBilletImprimable,
  placesRestantes: z.number().int().min(0),
});
export type ResultatCadence = z.infer<typeof SchemaResultatCadence>;

/** « + numéro · envoyer le SMS » : ajoute le téléphone d'un billet déjà vendu. */
export const EVENEMENT_BILLET_TELEPHONE_AJOUTE = definirEvenement({
  type: "billet.telephone_ajoute",
  numerote: false,
  donnees: z.object({ billetId: SchemaId, telephone: SchemaTelephone }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});
