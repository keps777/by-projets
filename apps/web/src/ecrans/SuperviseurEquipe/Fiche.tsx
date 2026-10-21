import { useTranslation } from "react-i18next";
import type { Feuille } from "./FeuilleActions";
import {
  ACTIONS_PAR_DEFAUT,
  contexteGenre,
  montant,
  personnesADebloquer,
  type ActionEquipe,
  type Equipe,
  type Personne,
} from "./formats";
import styles from "./superviseur-equipe.module.css";

/** Ce que la fiche demande à l'écran : une action à signer, ou le journal à lire. */
export type DemandeFiche = Feuille | { genre: "journal"; personneId: string };

function demandeDe(action: ActionEquipe, personneId: string): DemandeFiche {
  switch (action) {
    case "renouveler_pin":
      return { genre: "renouveler", personneId };
    case "changer_affectation":
      return { genre: "affectation", personneId };
    case "voir_journal":
      return { genre: "journal", personneId };
    case "desactiver":
      return { genre: "desactiver", personneId };
  }
}

/**
 * La fiche de la personne choisie : ses quatre actions, « Débloquer » pour chaque compte bloqué, « Mon propre PIN »,
 * puis la règle du PIN. « Renouveler le PIN » est l'action que le bouton du pied exécute : elle reste enfoncée.
 */
export function Fiche({
  equipe,
  personne,
  annonce,
  onDemander,
}: {
  equipe: Equipe;
  personne: Personne;
  /** Ce que la dernière action acceptée a fait, une fois faite. */
  annonce: string | null;
  onDemander: (demande: DemandeFiche) => void;
}) {
  const { t } = useTranslation("SuperviseurEquipe");
  const { fiche } = equipe;
  const role = t(`roles.${personne.role}`, contexteGenre(personne.nom));
  const actions = fiche?.actions ?? ACTIONS_PAR_DEFAUT;

  const minutes = equipe.pinProvisoireMinutes;
  const duree =
    minutes % 60 === 0
      ? t("fiche.dureeHeures", { count: minutes / 60 })
      : t("fiche.dureeMinutes", { count: minutes });

  // « guichetier depuis le 5 janv. · 1 204 billets » pour la personne de la fiche, « guichetière · guichet 1 » sinon.
  const detail =
    fiche && fiche.personneId === personne.personneId
      ? t("fiche.detail", {
          role,
          depuis: fiche.depuisLibelle,
          billets: montant(fiche.billets),
          count: fiche.billets,
        })
      : personne.affectation
        ? t("fiche.detailSimple", { role, affectation: personne.affectation })
        : t("fiche.detailRole", { role });

  return (
    <section className={styles.fiche} aria-label={personne.nom}>
      <div className={styles.ficheTete}>
        <h2 className={styles.ficheNom}>{personne.nom}</h2>
        <span className={styles.ficheDetail}>{detail}</span>
      </div>

      <div className={styles.grille}>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={styles.action}
            {...(action === "renouveler_pin" ? { "aria-pressed": true } : {})}
            {...(action === "desactiver" ? { "data-ton": "rouge" } : {})}
            onClick={() => onDemander(demandeDe(action, personne.personneId))}
          >
            <span className={styles.actionTitre}>{t(`fiche.actions.${action}.titre`)}</span>
            <span className={styles.actionDetail}>{t(`fiche.actions.${action}.detail`)}</span>
          </button>
        ))}
      </div>

      <div className={styles.grille}>
        {personnesADebloquer(equipe).map((x) => (
          <button
            key={x.id}
            type="button"
            className={styles.autreAction}
            onClick={() => onDemander({ genre: "debloquer", personneId: x.id, nom: x.nom })}
          >
            {t("fiche.debloquer", { nom: x.nom })}
          </button>
        ))}
        <button
          type="button"
          className={styles.autreAction}
          onClick={() => onDemander({ genre: "monPin" })}
        >
          {t("fiche.monPin")}
        </button>
      </div>

      <span className={styles.regle}>{t("fiche.regle", { duree })}</span>
      {annonce && (
        <span className={styles.resultat} role="status">
          {annonce}
        </span>
      )}
    </section>
  );
}
