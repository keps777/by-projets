import { useState } from "react";
import type { ReactNode } from "react";
import { classes } from "./format";
import styles from "./plan-sieges.module.css";

export type EtatSiege = "libre" | "pris" | "choisi" | "toi";
export type EtatSiegeControle = "scanne" | "sans-billet" | "libre";

type Commun = {
  /** Nombre de sièges, de 16 à 40 dans les maquettes. */
  nombre: number;
  /** Titre de l'en-tête : « Choisis ta place ». */
  titre?: ReactNode;
  /** Texte à droite de l'en-tête (mode contrôle : « 36 sièges »). En mode choix, la légende prend cette place. */
  info?: ReactNode;
  /** Afficher la légende des couleurs (oui par défaut). */
  legende?: boolean;
  className?: string;
};

export type PropsPlanSiegesChoix = Commun & {
  mode?: "choix";
  /** Numéros des sièges déjà pris. */
  pris?: readonly number[];
  /** Siège déjà attribué au voyageur (non modifiable). */
  toi?: number;
  /** Sélection pilotée de l'extérieur. */
  selection?: readonly number[];
  /** Sélection de départ quand le composant gère lui-même son état. */
  selectionInitiale?: readonly number[];
  /** Nombre maximal de sièges choisis en même temps (1 : le dernier touché remplace le précédent). */
  max?: number;
  onSelectionChange?: (selection: number[]) => void;
  /** Sièges de chaque côté de l'allée : 2 + 2 par défaut. */
  disposition?: { gauche: number; droite: number };
  /** Afficher le repère du chauffeur (oui par défaut). */
  chauffeur?: boolean;
  /** Contenu sous le plan : « Siège 7 · côté fenêtre » et « 9 places libres ». */
  pied?: ReactNode;
};

export type PropsPlanSiegesControle = Commun & {
  mode: "controle";
  scannes?: readonly number[];
  sansBillet?: readonly number[];
  /** Colonnes de la grille de contrôle : 9 dans la maquette. */
  colonnes?: number;
  /** Rend les sièges touchables : « touche un siège pour vérifier ». */
  onSiege?: (numero: number, etat: EtatSiegeControle) => void;
  pied?: ReactNode;
};

export type PropsPlanSieges = PropsPlanSiegesChoix | PropsPlanSiegesControle;

const LIBELLES_ETAT: Record<EtatSiege, string> = {
  libre: "libre",
  pris: "pris",
  choisi: "choisi",
  toi: "à toi",
};

const LIBELLES_CONTROLE: Record<EtatSiegeControle, string> = {
  scanne: "billet scanné",
  "sans-billet": "occupé sans billet",
  libre: "libre",
};

function numeros(nombre: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(nombre)) }, (_, i) => i + 1);
}

function Legende({ elements }: { elements: { etat: string; texte: string }[] }) {
  return (
    <span className={styles.legende}>
      {elements.map((element) => (
        <span key={element.etat}>
          <span className={styles.pastille} data-etat={element.etat} aria-hidden="true" />{" "}
          {element.texte}
        </span>
      ))}
    </span>
  );
}

function PlanChoix({
  nombre,
  titre,
  info,
  legende = true,
  className,
  pris = [],
  toi,
  selection,
  selectionInitiale = [],
  max = 1,
  onSelectionChange,
  disposition = { gauche: 2, droite: 2 },
  chauffeur = true,
  pied,
}: PropsPlanSiegesChoix) {
  const [interne, setInterne] = useState<readonly number[]>(selectionInitiale);
  const choisis = selection ?? interne;
  const parRangee = Math.max(1, disposition.gauche + disposition.droite);

  function toucher(numero: number) {
    const suivante = choisis.includes(numero)
      ? choisis.filter((n) => n !== numero)
      : [...choisis, numero].slice(-Math.max(1, max));
    if (selection === undefined) setInterne(suivante);
    onSelectionChange?.(suivante);
  }

  function etatDe(numero: number): EtatSiege {
    if (toi === numero) return "toi";
    if (pris.includes(numero)) return "pris";
    if (choisis.includes(numero)) return "choisi";
    return "libre";
  }

  const cellules: ReactNode[] = [];
  for (const numero of numeros(nombre)) {
    const colonne = (numero - 1) % parRangee;
    if (colonne === disposition.gauche && disposition.gauche > 0 && disposition.droite > 0) {
      cellules.push(<span key={`allee-${numero}`} aria-hidden="true" />);
    }
    const etat = etatDe(numero);
    const bloque = etat === "pris" || etat === "toi";
    cellules.push(
      <button
        key={numero}
        type="button"
        className={styles.siege}
        data-etat={etat}
        disabled={bloque}
        aria-pressed={bloque ? undefined : etat === "choisi"}
        aria-label={`Siège ${numero}, ${LIBELLES_ETAT[etat]}`}
        onClick={() => toucher(numero)}
      >
        {numero}
      </button>,
    );
  }

  const colonnesGrille = parRangee + (disposition.gauche > 0 && disposition.droite > 0 ? 1 : 0);

  return (
    <div className={classes(styles.plan, className)} data-mode="choix">
      <div className={styles.entete}>
        <span>{titre}</span>
        {legende ? (
          <Legende
            elements={[
              { etat: "pris", texte: "prise" },
              { etat: "libre", texte: "libre" },
              { etat: "choisi", texte: "toi" },
            ]}
          />
        ) : (
          info
        )}
      </div>
      {chauffeur ? (
        <div className={styles.chauffeurLigne}>
          <span className={styles.chauffeur}>chauffeur</span>
        </div>
      ) : null}
      <div
        className={styles.grille}
        role="group"
        aria-label="Plan des sièges"
        style={{ gridTemplateColumns: `repeat(${colonnesGrille}, minmax(0, 1fr))` }}
      >
        {cellules}
      </div>
      {pied ? <div className={styles.pied}>{pied}</div> : null}
    </div>
  );
}

function PlanControle({
  nombre,
  titre,
  info,
  legende = true,
  className,
  scannes = [],
  sansBillet = [],
  colonnes = 9,
  onSiege,
  pied,
}: PropsPlanSiegesControle) {
  function etatDe(numero: number): EtatSiegeControle {
    if (sansBillet.includes(numero)) return "sans-billet";
    if (scannes.includes(numero)) return "scanne";
    return "libre";
  }

  return (
    <div className={classes(styles.plan, className)} data-mode="controle">
      <div className={styles.entete}>
        <span>{titre}</span>
        <span className={styles.info}>{info}</span>
      </div>
      <div
        className={styles.grilleControle}
        role="group"
        aria-label="Plan de contrôle des sièges"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, colonnes)}, minmax(0, 1fr))` }}
      >
        {numeros(nombre).map((numero) => {
          const etat = etatDe(numero);
          const libelle = `Siège ${numero}, ${LIBELLES_CONTROLE[etat]}`;
          return onSiege ? (
            <button
              key={numero}
              type="button"
              className={styles.siegeControle}
              data-etat={etat}
              aria-label={libelle}
              onClick={() => onSiege(numero, etat)}
            >
              {numero}
            </button>
          ) : (
            <span
              key={numero}
              role="img"
              className={styles.siegeControle}
              data-etat={etat}
              aria-label={libelle}
            >
              {numero}
            </span>
          );
        })}
      </div>
      {legende ? (
        <Legende
          elements={[
            { etat: "scanne", texte: "billet scanné" },
            { etat: "sans-billet", texte: "occupé sans billet" },
            { etat: "libre", texte: "libre" },
          ]}
        />
      ) : null}
      {pied ? <div className={styles.pied}>{pied}</div> : null}
    </div>
  );
}

/**
 * Plan de sièges d'un bus. En mode « choix » (maquette SiegePay) le voyageur touche un siège libre ;
 * en mode « controle » (maquette Controleur) le contrôleur voit pour chaque siège s'il est scanné,
 * occupé sans billet ou libre.
 */
export function PlanSieges(props: PropsPlanSieges) {
  return props.mode === "controle" ? <PlanControle {...props} /> : <PlanChoix {...props} />;
}
