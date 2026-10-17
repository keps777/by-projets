import { ErreurHttp, patron } from "@afrimove/api-client";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./config.module.css";
import type { Regles } from "./formats";
import type { CleInterrupteur } from "./sections";

/** Un interrupteur que le patron vient de toucher : la règle et la valeur voulue. */
export interface Bascule {
  cle: CleInterrupteur;
  valeur: boolean;
}

/** Les règles modifiables d'un coup (les comptes MoMo ont leur propre commande, plus stricte) avec la bascule appliquée. */
export function reglesApresBascule(regles: Regles, { cle, valeur }: Bascule) {
  const { comptesMomo: _comptes, ...modifiables } = regles;
  return cle === "cadence"
    ? { ...modifiables, cadence: { numeroObligatoire: valeur } }
    : {
        ...modifiables,
        fraisService: { ...modifiables.fraisService, priseEnChargeParAgence: valeur },
      };
}

export interface PropsFeuilleSignature {
  regles: Regles;
  bascule: Bascule | null;
  /** Libellé de la règle touchée, repris de la planche. */
  libelle: string;
  onFermer: () => void;
}

/**
 * Signature d'un changement de règle. Toute écriture du patron est signée par son PIN : la planche ne dessine pas le
 * clavier, il s'ouvre ici en feuille quand on touche un interrupteur. Un PIN refusé (403) compte un essai ; une autre
 * erreur est technique et ne compte pas. Après un succès, `useEnregistrerRegles` recharge les règles.
 */
export function FeuilleSignature({ regles, bascule, libelle, onFermer }: PropsFeuilleSignature) {
  const { t } = useTranslation("Config");
  const enregistrer = patron.useEnregistrerRegles();
  const signer = patron.useSignaturePin();

  async function surPin(pin: string): Promise<boolean | void> {
    if (!bascule) return false;
    try {
      await enregistrer.mutateAsync({
        regles: reglesApresBascule(regles, bascule),
        signature: signer(pin),
      });
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      throw erreur;
    }
    onFermer();
  }

  return (
    <FeuilleModale
      ouverte={bascule !== null}
      onFermer={onFermer}
      titre={libelle}
      sousTitre={t("signature.sousTitre")}
      libelleFermer={t("signature.fermer")}
    >
      <div className={styles.signature}>
        <ClavierPin onComplet={surPin} aria-label={t("signature.clavier")} />
      </div>
    </FeuilleModale>
  );
}
