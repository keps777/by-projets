import { classes } from "./format";
import styles from "./gros-code.module.css";

/** Taille minimale d'un code lu à voix haute ou recopié : 28 px. */
export const TAILLE_MIN_GROS_CODE = 28;

export type PropsGrosCode = {
  /** 4 chiffres (billet) ou 6 chiffres (retrait de colis). Les espaces sont ignorés. */
  code: string;
  /** Taille de police en pixels ; jamais en dessous de 28. */
  taille?: number;
  /** « large » : espacement un peu plus ouvert, comme sur le billet. */
  espacement?: "code" | "large";
  /** Nom lu avant les chiffres : « Code du billet ». */
  libelle?: string;
  className?: string;
};

/** Gros code en police mono, chiffres seuls (maquettes Pass et ColisCode). */
export function GrosCode({
  code,
  taille = 34,
  espacement = "code",
  libelle = "Code",
  className,
}: PropsGrosCode) {
  const chiffres = code.replace(/\s+/g, "");
  if (!/^(\d{4}|\d{6})$/.test(chiffres)) {
    throw new RangeError(`GrosCode attend 4 ou 6 chiffres, reçu « ${code} ».`);
  }
  const affiche = chiffres.length === 6 ? `${chiffres.slice(0, 3)} ${chiffres.slice(3)}` : chiffres;

  return (
    <span
      className={classes(styles.code, className)}
      data-espacement={espacement}
      role="img"
      aria-label={`${libelle} : ${[...chiffres].join(" ")}`}
      style={{ fontSize: `${Math.max(TAILLE_MIN_GROS_CODE, taille)}px` }}
    >
      {affiche}
    </span>
  );
}
