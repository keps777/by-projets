import type { ecrans } from "@afrimove/fixtures";
import type { Poseur } from "./utilitaires";

/** Les 17 planches de l'agence, telles qu'elles sont nommées dans `@afrimove/fixtures`. */
export const PLANCHES_AGENCE = [
  "Guichet",
  "Vente",
  "Cadence",
  "CadenceBillet",
  "CadenceQuai",
  "GuichetColis",
  "Depot",
  "Quai",
  "Convoyeur",
  "Chauffeur",
  "Controleur",
  "Caisse",
  "Superviseur",
  "SuperviseurValider",
  "SuperviseurVoir",
  "SuperviseurEquipe",
  "SuperviseurDebloquer",
] as const satisfies readonly (keyof typeof ecrans)[];

export type NomPlancheAgence = (typeof PLANCHES_AGENCE)[number];

/** Le scénario d'une planche, avec le type exact de ses données. */
export type EcranAgence<K extends NomPlancheAgence> = (typeof ecrans)[K];

/** Ce qu'un module de planche fait : déclarer, via le poseur, les réponses de ses hooks. */
export type InstallateurPlanche<K extends NomPlancheAgence> = (
  ecran: EcranAgence<K>,
  poseur: Poseur,
) => void;
