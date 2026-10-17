import { useQueryClient } from "@tanstack/react-query";
import { voyageur as c } from "@afrimove/contrats";
import { z } from "zod";
import { definirOperation } from "../infra/operations";
import { useMutationApi, useRequete } from "../infra/react";
import type { OptionsRequete } from "../infra/react";
import { OP_SUIVI_BUS } from "./operationsServices";

/**
 * Compléments de « Mon bus en direct » (AM-040) : ce que la planche Direct fait et que `suivi.ts` ne couvre pas
 * encore (ne plus prévenir un proche, signaler un problème, joindre le chauffeur, retrouver son colis). Les schémas
 * sont ici, en attendant d'être repris dans `packages/contrats/src/voyageur/suivi.ts` ; l'API réelle les sert sous
 * `/voyageur/billets/:id/…` (voir apps/api/src/gps/README.md pour « ne plus prévenir »).
 */

/* ------------------------------------------------------------------ schémas */

export const SchemaMotifSignalement = z.enum(["retard", "conduite", "incident"]);
export type MotifSignalement = z.infer<typeof SchemaMotifSignalement>;

export const SchemaSignalerTrajet = z.object({
  billetId: c.SchemaId,
  motif: SchemaMotifSignalement,
});
export type SignalerTrajet = z.infer<typeof SchemaSignalerTrajet>;

export const SchemaSignalementEnvoye = z.object({
  id: c.SchemaId,
  billetId: c.SchemaId,
  motif: SchemaMotifSignalement,
  /** Gare qui reçoit le signalement (« Douala Akwa »). */
  transmisA: z.string(),
  creeA: c.SchemaIsoDouala,
});
export type SignalementEnvoye = z.infer<typeof SchemaSignalementEnvoye>;

export const SchemaChauffeurBus = z.object({
  nom: z.string(),
  telephone: c.SchemaTelephone,
});
export type ChauffeurBus = z.infer<typeof SchemaChauffeurBus>;

export const SchemaColisDuBillet = z.object({
  billetId: c.SchemaId,
  /** Colis du voyageur sur ce trajet ; `null` s'il n'en a pas. */
  colisId: c.SchemaId.nullable(),
});
export type ColisDuBillet = z.infer<typeof SchemaColisDuBillet>;

/* ------------------------------------------------------------------ opérations */

const enc = encodeURIComponent;

export const OP_NE_PLUS_PREVENIR_PROCHE = definirOperation<
  { billetId: string; procheId: string },
  c.ResultatPrevenirProche
>({
  nom: "voyageur.suivi.nePlusPrevenirProche",
  methode: "DELETE",
  chemin: (p) => `/voyageur/billets/${enc(p.billetId)}/prevenir/${enc(p.procheId)}`,
  reponse: c.SchemaResultatPrevenirProche,
});

export const OP_SIGNALER_TRAJET = definirOperation<SignalerTrajet, SignalementEnvoye>({
  nom: "voyageur.suivi.signaler",
  methode: "POST",
  chemin: (p) => `/voyageur/billets/${enc(p.billetId)}/direct/signalements`,
  corps: (p) => ({ motif: p.motif }),
  reponse: SchemaSignalementEnvoye,
});

export const OP_CHAUFFEUR_BUS = definirOperation<{ billetId: string }, ChauffeurBus>({
  nom: "voyageur.suivi.chauffeur",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${enc(p.billetId)}/direct/chauffeur`,
  reponse: SchemaChauffeurBus,
});

export const OP_COLIS_DU_BILLET = definirOperation<{ billetId: string }, ColisDuBillet>({
  nom: "voyageur.suivi.colis",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${enc(p.billetId)}/direct/colis`,
  reponse: SchemaColisDuBillet,
});

/* ------------------------------------------------------------------ hooks */

type Opt<R> = OptionsRequete<R> | undefined;

/** Ne plus prévenir le proche (tant que le SMS n'est pas parti) : rafraîchit le suivi du bus. */
export function useNePlusPrevenirProche() {
  const cache = useQueryClient();
  return useMutationApi(OP_NE_PLUS_PREVENIR_PROCHE, {
    onSuccess: () => cache.invalidateQueries({ queryKey: [OP_SUIVI_BUS.nom] }),
  });
}

export const useSignalerTrajet = () => useMutationApi(OP_SIGNALER_TRAJET);

export const useChauffeurBus = (params: { billetId: string }, options?: Opt<ChauffeurBus>) =>
  useRequete(OP_CHAUFFEUR_BUS, params, options);

export const useColisDuBillet = (params: { billetId: string }, options?: Opt<ColisDuBillet>) =>
  useRequete(OP_COLIS_DU_BILLET, params, options);
