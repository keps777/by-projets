import { HorlogeFixe } from "../../socle/testing/memoire";
import { AttributionPlagesServeur, ControleNumerosServeur } from "../adaptateurs";
import { ControleJourneeService } from "../controle-journee.service";
import {
  AlertesNumerotationMemoire,
  PlagesAttribueesMemoire,
  RegistreNumerosMemoire,
} from "../memoire";
import { NumerotationService } from "../numerotation.service";
import { PlagesService } from "../plages.service";

export const COMPAGNIE = "00000000-0000-4000-8000-0000000000c1";
export const GARE = "00000000-0000-4000-8000-0000000000a1";
export const AUTRE_GARE = "00000000-0000-4000-8000-0000000000a2";

/** Toute la numérotation sur les adaptateurs en mémoire, sans Nest : pour les tests unitaires. */
export function monterNumerotation(debut = new Date("2027-01-05T20:00:00.000Z")) {
  const horloge = new HorlogeFixe(debut);
  const plagesStock = new PlagesAttribueesMemoire();
  const registre = new RegistreNumerosMemoire();
  const alertesStock = new AlertesNumerotationMemoire();
  const plages = new PlagesService(plagesStock, horloge);
  const numerotation = new NumerotationService(plagesStock, registre, horloge);
  const controle = new ControleJourneeService(plagesStock, registre, alertesStock, horloge);
  return {
    horloge,
    plagesStock,
    registre,
    alertesStock,
    plages,
    numerotation,
    controle,
    controleNumeros: new ControleNumerosServeur(numerotation, registre, plagesStock),
    attribution: new AttributionPlagesServeur(plagesStock),
  };
}

export type MontageNumerotation = ReturnType<typeof monterNumerotation>;

let compteur = 0;
/** UUID lisible et unique dans un test. */
export const uuid = (): string => `00000000-0000-4000-8000-${String(++compteur).padStart(12, "0")}`;
