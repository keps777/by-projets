import styles from "./avatar-initiales.module.css";

export type TonAvatar = "vert" | "bleu" | "ambre";

type Props = {
  initiales: string;
  ton?: TonAvatar;
  /** Diamètre en pixels (44 dans les maquettes). */
  taille?: number;
};

/** Pastille ronde à initiales, décorative : le nom de la personne est toujours écrit à côté. */
export function AvatarInitiales({ initiales, ton = "vert", taille = 44 }: Props) {
  return (
    <span
      className={styles.avatar}
      data-ton={ton}
      aria-hidden="true"
      style={{ ["--taille" as string]: `${taille}px` }}
    >
      {initiales}
    </span>
  );
}
