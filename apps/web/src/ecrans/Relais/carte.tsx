import type { colis as contrats } from "@afrimove/contrats";
import styles from "./relais.module.css";

/** Position des trois points relais sur la carte de la planche, par rang (le rang 1 est le plus proche). */
const POSITION_RELAIS: Readonly<Record<number, { x: number; y: number }>> = {
  1: { x: 120, y: 110 },
  2: { x: 270, y: 120 },
  3: { x: 230, y: 260 },
};

/**
 * Carte de la ville (390 × 340), dessinée comme dans la planche : quadrillage, routes, le marché au centre, les points
 * relais numérotés, le domicile du destinataire et la gare. Les repères viennent du serveur (`reperes`) ; seule leur
 * place est fixe, car le serveur ne donne pas de coordonnées de carte.
 */
export function Carte({
  reperes,
  libelle,
}: {
  reperes: contrats.RelaisProches["reperes"];
  libelle: string;
}) {
  const marche = reperes.find((r) => r.type === "marche");
  const destinataire = reperes.find((r) => r.type === "destinataire");
  const gare = reperes.find((r) => r.type === "gare");
  const points = reperes.flatMap((r) => {
    const position = r.type === "relais" && r.rang !== null ? POSITION_RELAIS[r.rang] : undefined;
    return position && r.rang !== null ? [{ rang: r.rang, ...position }] : [];
  });

  return (
    <svg
      width="390"
      height="340"
      viewBox="0 0 390 340"
      role="img"
      aria-label={libelle}
      className={styles.carte}
    >
      <path
        className={styles.carteQuadrillage}
        d="M0 70h390M0 140h390M0 210h390M0 280h390M80 0v340M170 0v340M260 0v340M350 0v340"
        strokeWidth="1"
      />
      <path
        className={styles.carteRoutes}
        d="M0 120 L390 160M130 0 L170 340M0 250 L390 220"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {marche && (
        <>
          <circle className={styles.carteMarche} cx="195" cy="175" r="26" strokeWidth="2" />
          <text className={styles.carteMarcheNom} x="177" y="179">
            {marche.libelle}
          </text>
        </>
      )}
      {points.map((p) => (
        <g key={p.rang}>
          <circle className={styles.cartePoint} cx={p.x} cy={p.y} r="14" />
          <text className={styles.carteRang} x={p.x - 6} y={p.y + 4}>
            {p.rang}
          </text>
        </g>
      ))}
      {destinataire && (
        <>
          <circle className={styles.carteDomicile} cx="90" cy="250" r="12" strokeWidth="3" />
          <text className={styles.carteDomicileNom} x="56" y="285">
            {destinataire.libelle}
          </text>
        </>
      )}
      {gare && (
        <>
          <circle className={styles.carteGare} cx="330" cy="60" r="12" />
          <path
            className={styles.carteGareIcone}
            d="M324 56h12v6h-12z M325 62v2h2v-2 M333 62v2h2v-2"
          />
          <text className={styles.carteLieu} x="290" y="40">
            {gare.libelle}
          </text>
        </>
      )}
    </svg>
  );
}
