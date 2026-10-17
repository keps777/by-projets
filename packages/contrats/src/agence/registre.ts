import type { z } from "zod";
import { EVENEMENT_ANNULATION_DECIDEE, EVENEMENT_ANNULATION_DEMANDEE } from "./supervision";
import {
  EVENEMENT_APPAREIL_DEBLOQUE,
  EVENEMENT_CAISSE_REFUSEE,
  EVENEMENT_CAISSE_VALIDEE,
  EVENEMENT_EQUIPE_AFFECTATION_CHANGEE,
  EVENEMENT_EQUIPE_COMPTE_DESACTIVE,
  EVENEMENT_EQUIPE_PERSONNE_DEBLOQUEE,
  EVENEMENT_EQUIPE_PIN_RENOUVELE,
} from "./supervision";
import {
  EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET,
  EVENEMENT_CHAUFFEUR_DEPENSE,
  EVENEMENT_CHAUFFEUR_INCIDENT,
  EVENEMENT_CHAUFFEUR_RETARD,
  EVENEMENT_CONTROLE_CLOTURE,
  EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE,
  EVENEMENT_CONTROLE_REGULARISE,
  EVENEMENT_CONTROLE_SIEGE_VERIFIE,
  EVENEMENT_ROUTE_BILLET_VENDU,
  EVENEMENT_ROUTE_COLIS_DECHARGES,
  EVENEMENT_ROUTE_SCANNE,
} from "./bus";
import {
  EVENEMENT_CAISSE_CLOTUREE,
  EVENEMENT_CAISSE_COMPTEE,
  EVENEMENT_CAISSE_OUVERTE,
} from "./caisse";
import { EVENEMENT_COLIS_DEPOSE, EVENEMENT_COLIS_ENREGISTRE } from "./colis";
import { EVENEMENT_IMPRESSION_DEMANDEE } from "./impression";
import {
  EVENEMENT_BILLET_COMPLETE,
  EVENEMENT_QUAI_CODE_SAISI,
  EVENEMENT_QUAI_LIBERE,
  EVENEMENT_QUAI_LISTE_ENVOYEE,
  EVENEMENT_QUAI_SCANNE,
} from "./quai";
import {
  EVENEMENT_BILLET_TELEPHONE_AJOUTE,
  EVENEMENT_BILLET_VENDU,
  EVENEMENT_BILLET_VENDU_CADENCE,
} from "./vente";

/**
 * Tous les types d'événements que l'agence écrit. C'est la liste que le moteur hors ligne (AM-160)
 * met en file, rejoue au retour du réseau et que le serveur valide.
 */
export const EVENEMENTS_AGENCE = [
  // caisse
  EVENEMENT_CAISSE_OUVERTE,
  EVENEMENT_CAISSE_COMPTEE,
  EVENEMENT_CAISSE_CLOTUREE,
  // vente au guichet et cadence
  EVENEMENT_BILLET_VENDU,
  EVENEMENT_BILLET_VENDU_CADENCE,
  EVENEMENT_BILLET_TELEPHONE_AJOUTE,
  // colis
  EVENEMENT_COLIS_ENREGISTRE,
  EVENEMENT_COLIS_DEPOSE,
  // impression
  EVENEMENT_IMPRESSION_DEMANDEE,
  // quai
  EVENEMENT_QUAI_SCANNE,
  EVENEMENT_QUAI_CODE_SAISI,
  EVENEMENT_BILLET_COMPLETE,
  EVENEMENT_QUAI_LIBERE,
  EVENEMENT_QUAI_LISTE_ENVOYEE,
  // convoyeur
  EVENEMENT_ROUTE_BILLET_VENDU,
  EVENEMENT_ROUTE_SCANNE,
  EVENEMENT_ROUTE_COLIS_DECHARGES,
  // chauffeur
  EVENEMENT_CHAUFFEUR_DEPENSE,
  EVENEMENT_CHAUFFEUR_INCIDENT,
  EVENEMENT_CHAUFFEUR_RETARD,
  EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET,
  // contrôle inopiné
  EVENEMENT_CONTROLE_SIEGE_VERIFIE,
  EVENEMENT_CONTROLE_REGULARISE,
  EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE,
  EVENEMENT_CONTROLE_CLOTURE,
  // supervision
  EVENEMENT_ANNULATION_DEMANDEE,
  EVENEMENT_ANNULATION_DECIDEE,
  EVENEMENT_CAISSE_VALIDEE,
  EVENEMENT_CAISSE_REFUSEE,
  EVENEMENT_EQUIPE_PIN_RENOUVELE,
  EVENEMENT_EQUIPE_AFFECTATION_CHANGEE,
  EVENEMENT_EQUIPE_COMPTE_DESACTIVE,
  EVENEMENT_EQUIPE_PERSONNE_DEBLOQUEE,
  EVENEMENT_APPAREIL_DEBLOQUE,
] as const;

export type DefinitionEvenementAgence = (typeof EVENEMENTS_AGENCE)[number];
export type TypeEvenementAgence = DefinitionEvenementAgence["type"];

/** Les types d'événements qui créent un document numéroté dans la plage de l'appareil. */
export const TYPES_EVENEMENT_NUMEROTES: readonly TypeEvenementAgence[] = EVENEMENTS_AGENCE.filter(
  (e) => e.numerote,
).map((e) => e.type);

export function definitionEvenementAgence(type: string): DefinitionEvenementAgence | undefined {
  return EVENEMENTS_AGENCE.find((e) => e.type === type);
}

export type ResultatLectureEvenement =
  | { ok: true; type: TypeEvenementAgence; evenement: unknown }
  | { ok: false; erreur: string; details?: z.core.$ZodIssue[] };

/**
 * Valide un événement reçu (file hors ligne, serveur) : trouve son type puis applique le schéma
 * complet, identifiant UUID et numéro de plage compris.
 */
export function lireEvenementAgence(brut: unknown): ResultatLectureEvenement {
  const type = (brut as { type?: unknown } | null)?.type;
  if (typeof type !== "string") return { ok: false, erreur: "Événement sans type" };
  const definition = definitionEvenementAgence(type);
  if (!definition) return { ok: false, erreur: `Type d'événement inconnu : ${type}` };
  const resultat = (definition.schema as z.ZodType).safeParse(brut);
  if (!resultat.success) {
    return { ok: false, erreur: `Événement ${type} invalide`, details: resultat.error.issues };
  }
  return { ok: true, type: definition.type, evenement: resultat.data };
}
