import { z } from "zod";
import { SchemaFcfaPositif, SchemaIsoDouala, SchemaRefPhoto, SchemaTelephone } from "./commun";

/* ------------------------------------------------------------------ communs relais et livreur */

export const SchemaEtapeProgramme = z.object({
  rang: z.int().positive(),
  titre: z.string(),
  detail: z.string(),
});

/** Un jalon du suivi d'une demande (« Fiche reçue », « Activation »…). `a` est l'heure quand elle est connue. */
export const SchemaJalonDemande = z.object({
  fait: z.boolean(),
  libelle: z.string(),
  detail: z.string(),
  a: SchemaIsoDouala.nullable(),
});
export type JalonDemande = z.infer<typeof SchemaJalonDemande>;

/**
 * Suivi d'une demande d'inscription (point relais ou livreur) : dossier, jalons en direct, code ou
 * badge réservé, essai de l'app en démo. Les deux inscriptions partagent cette forme.
 */
export const SchemaSuiviDemande = z.object({
  type: z.enum(["relais", "livreur"]),
  /** « R-BAF-0215 » pour un relais, « L-BAF-0087 » pour un livreur. */
  dossier: z.string(),
  statut: z.enum(["en_cours", "active", "refusee"]),
  titre: z.string(),
  detail: z.string(),
  /** Étape du parcours d'inscription (2 / 3), pour la barre de progression. */
  etape: z.object({ courante: z.int().positive(), total: z.int().positive() }).nullable(),
  jalons: z.array(SchemaJalonDemande),
  /** Code relais ou badge livreur réservé, actif après la visite ou la formation. */
  reservation: z.object({ libelle: z.string(), valeur: z.string(), activation: z.string() }),
  demo: z.object({ libelle: z.string(), titre: z.string(), detail: z.string() }),
  /** Récit de la suite (jeudi chez le relais, première soirée du livreur). */
  recit: z.object({ titre: z.string(), texte: z.string() }),
  mention: z.string().nullable(),
  /** Bloc complémentaire (les particularités du livreur, modifiables à tout moment). */
  complement: z.object({ titre: z.string(), texte: z.string() }).nullable(),
  /** Agent AfriMove qui passera (relais seulement). */
  agent: z.object({ nom: z.string(), creneau: z.string() }).nullable(),
});
export type SuiviDemande = z.infer<typeof SchemaSuiviDemande>;

export const SchemaParamsSuiviDemande = z.object({ dossier: z.string().optional() });

/* ------------------------------------------------------------------ point relais */

/** Page « Deviens point de relais » : ce que gagne le commerçant, ce qu'il lui faut, les étapes. */
export const SchemaProgrammeRelais = z.object({
  titre: z.string(),
  detail: z.string(),
  accroche: z.string(),
  deroule: z.string(),
  /** Gain par colis remis (200 F) et par colis repris (100 F). */
  partParColis: SchemaFcfaPositif,
  partSiRepris: SchemaFcfaPositif,
  relaisActifs: z.int().nonnegative(),
  villes: z.int().positive(),
  /** Gain réel d'un relais la semaine dernière, en exemple. */
  exemple: z.object({ nom: z.string(), colis: z.int().nonnegative(), gain: SchemaFcfaPositif }),
  prerequis: z.array(z.string()),
  etapes: z.array(SchemaEtapeProgramme),
  mention: z.string(),
});
export type ProgrammeRelais = z.infer<typeof SchemaProgrammeRelais>;

const SchemaChoixFiche = z.object({
  libelle: z.string(),
  choix: z.array(z.string()),
  valeur: z.string(),
});

/** Fiche de la boutique (étape 1 / 3) : valeurs proposées et valeurs préremplies. */
export const SchemaFormulaireRelais = z.object({
  titre: z.string(),
  detail: z.string(),
  fiche: z.object({
    nom: z.string(),
    type: SchemaChoixFiche,
    ouvert: SchemaChoixFiche,
    position: z.object({ libelle: z.string(), valeur: z.string() }),
    taille: SchemaChoixFiche,
    momo: z.object({ libelle: z.string(), valeurMasquee: z.string() }),
  }),
  pieces: z.array(z.object({ titre: z.string(), detail: z.string() })),
  engagement: z.object({ titre: z.string(), texte: z.string() }),
  mention: z.string(),
  etape: z.object({ courante: z.int().positive(), total: z.int().positive() }),
});
export type FormulaireRelais = z.infer<typeof SchemaFormulaireRelais>;

export const SchemaFicheRelais = z.object({
  nom: z.string().min(1),
  type: z.string().min(1),
  ouvert: z.string().min(1),
  position: z.object({ ville: z.string(), quartier: z.string(), repere: z.string().optional() }),
  tailleMax: z.string().min(1),
  /**
   * Le MoMo qui reçoit les versements. Absent : le serveur prend celui du compte (le numéro masqué que le formulaire
   * propose), le cas courant quand le commerçant ne le change pas.
   */
  momo: z.object({ telephone: SchemaTelephone, operateur: z.enum(["mtn", "orange"]) }).optional(),
  facadeRef: SchemaRefPhoto,
});
export type FicheRelais = z.infer<typeof SchemaFicheRelais>;

export const SchemaBrouillonRelais = z.object({
  fiche: SchemaFicheRelais.partial(),
});

export const SchemaBrouillonEnregistre = z.object({ enregistreLe: SchemaIsoDouala });

/* ------------------------------------------------------------------ livreur */

const SchemaChoixLivreur = z.object({ libelle: z.string(), choix: z.array(z.string()) });

/** Page « Deviens livreur » : gain par course, particularités à choisir, pièces, règles à signer. */
export const SchemaProgrammeLivreur = z.object({
  titre: z.string(),
  detail: z.string(),
  /** Gain par course : 70 % de 1 000 F. */
  partParCourse: SchemaFcfaPositif,
  livreursActifs: z.int().nonnegative(),
  villes: z.int().positive(),
  exemple: z.object({ nom: z.string(), courses: z.int().nonnegative(), gain: SchemaFcfaPositif }),
  particularites: z.object({
    titre: z.string(),
    deplacement: SchemaChoixLivreur,
    zone: SchemaChoixLivreur.extend({ valeur: z.string() }),
    heures: SchemaChoixLivreur.extend({ valeur: z.string() }),
    charge: SchemaChoixLivreur.extend({ valeur: z.string() }),
    momo: z.object({ libelle: z.string(), valeurMasquee: z.string() }),
  }),
  pieces: z.array(z.object({ titre: z.string(), detail: z.string() })),
  regles: z.object({ titre: z.string(), texte: z.string() }),
  mention: z.string(),
});
export type ProgrammeLivreur = z.infer<typeof SchemaProgrammeLivreur>;

export const SchemaDemandeLivreur = z.object({
  deplacement: z.enum(["moto", "velo", "pied", "tricycle"]),
  zone: z.string().min(1),
  heures: z.string().min(1),
  chargeMax: z.string().min(1),
  /** Le MoMo des gains. Absent : le serveur prend celui du compte (le numéro masqué que le formulaire propose). */
  momo: z.object({ telephone: SchemaTelephone, operateur: z.enum(["mtn", "orange"]) }).optional(),
  pieces: z.object({
    permisRef: SchemaRefPhoto.optional(),
    assuranceRef: SchemaRefPhoto.optional(),
  }),
  /** Les trois règles ont été signées. */
  reglesAcceptees: z.literal(true),
});
export type DemandeLivreur = z.infer<typeof SchemaDemandeLivreur>;

/** Demande déposée : le dossier est ouvert, le suivi se lit avec `SchemaSuiviDemande`. */
export const SchemaDemandeDeposee = z.object({
  dossier: z.string(),
  deposeeLe: SchemaIsoDouala,
  /** Réponse sous 72 h pour un relais ; formation de 10 minutes pour un livreur. */
  suite: z.string(),
});
export type DemandeDeposee = z.infer<typeof SchemaDemandeDeposee>;
