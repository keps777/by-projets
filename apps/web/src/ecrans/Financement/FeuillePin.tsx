import { ErreurHttp } from "@afrimove/api-client";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./financement.module.css";

interface Props {
  ouverte: boolean;
  /** Ce que le PIN signe, en une ligne (« Demander 6 M d'avance sur recettes »). */
  sousTitre: string;
  /** Précision sous le clavier. */
  note: string;
  /** Message quand l'envoi échoue pour une raison technique. */
  messageEchec: string;
  onFermer: () => void;
  /** Envoie la demande signée. Une exception : PIN refusé (403) ou erreur technique. */
  onPin: (pin: string) => Promise<void>;
}

/**
 * La planche n'a pas de clavier : toute écriture du patron est signée par son PIN, il s'ouvre donc dans une feuille
 * quand on touche « Demander » ou l'interrupteur du paiement en 2 fois. Un PIN refusé (403) compte un essai ; une autre erreur est technique, elle ne compte
 * pas et la feuille le dit sans rien envoyer.
 */
export function FeuillePin({ ouverte, sousTitre, note, messageEchec, onFermer, onPin }: Props) {
  const { t } = useTranslation("Financement");
  const [echec, setEchec] = useState(false);

  async function surPin(pin: string): Promise<boolean | void> {
    setEchec(false);
    try {
      await onPin(pin);
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      setEchec(true);
    }
  }

  function fermer() {
    setEchec(false);
    onFermer();
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={fermer}
      titre={t("pin.titre")}
      sousTitre={sousTitre}
      libelleFermer={t("pin.fermer")}
    >
      <div className={styles.feuillePin}>
        {echec && (
          <p role="alert" className={styles.echec}>
            {messageEchec}
          </p>
        )}
        <ClavierPin onComplet={surPin} note={note} />
      </div>
    </FeuilleModale>
  );
}
