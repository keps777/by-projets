import { ETATS_BILLET, ETATS_SESSION } from "@afrimove/domain";
import type { Role } from "@afrimove/domain";
import { z } from "zod";
import {
  SchemaDepartResume,
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaPersonneRef,
  SchemaPieceQuatreDerniers,
  SchemaSequence,
  SchemaValidationSuperviseur,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ communs */

const ROLES_EQUIPE = [
  "guichetier",
  "convoyeur",
  "chauffeur",
  "controleur",
  "superviseur",
] as const satisfies readonly Role[];
export const SchemaRoleEquipe = z.enum(ROLES_EQUIPE);
export type RoleEquipe = z.infer<typeof SchemaRoleEquipe>;

export const SchemaStatutEcart = z.enum(["exact", "dans_tolerance", "hors_tolerance"]);

/* ------------------------------------------------------------------ la gare du superviseur */

export const SchemaDemandeCloture = z.object({
  genre: z.literal("cloture"),
  demandeId: SchemaId,
  sessionId: SchemaId,
  guichetRang: z.number().int().min(1),
  agent: SchemaPersonneRef,
  compte: SchemaFcfaPositif,
  ecart: SchemaFcfa,
});

export const SchemaDemandeAnnulation = z.object({
  genre: z.literal("annulation"),
  demandeId: SchemaId,
  billetId: SchemaId,
  /** NNNN du billet : « 0171 ». */
  billetSequence: SchemaSequence,
  guichetRang: z.number().int().min(1),
  montant: SchemaFcfaPositif,
  motif: z.string().min(1),
});

/** Une demande qui attend le PIN du superviseur : clôture de caisse ou annulation. */
export const SchemaDemandeSuperviseur = z.discriminatedUnion("genre", [
  SchemaDemandeCloture,
  SchemaDemandeAnnulation,
]);
export type DemandeSuperviseur = z.infer<typeof SchemaDemandeSuperviseur>;

export const SchemaGuichetSuperviseur = z.object({
  rang: z.number().int().min(1),
  billets: z.number().int().min(0),
  ecart: SchemaFcfa,
  etat: z.enum(["ouvert", "a_valider", "ferme"]),
  ouvertA: SchemaIsoDouala.nullable(),
});
export type GuichetSuperviseur = z.infer<typeof SchemaGuichetSuperviseur>;

export const SchemaDepartGare = SchemaDepartResume.omit({ placesLibres: true }).extend({
  quai: z.number().int().min(1),
  bus: z.string().nullable(),
  vendus: z.number().int().min(0),
  capacite: z.number().int().min(1),
  /** Fusion proposée avec un autre départ, par exemple le 16:30. */
  fusionProposeeAvec: SchemaIsoDouala.nullable(),
});
export type DepartGare = z.infer<typeof SchemaDepartGare>;

export const SchemaParamsSuperviseurGare = z.object({ gareId: SchemaId.optional() });
export type ParamsSuperviseurGare = z.infer<typeof SchemaParamsSuperviseurGare>;

/** L'accueil du superviseur de gare : demandes à valider, guichets, départs (planche « Superviseur »). */
export const SchemaSuperviseurGare = z.object({
  gare: z.object({ id: SchemaId, nom: z.string().min(1) }),
  superviseur: SchemaPersonneRef,
  at: SchemaIsoDouala,
  quais: z.number().int().min(0),
  synchro: z.object({ synchronises: z.number().int().min(0), total: z.number().int().min(0) }),
  demandes: z.array(SchemaDemandeSuperviseur),
  guichets: z.array(SchemaGuichetSuperviseur),
  apresMidi: z.array(SchemaDepartGare),
});
export type SuperviseurGare = z.infer<typeof SchemaSuperviseurGare>;

/* ------------------------------------------------------------------ valider une clôture */

export const SchemaParamsSuperviseurCloture = z.object({ sessionId: SchemaId });
export type ParamsSuperviseurCloture = z.infer<typeof SchemaParamsSuperviseurCloture>;

/** Valider la clôture d'un guichet avec le PIN (planche « SuperviseurValider »). */
export const SchemaSuperviseurCloture = z.object({
  sessionId: SchemaId,
  numero: z.string().min(1),
  guichetRang: z.number().int().min(1),
  agent: SchemaPersonneRef,
  clotureeA: SchemaIsoDouala,
  periode: z.object({ debut: SchemaIsoDouala, fin: SchemaIsoDouala }),
  bilan: z.object({
    attendu: SchemaFcfaPositif,
    compte: SchemaFcfaPositif,
    ecart: SchemaFcfa,
    statut: SchemaStatutEcart,
  }),
  resume: z.object({
    billetsCash: z.number().int().min(0),
    colis: z.number().int().min(0),
    annulationsValidees: z.number().int().min(0),
  }),
  controles: z.object({
    tolerance: z.object({ montant: SchemaFcfaPositif, dansLaLimite: z.boolean() }),
    historiqueAgent: z.object({
      jours: z.number().int().min(1),
      ecartsNegatifs: z.number().int().min(0),
      total: SchemaFcfa,
    }),
    /** Billets de cadence encore sans nom aujourd'hui. */
    cadenceSansNom: z.number().int().min(0),
  }),
  /** Commentaire proposé, visible par le patron. */
  commentaire: z.string().nullable(),
  pin: z.object({
    superviseur: SchemaPersonneRef,
    longueur: z.number().int().min(4),
    empreinteDisponible: z.boolean(),
    essaisMax: z.number().int().min(1),
    blocageMinutes: z.number().int().min(1),
  }),
});
export type SuperviseurCloture = z.infer<typeof SchemaSuperviseurCloture>;

/** « Valider · écart signé » : le superviseur met son PIN, l'écart est tracé. */
export const EVENEMENT_CAISSE_VALIDEE = definirEvenement({
  type: "caisse.validee",
  numerote: false,
  donnees: z.object({
    sessionId: SchemaId,
    ecart: SchemaFcfa,
    commentaire: z.string().nullable(),
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "session", id: d.sessionId }),
});

/** « Refuser · recompter » : la session redevient ouverte. */
export const EVENEMENT_CAISSE_REFUSEE = definirEvenement({
  type: "caisse.refusee",
  numerote: false,
  donnees: z.object({
    sessionId: SchemaId,
    motif: z.string().nullable(),
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "session", id: d.sessionId }),
});

export const SchemaResultatValidationCaisse = SchemaResultatSimple.extend({
  session: z.object({
    sessionId: SchemaId,
    etat: z.enum(ETATS_SESSION),
    ecart: SchemaFcfa,
  }),
});
export type ResultatValidationCaisse = z.infer<typeof SchemaResultatValidationCaisse>;

/* ------------------------------------------------------------------ annulations */

export const SchemaDecisionAnnulation = z.enum(["rembourser", "reporter", "avoir", "refuser"]);
export type DecisionAnnulationAgence = z.infer<typeof SchemaDecisionAnnulation>;

export const SchemaParamsSuperviseurAnnulation = z.object({ demandeId: SchemaId });
export type ParamsSuperviseurAnnulation = z.infer<typeof SchemaParamsSuperviseurAnnulation>;

/** Voir et décider une demande d'annulation avec le PIN (planche « SuperviseurVoir »). */
export const SchemaSuperviseurAnnulation = z.object({
  demandeId: SchemaId,
  demandeA: SchemaIsoDouala,
  guichetRang: z.number().int().min(1),
  demandeur: SchemaPersonneRef,
  billet: z.object({
    billetId: SchemaId,
    numero: z.string().min(1),
    sequence: SchemaSequence,
    prix: SchemaFcfaPositif,
    etat: z.enum(ETATS_BILLET),
    depart: SchemaDepartResume.omit({ placesLibres: true }).extend({
      siege: z.number().int().min(1),
    }),
    voyageur: z.object({
      nom: z.string().min(1),
      pieceQuatreDerniers: SchemaPieceQuatreDerniers.nullable(),
    }),
    vendu: z.object({
      at: SchemaIsoDouala,
      guichetRang: z.number().int().min(1),
      mode: z.enum(["cash", "momo", "orange_money"]),
      agent: SchemaPersonneRef,
    }),
    motif: z.string().min(1),
  }),
  /** Ce que l'app a vérifié avant de demander le PIN. */
  verifications: z.object({
    scanne: z.boolean(),
    siegeLiberable: z.boolean(),
    /** Selon les règles de l'agence : remboursement intégral ou retenue. */
    remboursementIntegral: z.boolean(),
    retenue: SchemaFcfaPositif,
    annulationsAgentAujourdhui: z.number().int().min(0),
    annulationsAgent10Jours: z.number().int().min(0),
    moyenneGuichets: z.number().int().min(0),
    clientPresent: z.boolean(),
    pieceVue: z.boolean(),
    aRendreCash: SchemaFcfaPositif,
  }),
  decisionsPossibles: z.array(SchemaDecisionAnnulation),
  decisionProposee: SchemaDecisionAnnulation,
});
export type SuperviseurAnnulation = z.infer<typeof SchemaSuperviseurAnnulation>;

/** Un guichetier demande l'annulation d'un billet ; il ne peut pas annuler seul. */
export const EVENEMENT_ANNULATION_DEMANDEE = definirEvenement({
  type: "annulation.demandee",
  numerote: false,
  donnees: z.object({
    demandeId: SchemaId,
    billetId: SchemaId,
    motif: z.string().min(1),
  }),
  cible: (d) => ({ type: "demande", id: d.demandeId }),
});

/**
 * Le superviseur décide : rembourser, reporter à demain, avoir, ou refuser. Le billet annulé garde
 * son numéro (voir `annulerBillet` du domaine).
 */
export const EVENEMENT_ANNULATION_DECIDEE = definirEvenement({
  type: "annulation.decidee",
  numerote: false,
  donnees: z.object({
    demandeId: SchemaId,
    billetId: SchemaId,
    decision: SchemaDecisionAnnulation,
    /** Montant remboursé ou crédité ; 0 pour un report ou un refus. */
    montant: SchemaFcfaPositif,
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "demande", id: d.demandeId }),
});

export const SchemaResultatAnnulation = SchemaResultatSimple.extend({
  billet: z.object({
    billetId: SchemaId,
    numero: z.string().min(1),
    etat: z.enum(ETATS_BILLET),
  }),
  decision: SchemaDecisionAnnulation,
  montant: SchemaFcfaPositif,
  siegeLibere: z.boolean(),
});
export type ResultatAnnulation = z.infer<typeof SchemaResultatAnnulation>;

export const SchemaResultatDemandeAnnulation = SchemaResultatSimple.extend({
  demandeId: SchemaId,
  /** La demande attend le PIN d'un superviseur. */
  statut: z.literal("en_attente_du_pin"),
});
export type ResultatDemandeAnnulation = z.infer<typeof SchemaResultatDemandeAnnulation>;

/* ------------------------------------------------------------------ équipe */

export const SchemaEtatPin = z.enum(["ok", "a_renouveler", "bloque"]);
export type EtatPin = z.infer<typeof SchemaEtatPin>;

export const SchemaPersonneEquipe = z.object({
  personneId: SchemaId,
  initiales: z.string().min(1).max(3),
  /** « Joseph M. » */
  nom: z.string().min(1),
  role: SchemaRoleEquipe,
  /** « guichet 2 », « LT 412 AB » */
  affectation: z.string().nullable(),
  statut: z.enum(["en_service", "a_bord", "bloquee"]),
  pin: z.object({
    etat: SchemaEtatPin,
    /** Nombre de PIN faux quand le compte est bloqué. */
    fauxEssais: z.number().int().min(0),
    bloqueA: SchemaIsoDouala.nullable(),
  }),
  /** Alerte à lire d'un coup d'œil : « 3 écarts en 10 jours ». */
  alerte: z.string().nullable(),
  /** Situation du jour : « en route vers Yaoundé ». */
  situation: z.string().nullable(),
});
export type PersonneEquipe = z.infer<typeof SchemaPersonneEquipe>;

export const SchemaActionEquipe = z.enum([
  "renouveler_pin",
  "changer_affectation",
  "voir_journal",
  "desactiver",
]);
export type ActionEquipe = z.infer<typeof SchemaActionEquipe>;

export const SchemaParamsSuperviseurEquipe = z.object({ gareId: SchemaId.optional() });
export type ParamsSuperviseurEquipe = z.infer<typeof SchemaParamsSuperviseurEquipe>;

/** L'équipe de la gare : un compte et un PIN chacun (planche « SuperviseurEquipe »). */
export const SchemaSuperviseurEquipe = z.object({
  gare: z.object({ id: SchemaId, nom: z.string().min(1) }),
  effectif: z.number().int().min(0),
  enService: z.array(SchemaPersonneEquipe),
  autres: z.object({ nombre: z.number().int().min(0), detail: z.string().nullable() }),
  /** La personne dont la fiche est ouverte. */
  fiche: z
    .object({
      personneId: SchemaId,
      nom: z.string().min(1),
      role: SchemaRoleEquipe,
      /** « depuis le 5 janv. » : tel qu'écrit par la fiche, sans année. */
      depuisLibelle: z.string().min(1),
      billets: z.number().int().min(0),
      actions: z.array(SchemaActionEquipe),
      personnesADebloquer: z.array(SchemaPersonneRef),
    })
    .nullable(),
  /** Durée de validité d'un PIN provisoire envoyé par SMS, en minutes. */
  pinProvisoireMinutes: z.number().int().min(1),
});
export type SuperviseurEquipe = z.infer<typeof SchemaSuperviseurEquipe>;

/** Renouveler le PIN d'une personne : un PIN provisoire part par SMS, à changer à la connexion. */
export const EVENEMENT_EQUIPE_PIN_RENOUVELE = definirEvenement({
  type: "equipe.pin_renouvele",
  numerote: false,
  donnees: z.object({
    personneId: SchemaId,
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "personne", id: d.personneId }),
});

/** Changer une personne de guichet ou de rôle. */
export const EVENEMENT_EQUIPE_AFFECTATION_CHANGEE = definirEvenement({
  type: "equipe.affectation_changee",
  numerote: false,
  donnees: z.object({
    personneId: SchemaId,
    guichetId: SchemaId.nullable(),
    role: SchemaRoleEquipe.nullable(),
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "personne", id: d.personneId }),
});

/** Désactiver un compte : immédiat, le patron est prévenu. */
export const EVENEMENT_EQUIPE_COMPTE_DESACTIVE = definirEvenement({
  type: "equipe.compte_desactive",
  numerote: false,
  donnees: z.object({
    personneId: SchemaId,
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "personne", id: d.personneId }),
});

/** Débloquer une personne dont le compte est bloqué après 3 PIN faux. */
export const EVENEMENT_EQUIPE_PERSONNE_DEBLOQUEE = definirEvenement({
  type: "equipe.personne_debloquee",
  numerote: false,
  donnees: z.object({
    personneId: SchemaId,
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "personne", id: d.personneId }),
});

export const SchemaResultatEquipe = SchemaResultatSimple.extend({
  personne: z.object({
    personneId: SchemaId,
    actif: z.boolean(),
    pin: SchemaEtatPin,
    /** Le PIN provisoire est parti par SMS ; il n'est jamais renvoyé ici. */
    smsProvisoireEnvoye: z.boolean(),
  }),
});
export type ResultatEquipe = z.infer<typeof SchemaResultatEquipe>;

/* ------------------------------------------------------------------ appareils bloqués */

export const SchemaOptionDeblocage = z.enum(["synchroniser", "debloquer_4h", "telephone_secours"]);
export type OptionDeblocage = z.infer<typeof SchemaOptionDeblocage>;

export const SchemaParamsSuperviseurAppareil = z.object({ appareilId: SchemaId });
export type ParamsSuperviseurAppareil = z.infer<typeof SchemaParamsSuperviseurAppareil>;

/** Un téléphone de guichet hors ligne depuis plus de 12 h (planche « SuperviseurDebloquer »). */
export const SchemaSuperviseurAppareil = z.object({
  appareil: z.object({
    id: SchemaId,
    /** « GU3-DLA » */
    code: z.string().min(1),
    guichetRang: z.number().int().min(1),
    gareId: SchemaId,
  }),
  etat: z.enum(["bloque", "en_ligne", "debloque_temporairement"]),
  derniereSyncA: SchemaIsoDouala,
  horsLigneMinutes: z.number().int().min(0),
  limiteHeures: z.number().int().min(1),
  enAttente: z.object({
    ventes: z.number().int().min(0),
    colis: z.number().int().min(0),
    cash: SchemaFcfaPositif,
    plage: z.object({
      debut: SchemaSequence,
      fin: SchemaSequence,
      /** Numéros manquants dans la plage : vide quand la plage est sans trou. */
      trous: z.array(SchemaSequence),
    }),
  }),
  diagnostics: z.array(
    z.object({ niveau: z.enum(["alerte", "info"]), constat: z.string().min(1) }),
  ),
  options: z.array(
    z.object({
      rang: z.number().int().min(1),
      option: SchemaOptionDeblocage,
      recommande: z.boolean(),
    }),
  ),
  rappelSupport: z.boolean(),
});
export type SuperviseurAppareil = z.infer<typeof SchemaSuperviseurAppareil>;

/**
 * Débloquer un appareil hors ligne : synchroniser via le téléphone du superviseur, accorder 4 h de
 * plus, ou basculer sur le téléphone de secours. Toujours avec le PIN du superviseur.
 */
export const EVENEMENT_APPAREIL_DEBLOQUE = definirEvenement({
  type: "appareil.debloque",
  numerote: false,
  donnees: z.object({
    appareilId: SchemaId,
    option: SchemaOptionDeblocage,
    validePar: SchemaValidationSuperviseur,
  }),
  cible: (d) => ({ type: "appareil", id: d.appareilId }),
});

export const SchemaResultatDeblocage = SchemaResultatSimple.extend({
  appareil: z.object({
    id: SchemaId,
    etat: z.enum(["bloque", "en_ligne", "debloque_temporairement"]),
    debloqueJusqua: SchemaIsoDouala.nullable(),
    ventesSynchronisees: z.number().int().min(0),
  }),
});
export type ResultatDeblocage = z.infer<typeof SchemaResultatDeblocage>;

/* ------------------------------------------------------------------ temps réel de la gare */

export const SchemaParamsGareDirect = z.object({ gareId: SchemaId.optional() });
export type ParamsGareDirect = z.infer<typeof SchemaParamsGareDirect>;

/** Message du canal de la gare : nouvelle demande, mouvement d'un guichet, remplissage d'un départ. */
export const SchemaMessageGare = z.discriminatedUnion("type", [
  z.object({ type: z.literal("demande"), at: SchemaIsoDouala, demande: SchemaDemandeSuperviseur }),
  z.object({
    type: z.literal("guichet"),
    at: SchemaIsoDouala,
    guichet: SchemaGuichetSuperviseur,
  }),
  z.object({
    type: z.literal("remplissage"),
    at: SchemaIsoDouala,
    departId: SchemaId,
    vendus: z.number().int().min(0),
    capacite: z.number().int().min(1),
  }),
]);
export type MessageGare = z.infer<typeof SchemaMessageGare>;
