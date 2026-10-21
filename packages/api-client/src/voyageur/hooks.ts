import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { voyageur as c } from "@afrimove/contrats";
import type { EtatFlux } from "../infra/client";
import type { ErreurApi } from "../infra/erreurs";
import { useClientApi, useFlux, useMutationApi, useRequete } from "../infra/react";
import type { OptionsRequete } from "../infra/react";
import {
  CANAL_PLAN_SIEGES,
  CANAL_STATUT_PAIEMENT,
  OP_AJOUTER_PROCHE,
  OP_ANNULER_BILLET,
  OP_APERCU_ANNULATION,
  OP_BILLET,
  OP_BLOQUER_SIEGE,
  OP_COMMANDE,
  OP_CREER_COMMANDE,
  OP_DEFINIR_PREFEREE,
  OP_DEMANDER_CODE,
  OP_DETAIL_DEPART,
  OP_DEVIS,
  OP_ENREGISTRER_FILTRES,
  OP_FIDELITE,
  OP_HISTORIQUE,
  OP_LIEN_PROCHE,
  OP_MOYENS_PAIEMENT,
  OP_OPTIONS_FILTRES,
  OP_PARRAINAGE,
  OP_PAYER_COMMANDE,
  OP_PLAN_SIEGES,
  OP_PROCHES,
  OP_PROFIL,
  OP_RECHERCHER_DEPARTS,
  OP_RECHERCHER_VILLE,
  OP_REPORTER_BILLET,
  OP_STATUT_PAIEMENT,
  OP_VERIFIER_CODE,
} from "./operations";
import {
  CANAL_POSITION_BUS,
  OP_DEFINIR_TRAJET_REGULIER,
  OP_DEVIS_BUS,
  OP_CREER_GROUPE,
  OP_FORMULAIRE_PUBLICATION,
  OP_GROUPE,
  OP_INVITER_GROUPE,
  OP_MES_TRAJETS_COVOIT,
  OP_OFFRES_MONTEE,
  OP_PREVENIR_PROCHE,
  OP_PROPOSER_A_DEMANDE,
  OP_PROPOSITION_COURSE,
  OP_PUBLIER_TRAJET,
  OP_RECHERCHER_COVOIT,
  OP_RESERVER_COURSE,
  OP_RESERVER_COVOIT,
  OP_RESERVER_MONTEE,
  OP_RESEAU,
  OP_SANS_INTERNET,
  OP_SUIVI_BUS,
  OP_TRAJET_REGULIER,
} from "./operationsServices";
import { appliquerMessagePlan } from "./planSieges";

/**
 * Hooks React de l'API voyageur. Un écran n'importe que ces hooks et les types de
 * `@afrimove/contrats` ; la liste « écran → hooks » est dans `packages/contrats/src/voyageur/README.md`.
 *
 * Lectures : `useX(params, options?)` → résultat TanStack Query (`data`, `isPending`, `error`).
 * Écritures : `useX()` → mutation (`mutate`, `data`, `isPending`, `error`) ; elles invalident
 * les lectures qu'elles modifient.
 */

type Opt<R> = OptionsRequete<R> | undefined;

/* ------------------------------------------------------------------ compte */

export const useDemanderCode = () => useMutationApi(OP_DEMANDER_CODE);
export const useVerifierCode = () => useMutationApi(OP_VERIFIER_CODE);
export const useProfil = (options?: Opt<c.Profil>) => useRequete(OP_PROFIL, undefined, options);
export const useFidelite = (options?: Opt<c.Fidelite>) =>
  useRequete(OP_FIDELITE, undefined, options);
export const useParrainage = (options?: Opt<c.Parrainage>) =>
  useRequete(OP_PARRAINAGE, undefined, options);
export const useProches = (options?: Opt<c.Proche[]>) => useRequete(OP_PROCHES, undefined, options);
export const useHistorique = (options?: Opt<c.ElementHistorique[]>) =>
  useRequete(OP_HISTORIQUE, undefined, options);

export function useAjouterProche() {
  const cache = useQueryClient();
  return useMutationApi(OP_AJOUTER_PROCHE, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_PROCHES.nom] }),
  });
}

/* ------------------------------------------------------------------ recherche de départs */

export const useRechercheDeparts = (
  params: c.RechercheDeparts,
  options?: Opt<c.ResultatRechercheDeparts>,
) => useRequete(OP_RECHERCHER_DEPARTS, params, options);

export const useOptionsFiltres = (
  params: { depart: string; arrivee: string; jour?: string },
  options?: Opt<c.OptionsFiltres>,
) => useRequete(OP_OPTIONS_FILTRES, params, options);

export function useEnregistrerFiltres() {
  const cache = useQueryClient();
  return useMutationApi(OP_ENREGISTRER_FILTRES, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_RECHERCHER_DEPARTS.nom] }),
  });
}

export function useDefinirPreferee() {
  const cache = useQueryClient();
  return useMutationApi(OP_DEFINIR_PREFEREE, {
    onSuccess: () =>
      Promise.all([
        cache.invalidateQueries({ queryKey: [OP_OPTIONS_FILTRES.nom] }),
        cache.invalidateQueries({ queryKey: [OP_RECHERCHER_DEPARTS.nom] }),
      ]),
  });
}

export const useRechercheVille = (
  params: c.RechercheVille,
  options?: Opt<c.ResultatRechercheVille>,
) => useRequete(OP_RECHERCHER_VILLE, params, options);

/* ------------------------------------------------------------------ départ, sièges, commande */

export const useDetailDepart = (params: { departId: string }, options?: Opt<c.DetailDepart>) =>
  useRequete(OP_DETAIL_DEPART, params, options);

export const usePlanSieges = (params: { departId: string }, options?: Opt<c.PlanSiegesVue>) =>
  useRequete(OP_PLAN_SIEGES, params, options);

export interface ResultatPlanTempsReel {
  /** Instantané de la requête, puis mis à jour par le temps réel. */
  plan: c.PlanSiegesVue | undefined;
  etat: EtatFlux;
  erreur: ErreurApi | undefined;
}

/** Plan de sièges qui suit le temps réel : un siège pris par un autre voyageur se grise à l'écran. */
export function usePlanSiegesTempsReel(params: { departId: string }): ResultatPlanTempsReel {
  const client = useClientApi();
  const requete = usePlanSieges(params);
  const [direct, setDirect] = useState<c.PlanSiegesVue | undefined>(undefined);
  const [etat, setEtat] = useState<EtatFlux>("ferme");
  const [erreur, setErreur] = useState<ErreurApi | undefined>(undefined);
  const base = useRef<c.PlanSiegesVue | undefined>(undefined);
  base.current = requete.data;

  useEffect(() => {
    setDirect(undefined);
    setErreur(undefined);
    return client.souscrire(
      CANAL_PLAN_SIEGES,
      { departId: params.departId },
      (message) => setDirect((prec) => appliquerMessagePlan(prec ?? base.current, message)),
      { surEtat: setEtat, surErreur: setErreur },
    );
  }, [client, params.departId]);

  return { plan: direct ?? requete.data, etat, erreur };
}

export function useBloquerSiege() {
  const cache = useQueryClient();
  return useMutationApi(OP_BLOQUER_SIEGE, {
    onSuccess: (_blocage, p) =>
      cache.invalidateQueries({ queryKey: [OP_PLAN_SIEGES.nom, { departId: p.departId }] }),
  });
}

export const useMoyensPaiement = (options?: Opt<c.MoyenPaiementVue[]>) =>
  useRequete(OP_MOYENS_PAIEMENT, undefined, options);

export const useDevis = (params: c.DemandeDevis, options?: Opt<c.Devis>) =>
  useRequete(OP_DEVIS, params, options);

export const useCreerCommande = () => useMutationApi(OP_CREER_COMMANDE);

export const useCommande = (params: { commandeId: string }, options?: Opt<c.Commande>) =>
  useRequete(OP_COMMANDE, params, options);

/* ------------------------------------------------------------------ paiement */

export const usePayerCommande = () => useMutationApi(OP_PAYER_COMMANDE);

/** Statut d'un paiement (relève toutes les 3 s tant qu'il attend la confirmation du voyageur). */
export const useStatutPaiement = (params: { paiementId: string }, options?: Opt<c.Paiement>) =>
  useRequete(OP_STATUT_PAIEMENT, params, {
    refetchInterval: (q) => (q.state.data?.statut === "en_attente_confirmation" ? 3000 : false),
    ...options,
  });

/** Statut d'un paiement en temps réel (MoMo push : le billet arrive dès la confirmation). */
export const useStatutPaiementEnDirect = (params: { paiementId: string }, actif = true) =>
  useFlux(CANAL_STATUT_PAIEMENT, params, { actif });

export const useLienProche = () => useMutationApi(OP_LIEN_PROCHE);

/* ------------------------------------------------------------------ billet */

export const useBillet = (params: { billetId: string }, options?: Opt<c.BilletVoyageur>) =>
  useRequete(OP_BILLET, params, options);

export const useApercuAnnulation = (
  params: { billetId: string },
  options?: Opt<c.ApercuAnnulation>,
) => useRequete(OP_APERCU_ANNULATION, params, options);

export function useAnnulerBillet() {
  const cache = useQueryClient();
  return useMutationApi(OP_ANNULER_BILLET, {
    onSuccess: () =>
      Promise.all([
        cache.invalidateQueries({ queryKey: [OP_BILLET.nom] }),
        cache.invalidateQueries({ queryKey: [OP_HISTORIQUE.nom] }),
      ]),
  });
}

export function useReporterBillet() {
  const cache = useQueryClient();
  return useMutationApi(OP_REPORTER_BILLET, {
    onSuccess: () =>
      Promise.all([
        cache.invalidateQueries({ queryKey: [OP_BILLET.nom] }),
        cache.invalidateQueries({ queryKey: [OP_HISTORIQUE.nom] }),
      ]),
  });
}

/* ------------------------------------------------------------------ bus en direct, réseau, route */

export const useSuiviBus = (params: { billetId: string }, options?: Opt<c.SuiviBus>) =>
  useRequete(OP_SUIVI_BUS, params, options);

/** Position du bus en temps réel : `dernier` est le dernier message reçu. */
export const usePositionBus = (params: { billetId: string }, actif = true) =>
  useFlux(CANAL_POSITION_BUS, params, { actif });

export function usePrevenirProche() {
  const cache = useQueryClient();
  return useMutationApi(OP_PREVENIR_PROCHE, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_SUIVI_BUS.nom] }),
  });
}

export const useReseau = (params: c.DemandeReseau = {}, options?: Opt<c.ApercuReseau>) =>
  useRequete(OP_RESEAU, params, options);

export const useOffresMonteeEnRoute = (
  params: c.DemandeMonteeEnRoute = {},
  options?: Opt<c.OffresMonteeEnRoute>,
) => useRequete(OP_OFFRES_MONTEE, params, options);

export const useReserverMontee = () => useMutationApi(OP_RESERVER_MONTEE);

export const usePropositionCourse = (
  params: { billetId: string },
  options?: Opt<c.PropositionCourse>,
) => useRequete(OP_PROPOSITION_COURSE, params, options);

export const useReserverCourse = () => useMutationApi(OP_RESERVER_COURSE);

/* ------------------------------------------------------------------ groupe et cagnotte */

export const useGroupe = (params: c.DemandeGroupe, options?: Opt<c.Groupe>) =>
  useRequete(OP_GROUPE, params, options);

export const useCreerGroupe = () => useMutationApi(OP_CREER_GROUPE);

export function useInviterGroupe() {
  const cache = useQueryClient();
  return useMutationApi(OP_INVITER_GROUPE, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_GROUPE.nom] }),
  });
}

export const useDevisBus = () => useMutationApi(OP_DEVIS_BUS);

/* ------------------------------------------------------------------ covoiturage */

export const useRechercheCovoit = (
  params: c.RechercheCovoit,
  options?: Opt<c.ResultatRechercheCovoit>,
) => useRequete(OP_RECHERCHER_COVOIT, params, options);

export const useReserverCovoit = () => useMutationApi(OP_RESERVER_COVOIT);

export const useFormulairePublication = (options?: Opt<c.FormulairePublication>) =>
  useRequete(OP_FORMULAIRE_PUBLICATION, undefined, options);

export function usePublierTrajet() {
  const cache = useQueryClient();
  return useMutationApi(OP_PUBLIER_TRAJET, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_MES_TRAJETS_COVOIT.nom] }),
  });
}

export const useMesTrajetsCovoit = (options?: Opt<c.MesTrajetsCovoit>) =>
  useRequete(OP_MES_TRAJETS_COVOIT, undefined, options);

export function useProposerADemande() {
  const cache = useQueryClient();
  return useMutationApi(OP_PROPOSER_A_DEMANDE, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_MES_TRAJETS_COVOIT.nom] }),
  });
}

export const useTrajetRegulier = (options?: Opt<c.TrajetRegulier>) =>
  useRequete(OP_TRAJET_REGULIER, undefined, options);

export function useDefinirTrajetRegulier() {
  const cache = useQueryClient();
  return useMutationApi(OP_DEFINIR_TRAJET_REGULIER, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_TRAJET_REGULIER.nom] }),
  });
}

/* ------------------------------------------------------------------ sans internet */

export const useApercuSansInternet = (options?: Opt<c.ApercuSansInternet>) =>
  useRequete(OP_SANS_INTERNET, undefined, options);
