import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./modules.module.css";

export interface ChangementEnAttente {
  code: string;
  nom: string;
  /** L'état demandé : `true` allume le module, `false` le masque. */
  actif: boolean;
}

interface Props {
  changement: ChangementEnAttente | null;
  onFermer: () => void;
  /** Reçoit le PIN complet. `false` : PIN refusé (compte un essai) ; une exception : erreur technique. */
  onPin: (pin: string) => Promise<boolean>;
}

/** Tout changement d'un module est signé par le PIN du patron (contrat patron) : le clavier s'ouvre dans une feuille. */
export function FeuillePin({ changement, onFermer, onPin }: Props) {
  const { t } = useTranslation("Modules");
  return (
    <FeuilleModale
      ouverte={changement !== null}
      onFermer={onFermer}
      titre={t("pin.titre")}
      sousTitre={
        changement
          ? t(changement.actif ? "pin.allumer" : "pin.masquer", { module: changement.nom })
          : undefined
      }
      libelleFermer={t("pin.fermer")}
    >
      <div className={styles.feuillePin}>
        <ClavierPin onComplet={onPin} note={t("pin.note")} />
      </div>
    </FeuilleModale>
  );
}
