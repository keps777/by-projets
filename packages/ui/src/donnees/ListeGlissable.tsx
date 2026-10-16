import type { ReactNode } from "react";
import styles from "./ListeGlissable.module.css";
import { classes } from "./internes/classes";
import { IconeFlecheBas } from "./internes/icones";
import type { VarianteDonnees } from "./types";

export interface ListeGlissableProps {
  /** Titre en mono capitales ambre, ex. « Alertes · 6 ». */
  titre: string;
  /** Texte de droite de l'en-tête ; sans lui, « n · glisser » si `nombre` est donné. */
  mention?: ReactNode;
  /** Nombre de lignes, pour la mention « n · glisser ». */
  nombre?: number;
  /**
   * Hauteur de la zone qui défile : un nombre de pixels (168 dans Analyses) ou `"libre"` pour
   * remplir le parent (Patron : la liste prend le reste de l'écran, le parent est un flex colonne),
   * ou `"auto"` pour tout montrer sans défiler (trajets d'un bus dans AnalysesBus).
   */
  hauteur?: number | "libre" | "auto";
  /** Les lignes : des `LigneAlerte`, `LigneListe` ou tout `<li>`. */
  children: ReactNode;
  /** `large` : en-tête plus haut et rayon 18 (salle de contrôle, 1280 px). */
  variante?: VarianteDonnees;
  /** Couleur du fond sous les lignes, pour que le dégradé du bas s'y fonde. */
  fond?: "surface" | "nuit";
  className?: string;
}

/**
 * Liste à hauteur fixe qui défile, avec un dégradé en bas et la mention « n · glisser ».
 * Planches : Patron (alertes), Analyses (par ligne, par bus), Controle (à traiter).
 */
export function ListeGlissable({
  titre,
  mention,
  nombre,
  hauteur = "libre",
  children,
  variante = "mobile",
  fond = "surface",
  className,
}: ListeGlissableProps) {
  const droite = mention ?? (nombre !== undefined ? `${nombre} · glisser` : null);
  const libre = hauteur === "libre";
  const fixe = typeof hauteur === "number";
  return (
    <section
      className={classes(styles.carte, className)}
      aria-label={titre}
      data-variante={variante}
      data-hauteur={libre ? "libre" : fixe ? "fixe" : "auto"}
    >
      <div className={styles.entete}>
        <span>{titre}</span>
        {droite ? (
          <span className={styles.mention}>
            {droite}
            <IconeFlecheBas width={10} height={10} />
          </span>
        ) : null}
      </div>
      <div className={styles.zone} style={fixe ? { height: hauteur } : undefined}>
        <div
          className={styles.defilement}
          data-fond={fond}
          tabIndex={0}
          role="region"
          aria-label={`${titre} (liste qui défile)`}
        >
          <ul className={styles.liste}>{children}</ul>
        </div>
        <span className={styles.degrade} data-fond={fond} aria-hidden="true" />
      </div>
    </section>
  );
}
