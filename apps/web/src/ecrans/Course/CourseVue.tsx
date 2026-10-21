import { voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { CarteCourse } from "./CarteCourse";
import { Retour, TitreEcran } from "./etats";
import {
  compagnieDeLaGare,
  departRetenu,
  formaterMontant,
  formaterNote,
  heureDouala,
  lieuCourt,
  modeInitial,
  prenom,
  prixDuMode,
  villeDeLaGare,
} from "./formats";
import { IconeTelephone } from "./icones";
import styles from "./course.module.css";

export interface PropsCourseVue {
  proposition: contrats.PropositionCourse;
}

/**
 * L'écran : la carte avec l'heure de départ, le choix du véhicule, le chauffeur proposé, le récapitulatif (prise en
 * charge, arrivée au quai, prix payé avec le billet) et le bouton de réservation.
 */
export function CourseVue({ proposition: p }: PropsCourseVue) {
  const { t } = useTranslation("Course");
  const navigate = useNavigate();
  const reserver = voyageur.useReserverCourse();
  const [choix, setChoix] = useState<contrats.ModeCourse | null>(null);
  const [appel, setAppel] = useState(false);
  const [echec, setEchec] = useState(false);
  const envoiEnCours = useRef(false);

  const mode = choix ?? modeInitial(p.modes);
  const depart = departRetenu(p);
  const heureDepart = heureDouala(depart.partirA);
  const prix = prixDuMode(p, mode);
  const chauffeur = p.chauffeur;
  const prenomChauffeur = prenom(chauffeur.nom);
  const reputation = [
    chauffeur.verifie ? t("chauffeur.verifie") : null,
    chauffeur.note === undefined ? null : `${formaterNote(chauffeur.note)} ★`,
  ]
    .filter((x) => x !== null)
    .join(" · ");

  async function reserverLaCourse() {
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;
    setEchec(false);
    try {
      // Le prix de la course s'ajoute au billet : aucun paiement n'est demandé ici.
      await reserver.mutateAsync({ billetId: p.billetId, mode, partirA: depart.partirA });
      void navigate(urlPlanche("Pass", { billetId: p.billetId }));
    } catch {
      setEchec(true);
    } finally {
      envoiEnCours.current = false;
    }
  }

  return (
    <div className={styles.racine}>
      <TitreEcran />

      <div className={styles.carte}>
        <CarteCourse
          depart={p.lieuDepart}
          gare={p.gare}
          chauffeur={t("carte.chauffeur", {
            prenom: prenomChauffeur,
            minutes: chauffeur.arriveDansMinutes,
          })}
          libelle={t("carte.libelle", {
            depart: lieuCourt(p.lieuDepart),
            ville: villeDeLaGare(p.gare),
            duree: t("carte.duree", { count: p.trajetMinutes }),
            mode: t(`carte.mode.${mode}`),
          })}
        />
        <Retour billetId={p.billetId} />
        <div className={styles.haut}>
          <span className={styles.hautGauche}>
            <span className={styles.consigne}>
              {t("depart.consigne", { minutes: p.presenceQuaiMinutes })}
            </span>
            <span className={styles.heure}>{t("depart.heure", { heure: heureDepart })}</span>
          </span>
          <span className={styles.hautDroite}>
            {t("depart.trajet", { minutes: p.trajetMinutes })}
            <br />
            {t("depart.bus", { heure: heureDouala(p.busA) })}
          </span>
        </div>
      </div>

      <EcranCorps className={styles.corps} data-planche="Course">
        <div role="group" aria-label={t("modes.groupe")} className={styles.modes}>
          {p.modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={styles.mode}
              aria-pressed={m.mode === mode}
              onClick={() => {
                setChoix(m.mode);
                setEchec(false);
              }}
            >
              {m.prix === undefined ? m.libelle : `${m.libelle} · ${formaterMontant(m.prix)} F`}
            </button>
          ))}
        </div>

        <div className={styles.chauffeur}>
          <span className={styles.avatar} aria-hidden="true">
            {chauffeur.initiales}
          </span>
          <span className={styles.chauffeurTextes}>
            <span className={styles.chauffeurNom}>
              {chauffeur.nom} · {chauffeur.type}{" "}
              {reputation !== "" && (
                <span className={styles.chauffeurReputation}>{reputation}</span>
              )}
            </span>
            <span className={styles.chauffeurDetail}>{chauffeur.detail}</span>
          </span>
          <button
            type="button"
            className={styles.appeler}
            aria-label={t("chauffeur.appeler", { prenom: prenomChauffeur })}
            onClick={() => setAppel(true)}
          >
            <IconeTelephone />
          </button>
        </div>

        <div className={styles.recap}>
          <span className={styles.ligne}>
            <span>{t("recap.cherche", { prenom: prenomChauffeur })}</span>
            <span className={styles.valeur}>{heureDepart}</span>
          </span>
          <span className={styles.ligne}>
            <span>{t("recap.arrivee", { compagnie: compagnieDeLaGare(p.gare) })}</span>
            <span className={styles.valeur}>{heureDouala(depart.arriveeQuai)}</span>
          </span>
          <span className={styles.ligne}>
            <span>{t(p.payeAvecBillet ? "recap.paiementBillet" : "recap.paiement")}</span>
            <span className={`${styles.valeur} ${styles.prix}`}>{formaterMontant(prix)} F</span>
          </span>
        </div>

        {appel && (
          <p role="status" className={styles.message}>
            {t("chauffeur.appelIndisponible", { prenom: prenomChauffeur })}
          </p>
        )}
        {echec && (
          <p role="alert" className={`${styles.message} ${styles.alerte}`}>
            {t("reserver.echec")}
          </p>
        )}
      </EcranCorps>

      <EcranPied>
        <button type="button" className={styles.reserver} onClick={() => void reserverLaCourse()}>
          {t("reserver.libelle", { context: mode, heure: heureDepart })}
        </button>
        <span className={styles.rappel}>
          {t("pied.rappel", {
            minutes: p.rappelMinutes,
            heure: heureDouala(p.annulationGratuiteJusqua),
          })}
        </span>
      </EcranPied>
    </div>
  );
}
