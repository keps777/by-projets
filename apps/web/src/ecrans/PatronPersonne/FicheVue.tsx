import type { patron as contrats } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete, Pastille, TuileKpi } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { moduleDeLUrl, useModules } from "@/coquille/modules";
import { urlPlanche } from "@/coquille/planches";
import {
  annulationsNormales,
  barresEcarts,
  ecart,
  estAuTravail,
  estFeminin,
  formaterJour,
  heureDouala,
  nombre,
  prenom,
  quandJournal,
  separerConclusion,
  taux,
} from "./formats";
import styles from "./patronpersonne.module.css";

export interface PropsFicheVue {
  fiche: contrats.FichePersonne;
  /** La gare de la personne (retrouvée dans « Mes gares ») : « Changer de guichet / gare » ouvre cette gare. */
  gareId: string | undefined;
}

function FlecheDroite() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Fiche d'une personne de l'équipe, vue par le patron (planche PatronPersonne.dc.html) : qui elle est, ses chiffres sur
 * 90 jours, ses écarts de caisse des 10 derniers jours, l'analyse de l'assistant, le journal des écarts, puis les
 * actions. Les écrans de destination (équipe, gare, superviseur, assistant) sont ceux de la planche ; un module masqué
 * retire l'action qui y mène.
 */
export function FicheVue({ fiche, gareId }: PropsFicheVue) {
  const { t, i18n } = useTranslation("PatronPersonne");
  const { moduleActif } = useModules();
  const { personne, chiffres, ecarts, journal } = fiche;

  const actif = (href: string): boolean => {
    const module = moduleDeLUrl(href);
    return module === null || moduleActif(module);
  };
  const hrefEquipe = urlPlanche("PatronEquipe");
  const hrefGare = gareId ? urlPlanche("PatronGare", { gareId }) : hrefEquipe;
  const hrefPin = urlPlanche("SuperviseurEquipe");
  const hrefAssistant = urlPlanche("Assistant");

  const lieu = personne.lieu;
  const sousTitre = [
    t(`roles.${personne.role}`),
    lieu,
    t("depuis", { date: formaterJour(personne.depuis, i18n.language) }),
  ]
    .filter((segment) => segment !== "")
    .join(" · ");

  const barres = barresEcarts(ecarts.jours);
  const barresAvecEcart = barres.filter((b) => b.accent);
  const { debut, conclusion } = separerConclusion(ecarts.lecture);
  const valideurs = [...new Set(journal.map((ligne) => ligne.validePar))].join(", ");

  const actionsGare = actif(hrefGare);
  const actionsPin = actif(hrefPin);
  const assistant = actif(hrefAssistant);

  return (
    <>
      <Entete
        titre={personne.nom}
        sousTitre={sousTitre}
        retour={{ libelle: t("retour"), href: hrefEquipe }}
        droite={
          chiffres.ecarts.nombre > 0 ? (
            <Pastille
              statut="aSurveiller"
              ton="ambre"
              libelle={t("badge.ecarts", { count: chiffres.ecarts.nombre })}
            />
          ) : undefined
        }
      />

      <EcranCorps className={styles.corps} data-planche="PatronPersonne" data-etat="pret">
        <section className={styles.fiche} aria-label={personne.nom}>
          <span className={styles.avatar} aria-hidden="true">
            {personne.initiales}
          </span>
          <span className={styles.identite}>
            <span className={styles.telephone}>
              {t("fiche.operateur", {
                numero: personne.telephoneMasque,
                operateur: personne.operateur,
              })}
            </span>
            <span>
              {t("fiche.salaire", { montant: nombre(personne.salaire), jour: personne.jourDePaie })}
            </span>
            {personne.superviseur !== "" && (
              <span>
                {t(estFeminin(personne.superviseur) ? "fiche.superviseure" : "fiche.superviseur", {
                  nom: personne.superviseur,
                })}
              </span>
            )}
          </span>
          <span className={styles.etat}>
            <span
              className={styles.etatLibelle}
              data-etat={personne.etat}
              data-ton={
                estAuTravail(personne.etat)
                  ? "vert"
                  : personne.etat === "bloquee"
                    ? "rouge"
                    : "neutre"
              }
            >
              {t(`fiche.etats.${personne.etat}`)}
            </span>
            {personne.enServiceDepuis !== null && estAuTravail(personne.etat) && (
              <span className={styles.depuis}>
                {t("fiche.depuisHeure", { heure: heureDouala(personne.enServiceDepuis) })}
              </span>
            )}
          </span>
        </section>

        <div className={styles.tuiles}>
          <TuileKpi
            etiquette={t("chiffres.billets")}
            valeur={nombre(chiffres.billets)}
            sousLigne={t("chiffres.jours", { count: chiffres.periodeJours })}
            className={styles.tuile}
          />
          <TuileKpi
            etiquette={t("chiffres.colis")}
            valeur={nombre(chiffres.colis)}
            sousLigne={t("chiffres.litiges", { count: chiffres.litiges })}
            className={styles.tuile}
          />
          <TuileKpi
            etiquette={t("chiffres.annulations")}
            valeur={nombre(chiffres.annulations)}
            sousLigne={t(
              annulationsNormales(chiffres.tauxAnnulationPct)
                ? "chiffres.annulationsNormales"
                : "chiffres.annulationsElevees",
              { taux: taux(chiffres.tauxAnnulationPct) },
            )}
            className={styles.tuile}
          />
          <TuileKpi
            etiquette={t("chiffres.ecarts")}
            valeur={nombre(chiffres.ecarts.nombre)}
            etat={chiffres.ecarts.nombre > 0 ? "ambre" : "neutre"}
            sousLigne={t("chiffres.ecartsDetail", {
              jours: t("chiffres.jours", { count: chiffres.ecarts.sur }),
              total: ecart(chiffres.ecarts.total),
            })}
            className={styles.tuile}
          />
        </div>

        <section className={styles.graphique}>
          <div className={styles.graphiqueEntete}>
            <h2 className={styles.etiquette}>
              {t("ecarts.titre", { count: ecarts.jours.length })}
            </h2>
            <span className={styles.tolerance}>
              {t("ecarts.tolerance", { montant: nombre(ecarts.tolerance) })}
            </span>
          </div>
          <div
            className={styles.barres}
            role="img"
            aria-label={
              barresAvecEcart.length > 0
                ? t("ecarts.aria", {
                    liste: barresAvecEcart
                      .map((b) => t("ecarts.ariaJour", { jour: b.jour, ecart: ecart(b.ecart) }))
                      .join(", "),
                  })
                : t("ecarts.ariaAucun")
            }
          >
            {barres.map((barre, i) => (
              <span key={`${barre.jour}-${i}`} className={styles.jour}>
                <span
                  className={styles.barre}
                  data-accent={barre.accent ? "ambre" : undefined}
                  style={{ height: `${barre.hauteur}%` }}
                />
                <span className={styles.jourEtiquette}>{barre.jour}</span>
              </span>
            ))}
          </div>
          <p className={styles.lecture}>
            {debut !== "" && `${debut} `}
            <strong>{conclusion}</strong>
          </p>
        </section>

        <section className={styles.journal}>
          <div className={styles.journalEntete}>
            <h2 className={styles.etiquette}>{t("journal.titre", { count: journal.length })}</h2>
            {journal.length > 0 && (
              <span className={styles.valides}>
                {t("journal.valides", { count: journal.length, par: valideurs })}
              </span>
            )}
          </div>
          {journal.length === 0 && <p className={styles.journalVide}>{t("journal.aucun")}</p>}
          {journal.map((ligne) => (
            <div key={ligne.quand} className={styles.ligne}>
              <span>
                <strong>{quandJournal(ligne.quand, i18n.language)}</strong>{" "}
                {t("journal.ligne", {
                  compte: nombre(ligne.cashCompte),
                  attendu: nombre(ligne.cashAttendu),
                })}
              </span>
              <span className={styles.ecart}>{ecart(ligne.ecart)}</span>
            </div>
          ))}
        </section>

        {(actionsGare || actionsPin) && (
          <div className={styles.actions}>
            {actionsGare && (
              <a className={styles.action} href={hrefGare}>
                <span className={styles.actionTitre}>{t("actions.gare.titre")}</span>
                <span className={styles.actionDetail}>{t("actions.gare.detail")}</span>
              </a>
            )}
            {actionsPin && (
              <a className={styles.action} href={hrefPin}>
                <span className={styles.actionTitre}>{t("actions.pin.titre")}</span>
                <span className={styles.actionDetail}>{t("actions.pin.detail")}</span>
              </a>
            )}
          </div>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a className={styles.desactiver} href={hrefEquipe}>
          {t("pied.desactiver.libelle")}
          <br />
          <span className={styles.desactiverDetail}>{t("pied.desactiver.detail")}</span>
        </a>
        {assistant && (
          <Bouton
            variante="assistant"
            href={hrefAssistant}
            libelle={t("pied.assistant.libelle")}
            sousLibelle={t("pied.assistant.detail", { prenom: prenom(personne.nom) })}
            icone={<FlecheDroite />}
            className={styles.assistant}
          />
        )}
      </EcranPied>
    </>
  );
}
