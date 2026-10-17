import { patron as c } from "@afrimove/contrats";
import { useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ErreurApi } from "../infra/erreurs";
import type { Operation } from "../infra/operations";
import { useClientApi, useFlux, useMutationApi, useRequete } from "../infra/react";
import type { OptionsFluxReact, OptionsRequete, ResultatFlux } from "../infra/react";
import * as op from "./operations";

/**
 * Hooks React de l'espace patron : un par donnée lue, un par écriture. Les écrans ne connaissent
 * que ces hooks et les types de `@afrimove/contrats` (le tableau écran → hooks est dans
 * `packages/contrats/src/patron/README.md`).
 *
 * Toute écriture prend une `signature` PIN dans ses paramètres (voir `useSignaturePin`) ; après
 * un succès, les lectures concernées sont rechargées.
 */

type Lecture<R> = UseQueryResult<R, ErreurApi>;
type Ecriture<P, R> = UseMutationResult<R, ErreurApi, P>;

/* ----------------------------------------------------------------------- signature PIN */

/**
 * Fabrique la signature d'une écriture à partir du PIN saisi (ou confirmé par l'empreinte) : la
 * date vient de l'horloge du client, jamais de l'écran. Le PIN n'est pas conservé.
 */
export function useSignaturePin(): (
  pin: string,
  methode?: c.SignaturePin["methode"],
) => c.SignaturePin {
  const client = useClientApi();
  return useCallback(
    (pin, methode = "pin") => ({ pin, methode, signeA: client.horloge.iso() }),
    [client],
  );
}

function useEcriture<P, R>(
  operation: Operation<P, R>,
  aRecharger: ReadonlyArray<Operation<never, unknown>>,
): Ecriture<P, R> {
  const cache = useQueryClient();
  return useMutationApi(operation, {
    onSuccess: async () => {
      await Promise.all(aRecharger.map((o) => cache.invalidateQueries({ queryKey: [o.nom] })));
    },
  });
}

/* ----------------------------------------------------------------------- tableau du jour (Patron) */

/** Chiffres du jour d'une compagnie : recette, billets, colis, remplissage, écart total. */
export function useTableauDuJour(
  options?: OptionsRequete<c.TableauDuJour>,
): Lecture<c.TableauDuJour> {
  return useRequete(op.OP_TABLEAU_DU_JOUR, undefined, options);
}

/** Les alertes du jour (écarts, pannes, PIN bloqués, MoMo sans correspondance…). */
export function useAlertes(options?: OptionsRequete<c.ListeAlertes>): Lecture<c.ListeAlertes> {
  return useRequete(op.OP_ALERTES, undefined, options);
}

/** Temps réel : chiffres rafraîchis et nouvelles alertes. */
export function useDirectJour(options?: OptionsFluxReact): ResultatFlux<c.MessageDirectJour> {
  return useFlux(op.CANAL_DIRECT_JOUR, undefined, options);
}

/* ----------------------------------------------------------------------- gares et équipe */

/** « Mes gares, mes gens » : les gares, les effectifs, les personnes à suivre, la paie. */
export function useGares(): Lecture<c.VueGares> {
  return useRequete(op.OP_GARES, undefined);
}

/** Une gare en détail : caisse, guichets, quais, journal. */
export function useGare(gareId: string): Lecture<c.DetailGare> {
  return useRequete(op.OP_GARE, { gareId });
}

/** Liste de l'équipe, filtrable par rôle, gare ou nom. */
export function useEquipe(filtre: c.FiltreEquipe = {}): Lecture<c.ListeEquipe> {
  return useRequete(op.OP_EQUIPE, filtre);
}

/** La fiche d'une personne vue par le patron : 90 jours de billets, écarts, journal. */
export function useFichePersonne(personneId: string): Lecture<c.FichePersonne> {
  return useRequete(op.OP_FICHE_PERSONNE, { personneId });
}

/** Payer les salaires du mois par MoMo (signé par le PIN). */
export function useLancerPaie(): Ecriture<c.LancerPaie, c.PaieLancee> {
  return useEcriture(op.OP_LANCER_PAIE, [op.OP_GARES]);
}

/* ----------------------------------------------------------------------- rapport du soir */

/** Le rapport du soir (21 h) : le dernier envoyé, ou celui du jour demandé. */
export function useRapportSoir(params: c.ParamsRapportSoir = {}): Lecture<c.RapportSoir> {
  return useRequete(op.OP_RAPPORT_SOIR, params);
}

/* ----------------------------------------------------------------------- analyses */

export function useAnalyses(periode: c.PeriodeAnalyse = "semaine"): Lecture<c.Analyses> {
  return useRequete(op.OP_ANALYSES, { periode });
}

export function useAnalyseLigne(
  ligneId: string,
  periode?: c.PeriodeAnalyse,
): Lecture<c.AnalyseLigne> {
  return useRequete(op.OP_ANALYSE_LIGNE, periode ? { ligneId, periode } : { ligneId });
}

export function useAnalyseBus(busId: string): Lecture<c.AnalyseBus> {
  return useRequete(op.OP_ANALYSE_BUS, { busId });
}

/* ----------------------------------------------------------------------- assistant */

/** Argent qui fuit, argent à gagner, questions suggérées. */
export function useInsightsAssistant(): Lecture<c.InsightsAssistant> {
  return useRequete(op.OP_INSIGHTS, undefined);
}

/** La conversation en cours avec l'assistant. */
export function useConversationAssistant(): Lecture<c.ConversationAssistant> {
  return useRequete(op.OP_CONVERSATION, undefined);
}

/** Question libre en français (texte ou transcription vocale). */
export function usePoserQuestion(): Ecriture<c.QuestionAssistant, c.ReponseAssistant> {
  return useEcriture(op.OP_QUESTION_ASSISTANT, [op.OP_CONVERSATION]);
}

/** Simulation d'horaire ou de prix : ne change rien. */
export function useSimuler(): Ecriture<c.DemandeSimulation, c.ResultatSimulation> {
  return useMutationApi(op.OP_SIMULATION);
}

/** Appliquer une proposition de l'assistant (signé par le PIN). */
export function useAppliquerProposition(): Ecriture<
  c.AppliquerProposition,
  c.PropositionAppliquee
> {
  return useEcriture(op.OP_APPLIQUER_PROPOSITION, [
    op.OP_INSIGHTS,
    op.OP_REGLAGES,
    op.OP_REGLES,
    op.OP_LIGNE_EDITABLE,
  ]);
}

/* ----------------------------------------------------------------------- comptable */

export function useSyntheseComptable(mois?: string): Lecture<c.SyntheseComptable> {
  return useRequete(op.OP_COMPTABLE, mois ? { mois } : {});
}

/** Aperçu d'un export (pop-up) : les premières lignes, le total, la signature du fichier. */
export function useApercuExport(exportId: c.IdExport, mois?: string): Lecture<c.ApercuExport> {
  return useRequete(op.OP_APERCU_EXPORT, mois ? { exportId, mois } : { exportId });
}

/** Les transactions MoMo sans billet ni colis, avec la cause probable. */
export function useRapprochementMomo(mois?: string): Lecture<c.RapprochementMomo> {
  return useRequete(op.OP_RAPPROCHEMENT, mois ? { mois } : {});
}

/** Appliquer les décisions du rapprochement (signé par le PIN). */
export function useAppliquerRapprochement(): Ecriture<
  c.AppliquerRapprochement,
  c.RapprochementApplique
> {
  return useEcriture(op.OP_APPLIQUER_RAPPROCHEMENT, [
    op.OP_RAPPROCHEMENT,
    op.OP_COMPTABLE,
    op.OP_ALERTES,
  ]);
}

/** Le mois clôturé et envoyé au cabinet (ou ce qui va l'être). */
export function useClotureMois(mois?: string): Lecture<c.ClotureMois> {
  return useRequete(op.OP_CLOTURE, mois ? { mois } : {});
}

/** Clôturer le mois et tout envoyer au cabinet (signé par le PIN). */
export function useCloturerMois(): Ecriture<c.CloturerMois, c.MoisCloture> {
  return useEcriture(op.OP_CLOTURER, [op.OP_CLOTURE, op.OP_COMPTABLE]);
}

/* ----------------------------------------------------------------------- réglages */

/** Accueil des réglages : lignes et tarifs, équipe, règles. */
export function useReglages(): Lecture<c.Reglages> {
  return useRequete(op.OP_REGLAGES, undefined);
}

export function useRegles(): Lecture<c.ReglesAgence> {
  return useRequete(op.OP_REGLES, undefined);
}

export function useLigneEditable(ligneId: string): Lecture<c.LigneEditable> {
  return useRequete(op.OP_LIGNE_EDITABLE, { ligneId });
}

export function usePersonneEditable(personneId: string): Lecture<c.PersonneEditable> {
  return useRequete(op.OP_PERSONNE_EDITABLE, { personneId });
}

const APRES_LIGNE = [
  op.OP_LIGNE_EDITABLE,
  op.OP_REGLAGES,
  op.OP_ANALYSE_LIGNE,
  op.OP_ANALYSES,
] as const;
const APRES_PERSONNE = [
  op.OP_PERSONNE_EDITABLE,
  op.OP_EQUIPE,
  op.OP_REGLAGES,
  op.OP_GARES,
  op.OP_FICHE_PERSONNE,
] as const;

/** Publier les modifications d'une ligne : départs, tarifs, arrêts, plan de sièges (signé par le PIN). */
export function useModifierLigne(): Ecriture<c.ModifierLigne, c.LignePubliee> {
  return useEcriture(op.OP_MODIFIER_LIGNE, APRES_LIGNE);
}

export function useCreerLigne(): Ecriture<c.CreerLigne, c.LignePubliee> {
  return useEcriture(op.OP_CREER_LIGNE, APRES_LIGNE);
}

export function useModifierPersonne(): Ecriture<c.ModifierPersonne, c.PersonneEnregistree> {
  return useEcriture(op.OP_MODIFIER_PERSONNE, APRES_PERSONNE);
}

export function useCreerPersonne(): Ecriture<c.CreerPersonne, c.PersonneEnregistree> {
  return useEcriture(op.OP_CREER_PERSONNE, APRES_PERSONNE);
}

export function useDesactiverPersonne(): Ecriture<c.DesactiverPersonne, c.PersonneDesactivee> {
  return useEcriture(op.OP_DESACTIVER_PERSONNE, APRES_PERSONNE);
}

export function useNouveauPinProvisoire(): Ecriture<c.NouveauPinProvisoire, c.PinProvisoireEnvoye> {
  return useMutationApi(op.OP_PIN_PROVISOIRE);
}

export function useEnregistrerRegles(): Ecriture<c.EnregistrerRegles, c.ReglesEnregistrees> {
  return useEcriture(op.OP_ENREGISTRER_REGLES, [op.OP_REGLES, op.OP_REGLAGES]);
}

/** Étape 1 du changement de compte MoMo : le SMS part vers l'ancien numéro. */
export function useDemanderConfirmationCompteMomo(): Ecriture<
  c.DemanderConfirmationCompteMomo,
  c.ConfirmationCompteMomoEnvoyee
> {
  return useMutationApi(op.OP_CONFIRMER_COMPTE_MOMO);
}

/** Étape 2 : changer le compte avec le code reçu. */
export function useChangerCompteMomo(): Ecriture<c.ChangerCompteMomo, c.CompteMomoChange> {
  return useEcriture(op.OP_CHANGER_COMPTE_MOMO, [op.OP_REGLES, op.OP_REGLAGES]);
}

/* ----------------------------------------------------------------------- modules */

export function useModules(): Lecture<c.ModulesAgence> {
  return useRequete(op.OP_MODULES, undefined);
}

/** Allumer ou masquer un module pour l'agence, une gare ou une ville (signé par le PIN). */
export function useChangerModule(): Ecriture<c.ChangerModule, c.ModuleChange> {
  return useEcriture(op.OP_CHANGER_MODULE, [op.OP_MODULES]);
}

/* ----------------------------------------------------------------------- financement */

export function useOffreFinancement(): Lecture<c.OffreFinancement> {
  return useRequete(op.OP_OFFRE_FINANCEMENT, undefined);
}

export function useDossierFinancement(dossierId: string): Lecture<c.DossierFinancement> {
  return useRequete(op.OP_DOSSIER_FINANCEMENT, { dossierId });
}

export function useDemanderAvance(): Ecriture<c.DemanderAvance, c.AvanceDemandee> {
  return useEcriture(op.OP_DEMANDER_AVANCE, [op.OP_OFFRE_FINANCEMENT, op.OP_ALERTES]);
}

export function useRetirerDemande(): Ecriture<c.RetirerDemande, c.DemandeRetiree> {
  return useEcriture(op.OP_RETIRER_DEMANDE, [op.OP_DOSSIER_FINANCEMENT, op.OP_OFFRE_FINANCEMENT]);
}

/** Activer ou couper le paiement du billet en 2 fois pour l'agence (signé par le PIN). */
export function useReglerBilletEnDeuxFois(): Ecriture<
  c.ReglerBilletEnDeuxFois,
  c.BilletEnDeuxFoisRegle
> {
  return useEcriture(op.OP_REGLER_BILLET_EN_DEUX_FOIS, [op.OP_OFFRE_FINANCEMENT]);
}

/* ----------------------------------------------------------------------- entre compagnies */

export function useInterAgences(): Lecture<c.InterAgences> {
  return useRequete(op.OP_INTER_AGENCES, undefined);
}

export function useConventionInterAgences(conventionId: string): Lecture<c.Convention> {
  return useRequete(op.OP_CONVENTION, { conventionId });
}

/* ----------------------------------------------------------------------- salle de contrôle */

export function useSalleDeControle(): Lecture<c.SalleDeControle> {
  return useRequete(op.OP_SALLE_DE_CONTROLE, undefined);
}

/** Temps réel de la salle de contrôle : chiffres, gares, éléments « à traiter ». */
export function useDirectControle(
  options?: OptionsFluxReact,
): ResultatFlux<c.MessageDirectControle> {
  return useFlux(op.CANAL_DIRECT_CONTROLE, undefined, options);
}
