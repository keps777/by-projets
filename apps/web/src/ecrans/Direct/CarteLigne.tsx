import { fractionsVilles, pointSurTrace, progressionBus, px, TRACE_ROUTE } from "./trace";
import styles from "./direct.module.css";

/** Quadrillage de fond de la carte (traits de 1 px tous les 70 px en hauteur, 90 px en largeur). */
const QUADRILLAGE =
  "M0 40h390M0 110h390M0 180h390M0 250h390M0 320h390M60 0v380M150 0v380M240 0v380M330 0v380";

/** Silhouette du bus dans le repère du marqueur (centrée sur le point où se trouve le bus). */
const BUS = "M-7 -4h14v7h-14z M-6 3v2h2v-2 M4 3v2h2v-2";

export interface PropsCarteLigne {
  /** Villes de la ligne, dans l'ordre du trajet. */
  villes: readonly string[];
  /** Statuts des arrêts du trajet : ils placent le bus sur le tracé. */
  statuts: ReadonlyArray<"passe" | "prochain" | "a_venir">;
  /** Texte déjà formaté de la vitesse (« 84 km/h »). */
  vitesse: string;
  /** Nom accessible de la carte. */
  libelle: string;
}

/**
 * Carte de la ligne (390 × 380) : route grise, route parcourue en ambre, villes, bus et sa vitesse. Le dessin est
 * celui de la maquette ; seule la place du bus et des villes suit les données.
 */
export function CarteLigne({ villes, statuts, vitesse, libelle }: PropsCarteLigne) {
  const progression = progressionBus(statuts);
  const bus = pointSurTrace(progression);
  const fractions = fractionsVilles(villes.length);

  return (
    <svg
      className={styles.carteSvg}
      width="390"
      height="380"
      viewBox="0 0 390 380"
      role="img"
      aria-label={libelle}
    >
      <path d={QUADRILLAGE} className={styles.quadrillage} />
      <path d={TRACE_ROUTE} className={styles.route} />
      {progression > 0 && (
        <path
          d={TRACE_ROUTE}
          pathLength={1}
          strokeDasharray={`${px(progression * 1000) / 1000} 2`}
          className={styles.parcours}
        />
      )}
      {villes.map((ville, rang) => {
        const fraction = fractions[rang] ?? 0;
        const { x, y } = pointSurTrace(fraction);
        const extremite = rang === 0 || rang === villes.length - 1;
        return (
          <circle
            key={`noeud-${rang}-${ville}`}
            cx={px(x)}
            cy={px(y)}
            r={extremite ? 9 : 7}
            className={fraction <= progression + 1e-9 ? styles.noeudPasse : styles.noeud}
          />
        );
      })}
      <circle cx={px(bus.x)} cy={px(bus.y)} r="22" className={styles.halo} />
      <circle cx={px(bus.x)} cy={px(bus.y)} r="13" className={styles.marqueur} />
      <path
        d={BUS}
        transform={`translate(${px(bus.x)} ${px(bus.y)})`}
        className={styles.silhouette}
      />
      {villes.map((ville, rang) => {
        const { x, y } = pointSurTrace(fractions[rang] ?? 0);
        // Place du nom, relevée sur la maquette : sous le départ, sous le point intermédiaire, au-dessus de l'arrivée.
        const place =
          rang === 0
            ? { x, y: y + 30 }
            : rang === villes.length - 1
              ? { x: x - 52, y: y - 12 }
              : { x: x - 15, y: y + 27 };
        return (
          <text
            key={`nom-${rang}-${ville}`}
            x={px(place.x)}
            y={px(place.y)}
            className={styles.nomVille}
          >
            {ville}
          </text>
        );
      })}
      <text x={px(bus.x + 20)} y={px(bus.y - 10)} className={styles.vitesse}>
        {vitesse}
      </text>
    </svg>
  );
}
