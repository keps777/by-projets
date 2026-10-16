import type { ReactNode } from "react";
import styles from "./TableauColonnesFixes.module.css";
import { classes } from "./internes/classes";
import type { EtatDonnees, VarianteDonnees } from "./types";

export interface ColonneTableau<T> {
  cle: string;
  titre: string;
  align?: "gauche" | "droite";
  /** Cellule en Geist Mono (chiffres, codes). */
  mono?: boolean;
  /** Cellule en gras. */
  gras?: boolean;
  /** Colonne collée à gauche quand le tableau défile (la première, en général). */
  fixe?: boolean;
  /** Contenu de la cellule ; par défaut `ligne[cle]`. */
  rendu?: (ligne: T) => ReactNode;
  /** Couleur d'état de la cellule (CASH vert, MOMO ambre, écart ambre…). */
  etat?: (ligne: T) => EtatDonnees | undefined;
}

export interface TableauColonnesFixesProps<T> {
  colonnes: ColonneTableau<T>[];
  lignes: T[];
  cleLigne: (ligne: T, index: number) => string;
  /** Nom du tableau, lu par les lecteurs d'écran. */
  ariaLabel: string;
  /**
   * - `mobile` : Geist Mono 10 px, sans retour à la ligne, entête ambre (ComptableApercu) ;
   * - `large` : Instrument Sans 13 px, entête grise en capitales mono (Controle, 1280 px).
   */
  variante?: VarianteDonnees;
  /** Largeur minimale avant que le tableau défile à l'horizontale (640 dans Controle). */
  largeurMin?: number;
  /** Pied sous le tableau (bornes des lignes, total). */
  pied?: ReactNode;
  className?: string;
}

function valeurCellule<T>(colonne: ColonneTableau<T>, ligne: T): ReactNode {
  if (colonne.rendu) return colonne.rendu(ligne);
  const brut = (ligne as Record<string, unknown>)[colonne.cle];
  return brut === undefined || brut === null ? "" : (brut as ReactNode);
}

/**
 * Tableau à colonnes fixes : le cabinet comptable importe sans retoucher, donc les colonnes ne
 * bougent pas d'une vue à l'autre ; les lignes alternent deux fonds. Planches : ComptableApercu
 * (aperçu d'un export), Controle (gares maintenant).
 */
export function TableauColonnesFixes<T>({
  colonnes,
  lignes,
  cleLigne,
  ariaLabel,
  variante = "mobile",
  largeurMin,
  pied,
  className,
}: TableauColonnesFixesProps<T>) {
  return (
    <div className={classes(styles.boite, className)} data-variante={variante}>
      <div
        className={styles.defilement}
        role="region"
        aria-label={`${ariaLabel} (défile à l'horizontale)`}
        tabIndex={0}
      >
        <table
          className={styles.tableau}
          aria-label={ariaLabel}
          style={largeurMin ? { minWidth: largeurMin } : undefined}
        >
          <thead>
            <tr>
              {colonnes.map((colonne) => (
                <th
                  key={colonne.cle}
                  scope="col"
                  className={styles.th}
                  data-align={colonne.align ?? "gauche"}
                  data-fixe={colonne.fixe ? "oui" : undefined}
                >
                  {colonne.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => (
              <tr key={cleLigne(ligne, index)} className={styles.tr} data-zebra={index % 2}>
                {colonnes.map((colonne) => (
                  <td
                    key={colonne.cle}
                    className={styles.td}
                    data-align={colonne.align ?? "gauche"}
                    data-mono={colonne.mono ? "oui" : undefined}
                    data-gras={colonne.gras ? "oui" : undefined}
                    data-fixe={colonne.fixe ? "oui" : undefined}
                    data-etat={colonne.etat?.(ligne)}
                  >
                    {valeurCellule(colonne, ligne)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pied ? <div className={styles.pied}>{pied}</div> : null}
    </div>
  );
}
