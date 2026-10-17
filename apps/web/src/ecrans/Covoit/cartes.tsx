import type { voyageur as c } from "@afrimove/contrats";
import { useConception } from "@afrimove/ui";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  formaterDuree,
  formaterMontant,
  formaterNote,
  heureDouala,
  separerLieu,
  type TonConducteur,
} from "./formats";
import styles from "./covoit.module.css";

interface PropsCarte {
  offre: c.OffreCovoit;
  ton: TonConducteur;
  /** Le conducteur est une conductrice : « vérifiée ». */
  feminin: boolean;
  onChoisir: (offre: c.OffreCovoit) => void;
}

/** Pastille ronde à initiales, de la couleur du rang. */
function Avatar({
  initiales,
  ton,
  grand,
}: {
  initiales: string;
  ton: TonConducteur;
  grand: boolean;
}) {
  return (
    <span
      className={grand ? `${styles.avatar} ${styles.avatarGrand}` : styles.avatar}
      data-ton={ton}
    >
      {initiales}
    </span>
  );
}

/** « · vérifié · 4,9 ★ · 112 trajets » : ce que le conducteur a déjà prouvé. */
function mentionsDe(
  conducteur: c.ConducteurCovoit,
  feminin: boolean,
  t: TFunction<"Covoit">,
): string {
  const parts: string[] = [];
  if (conducteur.verifie) parts.push(t(feminin ? "conducteur.verifiee" : "conducteur.verifie"));
  if (conducteur.note !== undefined) parts.push(formaterNote(conducteur.note));
  if (conducteur.trajets !== undefined) {
    parts.push(t("conducteur.trajets", { count: conducteur.trajets }));
  }
  return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
}

/** Les options de l'offre, dans l'ordre de la planche : clim, femmes bienvenues, grand bagage. */
function optionsDe(offre: c.OffreCovoit, t: TFunction<"Covoit">, avecClim: boolean): string[] {
  return [
    ...(avecClim && offre.clim ? [t("offre.clim")] : []),
    ...(offre.femmesBienvenues ? [t("offre.femmes")] : []),
    ...(offre.grandBagage ? [t("offre.grandBagage")] : []),
  ];
}

/** Carte détaillée du premier conducteur : voiture, plaque, départ et arrivée précis, garantie, bouton. */
export function CarteDetaillee({ offre, ton, feminin, onChoisir }: PropsCarte) {
  const { t } = useTranslation("Covoit");
  const conception = useConception();
  const { conducteur } = offre;
  const mentions = mentionsDe(conducteur, feminin, t);

  const places = t("offre.places", { count: offre.placesLibres });
  const detail = [
    offre.vehicule,
    ...(offre.immatriculation ? [offre.immatriculation] : []),
    ...(offre.clim ? [t("offre.clim")] : []),
    places,
    ...optionsDe(offre, t, false),
  ].join(" · ");

  const lieu = separerLieu(offre.lieuDepart);
  const duree = offre.dureeMinutes === undefined ? "" : ` · ${formaterDuree(offre.dureeMinutes)}`;
  const arrivee = [
    offre.lieuArrivee ? t("offre.arriveeLieu", { lieu: offre.lieuArrivee }) : t("offre.arrivee"),
    ...(offre.arriveeEstimee
      ? [t("offre.arriveeHeure", { heure: heureDouala(offre.arriveeEstimee) })]
      : []),
  ].join(" ");
  const arrets =
    offre.arretsPossibles !== undefined && offre.arretsPossibles > 0
      ? ` · ${t("offre.arrets", { count: offre.arretsPossibles })}`
      : "";

  return (
    <button type="button" className={styles.carteGrande} onClick={() => onChoisir(offre)}>
      <span className={styles.rangee}>
        <Avatar initiales={conducteur.initiales} ton={ton} grand />
        <span className={styles.identite}>
          <span className={styles.nomGrand}>
            {conducteur.nom}
            {mentions && (
              <>
                {" "}
                <span className={styles.mention} data-ton={ton}>
                  {mentions}
                </span>
              </>
            )}
          </span>
          <span className={styles.detail}>{detail}</span>
        </span>
        <span className={styles.prixGrand}>{formaterMontant(offre.prixParPlace)}</span>
      </span>
      <span className={styles.etapes}>
        <span className={styles.heure}>{heureDouala(offre.departA)}</span>
        <span className={styles.lignes}>
          <span>
            <strong className={styles.fort}>
              {t("offre.depart")}
              {lieu.quartier ? ` ${lieu.quartier}` : ""}
            </strong>
            {lieu.repere}
            {duree}
          </span>
          <span>
            {arrivee}
            {arrets}
          </span>
        </span>
      </span>
      <span className={styles.pied}>
        <span className={styles.garantie}>{offre.garantie}</span>
        <span className={styles.reserver}>
          {t("offre.reserver")}
          {conception ? t("offre.touche") : ""}
        </span>
      </span>
    </button>
  );
}

/** Carte compacte d'un des conducteurs suivants : heure, quartier, voiture, places, options, prix. */
export function CarteCompacte({ offre, ton, feminin, onChoisir }: PropsCarte) {
  const { t } = useTranslation("Covoit");
  const { conducteur } = offre;
  const mentions = mentionsDe(conducteur, feminin, t);
  const detail = [
    heureDouala(offre.departA),
    ...(offre.lieuDepart ? [offre.lieuDepart] : []),
    offre.vehicule,
    t("offre.places", { count: offre.placesLibres }),
    ...optionsDe(offre, t, true),
  ].join(" · ");

  return (
    <button type="button" className={styles.carte} onClick={() => onChoisir(offre)}>
      <Avatar initiales={conducteur.initiales} ton={ton} grand={false} />
      <span className={styles.identite}>
        <span className={styles.nom}>
          {conducteur.nom}
          {mentions && (
            <>
              {" "}
              <span className={styles.mention} data-ton={ton}>
                {mentions}
              </span>
            </>
          )}
        </span>
        <span className={styles.detail}>{detail}</span>
      </span>
      <span className={styles.prix}>{formaterMontant(offre.prixParPlace)}</span>
    </button>
  );
}
