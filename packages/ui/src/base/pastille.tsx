import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import { IconeEclair } from "./icones";
import styles from "./pastille.module.css";

export type StatutPastille =
  | "direct"
  | "horsLigne"
  | "bloque"
  | "inopine"
  | "enCours"
  | "active"
  | "verifie"
  | "aSurveiller"
  | "brouillon"
  | "modifier"
  | "sync"
  | "cadence";

export type TonPastille = "neutre" | "vert" | "ambre" | "rouge" | "bleu";

interface DefinitionStatut {
  /** Texte affiché par défaut (majuscules, comme dans les planches). */
  libelle: string;
  /** `pilule` = 7 / 11 px de marge avec bord ; `etiquette` = 6 / 9 px sans bord. */
  forme: "pilule" | "etiquette";
  /** Couleurs du fond, du bord et du texte. */
  ton: TonPastille;
  /** Fond Surface 2 au lieu de la teinte (BROUILLON, CADENCE). */
  fondDiscret?: boolean;
  /** Couleur du point qui précède le libellé, s'il y en a un. */
  point?: TonPastille;
  /** Le point pulse (opacité 1 → .35 → 1 en 1,6 s) : tout ce qui est vivant ou attend. */
  pulse?: boolean;
  /** Éclair à la place du point (CADENCE). */
  eclair?: boolean;
}

/**
 * Règle des couleurs de la planche Système : en direct = vert qui pulse, en attente = ambre,
 * bloquant = rouge. Chaque ligne est relevée dans la planche indiquée.
 */
export const statutsPastille: Record<StatutPastille, DefinitionStatut> = {
  direct: { libelle: "DIRECT", forme: "pilule", ton: "neutre", point: "vert", pulse: true }, // Main
  sync: { libelle: "SYNC", forme: "pilule", ton: "neutre", point: "vert", pulse: true }, // Guichet
  horsLigne: { libelle: "HORS LIGNE", forme: "pilule", ton: "neutre", point: "ambre", pulse: true }, // Convoyeur
  bloque: { libelle: "BLOQUÉ", forme: "pilule", ton: "rouge", point: "rouge", pulse: true }, // SuperviseurDebloquer
  enCours: { libelle: "EN COURS", forme: "pilule", ton: "ambre", point: "ambre", pulse: true }, // FinancementDemande
  active: { libelle: "ACTIVE", forme: "pilule", ton: "vert" }, // InterAgencesConvention
  aSurveiller: { libelle: "À SURVEILLER", forme: "pilule", ton: "rouge" }, // AnalysesBus
  modifier: { libelle: "MODIFIER", forme: "pilule", ton: "ambre" }, // ConfigPersonne
  cadence: { libelle: "CADENCE", forme: "pilule", ton: "ambre", fondDiscret: true, eclair: true }, // Cadence
  verifie: { libelle: "VÉRIFIÉ", forme: "etiquette", ton: "vert" }, // Conducteur
  inopine: { libelle: "INOPINÉ", forme: "etiquette", ton: "rouge" }, // Controleur, Systeme
  brouillon: { libelle: "BROUILLON", forme: "etiquette", ton: "ambre", fondDiscret: true }, // ConfigLigne
};

export interface PropsPastille extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  statut: StatutPastille;
  /** Remplace le libellé par défaut (par exemple « 14:05 » seul dans l'en-tête du patron). */
  libelle?: string;
  /** Complément après le libellé : « DIRECT · 07:38 », « CADENCE · 05:14 ». */
  detail?: string;
  /** Change les couleurs sans changer la forme (EN COURS bleu dans LivreurVerification). */
  ton?: TonPastille;
  /** Affiche ou masque le point ; par défaut celui de la définition du statut. */
  point?: boolean;
}

/** Pastille d'état : mono majuscule, point vert qui pulse pour ce qui est en direct. */
export function Pastille({
  statut,
  libelle,
  detail,
  ton,
  point,
  className,
  ...reste
}: PropsPastille) {
  const def = statutsPastille[statut];
  const tonEffectif = ton ?? def.ton;
  const tonPoint = ton ?? def.point ?? tonEffectif;
  const avecPoint = point ?? def.point !== undefined;
  const texte = [libelle ?? def.libelle, detail].filter(Boolean).join(" · ");
  return (
    <span
      className={cx(
        styles.pastille,
        styles[def.forme],
        styles[`ton-${tonEffectif}`],
        def.fondDiscret && ton === undefined && styles.fondDiscret,
        className,
      )}
      data-statut={statut}
      data-ton={tonEffectif}
      {...reste}
    >
      {avecPoint && (
        <span
          className={cx(styles.point, styles[`point-${tonPoint}`], def.pulse && "am-pulse")}
          data-pulse={def.pulse ? "true" : "false"}
          aria-hidden="true"
        />
      )}
      {def.eclair && <IconeEclair taille={13} trait={2.6} />}
      {texte}
    </span>
  );
}
