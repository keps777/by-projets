import { voyageur } from "@afrimove/api-client";
import { Bouton, CartePersonne, Etiquette, FeuilleModale, LigneInterrupteur } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { useSession } from "@/coquille/session";
import { LANGUES, changerLangue, estLangue, type Langue } from "@/i18n";
import { useAlertes } from "./alertes";
import { telephoneNational } from "./clients-connus";
import { useTextesFeuilles } from "./textes";
import styles from "./feuilles.module.css";

interface PropsFeuilleReglages {
  ouverte: boolean;
  onFermer: () => void;
  /** `parent` couvre l'écran qui porte la feuille (390 px) ; `ecran` toute la fenêtre. */
  ancrage?: "ecran" | "parent";
}

/**
 * Feuille « Réglages » du compte (icône roue de Moi) : qui je suis, la langue, les alertes de ce téléphone et la
 * déconnexion. Aucune planche ne la dessine (ticket AM-183). La langue s'applique et se mémorise aussitôt ; les
 * alertes sont gardées sur l'appareil. « Se déconnecter » n'apparaît que s'il y a une session.
 */
export function FeuilleReglages({ ouverte, onFermer, ancrage = "parent" }: PropsFeuilleReglages) {
  const { t } = useTextesFeuilles();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { session, fermerSession } = useSession();
  const profil = voyageur.useProfil({ enabled: ouverte });
  const [alertes, definirAlerte] = useAlertes();

  const langue: Langue | null = estLangue(i18n.language) ? i18n.language : null;

  function deconnecter() {
    fermerSession();
    onFermer();
    void navigate(urlPlanche("Connexion"));
  }

  const identite = profil.data;

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("reglages.titre")}
      sousTitre={t("reglages.sousTitre")}
      libelleFermer={t("fermer")}
      ancrage={ancrage}
      actions={
        <>
          {session !== null && (
            <Bouton
              variante="secondaire"
              libelle={t("reglages.deconnexion")}
              onClick={deconnecter}
            />
          )}
          <Bouton libelle={t("reglages.terminer")} onClick={onFermer} />
        </>
      }
    >
      <div className={styles.contenu}>
        {identite !== undefined ? (
          <CartePersonne
            nom={`${identite.prenom} ${identite.nom}`.trim()}
            initiales={identite.initiales}
            verifie={false}
            ton="ambre"
            detail={`+237 ${telephoneNational(identite.telephone)}`}
          />
        ) : profil.isError ? (
          <div className={styles.etat} role="alert">
            <p>{t("reglages.profil.indisponible")}</p>
            <button type="button" className={styles.relance} onClick={() => void profil.refetch()}>
              {t("reglages.profil.reessayer")}
            </button>
          </div>
        ) : (
          <div
            className={styles.carte}
            role="status"
            aria-busy="true"
            aria-label={t("reglages.profil.chargement")}
          >
            <span className={`${styles.squelette} am-pulse`} />
          </div>
        )}

        <fieldset className={styles.section}>
          <legend className={styles.etat}>
            <Etiquette>{t("reglages.langue.titre")}</Etiquette>
          </legend>
          <div className={styles.langues} role="group" aria-label={t("reglages.langue.aria")}>
            {LANGUES.map((code) => (
              <button
                key={code}
                type="button"
                className={styles.langue}
                aria-pressed={code === langue}
                onClick={() => void changerLangue(i18n, code)}
              >
                {t(`reglages.langue.${code}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.etat}>
            <Etiquette>{t("reglages.alertes.titre")}</Etiquette>
          </legend>
          <div className={styles.alertes}>
            <LigneInterrupteur
              libelle={t("reglages.alertes.voyage")}
              checked={alertes.voyage}
              onChange={(active) => definirAlerte("voyage", active)}
            />
            <LigneInterrupteur
              libelle={t("reglages.alertes.colis")}
              separateur
              checked={alertes.colis}
              onChange={(active) => definirAlerte("colis", active)}
            />
          </div>
        </fieldset>
      </div>
    </FeuilleModale>
  );
}
