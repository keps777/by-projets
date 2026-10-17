import { ErreurTransport } from "@afrimove/impression";
import { useState } from "react";
import { useFileImpression, useImprimante } from "./hooks";
import styles from "./indicateur-imprimante.module.css";
import { LIBELLE_ETAT, TEXTES } from "./textes";

interface Props {
  className?: string;
}

/**
 * État de l'imprimante du guichet : « imprimante OK » quand elle est prête, sinon la raison, le nombre de
 * documents qui attendent (ils repartent seuls à son retour) et la touche utile : appairer, ou relancer.
 * Sur un navigateur sans Web Bluetooth (Safari iOS), il explique pourquoi et n'offre aucune touche.
 */
export function IndicateurImprimante({ className }: Props) {
  const imprimante = useImprimante();
  const { enAttente, relancer } = useFileImpression();
  const [refus, setRefus] = useState<string | null>(null);

  const appairer = async () => {
    setRefus(null);
    try {
      await imprimante.appairer();
    } catch (erreur) {
      // Fermer le sélecteur Bluetooth n'est pas une erreur ; le reste se dit.
      if (erreur instanceof ErreurTransport && erreur.code === "annule") return;
      setRefus(erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

  const peutAppairer =
    imprimante.disponible &&
    (imprimante.etat === "non_appairee" || imprimante.etat === "deconnectee");
  const message = refus ?? (imprimante.etat === "erreur" ? imprimante.erreur : null);

  return (
    <div className={[styles.indicateur, className].filter(Boolean).join(" ")}>
      <span
        className={styles.pastille}
        data-etat={imprimante.etat}
        role="status"
        title={imprimante.nom ?? undefined}
      >
        <span className={styles.point} aria-hidden="true" />
        {LIBELLE_ETAT[imprimante.etat]}
        {enAttente.length > 0 ? (
          <span className={styles.attente}>
            {" · "}
            {TEXTES.enAttente(enAttente.length)}
            {imprimante.etat === "deconnectee" ? ` · ${TEXTES.relanceAuto}` : ""}
          </span>
        ) : null}
      </span>
      {!imprimante.disponible ? <p className={styles.note}>{TEXTES.indisponible}</p> : null}
      {message ? <p className={styles.note}>{message}</p> : null}
      {peutAppairer ? (
        <button type="button" className={styles.action} onClick={() => void appairer()}>
          {TEXTES.appairer}
        </button>
      ) : null}
      {imprimante.etat === "erreur" && enAttente.length > 0 ? (
        <button type="button" className={styles.action} onClick={() => void relancer()}>
          {TEXTES.reessayer}
        </button>
      ) : null}
    </div>
  );
}
