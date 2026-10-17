import { colis as c } from "@afrimove/contrats";
import { z } from "zod";
import { definirCanal, definirOperation } from "../infra/operations";
import type { Operation } from "../infra/operations";

/**
 * Opérations et canaux des colis et des partenaires (relais, livreurs, inter-agences, vendeurs).
 * Chaque contrat est déclaré une fois ici et partagé par les adaptateurs mock et HTTP. Les schémas
 * de réponse viennent de `@afrimove/contrats` (`colis.*`).
 *
 * Règle de sécurité : le code de retrait n'est dans aucune réponse destinée au guichet, au relais ou
 * au livreur. Les réponses partenaire sont des `strictObject` (voir `OPERATIONS_PARTENAIRE`).
 */

const enc = encodeURIComponent;

/* ------------------------------------------------------------------ voyageur : envoyer un colis (ColisEnvoi) */

export const OP_OPTIONS_ENVOI_COLIS = definirOperation<c.ParamsOptionsEnvoi, c.OptionsEnvoiColis>({
  nom: "colis.options-envoi",
  methode: "GET",
  chemin: () => "/colis/options-envoi",
  requete: (p) => ({ ville: p.ville }),
  reponse: c.SchemaOptionsEnvoiColis,
});

/** Lit la photo du colis : taille et poids estimés. */
export const OP_ESTIMER_PHOTO_COLIS = definirOperation<{ photoRef: string }, c.EstimationPhoto>({
  nom: "colis.estimer-photo",
  methode: "POST",
  chemin: () => "/colis/photo",
  corps: (p) => p,
  reponse: c.SchemaEstimationPhoto,
});

export const OP_DEVIS_COLIS = definirOperation<c.DemandeDevisColis, c.DevisColis>({
  nom: "colis.devis",
  methode: "GET",
  chemin: () => "/colis/devis",
  requete: (p) => ({
    departId: p.departId,
    mode: p.mode,
    valeurAssuree: p.valeurAssuree,
    prixLivraison: p.prixLivraison,
  }),
  reponse: c.SchemaDevisColis,
});

/** Crée le colis et le paie ; la réponse porte le code de retrait, pour l'expéditeur seul. */
export const OP_CREER_COLIS = definirOperation<c.DemandeCreationColis, c.ColisCree>({
  nom: "colis.creer",
  methode: "POST",
  chemin: () => "/colis",
  corps: (p) => p,
  reponse: c.SchemaColisCree,
});

/* ------------------------------------------------------------------ voyageur : code, suivi, réclamation (ColisCode) */

export const OP_COLIS = definirOperation<c.ParamsColis, c.ColisProprietaire>({
  nom: "colis.lire",
  methode: "GET",
  chemin: (p) => `/colis/${enc(p.colisId)}`,
  reponse: c.SchemaColisProprietaire,
});

export const OP_ENVOYER_CODE_COLIS = definirOperation<c.EnvoiCodeColis, c.AccuseEnvoiCode>({
  nom: "colis.envoyer-code",
  methode: "POST",
  chemin: (p) => `/colis/${enc(p.colisId)}/code/envoi`,
  corps: (p) => ({ canal: p.canal ?? "sms" }),
  reponse: c.SchemaAccuseEnvoiCode,
});

export const OP_RECLAMER_COLIS = definirOperation<c.DemandeReclamation, c.ReclamationOuverte>({
  nom: "colis.reclamer",
  methode: "POST",
  chemin: (p) => `/colis/${enc(p.colisId)}/reclamations`,
  corps: (p) => ({ motif: p.motif, message: p.message }),
  reponse: c.SchemaReclamationOuverte,
});

/** Passer le colis en relais ou en livraison moto après coup. */
export const OP_CHANGER_MODE_COLIS = definirOperation<c.ChangementMode, c.ModeChange>({
  nom: "colis.changer-mode",
  methode: "PUT",
  chemin: (p) => `/colis/${enc(p.colisId)}/mode`,
  corps: (p) => ({ mode: p.mode, relaisId: p.relaisId, adresse: p.adresse }),
  reponse: c.SchemaModeChange,
  idempotente: true,
});

export const CANAL_SUIVI_COLIS = definirCanal<c.ParamsColis, c.MessageSuiviColis>({
  nom: "colis.suivi",
  chemin: (p) => `/colis/${enc(p.colisId)}/direct`,
  message: c.SchemaMessageSuiviColis,
});

/* ------------------------------------------------------------------ voyageur : points relais (Relais) */

export const OP_RELAIS_PROCHES = definirOperation<c.ParamsRelaisProches, c.RelaisProches>({
  nom: "colis.relais-proches",
  methode: "GET",
  chemin: (p) => `/colis/${enc(p.colisId)}/relais`,
  requete: (p) => ({ q: p.q }),
  reponse: c.SchemaRelaisProches,
});

export const OP_CHOISIR_RELAIS = definirOperation<c.ChoixRelais, c.RelaisChoisi>({
  nom: "colis.choisir-relais",
  methode: "PUT",
  chemin: (p) => `/colis/${enc(p.colisId)}/relais`,
  corps: (p) => ({ relaisId: p.relaisId }),
  reponse: c.SchemaRelaisChoisi,
  idempotente: true,
});

/* ------------------------------------------------------------------ voyageur : livraison moto (Livraison) */

export const OP_LIVRAISON_COLIS = definirOperation<c.ParamsColis, c.LivraisonColis>({
  nom: "colis.livraison",
  methode: "GET",
  chemin: (p) => `/colis/${enc(p.colisId)}/livraison`,
  reponse: c.SchemaLivraisonColis,
});

export const OP_PARTAGER_SUIVI_LIVRAISON = definirOperation<
  z.infer<typeof c.SchemaPartageSuivi>,
  c.SuiviPartage
>({
  nom: "colis.livraison.partager",
  methode: "POST",
  chemin: (p) => `/colis/${enc(p.colisId)}/livraison/partage`,
  corps: (p) => ({ destinataire: p.destinataire }),
  reponse: c.SchemaSuiviPartage,
});

export const OP_CHANGER_ADRESSE_LIVRAISON = definirOperation<
  z.infer<typeof c.SchemaChangementAdresse>,
  z.infer<typeof c.SchemaAdresseChangee>
>({
  nom: "colis.livraison.adresse",
  methode: "PUT",
  chemin: (p) => `/colis/${enc(p.colisId)}/livraison/adresse`,
  corps: (p) => ({ adresse: p.adresse }),
  reponse: c.SchemaAdresseChangee,
  idempotente: true,
});

export const CANAL_POSITION_LIVREUR = definirCanal<c.ParamsColis, c.PositionLivreur>({
  nom: "colis.livraison.position",
  chemin: (p) => `/colis/${enc(p.colisId)}/livraison/direct`,
  message: c.SchemaPositionLivreur,
});

/* ------------------------------------------------------------------ point relais (RelaisApp) : réponses partenaire */

export const OP_ESPACE_RELAIS = definirOperation<void, c.EspaceRelais>({
  nom: "relais.espace",
  methode: "GET",
  chemin: () => "/relais/moi",
  reponse: c.SchemaEspaceRelais,
});

/** Recherche d'un colis par scan d'étiquette, avant une remise. */
export const OP_COLIS_RELAIS = definirOperation<
  z.infer<typeof c.SchemaParamsColisRelais>,
  c.ColisPartenaire
>({
  nom: "relais.colis",
  methode: "GET",
  chemin: (p) => `/relais/moi/colis/${enc(p.colisId)}`,
  reponse: c.SchemaColisPartenaire,
});

export const OP_RECEVOIR_COLIS_RELAIS = definirOperation<c.ReceptionColisRelais, c.ColisRecuRelais>(
  {
    nom: "relais.recevoir",
    methode: "POST",
    chemin: () => "/relais/moi/receptions",
    corps: (p) => p,
    reponse: c.SchemaColisRecuRelais,
  },
);

/** Remise contre code + pièce ; trois essais, puis le colis est bloqué. */
export const OP_REMETTRE_COLIS_RELAIS = definirOperation<c.RemiseColisRelais, c.ColisRemisRelais>({
  nom: "relais.remettre",
  methode: "POST",
  chemin: () => "/relais/moi/remises",
  corps: (p) => p,
  reponse: c.SchemaColisRemisRelais,
});

/* ------------------------------------------------------------------ livreur (Livreur) : réponses partenaire */

export const OP_ESPACE_LIVREUR = definirOperation<void, c.EspaceLivreur>({
  nom: "livreur.espace",
  methode: "GET",
  chemin: () => "/livreurs/moi",
  reponse: c.SchemaEspaceLivreur,
});

export const OP_DISPONIBILITE_LIVREUR = definirOperation<
  c.DisponibiliteLivreur,
  c.DisponibiliteLivreur
>({
  nom: "livreur.disponibilite",
  methode: "PUT",
  chemin: () => "/livreurs/moi/disponibilite",
  corps: (p) => p,
  reponse: c.SchemaDisponibiliteLivreur,
});

export const OP_ACCEPTER_MISSION = definirOperation<c.ParamsMission, c.MissionAcceptee>({
  nom: "livreur.accepter",
  methode: "POST",
  chemin: (p) => `/livreurs/moi/missions/${enc(p.missionId)}/acceptation`,
  reponse: c.SchemaMissionAcceptee,
});

export const OP_PASSER_MISSION = definirOperation<c.ParamsMission, c.MissionPassee>({
  nom: "livreur.passer",
  methode: "POST",
  chemin: (p) => `/livreurs/moi/missions/${enc(p.missionId)}/refus`,
  reponse: c.SchemaMissionPassee,
});

export const OP_REMETTRE_COLIS_LIVREUR = definirOperation<c.RemiseColisLivreur, c.ColisLivre>({
  nom: "livreur.remettre",
  methode: "POST",
  chemin: (p) => `/livreurs/moi/missions/${enc(p.missionId)}/remise`,
  corps: (p) => ({ code: p.code, pieceVerifiee: p.pieceVerifiee, photoRef: p.photoRef }),
  reponse: c.SchemaColisLivre,
});

export const OP_SIGNALER_ABSENCE_LIVREUR = definirOperation<c.ParamsMission, c.AbsenceEnregistree>({
  nom: "livreur.absence",
  methode: "POST",
  chemin: (p) => `/livreurs/moi/missions/${enc(p.missionId)}/absence`,
  reponse: c.SchemaAbsenceEnregistree,
});

export const OP_RETIRER_GAINS_LIVREUR = definirOperation<
  z.infer<typeof c.SchemaDemandeRetraitGains>,
  c.RetraitGains
>({
  nom: "livreur.retirer-gains",
  methode: "POST",
  chemin: () => "/livreurs/moi/retraits",
  corps: (p) => p,
  reponse: c.SchemaRetraitGains,
});

export const OP_INVITER_LIVREUR = definirOperation<
  z.infer<typeof c.SchemaInvitationLivreur>,
  z.infer<typeof c.SchemaInvitationEnvoyee>
>({
  nom: "livreur.inviter",
  methode: "POST",
  chemin: () => "/livreurs/moi/invitations",
  corps: (p) => p,
  reponse: c.SchemaInvitationEnvoyee,
});

/** Missions proposées en temps réel : 30 s pour accepter. */
export const CANAL_MISSIONS_LIVREUR = definirCanal<void, c.MessageMissions>({
  nom: "livreur.missions",
  chemin: () => "/livreurs/moi/missions/direct",
  message: c.SchemaMessageMissions,
});

/* ------------------------------------------------------------------ inscriptions relais et livreur */

export const OP_PROGRAMME_RELAIS = definirOperation<void, c.ProgrammeRelais>({
  nom: "partenaires.relais.programme",
  methode: "GET",
  chemin: () => "/partenaires/relais/programme",
  reponse: c.SchemaProgrammeRelais,
});

export const OP_FORMULAIRE_RELAIS = definirOperation<void, c.FormulaireRelais>({
  nom: "partenaires.relais.formulaire",
  methode: "GET",
  chemin: () => "/partenaires/relais/formulaire",
  reponse: c.SchemaFormulaireRelais,
});

export const OP_ENREGISTRER_BROUILLON_RELAIS = definirOperation<
  z.infer<typeof c.SchemaBrouillonRelais>,
  z.infer<typeof c.SchemaBrouillonEnregistre>
>({
  nom: "partenaires.relais.brouillon",
  methode: "PUT",
  chemin: () => "/partenaires/relais/brouillon",
  corps: (p) => p,
  reponse: c.SchemaBrouillonEnregistre,
  idempotente: true,
});

export const OP_ENVOYER_FICHE_RELAIS = definirOperation<c.FicheRelais, c.DemandeDeposee>({
  nom: "partenaires.relais.envoyer",
  methode: "POST",
  chemin: () => "/partenaires/relais/demandes",
  corps: (p) => p,
  reponse: c.SchemaDemandeDeposee,
});

export const OP_SUIVI_DEMANDE_RELAIS = definirOperation<
  z.infer<typeof c.SchemaParamsSuiviDemande>,
  c.SuiviDemande
>({
  nom: "partenaires.relais.suivi",
  methode: "GET",
  chemin: () => "/partenaires/relais/demandes/moi",
  requete: (p) => ({ dossier: p.dossier }),
  reponse: c.SchemaSuiviDemande,
});

export const OP_PROGRAMME_LIVREUR = definirOperation<void, c.ProgrammeLivreur>({
  nom: "partenaires.livreur.programme",
  methode: "GET",
  chemin: () => "/partenaires/livreurs/programme",
  reponse: c.SchemaProgrammeLivreur,
});

export const OP_DEPOSER_DEMANDE_LIVREUR = definirOperation<c.DemandeLivreur, c.DemandeDeposee>({
  nom: "partenaires.livreur.envoyer",
  methode: "POST",
  chemin: () => "/partenaires/livreurs/demandes",
  corps: (p) => p,
  reponse: c.SchemaDemandeDeposee,
});

export const OP_SUIVI_DEMANDE_LIVREUR = definirOperation<
  z.infer<typeof c.SchemaParamsSuiviDemande>,
  c.SuiviDemande
>({
  nom: "partenaires.livreur.suivi",
  methode: "GET",
  chemin: () => "/partenaires/livreurs/demandes/moi",
  requete: (p) => ({ dossier: p.dossier }),
  reponse: c.SchemaSuiviDemande,
});

/* ------------------------------------------------------------------ inter-agences (InterAgences, InterAgencesConvention) */

export const OP_INTER_AGENCES = definirOperation<void, c.InterAgences>({
  nom: "inter-agences.lire",
  methode: "GET",
  chemin: () => "/inter-agences",
  reponse: c.SchemaInterAgences,
});

export const OP_REGLEMENT_INTER_AGENCES = definirOperation<void, c.ReglementHebdo>({
  nom: "inter-agences.reglement",
  methode: "GET",
  chemin: () => "/inter-agences/reglement",
  reponse: c.SchemaReglementHebdo,
});

export const OP_CONTESTER_REGLEMENT = definirOperation<
  z.infer<typeof c.SchemaContestationReglement>,
  z.infer<typeof c.SchemaContestationEnregistree>
>({
  nom: "inter-agences.contester",
  methode: "POST",
  chemin: () => "/inter-agences/reglement/contestations",
  corps: (p) => p,
  reponse: c.SchemaContestationEnregistree,
});

/** Scan de transfert entre deux compagnies : « remis à Oméga » puis « reçu ». */
export const OP_SCANNER_TRANSFERT_COLIS = definirOperation<c.ScanTransfert, c.TransfertEnregistre>({
  nom: "inter-agences.scanner-transfert",
  methode: "POST",
  chemin: () => "/inter-agences/transferts",
  corps: (p) => p,
  reponse: c.SchemaTransfertEnregistre,
});

export const OP_CONVENTION_INTER_AGENCES = definirOperation<
  z.infer<typeof c.SchemaParamsConvention>,
  c.Convention
>({
  nom: "inter-agences.convention",
  methode: "GET",
  chemin: (p) => `/inter-agences/conventions/${enc(p.conventionId)}`,
  reponse: c.SchemaConvention,
});

export const OP_INVITER_COMPAGNIE = definirOperation<
  z.infer<typeof c.SchemaInvitationCompagnie>,
  z.infer<typeof c.SchemaInvitationCompagnieEnvoyee>
>({
  nom: "inter-agences.inviter",
  methode: "POST",
  chemin: () => "/inter-agences/invitations",
  corps: (p) => p,
  reponse: c.SchemaInvitationCompagnieEnvoyee,
});

/* ------------------------------------------------------------------ vendeur ambulant (Vendeur) */

export const OP_ESPACE_VENDEUR = definirOperation<void, c.EspaceVendeur>({
  nom: "vendeur.espace",
  methode: "GET",
  chemin: () => "/vendeurs/moi",
  reponse: c.SchemaEspaceVendeur,
});

export const OP_DEPARTS_VENDEUR = definirOperation<c.ParamsDepartsVendeur, c.DepartsVendeur>({
  nom: "vendeur.departs",
  methode: "GET",
  chemin: () => "/vendeurs/moi/departs",
  requete: (p) => ({ jour: p.jour, origine: p.origine, destination: p.destination }),
  reponse: c.SchemaDepartsVendeur,
});

export const OP_CLIENTS_VENDEUR = definirOperation<void, c.ClientsVendeur>({
  nom: "vendeur.clients",
  methode: "GET",
  chemin: () => "/vendeurs/moi/clients",
  reponse: c.SchemaClientsVendeur,
});

export const OP_VENDRE_BILLET_VENDEUR = definirOperation<c.VenteVendeur, c.BilletVendu>({
  nom: "vendeur.vendre",
  methode: "POST",
  chemin: () => "/vendeurs/moi/ventes",
  corps: (p) => p,
  reponse: c.SchemaBilletVendu,
});

/* ------------------------------------------------------------------ audiences */

/**
 * Opérations dont la réponse part au guichet, au relais, au livreur ou à une compagnie partenaire :
 * leur réponse ne porte jamais le code de retrait (test de sécurité sur chacune).
 */
export const OPERATIONS_PARTENAIRE: readonly Operation<never, unknown>[] = [
  OP_ESPACE_RELAIS,
  OP_COLIS_RELAIS,
  OP_RECEVOIR_COLIS_RELAIS,
  OP_REMETTRE_COLIS_RELAIS,
  OP_ESPACE_LIVREUR,
  OP_ACCEPTER_MISSION,
  OP_REMETTRE_COLIS_LIVREUR,
  OP_SIGNALER_ABSENCE_LIVREUR,
  OP_INTER_AGENCES,
  OP_SCANNER_TRANSFERT_COLIS,
] as unknown as readonly Operation<never, unknown>[];

/** Opérations dont la réponse part à l'expéditeur ou au destinataire : seules à porter le code de retrait. */
export const OPERATIONS_PROPRIETAIRE: readonly Operation<never, unknown>[] = [
  OP_CREER_COLIS,
  OP_COLIS,
  OP_LIVRAISON_COLIS,
] as unknown as readonly Operation<never, unknown>[];
