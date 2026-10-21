import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./configligne.module.css";

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  /** « 2 changements » : ce que le PIN va publier. */
  resume: string;
  /**
   * Publie la ligne avec ce PIN. `false` : PIN refusé (compte un essai du clavier). Une exception est une erreur
   * technique (réseau, contrat) : le clavier la dit sans compter d'essai.
   */
  onSigner: (pin: string) => Promise<boolean>;
  /** La publication a échoué pour une autre raison qu'un PIN refusé. */
  echec: boolean;
}

/**
 * Toute modification d'une ligne est signée par le PIN du patron et tracée dans le journal : le clavier du kit ouvre
 * donc la publication. Tant qu'il n'est pas validé, rien n'est envoyé et les guichets lisent toujours la ligne publiée.
 */
export function FeuillePin({ ouverte, onFermer, resume, onSigner, echec }: Props) {
  const { t } = useTranslation("ConfigLigne");
  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("pin.titre")}
      sousTitre={t("pin.sousTitre", { changements: resume })}
      libelleFermer={t("pin.fermer")}
      ancrage="parent"
    >
      <div className={styles.feuillePin}>
        <ClavierPin onComplet={onSigner} />
        {echec && (
          <p role="alert" className={styles.echec}>
            {t("pin.echec")}
          </p>
        )}
      </div>
    </FeuilleModale>
  );
}
