import type { ReactNode } from "react";
import type { Planche } from "@/coquille/planches";
import {
  IconeAnalyses,
  IconeComptable,
  IconeControle,
  IconeFinancement,
  IconeGares,
  IconeInterAgences,
  IconeModules,
  IconeRapports,
  IconeReglages,
} from "./icones";

export interface TuilePatron {
  /** Clé i18n sous `tuiles.<cle>` (titre, detail). */
  cle:
    | "analyses"
    | "gares"
    | "rapports"
    | "comptable"
    | "financement"
    | "interAgences"
    | "reglages"
    | "modules"
    | "controle";
  /** Planche vers laquelle mène la tuile. */
  planche: Planche;
  icone: ReactNode;
}

/**
 * Les neuf tuiles de la planche, dans l'ordre de la grille. Une tuile dont l'écran appartient à un module masqué
 * disparaît (c'est l'adresse de l'écran qui dit de quel module il dépend : `moduleDeLUrl`, comme les routes).
 */
export const TUILES: readonly TuilePatron[] = [
  { cle: "analyses", planche: "Analyses", icone: <IconeAnalyses /> },
  { cle: "gares", planche: "PatronEquipe", icone: <IconeGares /> },
  { cle: "rapports", planche: "RapportSoir", icone: <IconeRapports /> },
  { cle: "comptable", planche: "Comptable", icone: <IconeComptable /> },
  { cle: "financement", planche: "Financement", icone: <IconeFinancement /> },
  { cle: "interAgences", planche: "InterAgences", icone: <IconeInterAgences /> },
  { cle: "reglages", planche: "Config", icone: <IconeReglages /> },
  { cle: "modules", planche: "Modules", icone: <IconeModules /> },
  { cle: "controle", planche: "Controle", icone: <IconeControle /> },
];
