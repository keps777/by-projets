import type { colis as contrats } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete, IconeCoche, IconeFleche } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { etatsJalons, jourDeVisite, segmentsEtapes, separerRecit } from "./formats";
import type { EtatJalon } from "./formats";
import styles from "./relais-verification.module.css";

/**
 * L'écran : la fiche envoyée (dossier, étape), la frise de suivi en direct, le code relais réservé, l'essai de
 * l'app relais, le récit de la visite, puis « Modifier ma fiche » et « Retour à mon espace ».
 */
export function RelaisVerificationVue({ suivi }: { suivi: contrats.SuiviDemande }) {
  const { t } = useTranslation("RelaisVerification");
  const etats = etatsJalons(suivi.jalons, suivi.statut);
  const recit = separerRecit(suivi.recit.texte);
  // Le SMS de rappel annonce le jour de la visite : sans visite planifiée, il n'y a rien à annoncer.
  const jour =
    suivi.statut === "en_cours" && suivi.agent !== null ? jourDeVisite(suivi.agent.creneau) : null;

  return (
    <div className={styles.racine}>
      <Entete
        titre={suivi.titre}
        sousTitre={suivi.detail}
        retour={{ libelle: t("retour"), href: urlPlanche("Moi") }}
        droite={<Segments etape={suivi.etape} statut={suivi.statut} />}
      />

      <EcranCorps className={styles.corps} data-planche="RelaisVerification">
        <div className={styles.suivi}>
          <span className={styles.titreSuivi}>{t("suivi.titre")}</span>
          <ol className={styles.jalons} aria-label={t("suivi.liste")}>
            {suivi.jalons.map((jalon, i) => (
              <Jalon key={jalon.libelle} jalon={jalon} etat={etats[i] ?? "a-venir"} />
            ))}
          </ol>
        </div>

        <div className={styles.cartes}>
          <div className={styles.carte}>
            <span className={styles.carteLibelle}>{suivi.reservation.libelle}</span>
            <span className={styles.code}>{suivi.reservation.valeur}</span>
            <span className={styles.carteDetail}>{suivi.reservation.activation}</span>
          </div>
          <a className={`${styles.carte} ${styles.demo}`} href={urlPlanche("RelaisApp")}>
            <span className={styles.carteLibelle}>{suivi.demo.libelle}</span>
            <span className={styles.demoTitre}>{suivi.demo.titre}</span>
            <span className={`${styles.carteDetail} ${styles.demoDetail}`}>
              {suivi.demo.detail}
            </span>
          </a>
        </div>

        <div className={styles.recit}>
          <span className={styles.titreRecit}>{suivi.recit.titre}</span>
          <span className={styles.recitTexte}>
            {recit.debut}
            {recit.fin !== "" && <strong>{recit.fin}</strong>}
          </span>
        </div>

        {suivi.mention !== null && <span className={styles.mention}>{suivi.mention}</span>}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a
          className={styles.modifier}
          href={urlPlanche("RelaisInscription")}
          aria-label={t("actions.modifierNom")}
        >
          {t("actions.modifier")}
        </a>
        <Bouton
          variante="assistant"
          className={styles.retourEspace}
          href={urlPlanche("Moi")}
          libelle={t("actions.retourEspace")}
          {...(jour !== null ? { sousLibelle: t("actions.retourDetail", { jour }) } : {})}
          icone={<IconeFleche taille={22} trait={2.6} />}
        />
      </EcranPied>
    </div>
  );
}

/** Les segments de l'en-tête (décoratifs : « Étape 2 / 3 » est déjà dans le sous-titre). */
function Segments({
  etape,
  statut,
}: {
  etape: contrats.SuiviDemande["etape"];
  statut: contrats.SuiviDemande["statut"];
}) {
  const segments = segmentsEtapes(etape, statut);
  if (segments.length === 0) return null;
  return (
    <span className={styles.segments} aria-hidden="true">
      {segments.map((segment, i) => (
        <span key={i} className={styles.segment} data-segment={segment} />
      ))}
    </span>
  );
}

/** Une ligne de la frise : pastille d'état (coche verte, point ambre qui pulse, rond vide) et texte. */
function Jalon({ jalon, etat }: { jalon: contrats.JalonDemande; etat: EtatJalon }) {
  const { t } = useTranslation("RelaisVerification");
  const prefixe = { fait: "fait", "en-cours": "enCours", "a-venir": "aVenir" }[etat];
  return (
    <li
      className={styles.jalon}
      data-etat={etat}
      aria-current={etat === "en-cours" ? "step" : undefined}
    >
      <span
        className={etat === "en-cours" ? `${styles.pastille} am-pulse` : styles.pastille}
        aria-hidden="true"
      >
        {etat === "fait" && <IconeCoche taille={11} trait={3.5} />}
      </span>
      <span className={styles.jalonTexte}>
        <span className={styles.sr}>{t(`suivi.${prefixe}`)}</span>
        <strong>{jalon.libelle}</strong>
        {jalon.detail !== "" && ` · ${jalon.detail}`}
      </span>
    </li>
  );
}
