import { useTranslation } from "react-i18next";
import type { SalleDeControle } from "./direct";
import styles from "./controle.module.css";

type Carte = SalleDeControle["carte"];
type Ton = "orange" | "bleu" | "vert";

/**
 * Positions des points de la planche (viewBox 900 × 300). Le canal GPS du serveur (`/patron/controle/bus`, AM-170) n'a
 * pas encore d'opération dans le client d'API : la carte est le dessin schématique de la planche, les points y sont
 * posés dans l'ordre de cette liste, sans lien avec la position réelle des bus.
 */
const POINTS: ReadonlyArray<{ x: number; y: number; ton: Ton }> = [
  { x: 245, y: 205, ton: "orange" },
  { x: 330, y: 188, ton: "orange" },
  { x: 420, y: 170, ton: "orange" },
  { x: 470, y: 160, ton: "orange" },
  { x: 190, y: 160, ton: "bleu" },
  { x: 230, y: 120, ton: "bleu" },
  { x: 400, y: 110, ton: "vert" },
  { x: 340, y: 90, ton: "vert" },
];
const POINT_ALERTE = { x: 300, y: 195 };

/** Emplacement du nom de chaque ville, dans l'ordre de `carte.villes`. */
const VILLES: ReadonlyArray<{ x: number; y: number; discret?: boolean }> = [
  { x: 70, y: 268 },
  { x: 540, y: 156 },
  { x: 300, y: 66 },
  { x: 392, y: 26, discret: true },
];

const CLASSE_TON: Record<Ton, string | undefined> = {
  orange: styles.busOrange,
  bleu: styles.busBleu,
  vert: styles.busVert,
};

/** La carte schématique des bus en route : trois villes, la route de Bamenda en pointillés, un point par bus. */
export function CarteBus({ carte }: { carte: Carte }) {
  const { t } = useTranslation("Controle");
  const alerte = carte.alerte;
  const normaux = Math.max(0, Math.min(POINTS.length, carte.busEnRoute - (alerte ? 1 : 0)));

  return (
    <svg
      viewBox="0 0 900 300"
      role="img"
      aria-label={t("carte.libelle")}
      className={styles.carte}
      data-bus={carte.busEnRoute}
    >
      <path
        d="M0 60h900M0 140h900M0 220h900M150 0v300M300 0v300M450 0v300M600 0v300M750 0v300"
        className={styles.quadrillage}
      />
      <path d="M120 230 L520 150" className={styles.route12} />
      <path d="M120 230 L280 70" className={styles.route12} />
      <path d="M520 150 L280 70" className={styles.route10} />
      <path d="M280 70 L380 30" className={styles.routeBamenda} />
      {POINTS.slice(0, normaux).map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="9" className={CLASSE_TON[p.ton]} />
      ))}
      {alerte && (
        <circle cx={POINT_ALERTE.x} cy={POINT_ALERTE.y} r="9" className={styles.busAlerte} />
      )}
      <circle cx="120" cy="230" r="14" className={styles.ville} />
      <circle cx="520" cy="150" r="14" className={styles.ville} />
      <circle cx="280" cy="70" r="12" className={styles.ville} />
      <circle cx="380" cy="30" r="9" className={styles.villeLointaine} />
      {VILLES.map((emplacement, i) => {
        const nom = carte.villes[i];
        if (nom === undefined) return null;
        return (
          <text
            key={nom}
            x={emplacement.x}
            y={emplacement.y}
            className={emplacement.discret ? styles.nomVilleDiscret : styles.nomVille}
          >
            {nom}
          </text>
        );
      })}
      {alerte && (
        <text x="312" y="220" className={styles.nomAlerte}>
          {t(alerte.soupcon === "panne" ? "carte.alertePanne" : "carte.alerte", {
            immatriculation: alerte.immatriculation,
            minutes: alerte.arretMinutes,
          })}
        </text>
      )}
      <text x="640" y="268" className={styles.legende}>
        {t("carte.legende")}
      </text>
    </svg>
  );
}
