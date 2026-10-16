import type { ReactNode } from "react";
import styles from "./TuileKpi.module.css";
import { classes } from "./internes/classes";
import type { EtatDonnees } from "./types";

export type TailleTuileKpi =
  /** 18 px : trio Recette / Dépenses / Net de AnalysesBus. */
  | "compacte"
  /** 30 px : tuiles de la salle de contrôle (Controle, 1280 px). */
  | "large"
  /** 40 px : grande carte « Aujourd'hui · en direct » de Patron. */
  | "affiche";

export interface TuileKpiProps {
  /** Étiquette en Geist Mono capitales, ex. « Recette du jour ». */
  etiquette: string;
  /** Valeur en Bricolage Grotesque, ex. « 2,61 M ». */
  valeur: ReactNode;
  /** Sous-ligne, ex. « dont 37 en ligne · 11 en route ». */
  sousLigne?: ReactNode;
  /** Évolution à droite de la valeur, ex. « + 8 % ». */
  tendance?: ReactNode;
  /** Couleur de la tendance (vert par défaut). */
  etatTendance?: EtatDonnees;
  /** Mention à droite de l'étiquette, ex. « vs mardi dernier ». */
  note?: ReactNode;
  /** Couleur d'état de la valeur. */
  etat?: EtatDonnees;
  /** Fond et bord teintés (ambre ou rouge) avec l'étiquette de la même couleur : tuile d'alerte. */
  teinte?: "ambre" | "rouge";
  /** Étiquette en ambre sans teinter la tuile (carte Patron et graphiques). */
  etiquetteAmbre?: boolean;
  taille?: TailleTuileKpi;
  /** Sous-éléments sous la valeur (ex. une grille de `ChiffreCle`). */
  children?: ReactNode;
  /** Remplace le libellé lu par les lecteurs d'écran (par défaut « étiquette : valeur »). */
  ariaLabel?: string;
  className?: string;
}

function texteDe(noeud: ReactNode): string {
  return typeof noeud === "string" || typeof noeud === "number" ? String(noeud) : "";
}

/**
 * Tuile KPI : étiquette mono, valeur Bricolage, sous-ligne, couleur d'état.
 * Planches : Patron, AnalysesBus, Controle.
 */
export function TuileKpi({
  etiquette,
  valeur,
  sousLigne,
  tendance,
  etatTendance = "vert",
  note,
  etat = "neutre",
  teinte,
  etiquetteAmbre = false,
  taille = "compacte",
  children,
  ariaLabel,
  className,
}: TuileKpiProps) {
  const resume = [etiquette, texteDe(valeur), texteDe(tendance), texteDe(sousLigne)]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? resume}
      className={classes(styles.tuile, className)}
      data-taille={taille}
      data-etat={etat}
      data-teinte={teinte}
      data-etiquette-ambre={etiquetteAmbre || teinte ? "oui" : undefined}
    >
      <div className={styles.entete}>
        <span className={styles.etiquette}>{etiquette}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </div>
      <div className={styles.ligneValeur}>
        <span className={styles.valeur}>{valeur}</span>
        {tendance ? (
          <span className={styles.tendance} data-etat={etatTendance}>
            {tendance}
          </span>
        ) : null}
      </div>
      {sousLigne ? <span className={styles.sousLigne}>{sousLigne}</span> : null}
      {children}
    </div>
  );
}

export interface ChiffreCleProps {
  valeur: ReactNode;
  libelle: string;
  etat?: EtatDonnees;
}

/** Petit chiffre sans cadre (18 px) + libellé 10 px : la grille de 4 de la carte Patron. */
export function ChiffreCle({ valeur, libelle, etat = "neutre" }: ChiffreCleProps) {
  return (
    <span className={styles.chiffre} data-etat={etat}>
      <span className={styles.chiffreValeur}>{valeur}</span>
      <span className={styles.chiffreLibelle}>{libelle}</span>
    </span>
  );
}
