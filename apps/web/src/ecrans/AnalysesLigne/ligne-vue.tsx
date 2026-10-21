import { Bouton, BoutonIcone, EcranCorps, IconeRetour, couleurRemplissage } from "@afrimove/ui";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { groupes, millions, taux, variation } from "@/ecrans/Analyses/formats";
import styles from "./analyses-ligne.module.css";
import { barresJours, tonRemplissage, tonVariation } from "./tons";
import {
  PERIODES,
  type AnalyseLigne,
  type DepartAnalyse,
  type EtatLigne,
  type Periode,
} from "./types";

export interface PropsAnalyseLigneVue {
  /** Identifiant de la ligne dans l'adresse : les liens du pied et des départs en dépendent, même pendant la lecture. */
  ligneId: string;
  periode: Periode;
  onPeriode: (periode: Periode) => void;
  etat: EtatLigne;
  /** L'analyse de la ligne, présente quand `etat` vaut `pret`. */
  analyse?: AnalyseLigne | undefined;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- en-tête */

function Entete({
  periode,
  onPeriode,
  analyse,
  chargement,
}: Pick<PropsAnalyseLigneVue, "periode" | "onPeriode"> & {
  analyse: AnalyseLigne | undefined;
  chargement: boolean;
}) {
  const { t } = useTranslation("AnalysesLigne");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre le nom
          de la ligne, qui n'est connu qu'une fois la lecture arrivée. */}
      <h1 className={styles.titreEcran}>
        {t("ecrans.AnalysesLigne.titre", { ns: "translation" })}
      </h1>
      <BoutonIcone
        aria-label={t("entete.retour")}
        icone={<IconeRetour taille={20} />}
        href={urlPlanche("Analyses")}
      />
      <div className={styles.textes}>
        {analyse ? (
          <>
            <span className={styles.titre}>{analyse.ligne.nom}</span>
            <span className={styles.sousTitre}>
              {t("entete.sousTitre", { libelle: analyse.libelle, count: analyse.departsParJour })}
            </span>
          </>
        ) : chargement ? (
          <>
            <Squelette className={styles.squeletteTitre} />
            <Squelette className={styles.squeletteSousTitre} />
          </>
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

/* ---------------------------------------------------------------- les quatre tuiles */

type TonTuile = "neutre" | "vert" | "ambre" | "rouge";

function Tuile({
  etiquette,
  valeur,
  detail,
  tonValeur = "neutre",
  tonDetail = "neutre",
}: {
  etiquette: string;
  valeur: string;
  detail: string;
  tonValeur?: TonTuile;
  tonDetail?: TonTuile;
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.etiquette}>{etiquette}</span>
      <span className={styles.valeur} data-ton={tonValeur}>
        {valeur}
      </span>
      <span className={styles.detail} data-ton={tonDetail}>
        {detail}
      </span>
    </div>
  );
}

function TuileAttente({ etiquette }: { etiquette: string }) {
  return (
    <div className={styles.tuile}>
      <span className={styles.etiquette}>{etiquette}</span>
      <Squelette className={styles.squeletteValeur} />
      <Squelette className={styles.squeletteDetail} />
    </div>
  );
}

function Chiffres({ analyse }: { analyse: AnalyseLigne | undefined }) {
  const { t } = useTranslation("AnalysesLigne");
  if (!analyse) {
    return (
      <div className={styles.chiffres}>
        {(["recette", "billets", "remplissage", "colis"] as const).map((cle) => (
          <TuileAttente key={cle} etiquette={t(`chiffres.${cle}`)} />
        ))}
      </div>
    );
  }
  const ton = tonRemplissage(analyse.remplissage);
  return (
    <div className={styles.chiffres}>
      <Tuile
        etiquette={t("chiffres.recette")}
        valeur={millions(analyse.recette.total)}
        detail={variation(analyse.recette.variationPct)}
        tonDetail={tonVariation(analyse.recette.variationPct)}
      />
      <Tuile
        etiquette={t("chiffres.billets")}
        valeur={groupes(analyse.billets.nombre)}
        detail={t("chiffres.billetsDeparts", { count: analyse.billets.departs })}
      />
      <Tuile
        etiquette={t("chiffres.remplissage")}
        valeur={taux(analyse.remplissage.pct)}
        tonValeur={ton}
        detail={t("chiffres.cible", { pct: analyse.remplissage.cible })}
      />
      <Tuile
        etiquette={t("chiffres.colis")}
        valeur={groupes(analyse.colis.nombre)}
        detail={variation(analyse.colis.variationPct)}
        tonDetail={tonVariation(analyse.colis.variationPct)}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- par départ */

/** « classique · 3 500 · LT 118 AB » : la classe, le prix, le bus et la note (soute colis, clim…) du départ. */
function detailDepart(depart: DepartAnalyse, t: TFunction<"AnalysesLigne">): string {
  return [t(`departs.classe.${depart.classe}`), groupes(depart.prix), depart.bus, depart.note]
    .filter((morceau): morceau is string => Boolean(morceau))
    .join(" · ");
}

function Depart({
  depart,
  ligneId,
  premier,
}: {
  depart: DepartAnalyse;
  ligneId: string;
  premier: boolean;
}) {
  const { t } = useTranslation("AnalysesLigne");
  const ton = couleurRemplissage(depart.remplissagePct);
  const concurrent = depart.concurrent;
  return (
    <a
      className={styles.depart}
      data-ton={ton}
      data-premier={premier ? "oui" : undefined}
      // Le réglage de la ligne s'ouvre sur ce départ.
      href={`${urlPlanche("ConfigLigne", { ligneId })}?depart=${encodeURIComponent(depart.departId)}`}
    >
      <span className={styles.heure}>{depart.heure}</span>
      <span className={styles.infos}>
        {detailDepart(depart, t)}
        {concurrent && (
          <>
            {" · "}
            <span className={styles.concurrent}>
              {t("departs.concurrent", {
                compagnie: concurrent.compagnie,
                heure: concurrent.heure,
                prix: groupes(concurrent.prix),
              })}
            </span>
          </>
        )}
      </span>
      <span className={styles.rail} aria-hidden="true">
        <span
          className={styles.trait}
          data-ton={ton}
          style={{ width: `${Math.max(0, Math.min(100, depart.remplissagePct))}%` }}
        />
      </span>
      <span className={styles.pourcent}>{taux(depart.remplissagePct)}</span>
    </a>
  );
}

function Departs({
  etat,
  analyse,
  ligneId,
}: {
  etat: EtatLigne;
  analyse: AnalyseLigne | undefined;
  ligneId: string;
}) {
  const { t } = useTranslation("AnalysesLigne");
  return (
    <section className={styles.departs} aria-labelledby="departs-titre">
      <div className={styles.enteteDeparts}>
        <span id="departs-titre">{t("departs.titre")}</span>
        <span className={styles.aide}>{t("departs.aide")}</span>
      </div>
      {etat === "chargement" &&
        [1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.departAttente} aria-hidden="true">
            <Squelette className={styles.squeletteDepart} />
          </div>
        ))}
      {analyse && analyse.departs.length === 0 && (
        <p className={styles.message}>{t("departs.aucun")}</p>
      )}
      {analyse?.departs.map((depart, i) => (
        <Depart key={depart.departId} depart={depart} ligneId={ligneId} premier={i === 0} />
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------- par jour de la semaine */

function ParJour({ analyse }: { analyse: AnalyseLigne | undefined }) {
  const { t } = useTranslation("AnalysesLigne");
  const barres = analyse ? barresJours(analyse.parJour.serie, analyse.parJour.lecture) : [];
  return (
    <section className={styles.parJour} aria-labelledby="par-jour-titre">
      <span id="par-jour-titre" className={styles.titreParJour}>
        {t("parJour.titre")}
      </span>
      {analyse ? (
        <>
          <div className={styles.jours}>
            {barres.map((barre, i) => (
              <span key={i} className={styles.jour}>
                <span
                  className={styles.barre}
                  data-ton={barre.ton}
                  style={{ height: `${barre.hauteurPct}%` }}
                  aria-hidden="true"
                />
                <span className={styles.initiale} data-ton={barre.ton}>
                  {barre.libelle}
                </span>
              </span>
            ))}
          </div>
          <span className={styles.lecture}>{analyse.parJour.lecture}</span>
        </>
      ) : (
        <>
          <Squelette className={styles.squeletteJours} />
          <Squelette className={styles.squeletteLecture} />
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- vendus en ligne, en route */

function signe(valeur: number): string {
  return valeur < 0 ? "−" : "+";
}

function Canaux({ analyse }: { analyse: AnalyseLigne | undefined }) {
  const { t } = useTranslation("AnalysesLigne");
  if (!analyse) {
    return (
      <div className={styles.canaux}>
        <Squelette className={styles.squeletteCanal} />
        <Squelette className={styles.squeletteCanal} />
      </div>
    );
  }
  const { enLigne, enRoute } = analyse.canaux;
  const pts =
    enLigne.variationPts === 0
      ? t("canaux.ptsStable")
      : t("canaux.pts", {
          signe: signe(enLigne.variationPts),
          count: Math.abs(enLigne.variationPts),
        });
  return (
    <div className={styles.canaux}>
      <div className={styles.canal}>
        <span className={styles.canalTitre}>{t("canaux.enLigne")}</span>
        <span>
          <strong>{taux(enLigne.partPct)}</strong> ·{" "}
          {t("canaux.enLigneDetail", { count: enLigne.billets, pts })}
        </span>
      </div>
      <div className={styles.canal}>
        <span className={styles.canalTitre}>
          {enRoute.arrets.length > 0
            ? t("canaux.enRouteArrets", { arrets: enRoute.arrets.join(", ") })
            : t("canaux.enRoute")}
        </span>
        <span>
          <strong>{t("canaux.enRouteBillets", { count: enRoute.billets })}</strong> ·{" "}
          {t(enRoute.tousEnregistres ? "canaux.enregistres" : "canaux.aEnregistrer")}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- l'écran */

/**
 * Analyse d'une ligne : quatre tuiles (recette, billets, remplissage face à la cible, colis), le remplissage de chaque
 * départ (un toucher ouvre le réglage de la ligne sur ce départ), la recette par jour de la semaine, les ventes en
 * ligne et en route. Au pied : « Pourquoi ça baisse ? » (assistant) et « Modifier la ligne ».
 *
 * Changer la période relit tout : pendant la lecture, les blocs gardent leur gabarit et montrent des squelettes ; si
 * elle échoue, un message avec « Réessayer » (ou « ligne introuvable », sans réessai) prend la place des blocs.
 */
export function AnalyseLigneVue({
  ligneId,
  periode,
  onPeriode,
  etat,
  analyse,
  onReessayer,
}: PropsAnalyseLigneVue) {
  const { t } = useTranslation("AnalysesLigne");
  const donnees = etat === "pret" ? analyse : undefined;
  const sansBlocs = etat === "erreur" || etat === "introuvable";

  return (
    <>
      <Entete
        periode={periode}
        onPeriode={onPeriode}
        analyse={donnees}
        chargement={etat === "chargement"}
      />

      <EcranCorps
        className={styles.corps}
        data-planche="AnalysesLigne"
        data-etat={etat}
        aria-busy={etat === "chargement"}
      >
        {sansBlocs ? (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} aria-hidden="true" />
              <p>{t(etat === "erreur" ? "etats.erreur" : "etats.introuvable")}</p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        ) : (
          <>
            <Chiffres analyse={donnees} />
            <Departs etat={etat} analyse={donnees} ligneId={ligneId} />
            <ParJour analyse={donnees} />
            <Canaux analyse={donnees} />
          </>
        )}
      </EcranCorps>

      {etat !== "introuvable" && (
        <div className={styles.pied}>
          <a className={styles.pourquoi} href={urlPlanche("AssistantReponse")}>
            {t("pied.pourquoi")}
          </a>
          <a className={styles.modifier} href={urlPlanche("ConfigLigne", { ligneId })}>
            {t("pied.modifier")}
          </a>
        </div>
      )}
    </>
  );
}
