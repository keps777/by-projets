import { agence } from "@afrimove/api-client";
import { FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { heureDeIso } from "./format";
import styles from "./commun.module.css";

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  /** Départ affiché en ce moment. */
  departId: string;
  onChoisir: (departId: string) => void;
}

/**
 * Feuille « Autre départ » : les départs ouverts à la vente (ceux de la vente en un écran), pour vendre en cadence
 * sur un autre. Aucune planche ne la dessine ; elle ouvre la touche « Autre départ ».
 */
export function ChoixDepart({ ouverte, onFermer, departId, onChoisir }: Props) {
  const { t } = useTranslation("Cadence");
  const contexte = agence.useVenteContexte({}, { enabled: ouverte });
  const departs = contexte.data?.departs ?? [];

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("autreDepart.titre")}
      libelleFermer={t("numero.fermer")}
      ancrage="parent"
    >
      <div className={styles.formulaire}>
        {contexte.isPending && <p className={styles.etatDetail}>{t("autreDepart.chargement")}</p>}
        {contexte.isError && (
          <p role="alert" className={styles.etatDetail}>
            {t("autreDepart.erreur")}
          </p>
        )}
        {departs.map((depart) => (
          <button
            key={depart.departId}
            type="button"
            className={styles.option}
            aria-pressed={depart.departId === departId}
            onClick={() => onChoisir(depart.departId)}
          >
            {t("autreDepart.ligne", {
              heure: heureDeIso(depart.heureDepart),
              destination: depart.destination,
              count: depart.placesLibres,
            })}
          </button>
        ))}
      </div>
    </FeuilleModale>
  );
}
