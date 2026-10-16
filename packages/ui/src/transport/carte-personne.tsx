import type { ReactNode } from "react";
import { AvatarInitiales } from "./avatar-initiales";
import type { TonAvatar } from "./avatar-initiales";
import { classes, initialesDe } from "./format";
import styles from "./carte-personne.module.css";

export type PropsCartePersonne = {
  /** « Samuel E. » */
  nom: string;
  /** Initiales de l'avatar ; déduites du nom si absentes. */
  initiales?: string;
  verifie?: boolean;
  /** Note sur 5 : 4.9 s'affiche « 4,9 ★ ». */
  note?: number;
  /** Nombre de trajets (ou de livraisons, voir `unite`). */
  trajets?: number;
  unite?: { singulier: string; pluriel: string };
  /** Suffixe du nom, par exemple « moto-taxi ». */
  role?: string;
  /** « Toyota Corolla grise · LT 882 CE · clim · 2 places » */
  detail?: ReactNode;
  /** Couleur de l'avatar et de la mention « vérifié ». */
  ton?: TonAvatar;
  /** Contenu à droite : prix, bouton d'appel… */
  droite?: ReactNode;
  /** La carte entière devient un lien. */
  href?: string;
  className?: string;
};

const TRAJETS = { singulier: "trajet", pluriel: "trajets" };

function formaterNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/** Carte d'une personne vérifiée : avatar à initiales, note, nombre de trajets (maquettes Covoit, Course). */
export function CartePersonne({
  nom,
  initiales,
  verifie = true,
  note,
  trajets,
  unite = TRAJETS,
  role,
  detail,
  ton = "vert",
  droite,
  href,
  className,
}: PropsCartePersonne) {
  const mentions: string[] = [];
  if (verifie) mentions.push("vérifié");
  if (note !== undefined) mentions.push(`${formaterNote(note)} ★`);
  if (trajets !== undefined)
    mentions.push(`${trajets} ${trajets > 1 ? unite.pluriel : unite.singulier}`);

  const contenu = (
    <>
      <AvatarInitiales initiales={initiales ?? initialesDe(nom)} ton={ton} />
      <span className={styles.texte}>
        <span className={styles.nom}>
          {nom}
          {role ? ` · ${role}` : ""}
          {mentions.length > 0 ? (
            <>
              {" "}
              <span className={styles.mentions} data-ton={ton}>
                {role ? "" : "· "}
                {mentions.join(" · ")}
              </span>
            </>
          ) : null}
        </span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </span>
      {droite ? <span className={styles.droite}>{droite}</span> : null}
    </>
  );

  return href ? (
    <a className={classes(styles.carte, className)} data-ton={ton} href={href}>
      {contenu}
    </a>
  ) : (
    <div className={classes(styles.carte, className)} data-ton={ton}>
      {contenu}
    </div>
  );
}
