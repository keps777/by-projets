import { agence } from "@afrimove/api-client";
import { FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { heureDouala } from "./formats";
import styles from "./superviseur-equipe.module.css";

/**
 * « Voir son journal » : les entrées signées de la personne pour aujourd'hui (`useJournal({ personneId })`).
 * Lecture seule : aucune signature n'est demandée.
 */
export function FeuilleJournal({
  personneId,
  titre,
  sousTitre,
  onFermer,
}: {
  personneId: string;
  titre: string;
  sousTitre: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation("SuperviseurEquipe");
  const journal = agence.useJournal({ personneId }, { networkMode: "always" });

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={titre}
      sousTitre={sousTitre}
      libelleFermer={t("feuille.fermer")}
    >
      <div className={styles.feuille} aria-busy={journal.isPending}>
        {journal.data ? (
          journal.data.entrees.length === 0 ? (
            <p className={styles.etatDetail} role="status">
              {t("feuille.journal.vide")}
            </p>
          ) : (
            <>
              {!journal.data.chaineValide && (
                <p className={styles.retour} role="alert">
                  {t("feuille.journal.chaineRompue")}
                </p>
              )}
              <ul className={styles.journal}>
                {journal.data.entrees.map((e) => (
                  <li key={e.evenementId} className={styles.entree}>
                    <span className={styles.entreeHeure}>{heureDouala(e.at)}</span>
                    <span>
                      {e.resume}
                      {e.validePar ? (
                        <span className={styles.entreeSigne}>{t("feuille.journal.signe")}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : journal.isError ? (
          <div role="alert">
            <p className={styles.retour}>{t("feuille.journal.erreur")}</p>
            <button
              type="button"
              className={styles.reessayer}
              onClick={() => void journal.refetch()}
            >
              {t("feuille.journal.reessayer")}
            </button>
          </div>
        ) : (
          <p className={`${styles.etatDetail} am-pulse`} role="status">
            {t("feuille.journal.chargement")}
          </p>
        )}
      </div>
    </FeuilleModale>
  );
}
