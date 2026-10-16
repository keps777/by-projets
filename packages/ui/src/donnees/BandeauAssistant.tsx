import type { ReactNode } from "react";
import styles from "./BandeauAssistant.module.css";
import { classes } from "./internes/classes";
import { IconeChevronDroit, IconeEtincelles } from "./internes/icones";

interface BandeauCommun {
  className?: string;
}

export interface BandeauAssistantLien extends BandeauCommun {
  /** Bandeau d'une ligne cliquable avec icône (Patron). */
  forme?: "lien";
  titre: string;
  detail?: string;
  href?: string;
  onClick?: () => void;
}

export interface BandeauAssistantBloc extends BandeauCommun {
  /** Bloc de texte avec étiquette verte (AnalysesBus, Controle). */
  forme: "bloc";
  /** Étiquette mono capitales, « L'assistant » par défaut. */
  etiquette?: string;
  children: ReactNode;
}

export type BandeauAssistantProps = BandeauAssistantLien | BandeauAssistantBloc;

/**
 * Bandeau de l'assistant sur fond vert foncé (#0E2A1E, bord #1E5A40).
 * Planches : Patron (forme lien), AnalysesBus et Controle (forme bloc).
 */
export function BandeauAssistant(props: BandeauAssistantProps) {
  if (props.forme === "bloc") {
    return (
      <div className={classes(styles.bloc, props.className)} data-forme="bloc">
        <span className={styles.etiquette}>{props.etiquette ?? "L'assistant"}</span>
        <div className={styles.texte}>{props.children}</div>
      </div>
    );
  }
  const contenu = (
    <>
      <span className={styles.icone} aria-hidden="true">
        <IconeEtincelles width={17} height={17} />
      </span>
      <span className={styles.corps}>
        <span className={styles.titre}>{props.titre}</span>
        {props.detail ? <span className={styles.detail}>{props.detail}</span> : null}
      </span>
      <IconeChevronDroit className={styles.chevron} width={18} height={18} />
    </>
  );
  const classe = classes(styles.lien, props.className);
  if (props.href) {
    return (
      <a className={classe} href={props.href} data-forme="lien">
        {contenu}
      </a>
    );
  }
  return (
    <button type="button" className={classe} onClick={props.onClick} data-forme="lien">
      {contenu}
    </button>
  );
}
