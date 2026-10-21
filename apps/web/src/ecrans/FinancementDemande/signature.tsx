import { ErreurHttp, patron } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./financement-demande.module.css";

/** Le dossier n'est plus retirable : le partenaire a déjà versé ou répondu (409 `DOSSIER_NON_RETIRABLE`). */
export function nonRetirable(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.statut === 409;
}

export interface PropsFeuilleSignature {
  dossier: contrats.DossierFinancement | undefined;
  ouverte: boolean;
  /** Titre de la feuille : le libellé du bouton « Retirer la demande ». */
  titre: string;
  onFermer: () => void;
  /** Appelé une fois la demande retirée (retrait signé et enregistré). */
  onRetiree: () => void;
  /** Appelé quand le serveur refuse ou n'a pas pu enregistrer le retrait (autre qu'un PIN faux). */
  onEchec: (cause: "impossible" | "echec") => void;
}

/**
 * Signature du retrait. Toute écriture du patron est signée par son PIN : la planche ne dessine pas le clavier, il
 * s'ouvre ici en feuille quand on touche « Retirer la demande ». Un PIN refusé (403) compte un essai ; un dossier qui
 * n'est plus retirable (409) ferme la feuille ; une autre erreur est technique et ne compte pas. Après un succès,
 * `useRetirerDemande` recharge le dossier et l'offre.
 */
export function FeuilleSignature({
  dossier,
  ouverte,
  titre,
  onFermer,
  onRetiree,
  onEchec,
}: PropsFeuilleSignature) {
  const { t } = useTranslation("FinancementDemande");
  const retirer = patron.useRetirerDemande();
  const signer = patron.useSignaturePin();

  async function surPin(pin: string): Promise<boolean | void> {
    if (!dossier) return false;
    try {
      await retirer.mutateAsync({ dossierId: dossier.id, signature: signer(pin) });
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      onEchec(nonRetirable(erreur) ? "impossible" : "echec");
      onFermer();
      return;
    }
    onRetiree();
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
