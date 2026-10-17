import {
  BarreRemplissage,
  BoutonIcone,
  Bouton,
  CarteDonnees,
  EcranCorps,
  Histogramme,
  IconeRetour,
  LigneListe,
  ListeGlissable,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { colisEtRecette, millions, net, taux, variation } from "./formats";
import styles from "./analyses.module.css";
import { barresRecette, tonIncident, tonNet } from "./tons";
import {
  LIGNE_COLIS,
  PERIODES,
  type Analyses,
  type BusAnalyse,
  type EtatBloc,
  type Periode,
} from "./types";

export interface PropsAnalysesVue {
  periode: Periode;
  onPeriode: (periode: Periode) => void;
  /** Lecture des analyses de la période ; `pret` quand `analyses` est présent. */
  etat: EtatBloc;
  analyses?: Analyses | undefined;
  /** Nombre de bus de la flotte (la liste n'en montre que les plus marquants) ; à défaut, ceux de la liste. */
  nbBus?: number | undefined;
  onReessayer?: () => void;
}

/** Part de remplissage des colis, si l'API la donne (le contrat actuel n'a que le nombre et la recette). */
function remplissageColis(colis: Analyses["colis"]): number | undefined {
  const valeur = (colis as { remplissagePct?: unknown }).remplissagePct;
  return typeof valeur === "number" ? valeur : undefined;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Entete({
  periode,
  onPeriode,
  analyses,
  chargement,
}: Pick<PropsAnalysesVue, "periode" | "onPeriode"> & {
  analyses: Analyses | undefined;
  chargement: boolean;
}) {
  const { t } = useTranslation("Analyses");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre « Analyses ». */}
      <h1 className={styles.titreEcran}>{t("ecrans.Analyses.titre", { ns: "translation" })}</h1>
      <BoutonIcone
        aria-label={t("entete.retour")}
        icone={<IconeRetour taille={20} />}
        href={urlPlanche("Patron")}
      />
      <div className={styles.textes}>
        <span className={styles.titre}>{t("entete.titre")}</span>
        {analyses ? (
          <span className={styles.sousTitre}>
            {t("entete.sousTitre", {
              periode: analyses.libelle,
              gares: t("entete.gares", { count: analyses.nbGares }),
            })}
          </span>
        ) : chargement ? (
          <Squelette className={styles.squeletteSousTitre} />
        ) : null}
      </div>
      <label className={styles.periode}>
        <select
          className={styles.selecteur}
          aria-label={t("entete.periode")}
          value={periode}
          onChange={(e) => onPeriode(e.target.value as Periode)}
        >
          {PERIODES.map((p) => (
            <option key={p} value={p}>
              {t(`periodes.${p}`)}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}

function Recette({ periode, analyses }: { periode: Periode; analyses: Analyses | undefined }) {
  const { t } = useTranslation("Analyses");
  const recette = analyses?.recette;
  return (
    <CarteDonnees
      etiquette={t(`recette.titre.${periode}`)}
      className={styles.carteRecette}
      droite={
        recette ? (
          <span className={styles.valeurCarte}>
            {millions(recette.total)}{" "}
            <span
              className={styles.tendance}
              data-etat={recette.variationPct < 0 ? "rouge" : "vert"}
            >
              {variation(recette.variationPct)}
            </span>
          </span>
        ) : (
          <Squelette className={styles.squeletteTotal} />
        )
      }
    >
      {recette ? (
        <>
          <Histogramme
            format="jours"
            barres={barresRecette(recette.serie)}
            {...(recette.serie.length > 0
              ? { max: Math.max(...recette.serie.map((p) => p.recette)) }
              : {})}
          />
          <span className={styles.lecture}>{recette.lecture}</span>
        </>
      ) : (
        <>
          <Squelette className={styles.squeletteBarres} />
          <Squelette className={styles.squeletteLecture} />
        </>
      )}
    </CarteDonnees>
  );
}

function Message({ children }: { children: string }) {
  return (
    <li className={styles.message}>
      <p>{children}</p>
    </li>
  );
}

function Lignes({ etat, analyses }: { etat: EtatBloc; analyses: Analyses | undefined }) {
  const { t } = useTranslation("Analyses");
  // Sans colis sur la période, la ligne « Colis » n'a rien à dire : elle n'est pas affichée.
  const colis =
    analyses && (analyses.colis.nombre > 0 || analyses.colis.recette > 0)
      ? analyses.colis
      : undefined;
  const nombre = analyses ? analyses.lignes.length + (colis ? 1 : 0) : 0;
  const remplissage = colis ? remplissageColis(colis) : undefined;
  return (
    <ListeGlissable
      titre={t("lignes.titre")}
      {...(analyses ? { mention: t("lignes.mention", { count: nombre }) } : {})}
      hauteur={168}
      className={styles.liste}
    >
      {etat === "chargement" &&
        [1, 2, 3].map((i) => (
          <li key={i} className={styles.ligneSquelette} aria-hidden="true">
            <Squelette className={styles.squeletteLigne} />
          </li>
        ))}
      {analyses && nombre === 0 && <Message>{t("lignes.aucune")}</Message>}
      {analyses?.lignes.map((ligne) => (
        <LigneListe
          key={ligne.ligneId}
          colonnes="1fr 64px auto"
          href={urlPlanche("AnalysesLigne", { ligneId: ligne.ligneId })}
        >
          <span className={styles.nomLigne}>{ligne.nom}</span>
          <BarreRemplissage valeur={ligne.remplissagePct} libelle={ligne.nom} />
          <span className={styles.valeurLigne}>
            {taux(ligne.remplissagePct)} · {millions(ligne.recette)}
          </span>
        </LigneListe>
      ))}
      {colis && (
        <LigneListe
          colonnes="1fr 64px auto"
          href={urlPlanche("AnalysesLigne", { ligneId: LIGNE_COLIS })}
        >
          <span className={styles.nomLigne}>{t("lignes.colis")}</span>
          {remplissage !== undefined ? (
            <BarreRemplissage valeur={remplissage} libelle={t("lignes.colis")} />
          ) : (
            <span className={styles.railVide} aria-hidden="true" />
          )}
          <span className={styles.valeurLigne}>{colisEtRecette(colis)}</span>
        </LigneListe>
      )}
    </ListeGlissable>
  );
}

function LigneBus({ bus }: { bus: BusAnalyse }) {
  const { t } = useTranslation("Analyses");
  return (
    <LigneListe colonnes="1fr auto auto" href={urlPlanche("AnalysesBus", { busId: bus.busId })}>
      <span className={styles.bus}>
        <span>
          <strong>{bus.immatriculation}</strong> · {bus.chauffeur}
        </span>
        <span className={styles.petit}>{t("bus.trajets", { count: bus.trajets })}</span>
      </span>
      <span className={styles.net} data-etat={tonNet(bus)}>
        {net(bus.net)}
      </span>
      <span className={styles.incident} data-etat={tonIncident(bus.incident)}>
        {bus.incident}
      </span>
    </LigneListe>
  );
}

function ListeBus({
  etat,
  analyses,
  nbBus,
}: {
  etat: EtatBloc;
  analyses: Analyses | undefined;
  nbBus: number | undefined;
}) {
  const { t } = useTranslation("Analyses");
  return (
    <ListeGlissable
      titre={t("bus.titre")}
      {...(analyses ? { mention: t("bus.mention", { count: nbBus ?? analyses.bus.length }) } : {})}
      hauteur={168}
      className={styles.liste}
    >
      {etat === "chargement" &&
        [1, 2, 3].map((i) => (
          <li key={i} className={styles.ligneSquelette} aria-hidden="true">
            <Squelette className={styles.squeletteLigne} />
          </li>
        ))}
      {analyses && analyses.bus.length === 0 && <Message>{t("bus.aucun")}</Message>}
      {analyses?.bus.map((bus) => (
        <LigneBus key={bus.busId} bus={bus} />
      ))}
    </ListeGlissable>
  );
}

/** Aucune activité sur la période : ni recette, ni ligne, ni bus. */
function estVide(analyses: Analyses): boolean {
  return (
    analyses.recette.total === 0 &&
    analyses.lignes.length === 0 &&
    analyses.bus.length === 0 &&
    analyses.colis.nombre === 0
  );
}

/**
 * Analyses du patron : la période choisie, la recette par jour en barres avec son commentaire, la liste glissable
 * des lignes (remplissage, recette) et celle des bus (net, incident). Deux sorties au pied : l'export Excel
 * (Comptable) et l'assistant.
 *
 * Changer la période relit tout : pendant la lecture, les trois blocs gardent leur gabarit et montrent des
 * squelettes ; si elle échoue, un message avec « Réessayer » prend la place des blocs, l'en-tête et le pied restent.
 */
export function AnalysesVue({
  periode,
  onPeriode,
  etat,
  analyses,
  nbBus,
  onReessayer,
}: PropsAnalysesVue) {
  const { t } = useTranslation("Analyses");
  const donnees = etat === "pret" ? analyses : undefined;
  const vide = etat === "vide" || (donnees !== undefined && estVide(donnees));
  const montrerBlocs = etat === "chargement" || (donnees !== undefined && !vide);

  return (
    <>
      <Entete
        periode={periode}
        onPeriode={onPeriode}
        analyses={donnees}
        chargement={etat === "chargement"}
      />

      <EcranCorps
        className={styles.corps}
        data-planche="Analyses"
        data-etat={vide ? "vide" : etat}
        aria-busy={etat === "chargement"}
      >
        {(etat === "erreur" || vide) && (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} />
              <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}

        {montrerBlocs && (
          <>
            <Recette periode={periode} analyses={donnees} />
            <Lignes etat={etat} analyses={donnees} />
            <ListeBus etat={etat} analyses={donnees} nbBus={nbBus} />
          </>
        )}
      </EcranCorps>

      <div className={styles.pied}>
        <a className={styles.exporter} href={urlPlanche("Comptable")}>
          {t("pied.exporter")}
        </a>
        <a className={styles.assistant} href={urlPlanche("Assistant")}>
          {t("pied.assistant")}
        </a>
      </div>
    </>
  );
}
