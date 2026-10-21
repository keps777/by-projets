import { useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { colis as c } from "@afrimove/contrats";
import type { ErreurApi } from "../infra/erreurs";
import type { Operation } from "../infra/operations";
import { useFlux, useMutationApi, useRequete } from "../infra/react";
import type { OptionsFluxReact, OptionsRequete, ResultatFlux } from "../infra/react";
import {
  CANAL_MISSIONS_LIVREUR,
  CANAL_POSITION_LIVREUR,
  CANAL_SUIVI_COLIS,
  OP_ACCEPTER_MISSION,
  OP_CHANGER_ADRESSE_LIVRAISON,
  OP_CHANGER_MODE_COLIS,
  OP_CHOISIR_RELAIS,
  OP_CLIENTS_VENDEUR,
  OP_COLIS,
  OP_COLIS_RELAIS,
  OP_CONTESTER_REGLEMENT,
  OP_CONVENTION_INTER_AGENCES,
  OP_CREER_COLIS,
  OP_DEPARTS_VENDEUR,
  OP_DEPOSER_DEMANDE_LIVREUR,
  OP_DEVIS_COLIS,
  OP_DISPONIBILITE_LIVREUR,
  OP_ENREGISTRER_BROUILLON_RELAIS,
  OP_ENVOYER_CODE_COLIS,
  OP_ENVOYER_FICHE_RELAIS,
  OP_ESPACE_LIVREUR,
  OP_ESPACE_RELAIS,
  OP_ESPACE_VENDEUR,
  OP_ESTIMER_PHOTO_COLIS,
  OP_FORMULAIRE_RELAIS,
  OP_INTER_AGENCES,
  OP_INVITER_COMPAGNIE,
  OP_INVITER_LIVREUR,
  OP_LIVRAISON_COLIS,
  OP_OPTIONS_ENVOI_COLIS,
  OP_PARTAGER_SUIVI_LIVRAISON,
  OP_PASSER_MISSION,
  OP_PROGRAMME_LIVREUR,
  OP_PROGRAMME_RELAIS,
  OP_RECEVOIR_COLIS_RELAIS,
  OP_RECLAMER_COLIS,
  OP_REGLEMENT_INTER_AGENCES,
  OP_RELAIS_PROCHES,
  OP_REMETTRE_COLIS_LIVREUR,
  OP_REMETTRE_COLIS_RELAIS,
  OP_RETIRER_GAINS_LIVREUR,
  OP_SCANNER_TRANSFERT_COLIS,
  OP_SIGNALER_ABSENCE_LIVREUR,
  OP_SUIVI_DEMANDE_LIVREUR,
  OP_SUIVI_DEMANDE_RELAIS,
  OP_VENDRE_BILLET_VENDEUR,
} from "./operations";

/**
 * Hooks des écrans colis et partenaires. Un écran n'importe que ces hooks (jamais fetch ni les
 * fixtures) ; la table « écran → hooks » est dans `packages/contrats/src/colis/README.md`.
 *
 * Les hooks d'écriture invalident les lectures qu'ils rendent périmées : après une remise, l'espace
 * du relais se recharge tout seul.
 */

type Lecture<R> = UseQueryResult<R, ErreurApi>;
type Ecriture<P, R> = UseMutationResult<R, ErreurApi, P>;

/** Mutation qui invalide les lectures dont l'opération figure dans `invalide`. */
function useEcriture<P, R>(
  operation: Operation<P, R>,
  invalide: readonly Operation<never, unknown>[] = [],
): Ecriture<P, R> {
  const cache = useQueryClient();
  return useMutationApi(operation, {
    onSuccess: async () => {
      await Promise.all(invalide.map((op) => cache.invalidateQueries({ queryKey: [op.nom] })));
    },
  });
}

/* ------------------------------------------------------------------ ColisEnvoi (13) */

export function useOptionsEnvoiColis(
  params: c.ParamsOptionsEnvoi = {},
  options?: OptionsRequete<c.OptionsEnvoiColis>,
): Lecture<c.OptionsEnvoiColis> {
  return useRequete(OP_OPTIONS_ENVOI_COLIS, params, options);
}

export function useEstimerPhotoColis(): Ecriture<{ photoRef: string }, c.EstimationPhoto> {
  return useEcriture(OP_ESTIMER_PHOTO_COLIS);
}

export function useDevisColis(
  params: c.DemandeDevisColis,
  options?: OptionsRequete<c.DevisColis>,
): Lecture<c.DevisColis> {
  return useRequete(OP_DEVIS_COLIS, params, options);
}

export function useCreerColis(): Ecriture<c.DemandeCreationColis, c.ColisCree> {
  return useEcriture(OP_CREER_COLIS);
}

/* ------------------------------------------------------------------ ColisCode (14) */

export function useColis(
  colisId: string,
  options?: OptionsRequete<c.ColisProprietaire>,
): Lecture<c.ColisProprietaire> {
  return useRequete(OP_COLIS, { colisId }, options);
}

export function useEnvoyerCodeColis(): Ecriture<c.EnvoiCodeColis, c.AccuseEnvoiCode> {
  return useEcriture(OP_ENVOYER_CODE_COLIS);
}

export function useReclamerColis(): Ecriture<c.DemandeReclamation, c.ReclamationOuverte> {
  return useEcriture(OP_RECLAMER_COLIS, [OP_COLIS]);
}

export function useChangerModeColis(): Ecriture<c.ChangementMode, c.ModeChange> {
  return useEcriture(OP_CHANGER_MODE_COLIS, [OP_COLIS, OP_LIVRAISON_COLIS]);
}

/** Étapes du suivi en direct : le dernier message est l'étape la plus récente. */
export function useSuiviColisEnDirect(
  colisId: string,
  options?: OptionsFluxReact,
): ResultatFlux<c.MessageSuiviColis> {
  return useFlux(CANAL_SUIVI_COLIS, { colisId }, options);
}

/* ------------------------------------------------------------------ Relais (15) */

export function useRelaisProches(
  colisId: string,
  q?: string,
  options?: OptionsRequete<c.RelaisProches>,
): Lecture<c.RelaisProches> {
  return useRequete(OP_RELAIS_PROCHES, q === undefined ? { colisId } : { colisId, q }, options);
}

export function useChoisirRelais(): Ecriture<c.ChoixRelais, c.RelaisChoisi> {
  return useEcriture(OP_CHOISIR_RELAIS, [OP_COLIS]);
}

/* ------------------------------------------------------------------ Livraison (16) */

export function useLivraisonColis(
  colisId: string,
  options?: OptionsRequete<c.LivraisonColis>,
): Lecture<c.LivraisonColis> {
  return useRequete(OP_LIVRAISON_COLIS, { colisId }, options);
}

export function usePartagerSuiviLivraison(): Ecriture<
  { colisId: string; destinataire: string },
  c.SuiviPartage
> {
  return useEcriture(OP_PARTAGER_SUIVI_LIVRAISON);
}

export function useChangerAdresseLivraison(): Ecriture<
  { colisId: string; adresse: string },
  { colisId: string; adresse: string; livreurPrevenu: boolean }
> {
  return useEcriture(OP_CHANGER_ADRESSE_LIVRAISON, [OP_LIVRAISON_COLIS]);
}

export function usePositionLivreur(
  colisId: string,
  options?: OptionsFluxReact,
): ResultatFlux<c.PositionLivreur> {
  return useFlux(CANAL_POSITION_LIVREUR, { colisId }, options);
}

/* ------------------------------------------------------------------ RelaisApp (38) */

export function useEspaceRelais(options?: OptionsRequete<c.EspaceRelais>): Lecture<c.EspaceRelais> {
  return useRequete(OP_ESPACE_RELAIS, undefined, options);
}

export function useColisRelais(
  colisId: string,
  options?: OptionsRequete<c.ColisPartenaire>,
): Lecture<c.ColisPartenaire> {
  return useRequete(OP_COLIS_RELAIS, { colisId }, options);
}

export function useRecevoirColisRelais(): Ecriture<c.ReceptionColisRelais, c.ColisRecuRelais> {
  return useEcriture(OP_RECEVOIR_COLIS_RELAIS, [OP_ESPACE_RELAIS]);
}

export function useRemettreColisRelais(): Ecriture<c.RemiseColisRelais, c.ColisRemisRelais> {
  return useEcriture(OP_REMETTRE_COLIS_RELAIS, [OP_ESPACE_RELAIS, OP_COLIS_RELAIS]);
}

/* ------------------------------------------------------------------ Livreur (39) */

export function useEspaceLivreur(
  options?: OptionsRequete<c.EspaceLivreur>,
): Lecture<c.EspaceLivreur> {
  return useRequete(OP_ESPACE_LIVREUR, undefined, options);
}

export function useDisponibiliteLivreur(): Ecriture<
  c.DisponibiliteLivreur,
  c.DisponibiliteLivreur
> {
  return useEcriture(OP_DISPONIBILITE_LIVREUR, [OP_ESPACE_LIVREUR]);
}

export function useAccepterMission(): Ecriture<c.ParamsMission, c.MissionAcceptee> {
  return useEcriture(OP_ACCEPTER_MISSION, [OP_ESPACE_LIVREUR]);
}

export function usePasserMission(): Ecriture<c.ParamsMission, c.MissionPassee> {
  return useEcriture(OP_PASSER_MISSION, [OP_ESPACE_LIVREUR]);
}

export function useRemettreColisLivreur(): Ecriture<c.RemiseColisLivreur, c.ColisLivre> {
  return useEcriture(OP_REMETTRE_COLIS_LIVREUR, [OP_ESPACE_LIVREUR]);
}

export function useSignalerAbsenceLivreur(): Ecriture<c.ParamsMission, c.AbsenceEnregistree> {
  return useEcriture(OP_SIGNALER_ABSENCE_LIVREUR, [OP_ESPACE_LIVREUR]);
}

export function useRetirerGainsLivreur(): Ecriture<{ montant?: number }, c.RetraitGains> {
  return useEcriture(OP_RETIRER_GAINS_LIVREUR, [OP_ESPACE_LIVREUR]);
}

export function useInviterLivreur(): Ecriture<
  { telephone: string },
  { envoyeA: string; envoyeLe: string }
> {
  return useEcriture(OP_INVITER_LIVREUR);
}

/** Missions proposées en direct (30 s pour accepter) : `proposee` puis `expiree`. */
export function useMissionsEnDirect(options?: OptionsFluxReact): ResultatFlux<c.MessageMissions> {
  return useFlux(CANAL_MISSIONS_LIVREUR, undefined, options);
}

/* ------------------------------------------------------------------ RelaisDevenir (22b), RelaisInscription (22c), RelaisVerification (22d) */

export function useProgrammeRelais(
  options?: OptionsRequete<c.ProgrammeRelais>,
): Lecture<c.ProgrammeRelais> {
  return useRequete(OP_PROGRAMME_RELAIS, undefined, options);
}

export function useFormulaireRelais(
  options?: OptionsRequete<c.FormulaireRelais>,
): Lecture<c.FormulaireRelais> {
  return useRequete(OP_FORMULAIRE_RELAIS, undefined, options);
}

export function useEnregistrerBrouillonRelais(): Ecriture<
  { fiche: Partial<c.FicheRelais> },
  { enregistreLe: string }
> {
  return useEcriture(OP_ENREGISTRER_BROUILLON_RELAIS);
}

export function useEnvoyerFicheRelais(): Ecriture<c.FicheRelais, c.DemandeDeposee> {
  return useEcriture(OP_ENVOYER_FICHE_RELAIS, [OP_SUIVI_DEMANDE_RELAIS]);
}

export function useSuiviDemandeRelais(
  dossier?: string,
  options?: OptionsRequete<c.SuiviDemande>,
): Lecture<c.SuiviDemande> {
  return useRequete(OP_SUIVI_DEMANDE_RELAIS, dossier === undefined ? {} : { dossier }, options);
}

/* ------------------------------------------------------------------ LivreurDevenir (23b), LivreurVerification (23c) */

export function useProgrammeLivreur(
  options?: OptionsRequete<c.ProgrammeLivreur>,
): Lecture<c.ProgrammeLivreur> {
  return useRequete(OP_PROGRAMME_LIVREUR, undefined, options);
}

export function useDeposerDemandeLivreur(): Ecriture<c.DemandeLivreur, c.DemandeDeposee> {
  return useEcriture(OP_DEPOSER_DEMANDE_LIVREUR, [OP_SUIVI_DEMANDE_LIVREUR]);
}

export function useSuiviDemandeLivreur(
  dossier?: string,
  options?: OptionsRequete<c.SuiviDemande>,
): Lecture<c.SuiviDemande> {
  return useRequete(OP_SUIVI_DEMANDE_LIVREUR, dossier === undefined ? {} : { dossier }, options);
}

/* ------------------------------------------------------------------ InterAgences (37), InterAgencesConvention (37b) */

export function useInterAgences(options?: OptionsRequete<c.InterAgences>): Lecture<c.InterAgences> {
  return useRequete(OP_INTER_AGENCES, undefined, options);
}

export function useReglementInterAgences(
  options?: OptionsRequete<c.ReglementHebdo>,
): Lecture<c.ReglementHebdo> {
  return useRequete(OP_REGLEMENT_INTER_AGENCES, undefined, options);
}

export function useContesterReglement(): Ecriture<
  { motif: string; colisIds?: string[] },
  { reference: string; deposeeLe: string; recevable: boolean }
> {
  return useEcriture(OP_CONTESTER_REGLEMENT, [OP_REGLEMENT_INTER_AGENCES]);
}

export function useScannerTransfertColis(): Ecriture<c.ScanTransfert, c.TransfertEnregistre> {
  return useEcriture(OP_SCANNER_TRANSFERT_COLIS, [OP_INTER_AGENCES]);
}

export function useConventionInterAgences(
  conventionId: string,
  options?: OptionsRequete<c.Convention>,
): Lecture<c.Convention> {
  return useRequete(OP_CONVENTION_INTER_AGENCES, { conventionId }, options);
}

export function useInviterCompagnie(): Ecriture<
  { compagnie: string; patron: string },
  { reference: string; envoyeeLe: string }
> {
  return useEcriture(OP_INVITER_COMPAGNIE, [OP_INTER_AGENCES]);
}

/* ------------------------------------------------------------------ Vendeur (41) */

export function useEspaceVendeur(
  options?: OptionsRequete<c.EspaceVendeur>,
): Lecture<c.EspaceVendeur> {
  return useRequete(OP_ESPACE_VENDEUR, undefined, options);
}

export function useDepartsVendeur(
  params: c.ParamsDepartsVendeur = {},
  options?: OptionsRequete<c.DepartsVendeur>,
): Lecture<c.DepartsVendeur> {
  return useRequete(OP_DEPARTS_VENDEUR, params, options);
}

export function useClientsVendeur(
  options?: OptionsRequete<c.ClientsVendeur>,
): Lecture<c.ClientsVendeur> {
  return useRequete(OP_CLIENTS_VENDEUR, undefined, options);
}

export function useVendreBilletVendeur(): Ecriture<c.VenteVendeur, c.BilletVendu> {
  return useEcriture(OP_VENDRE_BILLET_VENDEUR, [OP_DEPARTS_VENDEUR, OP_ESPACE_VENDEUR]);
}
