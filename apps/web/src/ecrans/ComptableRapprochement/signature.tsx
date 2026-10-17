import { ErreurHttp, patron } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./rapprochement.module.css";
import { lignesOuvertes } from "./formats";

/** Les décisions à appliquer : la cause la plus probable de chaque ligne encore ouverte, avec l'action proposée. */
export function decisionsProposees(
  lignes: readonly contrats.TransactionSansCorrespondance[],
): contrats.AppliquerRapprochement["decisions"] {
  return lignesOuvertes(lignes).map((l) => ({ reference: l.reference, action: l.actionProposee }));
}

export interface PropsFeuilleSignature {
  rapprochement: contrats.RapprochementMomo | undefined;
  ouverte: boolean;
  /** Titre de la feuille : le libellé du bouton « Appliquer les N · mon PIN ». */
  titre: string;
  onFermer: () => void;
  /** Appelé une fois les décisions signées et enregistrées. */
  onApplique: () => void;
}

/**
 * Signature des décisions. Toute écriture du patron est signée par son PIN : la planche ne dessine pas le clavier,
 * il s'ouvre ici en feuille quand on touche « Appliquer ». Un PIN refusé (403) compte un essai ; une autre erreur
 * est technique et ne compte pas. Après un succès, `useAppliquerRapprochement` recharge le rapprochement.
 */
export function FeuilleSignature({
  rapprochement,
  ouverte,
  titre,
  onFermer,
  onApplique,
}: PropsFeuilleSignature) {
  const { t } = useTranslation("ComptableRapprochement");
  const appliquer = patron.useAppliquerRapprochement();
  const signer = patron.useSignaturePin();

  async function surPin(pin: string): Promise<boolean | void> {
    if (!rapprochement) return false;
    const decisions = decisionsProposees(rapprochement.lignes);
    if (decisions.length === 0) return false;
    try {
      await appliquer.mutateAsync({
        mois: rapprochement.mois,
        decisions,
        signature: signer(pin),
      });
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      throw erreur;
    }
    onApplique();
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
