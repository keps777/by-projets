import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps, IconeInverser, IconeLieu, IconePersonne, Puce, Selecteur } from "@afrimove/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { useParametres } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { CarteCompacte, CarteDetaillee } from "./cartes";
import { CONDUCTRICES_DEMO } from "./demo";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  FILTRES_PROPOSES,
  PRIX_MAX_FILTRE,
  TRAJET_PAR_DEFAUT,
  VILLE_PAR_DEFAUT,
  formaterMontant,
  heureDouala,
  heureDoualaDe,
  momentDe,
  rechercheDe,
  tonDuRang,
  type FiltreChoisi,
} from "./formats";
import { IconeBouclier, IconeVolant } from "./icones";
import styles from "./covoit.module.css";

type Message = "indisponible" | "echec";

/** Clé i18n du libellé de chaque filtre. */
const LIBELLE_FILTRE: Record<FiltreChoisi, string> = {
  clim: "filtres.clim",
  femmes: "filtres.femmes",
  grand_bagage: "filtres.grandBagage",
  prix_max: "filtres.prixMax",
};

/**
 * Planche « Covoit » (touche 2) : le passager d'un covoiturage entre villes. Une recherche (`useRechercheCovoit`)
 * donne les conducteurs de Douala à Kribi ; toucher l'un d'eux réserve sa place (`useReserverCovoit`) et ouvre le
 * paiement de la commande. « En ville » et « Je conduis » mènent aux autres planches du covoiturage.
 */
export function EcranCovoit() {
  const { t } = useTranslation("Covoit");
  const navigate = useNavigate();
  const horloge = useMaintenant();
  const { demo, scenario } = useParametres();
  const conductricesConnues = demo && scenario === "Covoit" ? CONDUCTRICES_DEMO : [];

  const [trajet, setTrajet] = useState<{ depart: string; arrivee: string }>(TRAJET_PAR_DEFAUT);
  const [filtres, setFiltres] = useState<readonly FiltreChoisi[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const enCours = useRef(false);

  const requete = voyageur.useRechercheCovoit(rechercheDe(trajet, filtres), {
    placeholderData: keepPreviousData,
  });
  const reserver = voyageur.useReserverCovoit();
  const recherche = requete.data;

  const ville = recherche?.ville ?? VILLE_PAR_DEFAUT;
  const heure = recherche ? heureDouala(recherche.maintenant) : heureDoualaDe(horloge);

  function basculer(filtre: FiltreChoisi) {
    setFiltres((actuels) =>
      actuels.includes(filtre) ? actuels.filter((f) => f !== filtre) : [...actuels, filtre],
    );
  }

  async function choisir(offre: c.OffreCovoit) {
    if (enCours.current) return;
    enCours.current = true;
    setMessage(null);
    try {
      const commande = await reserver.mutateAsync({ offreId: offre.id, places: 1 });
      void navigate(urlPlanche("Paiement", { commandeId: commande.id }));
    } catch (erreur) {
      const conflit = erreur instanceof ErreurHttp && erreur.statut === 409;
      setMessage(conflit ? "indisponible" : "echec");
      // L'offre a changé (plus de place, trajet fermé) : la liste se met à jour.
      if (conflit) void requete.refetch();
    } finally {
      enCours.current = false;
    }
  }

  let corps;
  if (recherche === undefined) {
    corps = requete.isError ? (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    ) : (
      <EtatChargement />
    );
  } else if (recherche.offres.length === 0) {
    corps = <EtatVide />;
  } else {
    corps = recherche.offres.map((offre, rang) => {
      const props = {
        offre,
        ton: tonDuRang(rang),
        feminin: conductricesConnues.includes(offre.conducteur.id),
        onChoisir: (choisie: c.OffreCovoit) => void choisir(choisie),
      };
      return rang === 0 ? (
        <CarteDetaillee key={offre.id} {...props} />
      ) : (
        <CarteCompacte key={offre.id} {...props} />
      );
    });
  }

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titreEcran}>{t("ecrans.Covoit.titre", { ns: "translation" })}</h1>
        <div className={styles.titreLigne}>
          <span className={styles.titre}>{t("titre")}</span>
          <span className={styles.ville}>
            <span className={styles.repere}>
              <IconeLieu taille={12} trait={2.4} />
            </span>
            {ville}
          </span>
        </div>
        <Selecteur
          ton="vert"
          taille="l"
          className={styles.mode}
          aria-label={t("mode.aria")}
          valeur="entre"
          mention={t("mode.glisse")}
          onChange={(valeur) => {
            if (valeur === "ville") void navigate(urlPlanche("CovoitVille"));
          }}
          options={[
            { valeur: "entre", libelle: t("mode.entreVilles") },
            { valeur: "ville", libelle: t("mode.enVille", { ville }) },
          ]}
        />
        <Selecteur
          ton="neutre"
          taille="l"
          className={styles.role}
          aria-label={t("role.aria")}
          valeur="passager"
          onChange={(valeur) => {
            if (valeur === "conducteur") void navigate(urlPlanche("CovoitConducteur"));
          }}
          options={[
            {
              valeur: "passager",
              libelle: t("role.passager"),
              icone: (
                <span className={styles.iconePassager}>
                  <IconePersonne taille={16} trait={2.2} />
                </span>
              ),
            },
            {
              valeur: "conducteur",
              libelle: t("role.conducteur"),
              icone: <IconeVolant taille={16} trait={2.2} />,
            },
          ]}
        />
      </header>

      <EcranCorps className={styles.corps} data-planche="Covoit" aria-busy={requete.isPending}>
        <div className={styles.trajet}>
          <span className={styles.route}>
            {trajet.depart} <span className={styles.fleche}>→</span> {trajet.arrivee}
          </span>
          <span className={styles.quand}>{t(`quand.${momentDe(heure)}`)}</span>
          <button
            type="button"
            className={styles.inverser}
            aria-label={t("trajet.inverser")}
            onClick={() =>
              setTrajet(({ depart, arrivee }) => ({ depart: arrivee, arrivee: depart }))
            }
          >
            <IconeInverser taille={16} trait={2.4} />
          </button>
        </div>

        <div className={styles.filtres} role="group" aria-label={t("filtres.aria")}>
          <Puce selectionnee={filtres.length === 0} onClick={() => setFiltres([])}>
            {t("filtres.tous")}
          </Puce>
          {FILTRES_PROPOSES.map((filtre) => (
            <Puce
              key={filtre}
              selectionnee={filtres.includes(filtre)}
              onClick={() => basculer(filtre)}
            >
              {t(LIBELLE_FILTRE[filtre], { prix: formaterMontant(PRIX_MAX_FILTRE) })}
            </Puce>
          ))}
        </div>

        {message && (
          <p role="alert" className={styles.alerte}>
            {t(`messages.${message}`)}
          </p>
        )}

        {corps}

        {recherche && recherche.offres.length > 0 && (
          <p className={styles.confiance}>
            <span className={styles.bouclier}>
              <IconeBouclier taille={18} trait={2.2} />
            </span>
            {recherche.note}
          </p>
        )}
      </EcranCorps>
    </>
  );
}
