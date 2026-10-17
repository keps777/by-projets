import { voyageur } from "@afrimove/api-client";
import { Bouton, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import styles from "./mainville.module.css";

interface PropsChoixVille {
  ouverte: boolean;
  onFermer: () => void;
  /** Ville actuellement affichée. */
  actuelle: string;
  onChoisir: (nom: string) => void;
}

/**
 * Feuille « Changer de ville » : les villes desservies par le réseau (`useReseau`). Aucune planche de la maquette ne
 * la dessine ; elle s'ouvre en touchant « Changer de ville ▾ ».
 */
export function ChoixVille({ ouverte, onFermer, actuelle, onChoisir }: PropsChoixVille) {
  const { t } = useTranslation("MainVille");
  const reseau = voyageur.useReseau({}, { enabled: ouverte });
  const villes = reseau.data?.villes ?? [];

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("ville.titreFeuille")}
      libelleFermer={t("ville.fermer")}
      ancrage="parent"
    >
      <div className={styles.feuille}>
        {reseau.isPending && (
          <p className={styles.feuilleEtat} role="status">
            {t("ville.chargement")}
          </p>
        )}
        {reseau.isError && (
          <div className={styles.feuilleEtat} role="alert">
            <p>{t("ville.erreur")}</p>
            <Bouton
              variante="secondaire"
              libelle={t("ville.reessayer")}
              onClick={() => void reseau.refetch()}
            />
          </div>
        )}
        {reseau.isSuccess && villes.length === 0 && (
          <p className={styles.feuilleEtat}>{t("ville.vide")}</p>
        )}
        {villes.map((nom) => (
          <button
            key={nom}
            type="button"
            className={styles.option}
            aria-pressed={nom === actuelle}
            onClick={() => onChoisir(nom)}
          >
            {nom}
          </button>
        ))}
      </div>
    </FeuilleModale>
  );
}
