import type { ReactNode } from "react";
import { useConception } from "./badge-touche";
import { Cible, type PropsCible } from "./cible";
import { cx } from "./cx";
import styles from "./bouton.module.css";

type SansEnfants<T> = T extends unknown ? Omit<T, "children"> : never;

export type VarianteBouton = "principal" | "assistant" | "secondaire";

export type PropsBouton = SansEnfants<PropsCible> & {
  /**
   * `principal` = orange, `assistant` = vert (l'assistant parle), `secondaire` = carte Surface avec
   * bord Trait. L'action principale se place en bas de l'écran, sous le pouce (voir `EcranPied`).
   */
  variante?: VarianteBouton;
  /** Libellé de l'action (15/700 ; 13/600 pour le bouton secondaire). */
  libelle: ReactNode;
  /** Sous-libellé 11/600 sous le libellé (variantes principal et assistant). */
  sousLibelle?: ReactNode;
  /**
   * Numéro de touche du parcours. Il précède le sous-libellé (« touche 3 · … ») uniquement quand le
   * flag conception est actif.
   */
  touche?: number;
  /** Prix ou montant à droite, en Bricolage 22/800 (« 7 500 F »). */
  prix?: ReactNode;
  /** Icône à droite du libellé (chevron, flèche, coche) ou devant lui pour le bouton secondaire. */
  icone?: ReactNode;
  /** Bouton secondaire seulement : `ambre` pour une action en attente (mode cadence). */
  ton?: "neutre" | "ambre";
};

/**
 * Bouton du kit. Lien si `href` est fourni, bouton sinon. Hauteur minimale 56 px pour les boutons
 * principaux et 46 px pour le secondaire : toujours au moins 44 px de cible tactile.
 */
export function Bouton({
  variante = "principal",
  libelle,
  sousLibelle,
  touche,
  prix,
  icone,
  ton = "neutre",
  className,
  ...reste
}: PropsBouton) {
  const conception = useConception();
  const prefixe = conception && touche !== undefined ? `touche ${touche}` : null;
  const sous =
    prefixe !== null && sousLibelle ? (
      <>
        {prefixe} · {sousLibelle}
      </>
    ) : (
      (prefixe ?? sousLibelle)
    );
  const secondaire = variante === "secondaire";
  const classes = cx(
    styles.bouton,
    styles[variante],
    secondaire && ton === "ambre" && styles.ambre,
    className,
  );

  if (secondaire) {
    return (
      <Cible className={classes} data-variante={variante} {...(reste as PropsCible)}>
        {icone}
        {libelle}
      </Cible>
    );
  }

  return (
    <Cible className={classes} data-variante={variante} {...(reste as PropsCible)}>
      <span className={styles.textes}>
        <span className={styles.libelle}>{libelle}</span>
        {sous ? <span className={styles.sous}>{sous}</span> : null}
      </span>
      {prix !== undefined && <span className={styles.prix}>{prix}</span>}
      {icone}
    </Cible>
  );
}

export type PropsBoutonIcone = SansEnfants<PropsCible> & {
  /** Obligatoire : un bouton qui n'a que son icône doit se nommer pour les lecteurs d'écran. */
  "aria-label": string;
  /** `surface` = rond Surface avec bord Trait (retour) ; `orange` = rond d'action (inverser le sens). */
  variante?: "surface" | "orange";
  /** L'icône (SVG), 20 px dans les planches. */
  icone: ReactNode;
};

/** Bouton rond de 44 px qui ne contient qu'une icône. */
export function BoutonIcone({
  variante = "surface",
  icone,
  className,
  ...reste
}: PropsBoutonIcone) {
  return (
    <Cible
      className={cx(styles.rond, styles[`rond-${variante}`], className)}
      {...(reste as PropsCible)}
    >
      {icone}
    </Cible>
  );
}
