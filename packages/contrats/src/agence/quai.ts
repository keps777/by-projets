import { z } from "zod";
import {
  SchemaClasse,
  SchemaCodeBillet,
  SchemaDepartResume,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaModePaiement,
  SchemaPersonneRef,
  SchemaPieceQuatreDerniers,
  SchemaSequence,
  SchemaTelephone,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ résultat d'un scan */

export const SchemaResultatScan = z.enum([
  "monte",
  "deja_scanne",
  "introuvable",
  "autre_depart",
  "annule",
  "sans_nom",
]);
export type ResultatScanQuai = z.infer<typeof SchemaResultatScan>;

export const SchemaScanQuai = z.object({
  billetId: SchemaId,
  /** AGENCE-GARE-AAMMJJ-NNNN */
  numero: z.string().min(1),
  resultat: SchemaResultatScan,
  at: SchemaIsoDouala,
  voyageur: z.string().nullable(),
  siege: z.number().int().min(1).nullable(),
  pieceQuatreDerniers: SchemaPieceQuatreDerniers.nullable(),
  classe: SchemaClasse,
  bagagesSoute: z.number().int().min(0),
});
export type ScanQuai = z.infer<typeof SchemaScanQuai>;

/* ------------------------------------------------------------------ quai : embarquement */

export const SchemaParamsQuaiEmbarquement = z.object({ departId: SchemaId.optional() });
export type ParamsQuaiEmbarquement = z.infer<typeof SchemaParamsQuaiEmbarquement>;

export const SchemaAbsentQuai = z.object({
  billetId: SchemaId,
  voyageur: z.string().min(1),
  siege: z.number().int().min(1),
  venduA: SchemaIsoDouala.nullable(),
  /** Le voyageur a prévenu qu'il est en retard. */
  retardPrevenu: z.boolean(),
  /** Ce que le quai propose en une touche. */
  actionSuggeree: z.enum(["code_billet", "liberer"]),
});
export type AbsentQuai = z.infer<typeof SchemaAbsentQuai>;

/** Le quai d'un départ : scan, comptage, soute, absents (planche « Quai »). */
export const SchemaQuaiEmbarquement = z.object({
  quai: z.number().int().min(1),
  depart: SchemaDepartResume,
  equipage: z.object({
    bus: z.object({ id: SchemaId, immatriculation: z.string().min(1) }),
    chauffeur: SchemaPersonneRef,
    convoyeur: SchemaPersonneRef,
  }),
  mode: z.enum(["scan", "code"]),
  dernierScan: SchemaScanQuai.nullable(),
  embarquement: z.object({
    embarques: z.number().int().min(0),
    capacite: z.number().int().min(1),
    attendus: z.number().int().min(0),
    nonPresentes: z.number().int().min(0),
  }),
  soute: z.object({
    charges: z.number().int().min(0),
    capacite: z.number().int().min(1),
    colisACharger: z.number().int().min(0),
  }),
  refuses: z.object({
    nombre: z.number().int().min(0),
    motif: z.enum(["deja_scanne", "autre_depart", "annule", "introuvable"]),
    /** Heure du premier scan quand le motif est « déjà scanné ». */
    premierScanA: SchemaIsoDouala.nullable(),
  }),
  enRoute: z.object({
    nombre: z.number().int().min(0),
    arret: z.string().min(1),
  }),
  absents: z.array(SchemaAbsentQuai),
  placesAVendre: z.number().int().min(0),
});
export type QuaiEmbarquement = z.infer<typeof SchemaQuaiEmbarquement>;

/** Scanner un billet : le QR du voyageur. */
export const EVENEMENT_QUAI_SCANNE = definirEvenement({
  type: "quai.scanne",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    /** Contenu du QR lu. */
    qr: z.string().min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

/** Embarquer sans scanner : le voyageur dicte son code à 4 chiffres. */
export const EVENEMENT_QUAI_CODE_SAISI = definirEvenement({
  type: "quai.code_saisi",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    codeBillet: SchemaCodeBillet,
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

/** Libérer le siège d'un absent (en retard, jamais venu) : le siège revient à la vente. */
export const EVENEMENT_QUAI_LIBERE = definirEvenement({
  type: "quai.libere",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    billetId: SchemaId,
    siege: z.number().int().min(1),
    motif: z.enum(["retard", "absent"]),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

/** Départ : la liste nominative des embarqués part au chauffeur. */
export const EVENEMENT_QUAI_LISTE_ENVOYEE = definirEvenement({
  type: "quai.liste_envoyee",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    embarques: z.number().int().min(0),
    capacite: z.number().int().min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

export const SchemaResultatScanQuai = SchemaResultatSimple.extend({
  scan: SchemaScanQuai,
  embarques: z.number().int().min(0),
  capacite: z.number().int().min(1),
});
export type ResultatScan = z.infer<typeof SchemaResultatScanQuai>;

export const SchemaResultatLiberation = SchemaResultatSimple.extend({
  siegesLibres: z.number().int().min(0),
});
export type ResultatLiberation = z.infer<typeof SchemaResultatLiberation>;

export const SchemaResultatListeChauffeur = SchemaResultatSimple.extend({
  chauffeur: SchemaPersonneRef,
  embarques: z.number().int().min(0),
});
export type ResultatListeChauffeur = z.infer<typeof SchemaResultatListeChauffeur>;

/* ------------------------------------------------------------------ quai : billets de cadence */

export const SchemaParamsQuaiCadence = z.object({ departId: SchemaId.optional() });
export type ParamsQuaiCadence = z.infer<typeof SchemaParamsQuaiCadence>;

export const SchemaBilletSansNom = z.object({
  billetId: SchemaId,
  sequence: SchemaSequence,
  siege: z.number().int().min(1),
  venduA: SchemaIsoDouala,
  paiement: SchemaModePaiement,
  smsEnvoye: z.boolean(),
});
export type BilletSansNom = z.infer<typeof SchemaBilletSansNom>;

/** Le quai complète les billets de cadence : nom et pièce au scan (planche « CadenceQuai »). */
export const SchemaQuaiCadence = z.object({
  quai: z.number().int().min(1),
  depart: SchemaDepartResume,
  convoyeur: SchemaPersonneRef,
  /** Le billet de cadence qui vient d'être scanné. */
  scan: z.object({
    at: SchemaIsoDouala,
    billetId: SchemaId,
    numero: z.string().min(1),
    siege: z.number().int().min(1),
    venduA: SchemaIsoDouala,
    guichetRang: z.number().int().min(1),
    paiement: SchemaModePaiement,
    montant: SchemaFcfaPositif,
    validePourCeDepart: z.boolean(),
  }),
  /** Saisie en cours : le client montre sa pièce. */
  saisie: z.object({
    nom: z.string(),
    pieceQuatreDerniers: z.string(),
    telephone: z.string().nullable(),
  }),
  embarquement: z.object({
    embarques: z.number().int().min(0),
    capacite: z.number().int().min(1),
    nominatifs: z.number().int().min(0),
    cadenceCompletes: z.number().int().min(0),
  }),
  sansNom: z.object({
    total: z.number().int().min(0),
    /** Les premiers de la liste ; le total peut dépasser sa longueur. */
    liste: z.array(SchemaBilletSansNom),
  }),
});
export type QuaiCadence = z.infer<typeof SchemaQuaiCadence>;

/** Compléter un billet de cadence au quai : nom et pièce, puis embarquer. Le numéro ne change pas. */
export const EVENEMENT_BILLET_COMPLETE = definirEvenement({
  type: "billet.complete",
  numerote: false,
  donnees: z.object({
    billetId: SchemaId,
    departId: SchemaId,
    nom: z.string().min(1),
    pieceQuatreDerniers: SchemaPieceQuatreDerniers,
    telephone: SchemaTelephone.nullable(),
    /** Embarquer tout de suite (« Embarquer · siège 19 »). */
    embarquer: z.boolean(),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

export const SchemaResultatCompletion = SchemaResultatSimple.extend({
  billet: z.object({
    billetId: SchemaId,
    numero: z.string().min(1),
    nom: z.string().min(1),
    embarque: z.boolean(),
  }),
  embarques: z.number().int().min(0),
  sansNomRestants: z.number().int().min(0),
});
export type ResultatCompletion = z.infer<typeof SchemaResultatCompletion>;

/* ------------------------------------------------------------------ temps réel */

export const SchemaParamsQuaiDirect = z.object({ departId: SchemaId });
export type ParamsQuaiDirect = z.infer<typeof SchemaParamsQuaiDirect>;

/** Message du canal du quai : un scan ou un changement de compteur, vu en direct par la gare. */
export const SchemaMessageQuai = z.object({
  departId: SchemaId,
  at: SchemaIsoDouala,
  scan: SchemaScanQuai.nullable(),
  embarques: z.number().int().min(0),
  capacite: z.number().int().min(1),
});
export type MessageQuai = z.infer<typeof SchemaMessageQuai>;
