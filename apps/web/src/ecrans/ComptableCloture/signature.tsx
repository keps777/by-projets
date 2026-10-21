import { ErreurHttp, patron } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./cloture.module.css";

export interface PropsFeuilleSignature {
  cloture: contrats.ClotureMois | undefined;
  ouverte: boolean;
  /** Titre de la feuille : le libellé du bouton « Clôturer décembre · mon PIN ». */
  titre: string;
  onFermer: () => void;
  /** Appelé une fois le mois clôturé et envoyé. */
  onCloture: () => void;
}

/**
 * Signature de la clôture. Toute écriture du patron est signée par son PIN : la planche ne dessine pas le clavier, il
 * s'ouvre ici en feuille quand on touche « Clôturer ». Un PIN refusé (403) compte un essai ; une autre erreur (par
 * exemple le rapprochement qui n'est pas terminé) est technique et ne compte pas. Après un succès,
 * `useCloturerMois` recharge la clôture : l'écran passe à « mois clôturé ».
 */
export function FeuilleSignature({
  cloture,
  ouverte,
  titre,
  onFermer,
  onCloture,
}: PropsFeuilleSignature) {
  const { t } = useTranslation("ComptableCloture");
  const cloturer = patron.useCloturerMois();
  const signer = patron.useSignaturePin();

  async function surPin(pin: string): Promise<boolean | void> {
    if (!cloture) return false;
    try {
      await cloturer.mutateAsync({
        mois: cloture.mois,
        envoyerAuCabinet: true,
        signature: signer(pin),
      });
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      throw erreur;
    }
    onCloture();
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={titre}
      sousTitre={t("signature.sousTitre")}
      libelleFermer={t("signature.fermer")}
    >
      <div className={styles.signature}>
        <ClavierPin onComplet={surPin} aria-label={t("signature.clavier")} />
      </div>
    </FeuilleModale>
  );
}
