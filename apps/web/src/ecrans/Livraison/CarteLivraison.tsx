import { ITINERAIRE, parcouru, tracer } from "./formats";
import styles from "./livraison.module.css";

/** Quadrillage et grandes rues de fond de la carte (390 × 360). */
const QUADRILLAGE =
  "M0 60h390M0 130h390M0 200h390M0 270h390M80 0v360M170 0v360M260 0v360M350 0v360";
const RUES = "M0 150 L390 170M120 0 L150 360M0 260 L390 240";

/** Silhouette du colis dans le rond orange du retrait. */
const COLIS = "M324 56h12v6h-12z M325 62v2h2v-2 M333 62v2h2v-2";

export interface PropsCarteLivraison {
  /** Avancée du livreur sur l'itinéraire, de 0 (retrait) à 1 (arrivée). */
  avancee: number;
  /** Textes déjà formatés des trois étiquettes de la carte. */
  depart: string;
  livreur: string;
  arrivee: string;
  /** Nom accessible de la carte. */
  libelle: string;
}

/**
 * Carte de la livraison : le trajet gris du retrait à la maison, la partie déjà faite en bleu, le livreur (qui bouge
 * avec le suivi en direct) et la destination. Le dessin est celui de la maquette.
 */
export function CarteLivraison({
  avancee,
  depart,
  livreur,
  arrivee,
  libelle,
}: PropsCarteLivraison) {
  const faite = parcouru(avancee);
  const position = faite[faite.length - 1]!;
  const fin = ITINERAIRE[ITINERAIRE.length - 1]!;
  const debut = ITINERAIRE[0]!;

  return (
    <svg
      className={styles.carteSvg}
      width="390"
      height="360"
      viewBox="0 0 390 360"
      role="img"
      aria-label={libelle}
    >
      <path d={QUADRILLAGE} className={styles.quadrillage} />
      <path d={RUES} className={styles.rues} />
      <path d={tracer(ITINERAIRE)} className={styles.trajet} />
      <path d={tracer(faite)} className={styles.parcouru} />
      <circle cx={debut.x} cy={debut.y} r="11" className={styles.depart} />
      <path d={COLIS} className={styles.colis} />
      <circle cx={position.x} cy={position.y} r="22" className={styles.halo} />
      <circle cx={position.x} cy={position.y} r="12" className={styles.livreur} />
      <circle cx={fin.x} cy={fin.y} r="12" className={styles.arrivee} />
      <text x="236" y="42" className={styles.nomDepart}>
        {depart}
      </text>
      <text x={position.x + 16} y={position.y - 10} className={styles.nomLivreur}>
        {livreur}
      </text>
      <text x="56" y="285" className={styles.nomArrivee}>
        {arrivee}
      </text>
    </svg>
  );
}
