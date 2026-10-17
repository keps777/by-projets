import {
  BandeauAssistant,
  Bouton,
  BoutonIcone,
  CarteDonnees,
  EcranCorps,
  EcranPied,
  Histogramme,
  IconeFleche,
  IconeRetour,
  LigneListe,
  ListeGlissable,
  Pastille,
  TuileKpi,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { millions, millionsSansUnite, net, netTrajet, taux, variation } from "./formats";
import styles from "./analyses-bus.module.css";
import { barresNet, nombrePannes, separerAvis, tonNetBus, tonNetTrajet, tonTendance } from "./tons";
import { detailTrajet, quandTrajet } from "./trajets";
import type { AnalyseBus, EtatBus } from "./types";

export interface PropsBusVue {
  etat: EtatBus;
  /** L'analyse du bus, présente quand `etat` vaut `pret` ou `vide`. */
  bus?: AnalyseBus | undefined;
  onReessayer?: () => void;
}

/** Semaines de la planche : sert de gabarit pendant le chargement. */
const SEMAINES_PLANCHE = 8;

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- en-tête */

function Entete({ etat, bus }: { etat: EtatBus; bus: AnalyseBus | undefined }) {
  const { t } = useTranslation("AnalysesBus");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre le bus,
          qui n'est connu qu'une fois la lecture arrivée. */}
      <h1 className={styles.titreEcran}>{t("ecrans.AnalysesBus.titre", { ns: "translation" })}</h1>
      <BoutonIcone
        aria-label={t("entete.retour")}
        icone={<IconeRetour taille={20} />}
        href={urlPlanche("Analyses")}
      />
      <div className={styles.textes}>
        {bus ? (
          <>
            <span className={styles.titre}>
              {bus.bus.immatriculation} · {bus.chauffeur.nom}
            </span>
            <span className={styles.sousTitre}>
              {[
                t("entete.places", { modele: bus.bus.modele, capacite: bus.bus.capacite }),
                bus.bus.annee > 0 ? String(bus.bus.annee) : null,
                t("entete.trajets", { count: bus.trajetsSemaine }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        ) : etat === "chargement" ? (
          <>
            <Squelette className={styles.squeletteTitre} />
            <Squelette className={styles.squeletteSousTitre} />
          </>
        ) : null}
      </div>
      {bus?.statut === "a_surveiller" && (
        <Pastille statut="aSurveiller" libelle={t("entete.aSurveiller")} />
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- recette, dépenses, net */

function Chiffres({ bus }: { bus: AnalyseBus | undefined }) {
  const { t } = useTranslation("AnalysesBus");
  const attente = <Squelette className={styles.squeletteChiffre} />;
  return (
    <div className={styles.chiffres}>
      <TuileKpi
        etiquette={t("chiffres.recette")}
        valeur={bus ? millions(bus.recette.total) : attente}
        {...(bus
          ? {
              sousLigne: t("chiffres.recetteDetail", {
                trajets: t("chiffres.trajets", { count: bus.recette.trajets }),
                taux: taux(bus.recette.remplissagePct),
              }),
            }
          : {})}
      />
      <TuileKpi
        etiquette={t("chiffres.depenses")}
        valeur={bus ? millions(bus.depenses.total) : attente}
        etat="rouge"
        {...(bus
          ? {
              sousLigne: t("chiffres.depensesDetail", {
                carburant: millionsSansUnite(bus.depenses.carburant),
                pannes: millionsSansUnite(bus.depenses.pannes),
              }),
            }
          : {})}
      />
      <TuileKpi
        etiquette={t("chiffres.net")}
        valeur={bus ? net(bus.net) : attente}
        etat={bus ? tonNetBus(bus) : "neutre"}
        {...(bus ? { sousLigne: t("chiffres.netDetail", { net: net(bus.netMoyenFlotte) }) } : {})}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- net par semaine */

function NetParSemaine({ bus }: { bus: AnalyseBus | undefined }) {
  const { t } = useTranslation("AnalysesBus");
  const semaines = bus?.netParSemaine;
  const nombre = semaines?.serie.length ?? SEMAINES_PLANCHE;
  const tendance = semaines
    ? semaines.depuis
      ? t("semaines.tendance", {
          variation: variation(semaines.variationPct),
          depuis: semaines.depuis,
        })
      : variation(semaines.variationPct)
    : null;
  return (
    <CarteDonnees
      etiquette={t("semaines.titre", { count: nombre })}
      className={styles.carteSemaines}
      droite={
        semaines ? (
          <span className={styles.tendance} data-ton={tonTendance(semaines.variationPct)}>
            {tendance}
          </span>
        ) : (
          <Squelette className={styles.squeletteTendance} />
        )
      }
    >
      {semaines ? (
        semaines.serie.length > 0 && (
          <Histogramme format="semaines" barres={barresNet(semaines.serie)} />
        )
      ) : (
        <Squelette className={styles.squeletteBarres} />
      )}
    </CarteDonnees>
  );
}

/* ---------------------------------------------------------------- trajet par trajet */

function Trajets({ bus }: { bus: AnalyseBus | undefined }) {
  const { t } = useTranslation("AnalysesBus");
  const trajets = bus?.trajets;
  return (
    <ListeGlissable
      titre={t("trajets.titre")}
      {...(trajets
        ? {
            mention: t("trajets.mentionPannes", {
              trajets: trajets.length,
              count: nombrePannes(trajets),
            }),
          }
        : {})}
      hauteur="auto"
      className={styles.trajets}
    >
      {!trajets &&
        [1, 2, 3].map((i) => (
          <li key={i} className={styles.ligneAttente} aria-hidden="true">
            <Squelette className={styles.squeletteLigne} />
          </li>
        ))}
      {trajets && trajets.length === 0 && (
        <li className={styles.message}>
          <p>{t("trajets.aucun")}</p>
        </li>
      )}
      {trajets?.map((trajet) => {
        const detail = detailTrajet(t, trajet);
        return (
          <LigneListe
            key={`${trajet.jour}-${trajet.heure}-${trajet.origine}-${trajet.destination}`}
            densite="serree"
            colonnes="1fr auto"
          >
            <span className={styles.trajet}>
              <span className={styles.quand}>{quandTrajet(t, trajet)}</span>
              <span className={styles.detail} data-incident={detail.incident ? "oui" : undefined}>
                {detail.texte}
              </span>
            </span>
            <span className={styles.netTrajet} data-ton={tonNetTrajet(trajet)}>
              {netTrajet(trajet.net)}
            </span>
          </LigneListe>
        );
      })}
    </ListeGlissable>
  );
}

/* ---------------------------------------------------------------- avis de l'assistant */

function Avis({ avis }: { avis: string }) {
  const { t } = useTranslation("AnalysesBus");
  const { debut, recommandation } = separerAvis(avis);
  return (
    <BandeauAssistant forme="bloc" etiquette={t("assistant.titre")} className={styles.assistant}>
      <span>
        {debut}
        {recommandation && <strong>{recommandation}</strong>}
      </span>
    </BandeauAssistant>
  );
}

/* ---------------------------------------------------------------- pied */

function Pied({ bus }: { bus: AnalyseBus | undefined }) {
  const { t } = useTranslation("AnalysesBus");
  return (
    <EcranPied className={styles.pied}>
      <a className={styles.flotte} href={urlPlanche("Analyses")}>
        {t("pied.flotte")}
      </a>
      <a className={styles.demander} href={urlPlanche("Assistant")}>
        <span className={styles.demanderTextes}>
          <span className={styles.demanderTitre}>{t("pied.assistant")}</span>
          {bus?.statut === "a_surveiller" && (
            <span className={styles.demanderDetail}>{t("pied.assistantDetail")}</span>
          )}
        </span>
        <IconeFleche taille={22} />
      </a>
    </EcranPied>
  );
}

/**
 * L'analyse d'un bus pour le patron : l'en-tête (immatriculation, chauffeur, modèle, pastille « À SURVEILLER »), la
 * recette, les dépenses et le net de la semaine, le net des huit dernières semaines, chaque trajet avec son incident,
 * l'avis de l'assistant, puis « Toute la flotte » (retour aux analyses) et « Demander à l'assistant ».
 *
 * Lecture seule. Pendant la lecture, les blocs gardent leur gabarit et montrent des squelettes ; si le bus est
 * inconnu, introuvable, ou si la lecture échoue, un message prend la place des blocs (l'en-tête et le pied restent).
 */
export function BusVue({ etat, bus, onReessayer }: PropsBusVue) {
  const { t } = useTranslation("AnalysesBus");
  const donnees = etat === "pret" || etat === "vide" ? bus : undefined;
  const sansDonnees = etat === "erreur" || etat === "introuvable";
  return (
    <>
      <Entete etat={etat} bus={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="AnalysesBus"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {sansDonnees || etat === "vide" ? (
          <div className={styles.etat}>
            <div className={styles.bandeau}>
              <span className={styles.point} />
              <p role={etat === "erreur" ? "alert" : "status"}>
                {t(
                  etat === "erreur"
                    ? "etats.erreur"
                    : etat === "introuvable"
                      ? "etats.introuvable"
                      : "etats.vide",
                )}
              </p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        ) : (
          <>
            <Chiffres bus={donnees} />
            <NetParSemaine bus={donnees} />
            <Trajets bus={donnees} />
            {donnees && donnees.avisAssistant.trim() !== "" && (
              <Avis avis={donnees.avisAssistant} />
            )}
          </>
        )}
      </EcranCorps>

      <Pied bus={donnees} />
    </>
  );
}
