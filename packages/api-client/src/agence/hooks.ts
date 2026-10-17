import { agence as c } from "@afrimove/contrats";
import { useQueryClient } from "@tanstack/react-query";
import type { MutateOptions, UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useFlux, useMutationApi, useRequete } from "../infra/index";
import type { ErreurApi, OptionsFluxReact, OptionsRequete, ResultatFlux } from "../infra/index";
import { useAppareilAgence } from "./appareil";
import {
  CANAL_GARE,
  CANAL_QUAI,
  ECRITURES,
  OP_CADENCE_BILLET,
  OP_CADENCE_ETAT,
  OP_CAISSE_SESSION,
  OP_CHAUFFEUR_FEUILLE,
  OP_COLIS_DEPOT,
  OP_COLIS_FORMULAIRE,
  OP_CONTROLE_INOPINE,
  OP_CONVOYEUR_ETAT,
  OP_GUICHET_ACCUEIL,
  OP_IMPRESSION_ETAT,
  OP_JOURNAL,
  OP_QUAI_CADENCE,
  OP_QUAI_EMBARQUEMENT,
  OP_SUPERVISEUR_ANNULATION,
  OP_SUPERVISEUR_APPAREIL,
  OP_SUPERVISEUR_CLOTURE,
  OP_SUPERVISEUR_EQUIPE,
  OP_SUPERVISEUR_GARE,
  OP_VENTE_CONTEXTE,
} from "./operations";
import type { DefinitionEvenementQuelconque, EcritureAgence } from "./operations";

/* ------------------------------------------------------------------ écritures */

/**
 * Résultat d'un hook d'écriture : une mutation TanStack dont `mutate` reçoit les **données** de
 * l'événement. L'événement complet (UUID, plage, appareil, heure) est créé ici, sur l'appareil.
 */
export type MutationEcriture<E extends DefinitionEvenementQuelconque, R> = Omit<
  UseMutationResult<R, ErreurApi, c.EvenementDe<E>>,
  "mutate" | "mutateAsync"
> & {
  mutate(donnees: c.DonneesDe<E>, options?: MutateOptions<R, ErreurApi, c.EvenementDe<E>>): void;
  mutateAsync(
    donnees: c.DonneesDe<E>,
    options?: MutateOptions<R, ErreurApi, c.EvenementDe<E>>,
  ): Promise<R>;
};

/**
 * Hook d'une écriture de l'agence. Chaque appel de `mutate` crée un nouvel événement (UUID neuf,
 * numéro de plage si le type en prend un) puis l'envoie. Après un succès, les lectures de l'agence
 * sont rechargées.
 */
export function useEcritureAgence<E extends DefinitionEvenementQuelconque, R>(
  ecriture: EcritureAgence<E, R>,
): MutationEcriture<E, R> {
  const appareil = useAppareilAgence();
  const queryClient = useQueryClient();
  const mutation = useMutationApi(ecriture.operation, {
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("agence."),
      }),
  });
  return {
    ...mutation,
    mutate: (donnees, options) =>
      mutation.mutate(appareil.creerEvenement(ecriture.evenement, donnees), options),
    mutateAsync: (donnees, options) =>
      mutation.mutateAsync(appareil.creerEvenement(ecriture.evenement, donnees), options),
  };
}

/* ------------------------------------------------------------------ guichet */

/** Planche « Guichet » : l'accueil de l'agent. */
export function useGuichetAccueil(
  options?: OptionsRequete<c.GuichetAccueil>,
): UseQueryResult<c.GuichetAccueil, ErreurApi> {
  return useRequete(OP_GUICHET_ACCUEIL, undefined, options);
}

/* ------------------------------------------------------------------ caisse */

/** Planche « Caisse » : ce que l'app a compté, ce que l'agent compte, l'écart. */
export function useCaisseSession(
  params: c.ParamsCaisseSession = {},
  options?: OptionsRequete<c.CaisseSession>,
) {
  return useRequete(OP_CAISSE_SESSION, params, options);
}
export const useOuvrirCaisse = () => useEcritureAgence(ECRITURES.caisseOuverte);
export const useCompterCaisse = () => useEcritureAgence(ECRITURES.caisseComptee);
export const useCloturerCaisse = () => useEcritureAgence(ECRITURES.caisseCloturee);

/* ------------------------------------------------------------------ vente et cadence */

/** Planche « Vente » : départs, plan du bus, tarifs, brouillon. */
export function useVenteContexte(
  params: c.ParamsVenteContexte = {},
  options?: OptionsRequete<c.VenteContexte>,
) {
  return useRequete(OP_VENTE_CONTEXTE, params, options);
}
export const useVendreBillet = () => useEcritureAgence(ECRITURES.billetVendu);

/** Planche « Cadence » : le départ en cours, le dernier billet, le siège suivant. */
export function useCadenceEtat(
  params: c.ParamsCadenceEtat = {},
  options?: OptionsRequete<c.CadenceEtat>,
) {
  return useRequete(OP_CADENCE_ETAT, params, options);
}
/** Planche « CadenceBillet » : le billet imprimé et ce que l'app a fait. */
export function useCadenceBillet(billetId: string, options?: OptionsRequete<c.CadenceBillet>) {
  return useRequete(OP_CADENCE_BILLET, { billetId }, options);
}
export const useVendreBilletCadence = () => useEcritureAgence(ECRITURES.billetVenduCadence);
export const useAjouterTelephoneBillet = () => useEcritureAgence(ECRITURES.billetTelephoneAjoute);

/* ------------------------------------------------------------------ colis */

/** Planche « GuichetColis » : formulaire, devis, étiquette. */
export function useColisFormulaire(
  params: c.ParamsColisFormulaire = {},
  options?: OptionsRequete<c.ColisFormulaire>,
) {
  return useRequete(OP_COLIS_FORMULAIRE, params, options);
}
export const useEnregistrerColis = () => useEcritureAgence(ECRITURES.colisEnregistre);

/** Planche « Depot » : le colis prépayé que le guichet vient de scanner. */
export function useColisDepot(code: string, options?: OptionsRequete<c.ColisDepot>) {
  return useRequete(OP_COLIS_DEPOT, { code }, { ...options, enabled: code !== "" });
}
export const useAccepterDepotColis = () => useEcritureAgence(ECRITURES.colisDepose);

/* ------------------------------------------------------------------ impression */

/** État de l'imprimante de l'appareil. */
export function useImpressionEtat(options?: OptionsRequete<c.ImpressionEtat>) {
  return useRequete(OP_IMPRESSION_ETAT, undefined, options);
}
export const useImprimer = () => useEcritureAgence(ECRITURES.impressionDemandee);

/* ------------------------------------------------------------------ quai */

/** Planche « Quai » : scan, comptage, soute, absents. */
export function useQuaiEmbarquement(
  params: c.ParamsQuaiEmbarquement = {},
  options?: OptionsRequete<c.QuaiEmbarquement>,
) {
  return useRequete(OP_QUAI_EMBARQUEMENT, params, options);
}
export const useScannerAuQuai = () => useEcritureAgence(ECRITURES.quaiScanne);
export const useSaisirCodeBillet = () => useEcritureAgence(ECRITURES.quaiCodeSaisi);
export const useLibererSiege = () => useEcritureAgence(ECRITURES.quaiLibere);
export const useEnvoyerListeAuChauffeur = () => useEcritureAgence(ECRITURES.quaiListeEnvoyee);

/** Planche « CadenceQuai » : compléter les billets de cadence au scan. */
export function useQuaiCadence(
  params: c.ParamsQuaiCadence = {},
  options?: OptionsRequete<c.QuaiCadence>,
) {
  return useRequete(OP_QUAI_CADENCE, params, options);
}
export const useCompleterBillet = () => useEcritureAgence(ECRITURES.billetComplete);

/** Temps réel du quai : chaque scan, vu en direct par la gare. */
export function useQuaiDirect(
  params: c.ParamsQuaiDirect,
  options?: OptionsFluxReact,
): ResultatFlux<c.MessageQuai> {
  return useFlux(CANAL_QUAI, params, options);
}

/* ------------------------------------------------------------------ à bord */

/** Planche « Convoyeur » : à bord, vente en route, colis à décharger. */
export function useConvoyeurEtat(
  params: c.ParamsDepartBord = {},
  options?: OptionsRequete<c.ConvoyeurEtat>,
) {
  return useRequete(OP_CONVOYEUR_ETAT, params, options);
}
export const useVendreEnRoute = () => useEcritureAgence(ECRITURES.routeBilletVendu);
export const useScannerEnRoute = () => useEcritureAgence(ECRITURES.routeScanne);
export const useDechargerColis = () => useEcritureAgence(ECRITURES.routeColisDecharges);

/** Planche « Chauffeur » : feuille de route, dépenses, incidents, semaine. */
export function useChauffeurFeuille(
  params: c.ParamsDepartBord = {},
  options?: OptionsRequete<c.ChauffeurFeuille>,
) {
  return useRequete(OP_CHAUFFEUR_FEUILLE, params, options);
}
export const useAjouterDepense = () => useEcritureAgence(ECRITURES.chauffeurDepense);
export const useDeclarerIncident = () => useEcritureAgence(ECRITURES.chauffeurIncident);
export const useDeclarerRetard = () => useEcritureAgence(ECRITURES.chauffeurRetard);
export const useArriveeArret = () => useEcritureAgence(ECRITURES.chauffeurArriveeArret);

/** Planche « Controleur » : contrôle inopiné, siège par siège. */
export function useControleInopine(
  params: c.ParamsControleInopine = {},
  options?: OptionsRequete<c.ControleInopine>,
) {
  return useRequete(OP_CONTROLE_INOPINE, params, options);
}
export const useVerifierSiege = () => useEcritureAgence(ECRITURES.controleSiegeVerifie);
export const useRegulariserVoyageur = () => useEcritureAgence(ECRITURES.controleRegularise);
export const useSignalerConvoyeur = () => useEcritureAgence(ECRITURES.controleConvoyeurSignale);
export const useCloreControle = () => useEcritureAgence(ECRITURES.controleCloture);

/* ------------------------------------------------------------------ supervision */

/** Planche « Superviseur » : demandes, guichets, départs de l'après-midi. */
export function useSuperviseurGare(
  params: c.ParamsSuperviseurGare = {},
  options?: OptionsRequete<c.SuperviseurGare>,
) {
  return useRequete(OP_SUPERVISEUR_GARE, params, options);
}
/** Temps réel de la gare : nouvelle demande, mouvement d'un guichet, remplissage. */
export function useGareDirect(
  params: c.ParamsGareDirect = {},
  options?: OptionsFluxReact,
): ResultatFlux<c.MessageGare> {
  return useFlux(CANAL_GARE, params, options);
}

/** Planche « SuperviseurValider » : valider une clôture avec le PIN. */
export function useSuperviseurCloture(
  sessionId: string,
  options?: OptionsRequete<c.SuperviseurCloture>,
) {
  return useRequete(OP_SUPERVISEUR_CLOTURE, { sessionId }, options);
}
export const useValiderCloture = () => useEcritureAgence(ECRITURES.caisseValidee);
export const useRefuserCloture = () => useEcritureAgence(ECRITURES.caisseRefusee);

/** Planche « SuperviseurVoir » : voir et décider une annulation. */
export function useSuperviseurAnnulation(
  demandeId: string,
  options?: OptionsRequete<c.SuperviseurAnnulation>,
) {
  return useRequete(OP_SUPERVISEUR_ANNULATION, { demandeId }, options);
}
export const useDemanderAnnulation = () => useEcritureAgence(ECRITURES.annulationDemandee);
export const useDeciderAnnulation = () => useEcritureAgence(ECRITURES.annulationDecidee);

/** Planche « SuperviseurEquipe » : l'équipe, les PIN, les comptes. */
export function useSuperviseurEquipe(
  params: c.ParamsSuperviseurEquipe = {},
  options?: OptionsRequete<c.SuperviseurEquipe>,
) {
  return useRequete(OP_SUPERVISEUR_EQUIPE, params, options);
}
export const useRenouvelerPin = () => useEcritureAgence(ECRITURES.equipePinRenouvele);
export const useChangerAffectation = () => useEcritureAgence(ECRITURES.equipeAffectationChangee);
export const useDesactiverCompte = () => useEcritureAgence(ECRITURES.equipeCompteDesactive);
export const useDebloquerPersonne = () => useEcritureAgence(ECRITURES.equipePersonneDebloquee);

/** Planche « SuperviseurDebloquer » : un téléphone de guichet bloqué hors ligne. */
export function useSuperviseurAppareil(
  appareilId: string,
  options?: OptionsRequete<c.SuperviseurAppareil>,
) {
  return useRequete(OP_SUPERVISEUR_APPAREIL, { appareilId }, options);
}
export const useDebloquerAppareil = () => useEcritureAgence(ECRITURES.appareilDebloque);

/* ------------------------------------------------------------------ journal */

/** Journal signé (« Voir son journal », journal d'une session, journal de la gare). */
export function useJournal(params: c.ParamsJournal = {}, options?: OptionsRequete<c.Journal>) {
  return useRequete(OP_JOURNAL, params, options);
}
