import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./configpersonne.module.css";

/** Ce que le PIN va signer : l'enregistrement de la fiche, l'envoi d'un PIN provisoire ou la désactivation du compte. */
export type ActionSignee = "enregistrer" | "provisoire" | "desactiver";

interface Props {
  /** `null` : la feuille est fermée. */
  action: ActionSignee | null;
  onFermer: () => void;
  /** Le nom de la personne, dit dans le sous-titre : ce que le PIN va tracer. */
  nom: string;
  /**
   * Exécute l'action avec ce PIN. `false` : PIN refusé (compte un essai du clavier). Une exception est une erreur
   * technique (réseau, contrat) : le clavier la dit sans compter d'essai.
   */
  onSigner: (pin: string) => Promise<boolean>;
  /** L'action a échoué pour une autre raison qu'un PIN refusé. */
  echec: boolean;
}

/**
 * Toute écriture sur une personne est signée par le PIN du patron et tracée dans le journal : le clavier du kit ouvre
 * donc l'enregistrement, le PIN provisoire et la désactivation. Tant qu'il n'est pas validé, rien n'est envoyé.
 */
export function FeuillePin({ action, onFermer, nom, onSigner, echec }: Props) {
  const { t } = useTranslation("ConfigPersonne");
  return (
    <FeuilleModale
      ouverte={action !== null}
      onFermer={onFermer}
      titre={action === null ? "" : t(`pin.${action}`)}
      sousTitre={t("pin.sousTitre", { nom })}
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
