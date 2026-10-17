import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps, FriseArrets, Pastille } from "@afrimove/ui";
import type { Arret } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CarteLigne } from "./CarteLigne";
import { CartePrevenir } from "./CartePrevenir";
import { FeuilleChauffeur, FeuilleSignaler } from "./feuilles";
import { HautDeCarte, TitreEcran } from "./haut";
import { IconeAlerte, IconeColisOuvert, IconeTelephone } from "./icones";
import { heureDouala, villeAvantBus } from "./suivi";
import styles from "./direct.module.css";

/** Arrêts du trajet pour la frise du kit : le prochain arrêt est « en cours » (il pulse), les suivants « à venir ». */
function arretsDeLaFrise(
  etapes: readonly c.EtapeTrajet[],
  prochainLibelle: string,
  hrefMontee: string,
): Arret[] {
  return etapes.map((etape, rang) => {
    const montees = etape.placesQuiMontent;
    const monte = montees !== undefined && etape.statut !== "passe";
    return {
      id: `${rang}-${etape.arret}`,
      nom: etape.arret,
      heure: heureDouala(etape.heure),
      etat:
        etape.statut === "passe" ? "passe" : etape.statut === "prochain" ? "en-cours" : "prochain",
      ...(etape.precision !== undefined
        ? { detail: etape.precision }
        : etape.statut === "prochain"
          ? { detail: prochainLibelle }
          : {}),
      ...(monte ? { montees, href: hrefMontee } : {}),
    };
  });
}

type Feuille = "signaler" | "chauffeur" | null;

/** « Mon bus en direct » : la carte, l'arrivée estimée, prévenir un proche, les arrêts et les trois actions. */
export function DirectVue({ billetId, suivi }: { billetId: string; suivi: c.SuiviBus }) {
  const { t } = useTranslation("Direct");
  const [feuille, setFeuille] = useState<Feuille>(null);
  const colis = voyageur.useColisDuBillet({ billetId }, { enabled: billetId !== "" });
  const hrefColis =
    colis.data?.colisId != null
      ? urlPlanche("ColisCode", { colisId: colis.data.colisId })
      : urlPlanche("ColisEnvoi");

  const { arrivee } = suivi;
  const villes = suivi.villes;
  const retard =
    arrivee.retardMinutes > 0
      ? t("arrivee.retard", { minutes: arrivee.retardMinutes })
      : t("arrivee.aLHeure");
  const compagnie =
    suivi.siege === null
      ? suivi.compagnie.nom
      : t("bus.compagnieSiege", { compagnie: suivi.compagnie.nom, siege: suivi.siege });

  return (
    <div className={styles.racine}>
      <TitreEcran />
      <HautDeCarte billetId={billetId}>
        <CarteLigne
          villes={villes}
          statuts={suivi.etapes.map((etape) => etape.statut)}
          vitesse={t("carte.vitesse", { vitesse: suivi.vitesseKmh })}
          libelle={t("carte.libelle", {
            depart: villes[0] ?? "",
            arrivee: villes[villes.length - 1] ?? "",
            apres: villeAvantBus(suivi),
          })}
        />
        <Pastille
          className={styles.direct}
          statut={suivi.enDirect ? "direct" : "horsLigne"}
          libelle={t(suivi.enDirect ? "statut.direct" : "statut.sansSignal")}
        />
        <div className={styles.arrivee}>
          <span className={styles.arriveeGauche}>
            <span className={styles.arriveeEtiquette}>{t("arrivee.etiquette")}</span>
            <span className={styles.arriveeHeure}>{heureDouala(arrivee.estimee)}</span>
            <span className={styles.arriveeDetail}>
              {t("arrivee.detail", { prevue: heureDouala(arrivee.prevue), retard })}
            </span>
          </span>
          <span className={styles.arriveeDroite}>
            <span>{compagnie}</span>
            <span className={styles.immatriculation}>{suivi.bus.immatriculation}</span>
          </span>
        </div>
      </HautDeCarte>

      <EcranCorps className={styles.corps} data-planche="Direct">
        <CartePrevenir billetId={billetId} prevenir={suivi.prevenir} />

        {suivi.etapes.length > 0 && (
          <FriseArrets
            libelle={t("frise.libelle")}
            arrets={arretsDeLaFrise(suivi.etapes, t("frise.prochain"), urlPlanche("Arret"))}
          />
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => setFeuille("chauffeur")}>
            <IconeTelephone />
            {t("actions.chauffeur")}
          </button>
          <button type="button" className={styles.action} onClick={() => setFeuille("signaler")}>
            <IconeAlerte />
            {t("actions.signaler")}
          </button>
          <a className={styles.action} href={hrefColis}>
            <IconeColisOuvert />
            {t("actions.colis")}
          </a>
        </div>
      </EcranCorps>

      {feuille === "signaler" && (
        <FeuilleSignaler billetId={billetId} onFermer={() => setFeuille(null)} />
      )}
      {feuille === "chauffeur" && (
        <FeuilleChauffeur billetId={billetId} onFermer={() => setFeuille(null)} />
      )}
    </div>
  );
}
