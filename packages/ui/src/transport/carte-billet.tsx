import type { ReactNode } from "react";
import { CodeQr } from "./code-qr";
import { classes } from "./format";
import { GrosCode } from "./gros-code";
import styles from "./carte-billet.module.css";

export type EscaleBillet = {
  /** « DLA » */
  code: string;
  /** « Douala Akwa » */
  ville: string;
};

export type PropsCarteBillet = {
  compagnie: string;
  /** « BEX-DLA-270105-0142 » */
  reference: string;
  depart: EscaleBillet;
  arrivee: EscaleBillet;
  /** Durée du trajet : « 3 h 30 ». */
  duree?: string;
  /** Heure de départ : « 08:00 ». */
  heure: string;
  /** Date : « 05.01 ». */
  date: string;
  siege: string;
  classe: string;
  /** Contenu du QR code. */
  qr: string;
  /** Code sans scanner, 4 chiffres. */
  code: string;
  /** « Aïcha Ngo · CNI ··· 4471 » */
  passager?: ReactNode;
  /** « Au quai 20 min avant, avec ta pièce. » */
  consigne?: ReactNode;
  className?: string;
};

function LogoMarque() {
  return (
    <svg width="26" height="26" viewBox="0 0 72 72" aria-hidden="true">
      <rect width="72" height="72" rx="20" fill="#0B1019" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="#273247" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="#1B2435" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="#FFB547" />
      <rect x="10" y="34" width="52" height="3" fill="#0B1019" />
    </svg>
  );
}

/** Billet nominatif : bandeau compagnie, souche DLA → YDE, départ, date, siège, classe, QR et code. */
export function CarteBillet({
  compagnie,
  reference,
  depart,
  arrivee,
  duree,
  heure,
  date,
  siege,
  classe,
  qr,
  code,
  passager,
  consigne,
  className,
}: PropsCarteBillet) {
  const champs = [
    { nom: "Départ", valeur: heure },
    { nom: "Date", valeur: date },
    { nom: "Siège", valeur: siege },
    { nom: "Classe", valeur: classe },
  ];

  return (
    <article
      className={classes(styles.billet, className)}
      aria-label={`Billet ${compagnie}, ${depart.ville} vers ${arrivee.ville}`}
    >
      <header className={styles.bandeau}>
        <span className={styles.marque}>
          <LogoMarque />
          <span className={styles.compagnie}>{compagnie}</span>
        </span>
        <span className={styles.reference}>{reference}</span>
      </header>

      <div className={styles.souche}>
        <span className={styles.escale}>
          <span className={styles.codeVille}>{depart.code}</span>
          <span className={styles.ville}>{depart.ville}</span>
        </span>
        <span className={styles.trajet} aria-hidden="true">
          <svg
            width="64"
            height="14"
            viewBox="0 0 64 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M2 7h52" />
            <path d="M50 2l6 5-6 5" />
          </svg>
          {duree ? <span className={styles.duree}>{duree}</span> : null}
        </span>
        <span className={classes(styles.escale, styles.escaleFin)}>
          <span className={styles.codeVille}>{arrivee.code}</span>
          <span className={styles.ville}>{arrivee.ville}</span>
        </span>
      </div>

      <dl className={styles.champs}>
        {champs.map((champ) => (
          <div key={champ.nom} className={styles.champ}>
            <dt className={styles.nomChamp}>{champ.nom}</dt>
            <dd className={styles.valeurChamp}>{champ.valeur}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.perforation} aria-hidden="true">
        <span className={styles.encoche} />
        <span className={styles.pointilles} />
        <span className={styles.encoche} />
      </div>

      <div className={styles.controle}>
        <CodeQr valeur={qr} taille={132} libelle="QR code du billet" />
        <span className={styles.sansScan}>
          <span className={styles.etiquette}>Code sans scanner</span>
          <GrosCode code={code} taille={34} espacement="large" libelle="Code du billet" />
          {passager || consigne ? (
            <span className={styles.consigne}>
              {passager}
              {passager && consigne ? <br /> : null}
              {consigne}
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}
