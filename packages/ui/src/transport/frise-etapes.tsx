import type { ReactNode } from "react";
import { classes } from "./format";
import styles from "./frise-etapes.module.css";
import commun from "./commun.module.css";

export type EtatEtape = "passe" | "en-cours" | "a-venir";

export type EtapeFrise = {
  id: string;
  etat: EtatEtape;
  contenu: ReactNode;
  /** « 10:05 », « ~13:00 », « — » */
  heure?: string;
  /** L'étape devient un lien (ex. « 4 places montent ici »). */
  href?: string;
  onSelect?: () => void;
};

export type PropsFriseEtapes = {
  etapes: readonly EtapeFrise[];
  /** Nom de la liste pour les lecteurs d'écran. */
  libelle: string;
  /** « arrets » : texte en 13 px semi-gras ; « suivi » : texte normal avec le mot-clé en gras. */
  variante?: "arrets" | "suivi";
  className?: string;
};

const PREFIXES: Record<EtatEtape, string> = {
  passe: "Passé : ",
  "en-cours": "En cours : ",
  "a-venir": "À venir : ",
};

/** Liste verticale d'étapes avec pastille d'état ; l'étape en cours pulse. Base des deux frises. */
export function FriseEtapes({ etapes, libelle, variante = "arrets", className }: PropsFriseEtapes) {
  return (
    <ol className={classes(styles.frise, className)} aria-label={libelle} data-variante={variante}>
      {etapes.map((etape) => {
        const interieur = (
          <>
            <span className={styles.pastille} data-etat={etape.etat} aria-hidden="true" />
            <span className={styles.texte}>
              <span className={commun.sr}>{PREFIXES[etape.etat]}</span>
              {etape.contenu}
            </span>
            {etape.heure ? <span className={styles.heure}>{etape.heure}</span> : <span />}
          </>
        );
        const attributs = { className: styles.ligne, "data-etat": etape.etat };
        return (
          <li
            key={etape.id}
            className={styles.item}
            aria-current={etape.etat === "en-cours" ? "step" : undefined}
          >
            {etape.href ? (
              <a {...attributs} href={etape.href}>
                {interieur}
              </a>
            ) : etape.onSelect ? (
              <button {...attributs} type="button" onClick={etape.onSelect}>
                {interieur}
              </button>
            ) : (
              <div {...attributs}>{interieur}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
