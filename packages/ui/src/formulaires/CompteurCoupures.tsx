import type { KeyboardEvent, MouseEvent } from "react";
import styles from "./compteur.module.css";
import { classes, formaterMontant, lireEntier, useControlled } from "./utils";

export const COUPURES_PAR_DEFAUT: readonly number[] = [10000, 5000, 2000, 1000, 500];

export interface ComptageCoupures {
  /** Nombre de billets comptés, par valeur de coupure. */
  quantites: Readonly<Record<number, number>>;
  /** Montant des pièces, en francs. */
  pieces: number;
  /** Total tapé à la main ; `null` tant que le total vient des billets. */
  totalManuel: number | null;
}

export function comptageVide(): ComptageCoupures {
  return { quantites: {}, pieces: 0, totalManuel: null };
}

/** Total compté : le total tapé s'il existe, sinon billets x quantités + pièces. */
export function totalComptage(comptage: ComptageCoupures): number {
  if (comptage.totalManuel !== null) return comptage.totalManuel;
  const billets = Object.entries(comptage.quantites).reduce(
    (somme, [valeur, quantite]) => somme + Number(valeur) * quantite,
    0,
  );
  return billets + comptage.pieces;
}

export interface CompteurCoupuresProps {
  coupures?: readonly number[];
  value?: ComptageCoupures;
  defaultValue?: ComptageCoupures;
  onChange?: (comptage: ComptageCoupures, total: number) => void;
  className?: string;
}

/**
 * Compteur de coupures : toucher un billet en ajoute un (10 000 x 48...), le total se
 * recalcule. Pour retirer un billet : appui long (menu contextuel du téléphone), clic
 * droit, ou touches Retour arrière / Suppr / flèche bas sur la coupure. Le total peut
 * aussi être tapé directement.
 */
export function CompteurCoupures({
  coupures = COUPURES_PAR_DEFAUT,
  value,
  defaultValue,
  onChange,
  className,
}: CompteurCoupuresProps) {
  const [comptage, setComptage] = useControlled(value, defaultValue ?? comptageVide());
  const total = totalComptage(comptage);

  const changer = (suivant: ComptageCoupures) => {
    setComptage(suivant);
    onChange?.(suivant, totalComptage(suivant));
  };

  const modifierBillet = (valeur: number, delta: number) => {
    const actuel = comptage.quantites[valeur] ?? 0;
    const quantite = Math.max(0, actuel + delta);
    if (quantite === actuel && comptage.totalManuel === null) return;
    // Toucher un billet reprend le calcul à partir des billets.
    changer({
      ...comptage,
      quantites: { ...comptage.quantites, [valeur]: quantite },
      totalManuel: null,
    });
  };

  const auClavier = (valeur: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "ArrowDown") {
      e.preventDefault();
      modifierBillet(valeur, -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      modifierBillet(valeur, 1);
    }
  };

  const retirer = (valeur: number) => (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    modifierBillet(valeur, -1);
  };

  return (
    <div
      role="group"
      aria-label="Compteur de coupures"
      className={classes(styles.compteur, className)}
    >
      {coupures.map((valeur) => {
        const quantite = comptage.quantites[valeur] ?? 0;
        return (
          <button
            key={valeur}
            type="button"
            className={styles.tuile}
            aria-label={`Billets de ${formaterMontant(valeur)} : ${quantite} comptés. Toucher pour en ajouter un, appui long pour en retirer un.`}
            onClick={() => modifierBillet(valeur, 1)}
            onContextMenu={retirer(valeur)}
            onKeyDown={auClavier(valeur)}
          >
            <span className={styles.valeur}>{formaterMontant(valeur)}</span>
            <span className={styles.quantite}>× {quantite}</span>
          </button>
        );
      })}
      <label className={styles.tuile}>
        <span className={styles.valeur}>pièces</span>
        <input
          className={styles.piecesSaisie}
          type="text"
          inputMode="numeric"
          aria-label="Montant des pièces"
          value={String(comptage.pieces)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) =>
            changer({ ...comptage, pieces: lireEntier(e.target.value), totalManuel: null })
          }
        />
      </label>
      <label className={styles.total}>
        <span className={styles.totalLibelle}>compté</span>
        <input
          className={styles.totalSaisie}
          type="text"
          inputMode="numeric"
          aria-label="Total compté"
          value={formaterMontant(total)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => changer({ ...comptage, totalManuel: lireEntier(e.target.value) })}
        />
      </label>
    </div>
  );
}
