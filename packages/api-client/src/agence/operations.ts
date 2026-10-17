import { agence as c } from "@afrimove/contrats";
import type { z } from "zod";
import { definirCanal, definirOperation } from "../infra/index";
import type { Operation } from "../infra/index";

/**
 * Contrats d'API de l'agence : une déclaration par opération, partagée par l'adaptateur HTTP et
 * l'adaptateur mock. Les schémas viennent de `@afrimove/contrats` (`agence`).
 *
 * - Lectures : `GET`, idempotentes, mises en cache par `useRequete`.
 * - Écritures : `POST` d'un événement (voir `definirEcriture`).
 */

/* ------------------------------------------------------------------ lectures */

export const OP_GUICHET_ACCUEIL = definirOperation<void, c.GuichetAccueil>({
  nom: "agence.guichet.accueil",
  methode: "GET",
  chemin: () => "/agence/guichet/accueil",
  reponse: c.SchemaGuichetAccueil,
});

export const OP_CAISSE_SESSION = definirOperation<c.ParamsCaisseSession, c.CaisseSession>({
  nom: "agence.caisse.session",
  methode: "GET",
  chemin: () => "/agence/caisse/session",
  requete: (p) => ({ sessionId: p.sessionId }),
  reponse: c.SchemaCaisseSession,
});

export const OP_VENTE_CONTEXTE = definirOperation<c.ParamsVenteContexte, c.VenteContexte>({
  nom: "agence.vente.contexte",
  methode: "GET",
  chemin: () => "/agence/vente/contexte",
  requete: (p) => ({ guichetId: p.guichetId }),
  reponse: c.SchemaVenteContexte,
});

export const OP_CADENCE_ETAT = definirOperation<c.ParamsCadenceEtat, c.CadenceEtat>({
  nom: "agence.cadence.etat",
  methode: "GET",
  chemin: () => "/agence/cadence",
  requete: (p) => ({ departId: p.departId }),
  reponse: c.SchemaCadenceEtat,
});

export const OP_CADENCE_BILLET = definirOperation<c.ParamsCadenceBillet, c.CadenceBillet>({
  nom: "agence.cadence.billet",
  methode: "GET",
  chemin: (p) => `/agence/cadence/billets/${encodeURIComponent(p.billetId)}`,
  reponse: c.SchemaCadenceBillet,
});

export const OP_COLIS_FORMULAIRE = definirOperation<c.ParamsColisFormulaire, c.ColisFormulaire>({
  nom: "agence.colis.formulaire",
  methode: "GET",
  chemin: () => "/agence/colis/formulaire",
  requete: (p) => ({ guichetId: p.guichetId }),
  reponse: c.SchemaColisFormulaire,
});

export const OP_COLIS_DEPOT = definirOperation<c.ParamsColisDepot, c.ColisDepot>({
  nom: "agence.colis.depot",
  methode: "GET",
  chemin: () => "/agence/colis/depot",
  requete: (p) => ({ code: p.code }),
  reponse: c.SchemaColisDepot,
});

export const OP_IMPRESSION_ETAT = definirOperation<void, c.ImpressionEtat>({
  nom: "agence.impression.etat",
  methode: "GET",
  chemin: () => "/agence/impression",
  reponse: c.SchemaImpressionEtat,
});

export const OP_QUAI_EMBARQUEMENT = definirOperation<c.ParamsQuaiEmbarquement, c.QuaiEmbarquement>({
  nom: "agence.quai.embarquement",
  methode: "GET",
  chemin: () => "/agence/quai/embarquement",
  requete: (p) => ({ departId: p.departId }),
  reponse: c.SchemaQuaiEmbarquement,
});

export const OP_QUAI_CADENCE = definirOperation<c.ParamsQuaiCadence, c.QuaiCadence>({
  nom: "agence.quai.cadence",
  methode: "GET",
  chemin: () => "/agence/quai/cadence",
  requete: (p) => ({ departId: p.departId }),
  reponse: c.SchemaQuaiCadence,
});

export const OP_CONVOYEUR_ETAT = definirOperation<c.ParamsDepartBord, c.ConvoyeurEtat>({
  nom: "agence.bus.convoyeur",
  methode: "GET",
  chemin: () => "/agence/bus/convoyeur",
  requete: (p) => ({ departId: p.departId }),
  reponse: c.SchemaConvoyeurEtat,
});

export const OP_CHAUFFEUR_FEUILLE = definirOperation<c.ParamsDepartBord, c.ChauffeurFeuille>({
  nom: "agence.bus.chauffeur",
  methode: "GET",
  chemin: () => "/agence/bus/chauffeur",
  requete: (p) => ({ departId: p.departId }),
  reponse: c.SchemaChauffeurFeuille,
});

export const OP_CONTROLE_INOPINE = definirOperation<c.ParamsControleInopine, c.ControleInopine>({
  nom: "agence.controle.inopine",
  methode: "GET",
  chemin: () => "/agence/controle/inopine",
  requete: (p) => ({ controleId: p.controleId }),
  reponse: c.SchemaControleInopine,
});

export const OP_SUPERVISEUR_GARE = definirOperation<c.ParamsSuperviseurGare, c.SuperviseurGare>({
  nom: "agence.superviseur.gare",
  methode: "GET",
  chemin: () => "/agence/superviseur/gare",
  requete: (p) => ({ gareId: p.gareId }),
  reponse: c.SchemaSuperviseurGare,
});

export const OP_SUPERVISEUR_CLOTURE = definirOperation<
  c.ParamsSuperviseurCloture,
  c.SuperviseurCloture
>({
  nom: "agence.superviseur.cloture",
  methode: "GET",
  chemin: (p) => `/agence/superviseur/clotures/${encodeURIComponent(p.sessionId)}`,
  reponse: c.SchemaSuperviseurCloture,
});

export const OP_SUPERVISEUR_ANNULATION = definirOperation<
  c.ParamsSuperviseurAnnulation,
  c.SuperviseurAnnulation
>({
  nom: "agence.superviseur.annulation",
  methode: "GET",
  chemin: (p) => `/agence/superviseur/annulations/${encodeURIComponent(p.demandeId)}`,
  reponse: c.SchemaSuperviseurAnnulation,
});

export const OP_SUPERVISEUR_EQUIPE = definirOperation<
  c.ParamsSuperviseurEquipe,
  c.SuperviseurEquipe
>({
  nom: "agence.superviseur.equipe",
  methode: "GET",
  chemin: () => "/agence/superviseur/equipe",
  requete: (p) => ({ gareId: p.gareId }),
  reponse: c.SchemaSuperviseurEquipe,
});

export const OP_SUPERVISEUR_APPAREIL = definirOperation<
  c.ParamsSuperviseurAppareil,
  c.SuperviseurAppareil
>({
  nom: "agence.superviseur.appareil",
  methode: "GET",
  chemin: (p) => `/agence/superviseur/appareils/${encodeURIComponent(p.appareilId)}`,
  reponse: c.SchemaSuperviseurAppareil,
});

export const OP_JOURNAL = definirOperation<c.ParamsJournal, c.Journal>({
  nom: "agence.journal.lister",
  methode: "GET",
  chemin: () => "/agence/journal",
  requete: (p) => ({
    personneId: p.personneId,
    sessionId: p.sessionId,
    jour: p.jour,
    apres: p.apres,
    limite: p.limite,
  }),
  reponse: c.SchemaJournal,
});

/** Toutes les lectures de l'agence (utile aux tests et à la documentation). */
export const LECTURES_AGENCE = [
  OP_GUICHET_ACCUEIL,
  OP_CAISSE_SESSION,
  OP_VENTE_CONTEXTE,
  OP_CADENCE_ETAT,
  OP_CADENCE_BILLET,
  OP_COLIS_FORMULAIRE,
  OP_COLIS_DEPOT,
  OP_IMPRESSION_ETAT,
  OP_QUAI_EMBARQUEMENT,
  OP_QUAI_CADENCE,
  OP_CONVOYEUR_ETAT,
  OP_CHAUFFEUR_FEUILLE,
  OP_CONTROLE_INOPINE,
  OP_SUPERVISEUR_GARE,
  OP_SUPERVISEUR_CLOTURE,
  OP_SUPERVISEUR_ANNULATION,
  OP_SUPERVISEUR_EQUIPE,
  OP_SUPERVISEUR_APPAREIL,
  OP_JOURNAL,
] as const;

/* ------------------------------------------------------------------ écritures (événements) */

// `any` : la définition est contravariante en ses données, on ne la contraint pas ici.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DefinitionEvenementQuelconque = c.DefinitionEvenement<string, any, boolean>;

/**
 * Une écriture de l'agence : un événement `POST`é tel quel.
 *
 * L'opération est **idempotente** : l'identifiant d'événement (UUID créé sur l'appareil) est la
 * clé d'idempotence, le serveur répond `deja_recu` à un rejeu. L'adaptateur HTTP peut donc la
 * relancer après une coupure sans risque de doublon, et le moteur hors ligne (AM-160) la rejouer
 * au retour du réseau.
 */
export interface EcritureAgence<E extends DefinitionEvenementQuelconque, R> {
  readonly evenement: E;
  readonly operation: Operation<c.EvenementDe<E>, R>;
}

export function definirEcriture<E extends DefinitionEvenementQuelconque, R>(
  evenement: E,
  chemin: string,
  reponse: z.ZodType<R>,
): EcritureAgence<E, R> {
  return {
    evenement,
    operation: definirOperation<c.EvenementDe<E>, R>({
      nom: `agence.${evenement.type}`,
      methode: "POST",
      chemin: () => chemin,
      corps: (evenementEnvoye) => evenementEnvoye,
      reponse,
      idempotente: true,
    }),
  };
}

export const ECRITURES = {
  // caisse
  caisseOuverte: definirEcriture(
    c.EVENEMENT_CAISSE_OUVERTE,
    "/agence/caisse/ouverture",
    c.SchemaResultatCaisse,
  ),
  caisseComptee: definirEcriture(
    c.EVENEMENT_CAISSE_COMPTEE,
    "/agence/caisse/comptage",
    c.SchemaResultatCaisse,
  ),
  caisseCloturee: definirEcriture(
    c.EVENEMENT_CAISSE_CLOTUREE,
    "/agence/caisse/cloture",
    c.SchemaResultatCaisse,
  ),
  // vente au guichet et cadence
  billetVendu: definirEcriture(c.EVENEMENT_BILLET_VENDU, "/agence/billets", c.SchemaResultatVente),
  billetVenduCadence: definirEcriture(
    c.EVENEMENT_BILLET_VENDU_CADENCE,
    "/agence/cadence/billets",
    c.SchemaResultatCadence,
  ),
  billetTelephoneAjoute: definirEcriture(
    c.EVENEMENT_BILLET_TELEPHONE_AJOUTE,
    "/agence/billets/telephone",
    c.SchemaResultatSimple,
  ),
  // colis
  colisEnregistre: definirEcriture(
    c.EVENEMENT_COLIS_ENREGISTRE,
    "/agence/colis",
    c.SchemaResultatColis,
  ),
  colisDepose: definirEcriture(
    c.EVENEMENT_COLIS_DEPOSE,
    "/agence/colis/depot",
    c.SchemaResultatDepot,
  ),
  // impression
  impressionDemandee: definirEcriture(
    c.EVENEMENT_IMPRESSION_DEMANDEE,
    "/agence/impressions",
    c.SchemaResultatImpression,
  ),
  // quai
  quaiScanne: definirEcriture(
    c.EVENEMENT_QUAI_SCANNE,
    "/agence/quai/scans",
    c.SchemaResultatScanQuai,
  ),
  quaiCodeSaisi: definirEcriture(
    c.EVENEMENT_QUAI_CODE_SAISI,
    "/agence/quai/codes",
    c.SchemaResultatScanQuai,
  ),
  billetComplete: definirEcriture(
    c.EVENEMENT_BILLET_COMPLETE,
    "/agence/quai/completions",
    c.SchemaResultatCompletion,
  ),
  quaiLibere: definirEcriture(
    c.EVENEMENT_QUAI_LIBERE,
    "/agence/quai/liberations",
    c.SchemaResultatLiberation,
  ),
  quaiListeEnvoyee: definirEcriture(
    c.EVENEMENT_QUAI_LISTE_ENVOYEE,
    "/agence/quai/listes",
    c.SchemaResultatListeChauffeur,
  ),
  // convoyeur
  routeBilletVendu: definirEcriture(
    c.EVENEMENT_ROUTE_BILLET_VENDU,
    "/agence/bus/ventes",
    c.SchemaResultatVenteRoute,
  ),
  routeScanne: definirEcriture(
    c.EVENEMENT_ROUTE_SCANNE,
    "/agence/bus/scans",
    c.SchemaResultatScanRoute,
  ),
  routeColisDecharges: definirEcriture(
    c.EVENEMENT_ROUTE_COLIS_DECHARGES,
    "/agence/bus/dechargements",
    c.SchemaResultatDechargement,
  ),
  // chauffeur
  chauffeurDepense: definirEcriture(
    c.EVENEMENT_CHAUFFEUR_DEPENSE,
    "/agence/bus/depenses",
    c.SchemaResultatDepense,
  ),
  chauffeurIncident: definirEcriture(
    c.EVENEMENT_CHAUFFEUR_INCIDENT,
    "/agence/bus/incidents",
    c.SchemaResultatPrevenus,
  ),
  chauffeurRetard: definirEcriture(
    c.EVENEMENT_CHAUFFEUR_RETARD,
    "/agence/bus/retards",
    c.SchemaResultatPrevenus,
  ),
  chauffeurArriveeArret: definirEcriture(
    c.EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET,
    "/agence/bus/arrivees",
    c.SchemaResultatSimple,
  ),
  // contrôle inopiné
  controleSiegeVerifie: definirEcriture(
    c.EVENEMENT_CONTROLE_SIEGE_VERIFIE,
    "/agence/controle/sieges",
    c.SchemaResultatControle,
  ),
  controleRegularise: definirEcriture(
    c.EVENEMENT_CONTROLE_REGULARISE,
    "/agence/controle/regularisations",
    c.SchemaResultatRegularisation,
  ),
  controleConvoyeurSignale: definirEcriture(
    c.EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE,
    "/agence/controle/signalements",
    c.SchemaResultatControle,
  ),
  controleCloture: definirEcriture(
    c.EVENEMENT_CONTROLE_CLOTURE,
    "/agence/controle/clotures",
    c.SchemaResultatControle,
  ),
  // supervision
  annulationDemandee: definirEcriture(
    c.EVENEMENT_ANNULATION_DEMANDEE,
    "/agence/annulations",
    c.SchemaResultatDemandeAnnulation,
  ),
  annulationDecidee: definirEcriture(
    c.EVENEMENT_ANNULATION_DECIDEE,
    "/agence/superviseur/annulations",
    c.SchemaResultatAnnulation,
  ),
  caisseValidee: definirEcriture(
    c.EVENEMENT_CAISSE_VALIDEE,
    "/agence/superviseur/validations",
    c.SchemaResultatValidationCaisse,
  ),
  caisseRefusee: definirEcriture(
    c.EVENEMENT_CAISSE_REFUSEE,
    "/agence/superviseur/refus",
    c.SchemaResultatValidationCaisse,
  ),
  equipePinRenouvele: definirEcriture(
    c.EVENEMENT_EQUIPE_PIN_RENOUVELE,
    "/agence/superviseur/equipe/pin",
    c.SchemaResultatEquipe,
  ),
  equipeAffectationChangee: definirEcriture(
    c.EVENEMENT_EQUIPE_AFFECTATION_CHANGEE,
    "/agence/superviseur/equipe/affectation",
    c.SchemaResultatEquipe,
  ),
  equipeCompteDesactive: definirEcriture(
    c.EVENEMENT_EQUIPE_COMPTE_DESACTIVE,
    "/agence/superviseur/equipe/desactivation",
    c.SchemaResultatEquipe,
  ),
  equipePersonneDebloquee: definirEcriture(
    c.EVENEMENT_EQUIPE_PERSONNE_DEBLOQUEE,
    "/agence/superviseur/equipe/deblocage",
    c.SchemaResultatEquipe,
  ),
  appareilDebloque: definirEcriture(
    c.EVENEMENT_APPAREIL_DEBLOQUE,
    "/agence/superviseur/appareils/deblocage",
    c.SchemaResultatDeblocage,
  ),
} as const;

export type NomEcriture = keyof typeof ECRITURES;

/** Toutes les écritures, dans l'ordre de déclaration. */
export const LISTE_ECRITURES = Object.values(ECRITURES);

/* ------------------------------------------------------------------ temps réel */

export const CANAL_QUAI = definirCanal<c.ParamsQuaiDirect, c.MessageQuai>({
  nom: "agence.quai.direct",
  chemin: (p) => `/agence/quai/${encodeURIComponent(p.departId)}/direct`,
  message: c.SchemaMessageQuai,
});

export const CANAL_GARE = definirCanal<c.ParamsGareDirect, c.MessageGare>({
  nom: "agence.gare.direct",
  chemin: (p) =>
    p.gareId ? `/agence/gares/${encodeURIComponent(p.gareId)}/direct` : "/agence/gare/direct",
  message: c.SchemaMessageGare,
});
