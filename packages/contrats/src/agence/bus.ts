import { z } from "zod";
import {
  SchemaCodeBillet,
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaId,
  SchemaIsoDouala,
  SchemaPaiement,
  SchemaPersonneRef,
  SchemaPieceQuatreDerniers,
  SchemaTelephone,
} from "./commun";
import { SchemaResultatSimple, definirEvenement } from "./evenements";

/* ------------------------------------------------------------------ communs à bord */

export const SchemaBusRef = z.object({
  id: SchemaId,
  immatriculation: z.string().min(1),
});
export type BusRef = z.infer<typeof SchemaBusRef>;

/** Position GPS relevée au moment du geste (vente en route, incident). */
export const SchemaPositionGps = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Précision en mètres. */
  precisionM: z.number().min(0),
});
export type PositionGps = z.infer<typeof SchemaPositionGps>;

export const SchemaParamsDepartBord = z.object({ departId: SchemaId.optional() });
export type ParamsDepartBord = z.infer<typeof SchemaParamsDepartBord>;

/* ------------------------------------------------------------------ convoyeur */

/** Le convoyeur à bord, sans réseau : scans, vente en route, colis à décharger (planche « Convoyeur »). */
export const SchemaConvoyeurEtat = z.object({
  convoyeur: SchemaPersonneRef,
  bus: SchemaBusRef,
  departId: SchemaId,
  trajet: z.object({
    origine: z.string().min(1),
    destination: z.string().min(1),
    partiA: SchemaIsoDouala,
  }),
  reseau: z.enum(["en_ligne", "hors_ligne"]),
  compteurs: z.object({
    scannesABord: z.number().int().min(0),
    sieges: z.object({
      libres: z.number().int().min(0),
      reservees: z.number().int().min(0),
      arretReservees: z.string().nullable(),
    }),
    ventesEnRoute: z.object({ nombre: z.number().int().min(0), montant: SchemaFcfaPositif }),
  }),
  /** La vente en route proposée, prête à valider (touche 1). */
  vente: z.object({
    arretMontee: z.string().min(1),
    destination: z.string().min(1),
    places: z.number().int().min(1),
    siege: z.number().int().min(1),
    /** Prix prorata fixé par l'agence pour ce tronçon. */
    prix: SchemaFcfaPositif,
    modes: z.array(z.enum(["cash", "momo"])),
    /** Saisie en cours : « Mballa J. · 6 55 … » (téléphone facultatif, possiblement partiel). */
    saisie: z.object({ nom: z.string(), telephone: z.string().nullable() }),
  }),
  colisADecharger: z.number().int().min(0),
  listeNominative: z.object({ aBord: z.number().int().min(0) }),
});
export type ConvoyeurEtat = z.infer<typeof SchemaConvoyeurEtat>;

/**
 * Vendre une place en route, hors ligne. Numérotée dans la plage du convoyeur (3001–3999), avec
 * l'heure et le lieu GPS que le patron voit le soir.
 */
export const EVENEMENT_ROUTE_BILLET_VENDU = definirEvenement({
  type: "route.billet_vendu",
  numerote: true,
  donnees: z.object({
    billetId: SchemaId,
    departId: SchemaId,
    arretMontee: z.string().min(1),
    arretDescente: z.string().min(1),
    siege: z.number().int().min(1),
    prix: SchemaFcfaPositif,
    passager: z.object({ nom: z.string().nullable(), telephone: SchemaTelephone.nullable() }),
    paiement: SchemaPaiement,
    codeBillet: SchemaCodeBillet,
    gps: SchemaPositionGps.nullable(),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

export const SchemaResultatVenteRoute = SchemaResultatSimple.extend({
  billet: z.object({
    billetId: SchemaId,
    numero: z.string().min(1),
    siege: z.number().int().min(1),
    prix: SchemaFcfaPositif,
    smsEnvoye: z.boolean(),
  }),
  ventesEnRoute: z.object({ nombre: z.number().int().min(0), montant: SchemaFcfaPositif }),
});
export type ResultatVenteRoute = z.infer<typeof SchemaResultatVenteRoute>;

/** Scanner les voyageurs qui montent à un arrêt. */
export const EVENEMENT_ROUTE_SCANNE = definirEvenement({
  type: "route.scanne",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    arret: z.string().min(1),
    qr: z.string().min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

export const SchemaResultatScanRoute = SchemaResultatSimple.extend({
  scannesABord: z.number().int().min(0),
});
export type ResultatScanRoute = z.infer<typeof SchemaResultatScanRoute>;

/** Décharger les colis destinés à un arrêt. */
export const EVENEMENT_ROUTE_COLIS_DECHARGES = definirEvenement({
  type: "route.colis_decharges",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    arret: z.string().min(1),
    colisIds: z.array(SchemaId).min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

export const SchemaResultatDechargement = SchemaResultatSimple.extend({
  colisRestants: z.number().int().min(0),
});
export type ResultatDechargement = z.infer<typeof SchemaResultatDechargement>;

/* ------------------------------------------------------------------ chauffeur */

export const SchemaCategorieDepense = z.enum(["carburant", "peage", "autre"]);
export type CategorieDepense = z.infer<typeof SchemaCategorieDepense>;

export const SchemaDepenseTrajet = z.object({
  depenseId: SchemaId,
  categorie: SchemaCategorieDepense,
  libelle: z.string().min(1),
  montant: SchemaFcfaPositif,
  /** Le justificatif photo est joint. */
  justificatif: z.boolean(),
});
export type DepenseTrajet = z.infer<typeof SchemaDepenseTrajet>;

/** La feuille de route du chauffeur : trajet, dépenses, incidents, semaine (planche « Chauffeur »). */
export const SchemaChauffeurFeuille = z.object({
  chauffeur: SchemaPersonneRef,
  bus: SchemaBusRef,
  /** AAAA-MM-JJ de la feuille de route. */
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gps: z.boolean(),
  trajet: z.object({
    departId: SchemaId,
    origine: z.string().min(1),
    destination: z.string().min(1),
    partiA: SchemaIsoDouala,
    aBord: z.number().int().min(0),
    colis: z.number().int().min(0),
    prochainArret: z.object({ nom: z.string().min(1), heure: SchemaIsoDouala }),
    vitesseKmh: z.number().int().min(0),
    limiteKmh: z.number().int().min(1),
  }),
  depenses: z.object({
    lignes: z.array(SchemaDepenseTrajet),
    total: SchemaFcfaPositif,
    categories: z.array(SchemaCategorieDepense),
  }),
  incidents: z.object({ retardParDefautMinutes: z.number().int().min(1) }),
  semaine: z.object({
    trajets: z.number().int().min(0),
    km: z.number().int().min(0),
    excesVitesse: z.number().int().min(0),
    aRecevoir: SchemaFcfaPositif,
    /** Jour de la paie par MoMo. */
    paieLe: z.enum(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]),
  }),
});
export type ChauffeurFeuille = z.infer<typeof SchemaChauffeurFeuille>;

/** Ajouter une dépense du trajet avec son justificatif photo (remboursée au rapport). */
export const EVENEMENT_CHAUFFEUR_DEPENSE = definirEvenement({
  type: "chauffeur.depense",
  numerote: false,
  donnees: z.object({
    depenseId: SchemaId,
    departId: SchemaId,
    categorie: SchemaCategorieDepense,
    libelle: z.string().min(1),
    montant: SchemaFcfaPositif,
    /** Référence de la photo du justificatif. */
    justificatifRef: z.string().min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

export const SchemaResultatDepense = SchemaResultatSimple.extend({
  depense: SchemaDepenseTrajet,
  totalDepenses: SchemaFcfaPositif,
});
export type ResultatDepense = z.infer<typeof SchemaResultatDepense>;

/** Incident en une touche : la gare et les voyageurs sont prévenus. */
export const EVENEMENT_CHAUFFEUR_INCIDENT = definirEvenement({
  type: "chauffeur.incident",
  numerote: false,
  donnees: z.object({
    incidentId: SchemaId,
    departId: SchemaId,
    nature: z.enum(["panne", "accident", "route_coupee", "autre"]),
    gps: SchemaPositionGps.nullable(),
    note: z.string().nullable(),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

/** Retard : un SMS automatique part à tous les voyageurs à bord. */
export const EVENEMENT_CHAUFFEUR_RETARD = definirEvenement({
  type: "chauffeur.retard",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    minutes: z.number().int().min(1),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

/** Arrivée à un arrêt : les portes s'ouvrent, le convoyeur scanne. */
export const EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET = definirEvenement({
  type: "chauffeur.arrivee_arret",
  numerote: false,
  donnees: z.object({
    departId: SchemaId,
    arret: z.string().min(1),
    gps: SchemaPositionGps.nullable(),
  }),
  cible: (d) => ({ type: "depart", id: d.departId }),
});

export const SchemaResultatPrevenus = SchemaResultatSimple.extend({
  /** Voyageurs prévenus par SMS. */
  voyageursPrevenus: z.number().int().min(0),
  garePrevenue: z.boolean(),
});
export type ResultatPrevenus = z.infer<typeof SchemaResultatPrevenus>;

/* ------------------------------------------------------------------ contrôle inopiné */

export const SchemaConstatSiege = z.enum(["scanne", "sans_billet", "libre"]);
export type ConstatSiege = z.infer<typeof SchemaConstatSiege>;

export const SchemaParamsControleInopine = z.object({ controleId: SchemaId.optional() });
export type ParamsControleInopine = z.infer<typeof SchemaParamsControleInopine>;

/** Le contrôle à bord : on compte les têtes, siège par siège (planche « Controleur »). */
export const SchemaControleInopine = z.object({
  controleId: SchemaId,
  controleur: SchemaPersonneRef,
  bus: SchemaBusRef,
  departId: SchemaId,
  lieu: z.string().min(1),
  at: SchemaIsoDouala,
  comptes: z.object({
    /** Billets valides sur la liste du départ. */
    liste: z.number().int().min(0),
    /** Têtes comptées à bord. */
    tetes: z.number().int().min(0),
    /** tetes − liste : positif = voyageurs sans billet. */
    ecart: SchemaFcfa,
  }),
  sieges: z.array(z.object({ numero: z.number().int().min(1), constat: SchemaConstatSiege })),
  /** Le voyageur sans billet que le contrôleur est en train de traiter. */
  sansBillet: z
    .object({
      siege: z.number().int().min(1),
      lieu: z.string().min(1),
      at: SchemaIsoDouala,
      /** Montant que le voyageur dit avoir payé au convoyeur. */
      montantDeclare: SchemaFcfaPositif,
      venteEnRouteTrouvee: z.boolean(),
    })
    .nullable(),
});
export type ControleInopine = z.infer<typeof SchemaControleInopine>;

/** Constater un siège (billet scanné, occupé sans billet, libre). */
export const EVENEMENT_CONTROLE_SIEGE_VERIFIE = definirEvenement({
  type: "controle.siege_verifie",
  numerote: false,
  donnees: z.object({
    controleId: SchemaId,
    departId: SchemaId,
    siege: z.number().int().min(1),
    constat: SchemaConstatSiege,
  }),
  cible: (d) => ({ type: "controle", id: d.controleId }),
});

/** Régulariser un voyageur sans billet : un billet est vendu sur place, numéroté dans la plage. */
export const EVENEMENT_CONTROLE_REGULARISE = definirEvenement({
  type: "controle.regularise",
  numerote: true,
  donnees: z.object({
    controleId: SchemaId,
    billetId: SchemaId,
    departId: SchemaId,
    siege: z.number().int().min(1),
    prix: SchemaFcfaPositif,
    paiement: SchemaPaiement,
    codeBillet: SchemaCodeBillet,
    passager: z.object({
      nom: z.string().nullable(),
      pieceQuatreDerniers: SchemaPieceQuatreDerniers.nullable(),
    }),
  }),
  cible: (d) => ({ type: "billet", id: d.billetId }),
});

/** Signaler le convoyeur : une vente en route non enregistrée. */
export const EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE = definirEvenement({
  type: "controle.convoyeur_signale",
  numerote: false,
  donnees: z.object({
    controleId: SchemaId,
    departId: SchemaId,
    convoyeurId: SchemaId,
    siege: z.number().int().min(1),
    montantDeclare: SchemaFcfaPositif,
    note: z.string().nullable(),
  }),
  cible: (d) => ({ type: "controle", id: d.controleId }),
});

/** Clore le contrôle : le constat part au patron. */
export const EVENEMENT_CONTROLE_CLOTURE = definirEvenement({
  type: "controle.cloture",
  numerote: false,
  donnees: z.object({
    controleId: SchemaId,
    departId: SchemaId,
    liste: z.number().int().min(0),
    tetes: z.number().int().min(0),
    ecart: SchemaFcfa,
  }),
  cible: (d) => ({ type: "controle", id: d.controleId }),
});

export const SchemaResultatControle = SchemaResultatSimple.extend({
  controle: z.object({
    controleId: SchemaId,
    comptes: z.object({
      liste: z.number().int().min(0),
      tetes: z.number().int().min(0),
      ecart: SchemaFcfa,
    }),
    clos: z.boolean(),
    envoyeAuPatron: z.boolean(),
  }),
});
export type ResultatControle = z.infer<typeof SchemaResultatControle>;

export const SchemaResultatRegularisation = SchemaResultatControle.extend({
  billet: z.object({ billetId: SchemaId, numero: z.string().min(1), prix: SchemaFcfaPositif }),
});
export type ResultatRegularisation = z.infer<typeof SchemaResultatRegularisation>;
