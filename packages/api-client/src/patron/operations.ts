import { patron as c } from "@afrimove/contrats";
import { definirCanal, definirOperation } from "../infra/operations";
import type { Operation } from "../infra/operations";

/**
 * Opérations et canaux de l'espace patron. Le contrat (chemin, schéma de réponse) vit ici une
 * seule fois et sert au mock comme au HTTP ; les schémas viennent de `@afrimove/contrats`.
 * Les écritures (`POST`/`PUT`) portent toutes une `signature` PIN dans leur corps (voir
 * `COMMANDES_SIGNEES` dans les contrats).
 */

const id = encodeURIComponent;

/* ----------------------------------------------------------------------- tableau du jour */

export const OP_TABLEAU_DU_JOUR = definirOperation<void, c.TableauDuJour>({
  nom: "patron.aujourdhui.tableau",
  methode: "GET",
  chemin: () => "/patron/aujourdhui",
  reponse: c.TableauDuJourSchema,
});

export const OP_ALERTES = definirOperation<void, c.ListeAlertes>({
  nom: "patron.aujourdhui.alertes",
  methode: "GET",
  chemin: () => "/patron/alertes",
  reponse: c.ListeAlertesSchema,
});

/** Chiffres du jour et nouvelles alertes, en direct. */
export const CANAL_DIRECT_JOUR = definirCanal<void, c.MessageDirectJour>({
  nom: "patron.direct",
  chemin: () => "/patron/direct",
  message: c.MessageDirectJourSchema,
});

/* ----------------------------------------------------------------------- gares et équipe */

export const OP_GARES = definirOperation<void, c.VueGares>({
  nom: "patron.gares.lister",
  methode: "GET",
  chemin: () => "/patron/gares",
  reponse: c.VueGaresSchema,
});

export const OP_GARE = definirOperation<{ gareId: string }, c.DetailGare>({
  nom: "patron.gares.detail",
  methode: "GET",
  chemin: (p) => `/patron/gares/${id(p.gareId)}`,
  reponse: c.DetailGareSchema,
});

export const OP_EQUIPE = definirOperation<c.FiltreEquipe, c.ListeEquipe>({
  nom: "patron.equipe.lister",
  methode: "GET",
  chemin: () => "/patron/equipe",
  requete: (p) => ({ role: p.role, recherche: p.recherche, gareId: p.gareId }),
  reponse: c.ListeEquipeSchema,
});

export const OP_FICHE_PERSONNE = definirOperation<{ personneId: string }, c.FichePersonne>({
  nom: "patron.personnes.fiche",
  methode: "GET",
  chemin: (p) => `/patron/personnes/${id(p.personneId)}`,
  reponse: c.FichePersonneSchema,
});

/* ----------------------------------------------------------------------- rapport du soir */

export const OP_RAPPORT_SOIR = definirOperation<c.ParamsRapportSoir, c.RapportSoir>({
  nom: "patron.rapport.soir",
  methode: "GET",
  chemin: () => "/patron/rapports/soir",
  requete: (p) => ({ jour: p.jour }),
  reponse: c.RapportSoirSchema,
});

/* ----------------------------------------------------------------------- analyses */

export const OP_ANALYSES = definirOperation<c.ParamsAnalyses, c.Analyses>({
  nom: "patron.analyses.synthese",
  methode: "GET",
  chemin: () => "/patron/analyses",
  requete: (p) => ({ periode: p.periode }),
  reponse: c.AnalysesSchema,
});

export const OP_ANALYSE_LIGNE = definirOperation<c.ParamsAnalyseLigne, c.AnalyseLigne>({
  nom: "patron.analyses.ligne",
  methode: "GET",
  chemin: (p) => `/patron/analyses/lignes/${id(p.ligneId)}`,
  requete: (p) => ({ periode: p.periode }),
  reponse: c.AnalyseLigneSchema,
});

export const OP_ANALYSE_BUS = definirOperation<c.ParamsAnalyseBus, c.AnalyseBus>({
  nom: "patron.analyses.bus",
  methode: "GET",
  chemin: (p) => `/patron/analyses/bus/${id(p.busId)}`,
  reponse: c.AnalyseBusSchema,
});

/* ----------------------------------------------------------------------- assistant */

export const OP_INSIGHTS = definirOperation<void, c.InsightsAssistant>({
  nom: "patron.assistant.insights",
  methode: "GET",
  chemin: () => "/patron/assistant/insights",
  reponse: c.InsightsAssistantSchema,
});

export const OP_CONVERSATION = definirOperation<void, c.ConversationAssistant>({
  nom: "patron.assistant.conversation",
  methode: "GET",
  chemin: () => "/patron/assistant/conversation",
  reponse: c.ConversationAssistantSchema,
});

/** Question libre en français : l'API répond sur les chiffres de la compagnie, sources citées. */
export const OP_QUESTION_ASSISTANT = definirOperation<c.QuestionAssistant, c.ReponseAssistant>({
  nom: "patron.assistant.question",
  methode: "POST",
  chemin: () => "/patron/assistant/questions",
  corps: (p) => p,
  reponse: c.ReponseAssistantSchema,
});

/** Simulation d'horaire ou de prix : ne change rien, donc rejouable. */
export const OP_SIMULATION = definirOperation<c.DemandeSimulation, c.ResultatSimulation>({
  nom: "patron.assistant.simuler",
  methode: "POST",
  chemin: () => "/patron/assistant/simulations",
  corps: (p) => p,
  reponse: c.ResultatSimulationSchema,
  idempotente: true,
});

export const OP_APPLIQUER_PROPOSITION = definirOperation<
  c.AppliquerProposition,
  c.PropositionAppliquee
>({
  nom: "patron.assistant.appliquer",
  methode: "POST",
  chemin: () => "/patron/assistant/propositions",
  corps: (p) => p,
  reponse: c.PropositionAppliqueeSchema,
});

/* ----------------------------------------------------------------------- comptable */

export const OP_COMPTABLE = definirOperation<c.ParamsMois, c.SyntheseComptable>({
  nom: "patron.comptable.synthese",
  methode: "GET",
  chemin: () => "/patron/comptable",
  requete: (p) => ({ mois: p.mois }),
  reponse: c.SyntheseComptableSchema,
});

export const OP_APERCU_EXPORT = definirOperation<c.ParamsApercuExport, c.ApercuExport>({
  nom: "patron.comptable.apercu",
  methode: "GET",
  chemin: (p) => `/patron/comptable/exports/${id(p.exportId)}/apercu`,
  requete: (p) => ({ mois: p.mois, onglet: p.onglet }),
  reponse: c.ApercuExportSchema,
});

/** Le vrai fichier d'un export (XLSX, CSV ou PDF), pour « Télécharger ». */
export const OP_FICHIER_EXPORT = definirOperation<c.ParamsFichierExport, c.FichierExport>({
  nom: "patron.comptable.fichier",
  methode: "GET",
  chemin: (p) => `/patron/comptable/exports/${id(p.exportId)}/fichier`,
  requete: (p) => ({ mois: p.mois }),
  reponse: c.FichierExportSchema,
  lecture: "binaire",
});

export const OP_RAPPROCHEMENT = definirOperation<c.ParamsMois, c.RapprochementMomo>({
  nom: "patron.comptable.rapprochement",
  methode: "GET",
  chemin: () => "/patron/comptable/rapprochement",
  requete: (p) => ({ mois: p.mois }),
  reponse: c.RapprochementMomoSchema,
});

export const OP_APPLIQUER_RAPPROCHEMENT = definirOperation<
  c.AppliquerRapprochement,
  c.RapprochementApplique
>({
  nom: "patron.comptable.rapprochement.appliquer",
  methode: "POST",
  chemin: () => "/patron/comptable/rapprochement/decisions",
  corps: (p) => p,
  reponse: c.RapprochementAppliqueSchema,
});

export const OP_CLOTURE = definirOperation<c.ParamsMois, c.ClotureMois>({
  nom: "patron.comptable.cloture",
  methode: "GET",
  chemin: () => "/patron/comptable/cloture",
  requete: (p) => ({ mois: p.mois }),
  reponse: c.ClotureMoisSchema,
});

export const OP_CLOTURER = definirOperation<c.CloturerMois, c.MoisCloture>({
  nom: "patron.comptable.cloturer",
  methode: "POST",
  chemin: () => "/patron/comptable/clotures",
  corps: (p) => p,
  reponse: c.MoisClotureSchema,
});

/* ----------------------------------------------------------------------- réglages */

export const OP_REGLAGES = definirOperation<void, c.Reglages>({
  nom: "patron.reglages.accueil",
  methode: "GET",
  chemin: () => "/patron/reglages",
  reponse: c.ReglagesSchema,
});

export const OP_LIGNE_EDITABLE = definirOperation<{ ligneId: string }, c.LigneEditable>({
  nom: "patron.reglages.ligne",
  methode: "GET",
  chemin: (p) => `/patron/reglages/lignes/${id(p.ligneId)}`,
  reponse: c.LigneEditableSchema,
});

export const OP_MODIFIER_LIGNE = definirOperation<c.ModifierLigne, c.LignePubliee>({
  nom: "patron.reglages.ligne.modifier",
  methode: "PUT",
  chemin: (p) => `/patron/reglages/lignes/${id(p.ligneId)}`,
  corps: (p) => p,
  reponse: c.LignePublieeSchema,
  idempotente: false,
});

export const OP_CREER_LIGNE = definirOperation<c.CreerLigne, c.LignePubliee>({
  nom: "patron.reglages.ligne.creer",
  methode: "POST",
  chemin: () => "/patron/reglages/lignes",
  corps: (p) => p,
  reponse: c.LignePublieeSchema,
});

export const OP_PERSONNE_EDITABLE = definirOperation<{ personneId: string }, c.PersonneEditable>({
  nom: "patron.reglages.personne",
  methode: "GET",
  chemin: (p) => `/patron/reglages/personnes/${id(p.personneId)}`,
  reponse: c.PersonneEditableSchema,
});

export const OP_MODIFIER_PERSONNE = definirOperation<c.ModifierPersonne, c.PersonneEnregistree>({
  nom: "patron.reglages.personne.modifier",
  methode: "PUT",
  chemin: (p) => `/patron/reglages/personnes/${id(p.personneId)}`,
  corps: (p) => p,
  reponse: c.PersonneEnregistreeSchema,
  idempotente: false,
});

export const OP_CREER_PERSONNE = definirOperation<c.CreerPersonne, c.PersonneEnregistree>({
  nom: "patron.reglages.personne.creer",
  methode: "POST",
  chemin: () => "/patron/reglages/personnes",
  corps: (p) => p,
  reponse: c.PersonneEnregistreeSchema,
});

export const OP_DESACTIVER_PERSONNE = definirOperation<c.DesactiverPersonne, c.PersonneDesactivee>({
  nom: "patron.reglages.personne.desactiver",
  methode: "POST",
  chemin: (p) => `/patron/reglages/personnes/${id(p.personneId)}/desactivation`,
  corps: (p) => p,
  reponse: c.PersonneDesactiveeSchema,
});

export const OP_PIN_PROVISOIRE = definirOperation<c.NouveauPinProvisoire, c.PinProvisoireEnvoye>({
  nom: "patron.reglages.personne.pinProvisoire",
  methode: "POST",
  chemin: (p) => `/patron/reglages/personnes/${id(p.personneId)}/pin-provisoire`,
  corps: (p) => p,
  reponse: c.PinProvisoireEnvoyeSchema,
});

export const OP_REGLES = definirOperation<void, c.ReglesAgence>({
  nom: "patron.reglages.regles",
  methode: "GET",
  chemin: () => "/patron/reglages/regles",
  reponse: c.ReglesAgenceSchema,
});

export const OP_ENREGISTRER_REGLES = definirOperation<c.EnregistrerRegles, c.ReglesEnregistrees>({
  nom: "patron.reglages.regles.enregistrer",
  methode: "PUT",
  chemin: () => "/patron/reglages/regles",
  corps: (p) => p,
  reponse: c.ReglesEnregistreesSchema,
  idempotente: false,
});

export const OP_CONFIRMER_COMPTE_MOMO = definirOperation<
  c.DemanderConfirmationCompteMomo,
  c.ConfirmationCompteMomoEnvoyee
>({
  nom: "patron.reglages.compteMomo.confirmer",
  methode: "POST",
  chemin: () => "/patron/reglages/comptes-momo/confirmation",
  corps: (p) => p,
  reponse: c.ConfirmationCompteMomoEnvoyeeSchema,
});

export const OP_CHANGER_COMPTE_MOMO = definirOperation<c.ChangerCompteMomo, c.CompteMomoChange>({
  nom: "patron.reglages.compteMomo.changer",
  methode: "PUT",
  chemin: () => "/patron/reglages/comptes-momo",
  corps: (p) => p,
  reponse: c.CompteMomoChangeSchema,
  idempotente: false,
});

export const OP_LANCER_PAIE = definirOperation<c.LancerPaie, c.PaieLancee>({
  nom: "patron.paie.lancer",
  methode: "POST",
  chemin: () => "/patron/paie",
  corps: (p) => p,
  reponse: c.PaieLanceeSchema,
});

/* ----------------------------------------------------------------------- modules */

export const OP_MODULES = definirOperation<void, c.ModulesAgence>({
  nom: "patron.modules.lister",
  methode: "GET",
  chemin: () => "/patron/modules",
  reponse: c.ModulesAgenceSchema,
});

export const OP_CHANGER_MODULE = definirOperation<c.ChangerModule, c.ModuleChange>({
  nom: "patron.modules.changer",
  methode: "PUT",
  chemin: (p) => `/patron/modules/${id(p.code)}`,
  corps: (p) => p,
  reponse: c.ModuleChangeSchema,
  idempotente: false,
});

/* ----------------------------------------------------------------------- financement */

export const OP_OFFRE_FINANCEMENT = definirOperation<void, c.OffreFinancement>({
  nom: "patron.financement.offre",
  methode: "GET",
  chemin: () => "/patron/financement",
  reponse: c.OffreFinancementSchema,
});

export const OP_DOSSIER_FINANCEMENT = definirOperation<{ dossierId: string }, c.DossierFinancement>(
  {
    nom: "patron.financement.dossier",
    methode: "GET",
    chemin: (p) => `/patron/financement/demandes/${id(p.dossierId)}`,
    reponse: c.DossierFinancementSchema,
  },
);

export const OP_DEMANDER_AVANCE = definirOperation<c.DemanderAvance, c.AvanceDemandee>({
  nom: "patron.financement.demander",
  methode: "POST",
  chemin: () => "/patron/financement/demandes",
  corps: (p) => p,
  reponse: c.AvanceDemandeeSchema,
});

export const OP_RETIRER_DEMANDE = definirOperation<c.RetirerDemande, c.DemandeRetiree>({
  nom: "patron.financement.retirer",
  methode: "POST",
  chemin: (p) => `/patron/financement/demandes/${id(p.dossierId)}/retrait`,
  corps: (p) => p,
  reponse: c.DemandeRetireeSchema,
});

export const OP_REGLER_BILLET_EN_DEUX_FOIS = definirOperation<
  c.ReglerBilletEnDeuxFois,
  c.BilletEnDeuxFoisRegle
>({
  nom: "patron.financement.billetEnDeuxFois",
  methode: "PUT",
  chemin: () => "/patron/financement/billet-en-deux-fois",
  corps: (p) => p,
  reponse: c.BilletEnDeuxFoisRegleSchema,
  idempotente: false,
});

/* ----------------------------------------------------------------------- entre compagnies */

export const OP_INTER_AGENCES = definirOperation<void, c.InterAgences>({
  nom: "patron.interAgences.vue",
  methode: "GET",
  chemin: () => "/patron/inter-agences",
  reponse: c.InterAgencesSchema,
});

export const OP_CONVENTION = definirOperation<{ conventionId: string }, c.Convention>({
  nom: "patron.interAgences.convention",
  methode: "GET",
  chemin: (p) => `/patron/inter-agences/conventions/${id(p.conventionId)}`,
  reponse: c.ConventionSchema,
});

/* ----------------------------------------------------------------------- salle de contrôle */

export const OP_SALLE_DE_CONTROLE = definirOperation<void, c.SalleDeControle>({
  nom: "patron.controle.salle",
  methode: "GET",
  chemin: () => "/patron/controle",
  reponse: c.SalleDeControleSchema,
});

/** Chiffres, gares et éléments « à traiter » de la salle de contrôle, en direct. */
export const CANAL_DIRECT_CONTROLE = definirCanal<void, c.MessageDirectControle>({
  nom: "controle.direct",
  chemin: () => "/patron/controle/direct",
  message: c.MessageDirectControleSchema,
});

/* ----------------------------------------------------------------------- registre */

/**
 * Les écritures du patron, par nom : exactement les clés de `COMMANDES_SIGNEES` (contrats). Le test
 * `operations.test.ts` vérifie la correspondance, et que chaque opération envoie bien sa signature.
 */
export const OPERATIONS_SIGNEES = {
  "patron.reglages.ligne.modifier": OP_MODIFIER_LIGNE,
  "patron.reglages.ligne.creer": OP_CREER_LIGNE,
  "patron.reglages.personne.modifier": OP_MODIFIER_PERSONNE,
  "patron.reglages.personne.creer": OP_CREER_PERSONNE,
  "patron.reglages.personne.desactiver": OP_DESACTIVER_PERSONNE,
  "patron.reglages.personne.pinProvisoire": OP_PIN_PROVISOIRE,
  "patron.reglages.regles.enregistrer": OP_ENREGISTRER_REGLES,
  "patron.reglages.compteMomo.confirmer": OP_CONFIRMER_COMPTE_MOMO,
  "patron.reglages.compteMomo.changer": OP_CHANGER_COMPTE_MOMO,
  "patron.modules.changer": OP_CHANGER_MODULE,
  "patron.assistant.appliquer": OP_APPLIQUER_PROPOSITION,
  "patron.comptable.rapprochement.appliquer": OP_APPLIQUER_RAPPROCHEMENT,
  "patron.comptable.cloturer": OP_CLOTURER,
  "patron.financement.demander": OP_DEMANDER_AVANCE,
  "patron.financement.retirer": OP_RETIRER_DEMANDE,
  "patron.financement.billetEnDeuxFois": OP_REGLER_BILLET_EN_DEUX_FOIS,
  "patron.paie.lancer": OP_LANCER_PAIE,
} as const satisfies Record<c.NomCommandeSignee, Operation<never, unknown>>;
