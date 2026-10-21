import styles from "./course.module.css";

/** Quadrillage, grandes rues et trajet de la carte (390 × 330), tels que dessinés dans la planche. */
const QUADRILLAGE =
  "M0 60h390M0 130h390M0 200h390M0 270h390M70 0v330M160 0v330M250 0v330M340 0v330";
const RUES = "M0 150 L390 150M0 230 L390 230M120 0 L120 330M290 0 L290 330";
const TRAJET = "M60 270 L120 270 L120 150 L290 150 L290 90 L330 90";

/** Silhouette de la gare dans le rond orange de l'arrivée. */
const GARE = "M324 86h12v6h-12z M325 92v2h2v-2 M333 92v2h2v-2";

export interface PropsCarteCourse {
  /** Textes déjà formatés des trois étiquettes de la carte. */
  depart: string;
  gare: string;
  chauffeur: string;
  /** Nom accessible de la carte. */
  libelle: string;
}

/**
 * Carte de la course : le trajet en pointillés ambre de chez soi à la gare, et le chauffeur en route. Le dessin est
 * celui de la planche.
 */
export function CarteCourse({ depart, gare, chauffeur, libelle }: PropsCarteCourse) {
  return (
    <svg
      className={styles.carteSvg}
      width="390"
      height="330"
      viewBox="0 0 390 330"
      role="img"
      aria-label={libelle}
    >
      <path d={QUADRILLAGE} className={styles.quadrillage} />
      <path d={RUES} className={styles.rues} />
      <path d={TRAJET} className={styles.trajet} />
      <circle cx="60" cy="270" r="10" className={styles.origine} />
      <circle cx="330" cy="90" r="12" className={styles.destination} />
      <path d={GARE} className={styles.gare} />
      <circle cx="120" cy="200" r="16" className={styles.halo} />
      <circle cx="120" cy="200" r="8" className={styles.chauffeurPoint} />
      <text x="30" y="300" className={styles.nomDepart}>
        {depart}
      </text>
      <text x="206" y="72" className={styles.nomGare}>
        {gare}
      </text>
      <text x="134" y="204" className={styles.nomChauffeur}>
        {chauffeur}
      </text>
    </svg>
  );
}
