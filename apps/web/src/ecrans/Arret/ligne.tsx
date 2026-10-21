import type { voyageur as c } from "@afrimove/contrats";
import { useTranslation } from "react-i18next";
import styles from "./arret.module.css";

type EtatArret = "passe" | "ici" | "a-venir";

function etatDe(index: number, courant: number): EtatArret {
  if (courant < 0) return "a-venir";
  if (index < courant) return "passe";
  return index === courant ? "ici" : "a-venir";
}

/**
 * La ligne et la position du voyageur : les arrêts en frise (passés en vert, « toi » en orange cerclé d'ambre, à venir
 * en anneau gris), puis le point de montée choisi par la compagnie.
 */
export function CarteLigne({ ligne }: { ligne: c.OffresMonteeEnRoute["ligne"] }) {
  const { t } = useTranslation("Arret");
  const courant = ligne.arrets.indexOf(ligne.arretCourant);
  return (
    <div className={styles.ligne}>
      <div className={styles.ligneEnTete}>
        <span>{t("ligne.etiquette", { ligne: ligne.libelle })}</span>
        <span>{ligne.sens}</span>
      </div>
      <ol className={styles.frise} style={{ ["--arrets" as string]: ligne.arrets.length }}>
        {ligne.arrets.map((arret, index) => {
          const etat = etatDe(index, courant);
          return (
            <li
              key={`${index}-${arret}`}
              className={styles.arret}
              data-etat={etat}
              {...(etat === "ici" ? { "aria-current": "location" as const } : {})}
            >
              <span className={styles.point} aria-hidden="true" />
              <span className={styles.nomArret}>
                {etat === "ici" ? t("ligne.toi", { arret }) : arret}
              </span>
            </li>
          );
        })}
      </ol>
      <span className={styles.pointDeMontee}>{ligne.pointDeMontee}</span>
    </div>
  );
}

/** Squelette de la carte de la ligne, à la même hauteur que la carte réelle. */
export function SqueletteLigne() {
  return (
    <div className={styles.ligne} aria-hidden="true">
      <span className={`${styles.squelette} ${styles.squeletteEtiquette} am-pulse`} />
      <span className={`${styles.squelette} ${styles.squeletteFrise} am-pulse`} />
      <span className={`${styles.squelette} ${styles.squeletteMontee} am-pulse`} />
    </div>
  );
}
