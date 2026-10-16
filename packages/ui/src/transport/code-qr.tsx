import { useMemo } from "react";
import { create } from "qrcode";
import { classes } from "./format";
import styles from "./code-qr.module.css";

export type PropsCodeQr = {
  /** Contenu encodé : référence du billet, lien de retrait… Ne doit pas être vide. */
  valeur: string;
  /** Côté du dessin en pixels (132 sur le billet). */
  taille?: number;
  /** Niveau de correction d'erreur (M par défaut). */
  correction?: "L" | "M" | "Q" | "H";
  /** Marge blanche autour des modules, en modules. */
  marge?: number;
  /** Nom lu par les lecteurs d'écran. */
  libelle?: string;
  className?: string;
};

/** Chemin SVG des modules sombres, regroupés par séquences horizontales. */
export function cheminModules(
  taille: number,
  estSombre: (ligne: number, colonne: number) => boolean,
  marge: number,
): string {
  const segments: string[] = [];
  for (let ligne = 0; ligne < taille; ligne++) {
    let colonne = 0;
    while (colonne < taille) {
      if (!estSombre(ligne, colonne)) {
        colonne++;
        continue;
      }
      const debut = colonne;
      while (colonne < taille && estSombre(ligne, colonne)) colonne++;
      segments.push(`M${debut + marge} ${ligne + marge}h${colonne - debut}v1h-${colonne - debut}z`);
    }
  }
  return segments.join("");
}

/** QR code en SVG (bibliothèque qrcode), généré sans attendre et sans réseau. */
export function CodeQr({
  valeur,
  taille = 132,
  correction = "M",
  marge = 2,
  libelle = "QR code",
  className,
}: PropsCodeQr) {
  const dessin = useMemo(() => {
    const qr = create(valeur, { errorCorrectionLevel: correction });
    const cote = qr.modules.size;
    return {
      cote,
      chemin: cheminModules(cote, (l, c) => qr.modules.get(l, c) === 1, marge),
    };
  }, [valeur, correction, marge]);

  const total = dessin.cote + 2 * marge;

  return (
    <svg
      className={classes(styles.qr, className)}
      width={taille}
      height={taille}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={libelle}
    >
      <rect className={styles.fond} width={total} height={total} />
      <path className={styles.modules} d={dessin.chemin} />
    </svg>
  );
}
