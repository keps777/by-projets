import { EcranCorps } from "@afrimove/ui";
import type { ReactNode } from "react";
import styles from "./commun.module.css";
import { RacineCadence } from "./commun";

/** Cadre des états sans données : l'en-tête de l'écran (on peut toujours sortir) puis un corps sur fond Profond. */
function Cadre({
  planche,
  entete,
  children,
}: {
  planche: string;
  entete: ReactNode;
  children: ReactNode;
}) {
  return (
    <RacineCadence planche={planche}>
      {entete}
      {children}
    </RacineCadence>
  );
}

/** Chargement : deux cartes de la taille de celles de la planche, qui pulsent. */
export function EtatChargement({
  planche,
  entete,
  libelle,
}: {
  planche: string;
  entete: ReactNode;
  libelle: string;
}) {
  return (
    <Cadre planche={planche} entete={entete}>
      <EcranCorps role="status" aria-busy="true" aria-label={libelle}>
        <div className={styles.squelette} />
        <div className={styles.squelette} />
        <div className={`${styles.squelette} ${styles.squeletteGrand}`} />
      </EcranCorps>
    </Cadre>
  );
}

/** Vide : rien à vendre ou rien à montrer. */
export function EtatVide({
  planche,
  entete,
  titre,
  detail,
}: {
  planche: string;
  entete: ReactNode;
  titre: string;
  detail: string;
}) {
  return (
    <Cadre planche={planche} entete={entete}>
      <EcranCorps>
        <div className={styles.etat}>
          <h2 className={styles.etatTitre}>{titre}</h2>
          <p className={styles.etatDetail}>{detail}</p>
        </div>
      </EcranCorps>
    </Cadre>
  );
}

/** Erreur de chargement, avec de quoi réessayer. */
export function EtatErreur({
  planche,
  entete,
  titre,
  detail,
  reessayer,
  onReessayer,
}: {
  planche: string;
  entete: ReactNode;
  titre: string;
  detail: string;
  reessayer: string;
  onReessayer: () => void;
}) {
  return (
    <Cadre planche={planche} entete={entete}>
      <EcranCorps>
        <div className={styles.etat} role="alert">
          <h2 className={styles.etatTitre}>{titre}</h2>
          <p className={styles.etatDetail}>{detail}</p>
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {reessayer}
          </button>
        </div>
      </EcranCorps>
    </Cadre>
  );
}
