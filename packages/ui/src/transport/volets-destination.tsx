import { useEffect, useRef, useState } from "react";
import { classes } from "./format";
import { useReductionAnimations } from "./reduction-animations";
import styles from "./volets-destination.module.css";

export type PropsVoletsDestination = {
  /** Code de la ville affiché lettre par lettre : « DLA », « YDE ». */
  code: string;
  /** Nom lu par les lecteurs d'écran (« Douala »). Par défaut, le code. */
  libelle?: string;
  alignement?: "debut" | "fin";
  /** Mettre à false pour couper l'animation même si le système l'autorise. */
  anime?: boolean;
  className?: string;
};

type PropsLame = { lettre: string; rang: number; animerAuMontage: boolean };

function Lame({ lettre, rang, animerAuMontage }: PropsLame) {
  // Décidé une seule fois, au montage : une lame déjà posée ne rejoue pas son animation.
  const [anime] = useState(animerAuMontage);
  return (
    <span
      className={classes(styles.lame, anime && styles.lameAnimee)}
      style={{ ["--rang" as string]: rang }}
    >
      {lettre}
    </span>
  );
}

/**
 * Volets de destination à lames, comme un panneau de gare : une lame par lettre.
 * Quand le code change, les lames qui changent basculent l'une après l'autre.
 */
export function VoletsDestination({
  code,
  libelle,
  alignement = "debut",
  anime = true,
  className,
}: PropsVoletsDestination) {
  const reduit = useReductionAnimations();
  const animer = anime && !reduit;
  const monte = useRef(false);
  useEffect(() => {
    monte.current = true;
  }, []);
  // Au tout premier affichage, les lames sont simplement posées ; ensuite chaque changement bascule.
  const animerAuMontage = animer && monte.current;

  const lettres = [...code.toUpperCase()];

  return (
    <span
      className={classes(styles.volets, className)}
      role="img"
      aria-label={libelle ?? code}
      data-alignement={alignement}
      data-animation={animer ? "active" : "coupee"}
    >
      {lettres.map((lettre, rang) => (
        // La clé contient la lettre : un changement remonte la lame et lance sa bascule.
        <Lame
          key={`${rang}-${lettre}`}
          lettre={lettre}
          rang={rang}
          animerAuMontage={animerAuMontage}
        />
      ))}
    </span>
  );
}
