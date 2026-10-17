import { voyageur } from "@afrimove/api-client";
import { Bouton, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { ajouterJours, jourLong, villeDepuisNom, type VilleChoisie } from "./formats";
import styles from "./main.module.css";

/** Nombre de jours proposés dans la feuille « Choisir le jour » : aujourd'hui et les six suivants. */
const JOURS_PROPOSES = 7;

interface PropsChoixVille {
  ouverte: boolean;
  onFermer: () => void;
  cote: "depart" | "arrivee";
  /** Ville actuellement choisie de ce côté. */
  actuelle: VilleChoisie;
  onChoisir: (ville: VilleChoisie) => void;
}

/**
 * Feuille « choix de ville » : les villes desservies par le réseau (`useReseau`). Aucune planche de la maquette
 * ne la dessine (elle est du ticket AM-183) ; elle s'ouvre en touchant une ville des volets de destination.
 */
export function ChoixVille({ ouverte, onFermer, cote, actuelle, onChoisir }: PropsChoixVille) {
  const { t } = useTranslation("Main");
  const reseau = voyageur.useReseau({}, { enabled: ouverte });
  const villes = reseau.data?.villes ?? [];

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t(cote === "depart" ? "choixVille.titreDepart" : "choixVille.titreArrivee")}
      libelleFermer={t("choixVille.fermer")}
      ancrage="parent"
    >
      <div className={styles.feuille}>
        {reseau.isPending && (
          <p className={styles.feuilleEtat} role="status">
            {t("choixVille.chargement")}
          </p>
        )}
        {reseau.isError && (
          <div className={styles.feuilleEtat} role="alert">
            <p>{t("choixVille.erreur")}</p>
            <Bouton
              variante="secondaire"
              libelle={t("choixVille.reessayer")}
              onClick={() => void reseau.refetch()}
            />
          </div>
        )}
        {reseau.isSuccess && villes.length === 0 && (
          <p className={styles.feuilleEtat}>{t("choixVille.vide")}</p>
        )}
        {villes.map((nom) => (
          <button
            key={nom}
            type="button"
            className={styles.option}
            aria-pressed={nom === actuelle.nom}
            onClick={() => onChoisir(villeDepuisNom(nom))}
          >
            {nom}
          </button>
        ))}
      </div>
    </FeuilleModale>
  );
}

interface PropsChoixJour {
  ouverte: boolean;
  onFermer: () => void;
  /** Jour affiché par la recherche (`AAAA-MM-JJ`) ; `aujourdhui` est le premier jour proposé. */
  jour: string;
  aujourdhui: string;
  langue: string;
  onChoisir: (jour: string) => void;
}

/** Feuille « choisir le jour » : aujourd'hui puis les six jours suivants (AM-183 pour sa mise au propre). */
export function ChoixJour({
  ouverte,
  onFermer,
  jour,
  aujourdhui,
  langue,
  onChoisir,
}: PropsChoixJour) {
  const { t } = useTranslation("Main");
  const jours = Array.from({ length: JOURS_PROPOSES }, (_, i) => ajouterJours(aujourdhui, i));

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("choixJour.titre")}
      libelleFermer={t("choixJour.fermer")}
      ancrage="parent"
    >
      <div className={styles.feuille}>
        {jours.map((j, i) => (
          <button
            key={j}
            type="button"
            className={styles.option}
            aria-pressed={j === jour}
            onClick={() => onChoisir(j)}
          >
            {i === 0
              ? t("choixJour.aujourdhui")
              : i === 1
                ? t("choixJour.demain")
                : jourLong(j, langue)}
          </button>
        ))}
      </div>
    </FeuilleModale>
  );
}
