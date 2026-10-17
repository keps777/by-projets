import type { colis as contrats } from "@afrimove/contrats";
import {
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche,
  IconeFleche,
  Pastille,
  type PropsPastille,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { decouperEnDeuxLignes, decouperRecit, etatsDesJalons } from "./formats";
import styles from "./livreur-verification.module.css";

type Statut = contrats.SuiviDemande["statut"];

/** La pastille de l'en-tête : « EN COURS » en bleu sans point tant que la demande est étudiée, puis son issue. */
const PASTILLES: Record<Statut, Pick<PropsPastille, "statut" | "ton" | "point">> = {
  en_cours: { statut: "enCours", ton: "bleu", point: false },
  active: { statut: "active" },
  refusee: { statut: "aSurveiller" },
};

function EnteteVerification({ suivi }: { suivi: contrats.SuiviDemande }) {
  const { t } = useTranslation("LivreurVerification");
  return (
    <Entete
      className={styles.entete}
      titre={suivi.titre}
      sousTitre={suivi.detail}
      retour={{ libelle: t("retour"), href: urlPlanche("Moi") }}
      droite={
        <Pastille
          {...PASTILLES[suivi.statut]}
          libelle={t(`statut.${suivi.statut}`)}
          data-statut-demande={suivi.statut}
        />
      }
    />
  );
}

/** La frise : fiche, pièces, formation, activation. Le premier jalon à faire pulse en bleu, la suite attend. */
function Frise({ jalons }: { jalons: contrats.JalonDemande[] }) {
  const { t } = useTranslation("LivreurVerification");
  const etats = etatsDesJalons(jalons);
  return (
    <section className={styles.frise} aria-labelledby="frise-titre">
      <h2 id="frise-titre" className={styles.friseTitre}>
        {t("suivi.titre")}
      </h2>
      <ol className={styles.etapes}>
        {jalons.map((jalon, i) => {
          const etat = etats[i] ?? "a_venir";
          return (
            <li
              key={`${jalon.libelle}-${i}`}
              className={styles.etape}
              data-etat={etat}
              {...(etat === "en_cours" ? { "aria-current": "step" as const } : {})}
            >
              <span
                className={`${styles.rond} ${etat === "en_cours" ? "am-pulse" : ""}`}
                data-etat={etat}
                aria-hidden="true"
              >
                {etat === "fait" && <IconeCoche taille={11} trait={3.5} />}
              </span>
              <span className={styles.etapeTexte}>
                <strong>{jalon.libelle}</strong>
                {jalon.detail !== "" && ` · ${jalon.detail}`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Le badge réservé et l'essai de l'app livreur en démo. */
function Tuiles({ suivi }: { suivi: contrats.SuiviDemande }) {
  const { reservation, demo } = suivi;
  return (
    <div className={styles.tuiles}>
      <div className={styles.tuile}>
        <span className={styles.tuileEtiquette}>{reservation.libelle}</span>
        <span className={styles.badge}>{reservation.valeur}</span>
        <span className={styles.tuileDetail}>{reservation.activation}</span>
      </div>
      <a className={`${styles.tuile} ${styles.demo}`} href={urlPlanche("Livreur")}>
        <span className={styles.tuileEtiquette}>{demo.libelle}</span>
        <span className={styles.demoTitre}>{demo.titre}</span>
        <span className={styles.demoDetail}>{demo.detail}</span>
      </a>
    </div>
  );
}

/** « Ta première soirée » : la dernière phrase (le gain versé le soir même) est en gras. */
function Recit({ recit }: { recit: contrats.SuiviDemande["recit"] }) {
  const { debut, fin } = decouperRecit(recit.texte);
  return (
    <section className={styles.recit} aria-labelledby="recit-titre">
      <h2 id="recit-titre" className={styles.recitTitre}>
        {recit.titre}
      </h2>
      <p className={styles.recitTexte}>
        {debut}
        {fin !== "" && <strong>{fin}</strong>}
      </p>
    </section>
  );
}

function Particularites({
  complement,
}: {
  complement: NonNullable<contrats.SuiviDemande["complement"]>;
}) {
  return (
    <section className={styles.particularites} aria-labelledby="particularites-titre">
      <h2 id="particularites-titre" className={styles.particularitesTitre}>
        {complement.titre}
      </h2>
      <p className={styles.particularitesTexte}>{complement.texte}</p>
    </section>
  );
}

/** Pied : modifier la fiche (LivreurDevenir) et revenir à son espace (Moi), l'action principale en bleu. */
export function PiedVerification() {
  const { t } = useTranslation("LivreurVerification");
  const { haut, bas } = decouperEnDeuxLignes(t("actions.modifier"));
  return (
    <EcranPied className={styles.pied}>
      <a className={styles.modifier} href={urlPlanche("LivreurDevenir")}>
        {haut}
        {bas !== "" && (
          <>
            {" "}
            <br />
            {bas}
          </>
        )}
      </a>
      <a className={styles.retour} href={urlPlanche("Moi")}>
        <span className={styles.retourTextes}>
          <span className={styles.retourTitre}>{t("actions.retour")}</span>
          <span className={styles.retourDetail}>{t("actions.retourDetail")}</span>
        </span>
        <IconeFleche taille={22} trait={2.6} />
      </a>
    </EcranPied>
  );
}

/**
 * Suivi de la demande de livreur : la pastille de statut, la frise des vérifications, le badge réservé, l'essai de l'app
 * en démo, le récit de la première soirée et les particularités modifiables.
 */
export function VerificationVue({ suivi }: { suivi: contrats.SuiviDemande }) {
  return (
    <>
      <EnteteVerification suivi={suivi} />
      <EcranCorps className={styles.corps} data-planche="LivreurVerification">
        <Frise jalons={suivi.jalons} />
        <Tuiles suivi={suivi} />
        <Recit recit={suivi.recit} />
        {suivi.complement !== null && <Particularites complement={suivi.complement} />}
      </EcranCorps>
      <PiedVerification />
    </>
  );
}
