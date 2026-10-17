import type { HTMLAttributes, ReactNode } from "react";
import { BoutonIcone } from "./bouton";
import { cx } from "./cx";
import { IconeRetour } from "./icones";
import styles from "./entete.module.css";

export interface RetourEntete {
  /** Texte lu par les lecteurs d'écran, par exemple « Retour aux départs ». Obligatoire. */
  libelle: string;
  /** Destination du retour (lien). */
  href?: string;
  /** Action du retour (bouton), si le retour n'est pas un lien. */
  onClick?: () => void;
}

export interface PropsEntete extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Titre de l'écran, Bricolage 18/800. */
  titre: ReactNode;
  /** Sous-titre 12 px en Craie 2. */
  sousTitre?: ReactNode;
  /** Bouton retour rond de 44 px à gauche ; absent sur les écrans d'accueil. */
  retour?: RetourEntete;
  /** Élément à droite : pastille, badge « TOUCHE n », bouton. */
  droite?: ReactNode;
  /** `standard` : marges 14/6 (43 planches). `ample` : 16/8 (15 planches). */
  espace?: "standard" | "ample";
}

/** En-tête d'écran : retour rond, titre, sous-titre et élément à droite. */
export function Entete({
  titre,
  sousTitre,
  retour,
  droite,
  espace = "standard",
  className,
  ...reste
}: PropsEntete) {
  return (
    <header className={cx(styles.entete, espace === "ample" && styles.ample, className)} {...reste}>
      {retour && (
        <BoutonIcone
          aria-label={retour.libelle}
          icone={<IconeRetour taille={20} />}
          {...(retour.href !== undefined ? { href: retour.href } : { onClick: retour.onClick })}
        />
      )}
      <div className={styles.textes}>
        <h1 className={styles.titre}>{titre}</h1>
        {sousTitre !== undefined && <span className={styles.sousTitre}>{sousTitre}</span>}
      </div>
      {droite !== undefined && <div className={styles.droite}>{droite}</div>}
    </header>
  );
}
