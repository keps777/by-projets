import type { ReactNode } from "react";
import { AvatarInitiales } from "./avatar-initiales";
import { classes, formaterMontant, initialesDe } from "./format";
import styles from "./ligne-depart.module.css";

export type ConducteurLigne = {
  /** Nom affiché, par exemple « Samuel ». */
  nom: string;
  /** Initiales de l'avatar ; déduites du nom si absentes. */
  initiales?: string;
  verifie?: boolean;
};

export type PropsLigneDepart = {
  /** « 08:00 » */
  heure: string;
  /** Nom de la compagnie (variante bus). */
  compagnie?: string;
  /** « VIP », « Classique »… */
  classe?: string;
  /** Classe haut de gamme : libellé en bleu, comme « VIP » dans la maquette. */
  classePremium?: boolean;
  /** Places réellement libres. */
  placesLibres?: number;
  /** Capacité du bus : sert à calculer la jauge quand `remplissage` n'est pas donné. */
  capacite?: number;
  /** Part de places prises, de 0 à 1 (jauge). */
  remplissage?: number;
  /** En dessous de ce nombre de places, la ligne passe en rouge : « plus que 3 ». */
  seuilUrgence?: number;
  /** Prix en francs CFA. */
  prix: number;
  variante?: "bus" | "covoiturage";
  /** Covoiturage : le conducteur. */
  conducteur?: ConducteurLigne;
  /** Covoiturage : afficher l'avatar du conducteur (oui par défaut). */
  avatar?: boolean;
  /** Covoiturage : « Bonapriso · 2 places · Toyota ». */
  detail?: ReactNode;
  /** La ligne devient un lien. */
  href?: string;
  /** La ligne devient un bouton. */
  onSelect?: () => void;
  className?: string;
};

function pourcentage(valeur: number): number {
  return Math.round(Math.min(1, Math.max(0, valeur)) * 100);
}

/** Une ligne de la liste des départs de l'accueil (maquette Main). */
export function LigneDepart({
  heure,
  compagnie,
  classe,
  classePremium = false,
  placesLibres,
  capacite,
  remplissage,
  seuilUrgence = 5,
  prix,
  variante = "bus",
  conducteur,
  avatar = true,
  detail,
  href,
  onSelect,
  className,
}: PropsLigneDepart) {
  const covoiturage = variante === "covoiturage";
  const complet = placesLibres === 0;
  const urgent = !covoiturage && placesLibres !== undefined && placesLibres <= seuilUrgence;
  const part =
    remplissage ??
    (capacite && placesLibres !== undefined ? 1 - placesLibres / capacite : undefined);

  let textePlaces: string | undefined;
  if (placesLibres !== undefined) {
    if (complet) textePlaces = "complet";
    else if (urgent) textePlaces = `plus que ${placesLibres}`;
    else textePlaces = `${placesLibres} ${placesLibres > 1 ? "places" : "place"}`;
  }

  const initiales = conducteur ? (conducteur.initiales ?? initialesDe(conducteur.nom)) : "";

  const contenu = (
    <>
      <span className={styles.heure}>{heure}</span>
      <span className={styles.centre}>
        {covoiturage && conducteur && avatar ? (
          <AvatarInitiales initiales={initiales} ton="vert" taille={32} />
        ) : null}
        <span className={styles.texte}>
          <span className={styles.titre}>
            {covoiturage ? (
              <>
                Covoiturage
                {conducteur ? (
                  <>
                    {" "}
                    <span className={styles.conducteur}>
                      {conducteur.nom}
                      {conducteur.verifie ? " · vérifié" : ""}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {compagnie}
                {classe ? (
                  <>
                    {" "}
                    <span className={classes(styles.classe, classePremium && styles.premium)}>
                      {classe}
                    </span>
                  </>
                ) : null}
              </>
            )}
          </span>
          {covoiturage ? (
            detail ? (
              <span className={styles.detail}>{detail}</span>
            ) : null
          ) : textePlaces ? (
            <span className={styles.places}>
              {part !== undefined ? (
                <span className={styles.jauge} aria-hidden="true">
                  <span className={styles.jaugePleine} style={{ width: `${pourcentage(part)}%` }} />
                </span>
              ) : null}
              {textePlaces}
            </span>
          ) : null}
        </span>
      </span>
      <span className={styles.prix}>{formaterMontant(prix)}</span>
    </>
  );

  const attributs = {
    className: classes(styles.ligne, className),
    "data-variante": variante,
    "data-urgent": urgent || complet ? "oui" : undefined,
  };

  if (href) {
    return (
      <a {...attributs} href={href}>
        {contenu}
      </a>
    );
  }
  if (onSelect) {
    return (
      <button {...attributs} type="button" onClick={onSelect}>
        {contenu}
      </button>
    );
  }
  return <div {...attributs}>{contenu}</div>;
}
