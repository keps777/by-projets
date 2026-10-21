import { AppliquerPropositionSchema } from "./assistant";
import { AppliquerRapprochementSchema, CloturerMoisSchema } from "./comptable";
import {
  DemanderAvanceSchema,
  ReglerBilletEnDeuxFoisSchema,
  RetirerDemandeSchema,
} from "./financement";
import { ChangerModuleSchema } from "./modules";
import {
  ChangerCompteMomoSchema,
  CreerLigneSchema,
  CreerPersonneSchema,
  DemanderConfirmationCompteMomoSchema,
  DesactiverPersonneSchema,
  EnregistrerReglesSchema,
  LancerPaieSchema,
  ModifierLigneSchema,
  ModifierPersonneSchema,
  NouveauPinProvisoireSchema,
} from "./reglages";

/**
 * Toutes les écritures du patron, par nom d'opération. Chacune est une `commandeSignee` : le corps
 * porte une `signature` PIN obligatoire. Le test `commandes.test.ts` parcourt ce registre : une
 * écriture ajoutée à l'API sans passer par ici (ou sans signature) fait échouer la suite.
 */
export const COMMANDES_REGLAGES = {
  "patron.reglages.ligne.modifier": ModifierLigneSchema,
  "patron.reglages.ligne.creer": CreerLigneSchema,
  "patron.reglages.personne.modifier": ModifierPersonneSchema,
  "patron.reglages.personne.creer": CreerPersonneSchema,
  "patron.reglages.personne.desactiver": DesactiverPersonneSchema,
  "patron.reglages.personne.pinProvisoire": NouveauPinProvisoireSchema,
  "patron.reglages.regles.enregistrer": EnregistrerReglesSchema,
  "patron.reglages.compteMomo.confirmer": DemanderConfirmationCompteMomoSchema,
  "patron.reglages.compteMomo.changer": ChangerCompteMomoSchema,
  "patron.modules.changer": ChangerModuleSchema,
  "patron.assistant.appliquer": AppliquerPropositionSchema,
} as const;

/** Les autres écritures du patron (argent, clôture, financement) : signées elles aussi. */
export const COMMANDES_FINANCIERES = {
  "patron.comptable.rapprochement.appliquer": AppliquerRapprochementSchema,
  "patron.comptable.cloturer": CloturerMoisSchema,
  "patron.financement.demander": DemanderAvanceSchema,
  "patron.financement.retirer": RetirerDemandeSchema,
  "patron.financement.billetEnDeuxFois": ReglerBilletEnDeuxFoisSchema,
  "patron.paie.lancer": LancerPaieSchema,
} as const;

export const COMMANDES_SIGNEES = { ...COMMANDES_REGLAGES, ...COMMANDES_FINANCIERES } as const;
export type NomCommandeSignee = keyof typeof COMMANDES_SIGNEES;
