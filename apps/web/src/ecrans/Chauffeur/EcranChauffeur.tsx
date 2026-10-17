import { ErreurHttp, agence } from "@afrimove/api-client";
import { EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { FeuilleDepense } from "./FeuilleDepense";
import { heureDouala, jourMois, montantCourt, montantFcfa } from "./formats";
import { IconeAlerte, IconeHorloge } from "./icones";
import { peripheriques } from "./peripheriques";
import styles from "./chauffeur.module.css";

export type FeuilleRoute = NonNullable<ReturnType<typeof agence.useChauffeurFeuille>["data"]>;

/** Planche « Chauffeur » : feuille de route, dépenses, incident et retard en 1 touche. Lit `useChauffeurFeuille`. */
export function EcranChauffeur() {
  const requete = agence.useChauffeurFeuille();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  return <FeuilleDeRoute feuille={requete.data} />;
}

type Retour = { ton: "ok" | "erreur"; texte: string } | null;

function FeuilleDeRoute({ feuille }: { feuille: FeuilleRoute }) {
  const { t } = useTranslation("Chauffeur");
  const navigate = useNavigate();
  const incident = agence.useDeclarerIncident();
  const retard = agence.useDeclarerRetard();
  const arrivee = agence.useArriveeArret();

  const [depenseOuverte, setDepenseOuverte] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);
  const [echecArrivee, setEchecArrivee] = useState(false);
  const enCours = useRef(false);

  const { trajet, depenses, semaine } = feuille;
  const date = jourMois(feuille.jour);
  const excesVitesse = trajet.vitesseKmh > trajet.limiteKmh;
  const minutesRetard = feuille.incidents.retardParDefautMinutes;

  /** Un seul geste à la fois : on garde la position (facultative), on envoie, on dit ce qui est parti. */
  async function geste(action: () => Promise<Retour>, echec: string) {
    if (enCours.current) return;
    enCours.current = true;
    setRetour(null);
    try {
      setRetour(await action());
    } catch {
      setRetour({ ton: "erreur", texte: echec });
    } finally {
      enCours.current = false;
    }
  }

  const signalerIncident = () =>
    geste(async () => {
      const gps = await peripheriques.position.position();
      const resultat = await incident.mutateAsync({
        incidentId: globalThis.crypto.randomUUID(),
        departId: trajet.departId,
        nature: "panne",
        gps,
        note: null,
      });
      return { ton: "ok", texte: t("incident.envoye", { nombre: resultat.voyageursPrevenus }) };
    }, t("incident.echec"));

  const annoncerRetard = () =>
    geste(async () => {
      const resultat = await retard.mutateAsync({
        departId: trajet.departId,
        minutes: minutesRetard,
      });
      return {
        ton: "ok",
        texte: t("retard.envoye", { minutes: minutesRetard, nombre: resultat.voyageursPrevenus }),
      };
    }, t("retard.echec"));

  /** « Arrivé à Pouma » : l'arrivée est enregistrée (avec la position), puis le convoyeur prend la main. */
  async function surArrivee(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (enCours.current) return;
    enCours.current = true;
    setEchecArrivee(false);
    try {
      const gps = await peripheriques.position.position();
      await arrivee.mutateAsync({
        departId: trajet.departId,
        arret: trajet.prochainArret.nom,
        gps,
      });
      void navigate(urlPlanche("Convoyeur"));
    } catch {
      setEchecArrivee(true);
    } finally {
      enCours.current = false;
    }
  }

  return (
    <>
      <Entete
        titre={t("titre", { nom: feuille.chauffeur.nom })}
        sousTitre={t("sousTitre", {
          bus: feuille.bus.immatriculation,
          jour: date.jour,
          mois: t(`mois.${date.mois}`),
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Quai") }}
        droite={
          <span className={styles.gps}>
            <span className={styles.gpsPoint} data-actif={feuille.gps} aria-hidden="true" />
            {t("gps")}
          </span>
        }
      />

      <EcranCorps className={styles.corps} data-planche="Chauffeur">
        <section className={styles.trajet} aria-label={t("trajet.etiquette")}>
          <span className={styles.trajetTextes}>
            <span className={styles.etiquette}>{t("trajet.etiquette")}</span>
            <span className={styles.trajetRoute}>
              {t("trajet.route", { origine: trajet.origine, destination: trajet.destination })}
            </span>
            <span className={styles.trajetDetail}>
              {t("trajet.detail", {
                depart: heureDouala(trajet.partiA),
                abord: trajet.aBord,
                colis: trajet.colis,
                arret: trajet.prochainArret.nom,
                heure: heureDouala(trajet.prochainArret.heure),
              })}
            </span>
          </span>
          <span className={styles.vitesse}>
            <span className={styles.vitesseValeur} data-exces={excesVitesse}>
              {trajet.vitesseKmh}
            </span>
            <span className={styles.vitesseUnite}>
              {t("trajet.vitesse", { limite: trajet.limiteKmh })}
            </span>
          </span>
        </section>

        <section className={styles.depenses} aria-label={t("depenses.titre")}>
          <div className={`${styles.etiquette} ${styles.depensesTete}`}>
            <span>{t("depenses.titre")}</span>
            <span className={styles.depensesRappel}>{t("depenses.rappel")}</span>
          </div>
          <ul className={styles.lignes}>
            {depenses.lignes.map((ligne) => (
              <li key={ligne.depenseId} className={styles.ligne}>
                <span>{ligne.libelle}</span>
                <span className={styles.montant}>{montantFcfa(ligne.montant)}</span>
                <span className={styles.justificatif} data-manquant={!ligne.justificatif}>
                  {ligne.justificatif ? t("depenses.photo") : t("depenses.sansPhoto")}
                </span>
              </li>
            ))}
            <li className={`${styles.ligne} ${styles.ligneAutre}`}>
              <span>{t("depenses.autre")}</span>
              <span className={styles.montantAucun}>{t("depenses.aucun")}</span>
              <button
                type="button"
                className={styles.ajouter}
                aria-haspopup="dialog"
                onClick={() => setDepenseOuverte(true)}
              >
                {t("depenses.ajouter")}
              </button>
            </li>
          </ul>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} ${styles.actionIncident}`}
            onClick={() => void signalerIncident()}
          >
            <IconeAlerte couleur="var(--am-rouge)" />
            <span className={styles.actionTitre}>{t("incident.titre")}</span>
            <span className={styles.actionDetail}>{t("incident.detail")}</span>
          </button>
          <button type="button" className={styles.action} onClick={() => void annoncerRetard()}>
            <IconeHorloge couleur="var(--am-ambre)" />
            <span className={styles.actionTitre}>
              {t("retard.titre", { minutes: minutesRetard })}
            </span>
            <span className={styles.actionDetail}>
              {t("retard.detail", { nombre: trajet.aBord })}
            </span>
          </button>
        </div>

        {retour && (
          <p
            className={styles.retour}
            data-ton={retour.ton}
            role={retour.ton === "erreur" ? "alert" : "status"}
          >
            {retour.texte}
          </p>
        )}

        <section className={styles.semaine} aria-label={t("semaine.titre")}>
          <div className={styles.semaineTete}>
            <span className={styles.semaineTitre}>{t("semaine.titre")}</span>
            <span className={styles.semainePaie}>
              {t("semaine.paie", { jour: semaine.paieLe })}
            </span>
          </div>
          <div className={styles.stats}>
            <Stat valeur={semaine.trajets} libelle={t("semaine.trajets")} />
            <Stat valeur={montantFcfa(semaine.km)} libelle={t("semaine.km")} />
            <Stat
              valeur={semaine.excesVitesse}
              libelle={t("semaine.excesVitesse")}
              ton={semaine.excesVitesse === 0 ? "bon" : "exces"}
            />
            <Stat valeur={montantCourt(semaine.aRecevoir)} libelle={t("semaine.aRecevoir")} />
          </div>
        </section>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {echecArrivee && (
          <p role="alert" className={styles.alerte}>
            {t("arrivee.echec")}
          </p>
        )}
        <a
          href={urlPlanche("Convoyeur")}
          className={styles.arrivee}
          aria-busy={arrivee.isPending}
          onClick={(e) => void surArrivee(e)}
        >
          {t("arrivee.libelle", { arret: trajet.prochainArret.nom })}
        </a>
      </EcranPied>

      <FeuilleDepense
        ouverte={depenseOuverte}
        onFermer={() => setDepenseOuverte(false)}
        departId={trajet.departId}
        categories={depenses.categories}
      />
    </>
  );
}

function Stat({
  valeur,
  libelle,
  ton,
}: {
  valeur: number | string;
  libelle: string;
  ton?: "bon" | "exces";
}) {
  return (
    <div className={styles.stat}>
      <p className={styles.statValeur} data-ton={ton}>
        {valeur}
      </p>
      <p className={styles.statLibelle}>{libelle}</p>
    </div>
  );
}
