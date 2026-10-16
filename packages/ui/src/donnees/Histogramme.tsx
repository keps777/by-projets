import styles from "./Histogramme.module.css";
import { classes } from "./internes/classes";
import type { VarianteDonnees } from "./types";

export type FormatHistogramme = "jours" | "semaines" | "heures";

export interface BarreHistogramme {
  /** Étiquette sous la barre (« L », « S46 »…). Lue aussi dans la bulle de la barre. */
  etiquette: string;
  /** Valeur brute ; la hauteur est proportionnelle à `max` (ou à la plus grande valeur). */
  valeur: number;
  /** Barre mise en avant : ambre (pics) ou rouge (creux, pannes). */
  accent?: "ambre" | "rouge";
  /** Barre prévue, pas encore réalisée : fond sombre et bord pointillé (Controle, ventes par heure). */
  prevue?: boolean;
  /** Valeur lisible pour la bulle et les lecteurs d'écran, ex. « 28,4 M ». */
  valeurAffichee?: string;
}

export interface HistogrammeProps {
  barres: BarreHistogramme[];
  /**
   * - `jours` : 7 barres, étiquettes 10 px, 96 px de haut (Analyses) ;
   * - `semaines` : 8 barres, étiquettes 9 px, 70 px de haut (AnalysesBus) ;
   * - `heures` : 12 barres sans étiquette, 90 px de haut, repères en dessous (Controle).
   */
  format?: FormatHistogramme;
  /** `large` agrandit le dessin pour la salle de contrôle (1280 px). */
  variante?: VarianteDonnees;
  /** Valeur qui correspond à 100 % de la hauteur. Par défaut, la plus grande valeur. */
  max?: number;
  /** Repères sous le graphique, répartis de gauche à droite (ex. « 05 h », « 09 h »). */
  reperes?: string[];
  /** Colore et grasse l'étiquette des barres mises en avant (vrai pour `jours`). */
  etiquettesMisesEnAvant?: boolean;
  /** Libellé lu par les lecteurs d'écran ; par défaut la liste « étiquette valeur ». */
  ariaLabel?: string;
  className?: string;
}

interface Geometrie {
  largeur: number;
  hauteur: number;
  ecart: number;
  police: number;
  hauteurEtiquette: number;
  rayonHaut: number;
  rayonBas: number;
  etiquettes: boolean;
}

const GEOMETRIES: Record<FormatHistogramme, Geometrie> = {
  jours: {
    largeur: 328,
    hauteur: 96,
    ecart: 6,
    police: 10,
    hauteurEtiquette: 14,
    rayonHaut: 6,
    rayonBas: 2,
    etiquettes: true,
  },
  semaines: {
    largeur: 328,
    hauteur: 70,
    ecart: 6,
    police: 9,
    hauteurEtiquette: 12,
    rayonHaut: 5,
    rayonBas: 2,
    etiquettes: true,
  },
  heures: {
    largeur: 268,
    hauteur: 90,
    ecart: 4,
    police: 11,
    hauteurEtiquette: 0,
    rayonHaut: 4,
    rayonBas: 2,
    etiquettes: false,
  },
};

const ECHELLE_LARGE = { largeur: 1.75, hauteur: 1.3, texte: 1.4 };
const HAUTEUR_REPERES = 16;

/** Barre aux coins du haut arrondis (r. haut) et du bas moins arrondis (r. bas). */
export function cheminBarre(
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  rayonHaut: number,
  rayonBas: number,
): string {
  let haut = Math.min(rayonHaut, largeur / 2);
  let bas = Math.min(rayonBas, largeur / 2);
  if (haut + bas > hauteur) {
    const facteur = hauteur / (haut + bas);
    haut *= facteur;
    bas *= facteur;
  }
  const f = (n: number) => Number(n.toFixed(2));
  return [
    `M${f(x)} ${f(y + haut)}`,
    `A${f(haut)} ${f(haut)} 0 0 1 ${f(x + haut)} ${f(y)}`,
    `H${f(x + largeur - haut)}`,
    `A${f(haut)} ${f(haut)} 0 0 1 ${f(x + largeur)} ${f(y + haut)}`,
    `V${f(y + hauteur - bas)}`,
    `A${f(bas)} ${f(bas)} 0 0 1 ${f(x + largeur - bas)} ${f(y + hauteur)}`,
    `H${f(x + bas)}`,
    `A${f(bas)} ${f(bas)} 0 0 1 ${f(x)} ${f(y + hauteur - bas)}`,
    "Z",
  ].join("");
}

function descriptionBarre(barre: BarreHistogramme): string {
  const valeur = barre.valeurAffichee ?? String(barre.valeur);
  return `${barre.etiquette} : ${valeur}${barre.prevue ? " (prévu)" : ""}`;
}

/**
 * Histogramme en barres en SVG natif. Les barres, les étiquettes et les repères sont dessinés
 * dans un même `viewBox`, donc le graphique garde ses proportions à toute largeur.
 * Planches : Analyses (7 jours), AnalysesBus (8 semaines), Controle (heures).
 */
export function Histogramme({
  barres,
  format = "jours",
  variante = "mobile",
  max,
  reperes,
  etiquettesMisesEnAvant = format === "jours",
  ariaLabel,
  className,
}: HistogrammeProps) {
  const base = GEOMETRIES[format];
  const large = variante === "large";
  const largeur = base.largeur * (large ? ECHELLE_LARGE.largeur : 1);
  const hauteur = base.hauteur * (large ? ECHELLE_LARGE.hauteur : 1);
  const police = base.police * (large ? ECHELLE_LARGE.texte : 1);
  const hauteurEtiquette = base.hauteurEtiquette * (large ? ECHELLE_LARGE.texte : 1);
  const hauteurRepere = reperes && reperes.length > 0 ? HAUTEUR_REPERES * (large ? 1.4 : 1) : 0;
  const n = barres.length;
  const hauteurTotale = hauteur + hauteurRepere;
  const zoneBarres = hauteur - (base.etiquettes ? hauteurEtiquette : 0);
  const plafond = max ?? Math.max(...barres.map((b) => b.valeur), 0);
  const largeurBarre = n > 0 ? (largeur - (n - 1) * base.ecart) / n : 0;
  const libelle = ariaLabel ?? `Histogramme : ${barres.map(descriptionBarre).join(", ")}`;

  return (
    <svg
      role="img"
      aria-label={libelle}
      className={classes(styles.histogramme, className)}
      viewBox={`0 0 ${largeur} ${hauteurTotale}`}
      data-format={format}
      data-variante={variante}
    >
      {barres.map((barre, i) => {
        const x = i * (largeurBarre + base.ecart);
        const part = plafond > 0 ? Math.max(0, Math.min(barre.valeur / plafond, 1)) : 0;
        const h = Math.max(part * zoneBarres, part > 0 ? 1 : 0);
        const y = zoneBarres - h;
        const miseEnAvant = Boolean(barre.accent) && etiquettesMisesEnAvant;
        return (
          <g key={`${barre.etiquette}-${i}`}>
            <path
              d={cheminBarre(x, y, largeurBarre, h, base.rayonHaut, base.rayonBas)}
              className={styles.barre}
              data-barre=""
              data-accent={barre.accent}
              data-prevue={barre.prevue ? "oui" : undefined}
            >
              <title>{descriptionBarre(barre)}</title>
            </path>
            {base.etiquettes ? (
              <text
                x={x + largeurBarre / 2}
                y={hauteur - 2 * (large ? ECHELLE_LARGE.texte : 1)}
                textAnchor="middle"
                fontSize={police}
                className={styles.etiquette}
                data-accent={miseEnAvant ? barre.accent : undefined}
              >
                {barre.etiquette}
              </text>
            ) : null}
          </g>
        );
      })}
      {hauteurRepere > 0 && reperes
        ? reperes.map((repere, i) => {
            const dernier = reperes.length - 1;
            const x = dernier === 0 ? 0 : (i * largeur) / dernier;
            return (
              <text
                key={`${repere}-${i}`}
                x={x}
                y={hauteurTotale - 3}
                textAnchor={i === 0 ? "start" : i === dernier ? "end" : "middle"}
                fontSize={police}
                className={styles.repere}
              >
                {repere}
              </text>
            );
          })
        : null}
    </svg>
  );
}
