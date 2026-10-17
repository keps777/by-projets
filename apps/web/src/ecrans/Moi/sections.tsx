import type { voyageur as c } from "@afrimove/contrats";
import { BoutonIcone } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  estFeminin,
  formaterMontant,
  jourEtHeure,
  moisAnnee,
  telephoneLisible,
  telephoneMasque,
} from "./formats";
import { ChevronCarte, IconeBoutique, IconeMotoLivreur, IconeRoue } from "./icones";
import styles from "./moi.module.css";

type Requete<T> = {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
};

/** Une requête de la planche : ce qu'en lisent les sections (état, donnée, relance). */
export type RequeteProfil = Requete<c.Profil>;
export type RequeteFidelite = Requete<c.Fidelite>;
export type RequeteParrainage = Requete<c.Parrainage>;
export type RequeteProches = Requete<c.Proche[]>;
export type RequeteHistorique = Requete<c.ElementHistorique[]>;

/** Titre de l'écran pour les lecteurs d'écran : la planche n'en montre pas. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.Moi.titre")}</h1>;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Relance({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("Moi");
  return (
    <button type="button" className={styles.relance} onClick={onClick}>
      {t("etats.reessayer")}
    </button>
  );
}

/* ------------------------------------------------------------------ en-tête : profil et réglages */

export function EnteteMoi({
  profil,
  onReglages,
}: {
  profil: RequeteProfil;
  onReglages: (() => void) | undefined;
}) {
  const { t, i18n } = useTranslation("Moi");
  const donnees = profil.data;

  let corps;
  if (donnees) {
    const details = [
      telephoneLisible(donnees.telephone),
      donnees.pieceVerifiee ? t("profil.cni") : null,
      t("profil.depuis", { date: moisAnnee(donnees.inscritDepuis, i18n.language) }),
    ].filter((d): d is string => d !== null);
    corps = (
      <>
        <span className={styles.avatar}>{donnees.initiales}</span>
        <span className={styles.identite}>
          <span className={styles.nom}>{`${donnees.prenom} ${donnees.nom}`.trim()}</span>
          <span className={styles.detailProfil}>{details.join(" · ")}</span>
        </span>
      </>
    );
  } else if (profil.isError) {
    corps = (
      <>
        <span className={styles.avatarSquelette} aria-hidden="true" />
        <span className={styles.identite} role="alert">
          <span className={styles.nom}>{t("profil.indisponible")}</span>
          <Relance onClick={() => void profil.refetch()} />
        </span>
      </>
    );
  } else {
    corps = (
      <>
        <span className={`${styles.avatarSquelette} am-pulse`} aria-hidden="true" />
        <span
          className={styles.identite}
          role="status"
          aria-busy="true"
          aria-label={t("etats.chargement")}
        >
          <Squelette className={styles.squeletteNom} />
          <Squelette className={styles.squeletteDetail} />
        </span>
      </>
    );
  }

  return (
    <header className={styles.entete}>
      {corps}
      <BoutonIcone
        className={styles.reglages}
        aria-label={t("reglages")}
        icone={<IconeRoue taille={20} trait={2} />}
        {...(onReglages ? { onClick: onReglages } : {})}
      />
    </header>
  );
}

/* ------------------------------------------------------------------ fidélité et parrainage */

function TuileFidelite({ requete }: { requete: RequeteFidelite }) {
  const { t } = useTranslation("Moi");
  const f = requete.data;
  if (!f) {
    return <TuileEtat requete={requete} libelle={t("fidelite.libelle")} />;
  }
  return (
    <div className={`${styles.tuile} ${styles.tuileFidelite}`}>
      <span className={styles.etiquetteTuile}>{t("fidelite.libelle")}</span>
      <span className={styles.valeur}>
        {formaterMontant(f.points)} <span className={styles.unite}>{t("fidelite.points")}</span>
      </span>
      <span className={styles.precisionFidelite}>
        {t("fidelite.equivalence", { montant: formaterMontant(f.valeurFcfa) })}
      </span>
    </div>
  );
}

function TuileParrainage({ requete }: { requete: RequeteParrainage }) {
  const { t } = useTranslation("Moi");
  const p = requete.data;
  if (!p) {
    return <TuileEtat requete={requete} libelle={null} etiquette={styles.etiquetteParrainage} />;
  }
  return (
    <div className={`${styles.tuile} ${styles.tuileParrainage}`}>
      <span className={`${styles.etiquetteTuile} ${styles.etiquetteParrainage}`}>
        {t("parrainage.libelle", { code: p.code })}
      </span>
      <span className={styles.valeur}>
        {formaterMontant(p.amis)}{" "}
        <span className={`${styles.unite} ${styles.uniteParrainage}`}>
          {t("parrainage.ami", { count: p.amis })}
        </span>
      </span>
      <span className={styles.precisionParrainage}>
        {t("parrainage.detail", {
          parrain: formaterMontant(p.bonusParrain),
          filleul: formaterMontant(p.bonusFilleul),
        })}
      </span>
    </div>
  );
}

/** Tuile qui n'a pas (encore) sa donnée : squelette de la même hauteur, ou message et « Réessayer ». */
function TuileEtat({
  requete,
  libelle,
  etiquette,
}: {
  requete: Requete<unknown>;
  libelle: string | null;
  etiquette?: string | undefined;
}) {
  const { t } = useTranslation("Moi");
  if (requete.isError) {
    return (
      <div className={`${styles.tuile} ${styles.tuileSquelette}`} role="alert">
        {libelle !== null && (
          <span className={`${styles.etiquetteTuile} ${etiquette ?? ""}`}>{libelle}</span>
        )}
        <span className={styles.tuileIndisponible}>{t("etats.indisponible")}</span>
        <Relance onClick={() => void requete.refetch()} />
      </div>
    );
  }
  return (
    <div
      className={`${styles.tuile} ${styles.tuileSquelette}`}
      role="status"
      aria-busy="true"
      aria-label={t("etats.chargement")}
    >
      <Squelette className={`${styles.squeletteEtiquette}`} />
      <Squelette className={`${styles.squeletteValeur}`} />
      <Squelette className={`${styles.squelettePrecision}`} />
    </div>
  );
}

/** Les deux tuiles du haut ; un module « fidélité » masqué retire les deux (fidélité et parrainage). */
export function Tuiles({
  fidelite,
  parrainage,
}: {
  fidelite: RequeteFidelite;
  parrainage: RequeteParrainage;
}) {
  return (
    <div className={styles.tuiles}>
      <TuileFidelite requete={fidelite} />
      <TuileParrainage requete={parrainage} />
    </div>
  );
}

/* ------------------------------------------------------------------ listes : états communs */

function EtatsListe({ requete, vide }: { requete: Requete<unknown[]>; vide: string }) {
  const { t } = useTranslation("Moi");
  if (requete.isError) {
    return (
      <div className={styles.etatListe} role="alert">
        <p>{t("etats.indisponible")}</p>
        <Relance onClick={() => void requete.refetch()} />
      </div>
    );
  }
  if (requete.isPending) {
    return (
      <div role="status" aria-busy="true" aria-label={t("etats.chargement")}>
        {[0, 1].map((i) => (
          <div key={i} className={styles.rangeeSquelette}>
            <Squelette className={`${styles.squeletteRond}`} />
            <span>
              <Squelette className={`${styles.squeletteLigne}`} />
              <Squelette className={`${styles.squeletteLigneFine}`} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.etatListe} role="status">
      <p>{vide}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ mes proches */

function DetailProche({ proche }: { proche: c.Proche }) {
  const { t } = useTranslation("Moi");
  const parties = [
    telephoneMasque(proche.telephone),
    proche.prevenuALArrivee
      ? t(estFeminin(proche.nom) ? "proches.prevenue" : "proches.prevenu")
      : null,
    proche.payeMesVoyages ? t("proches.payeMesVoyages") : null,
  ].filter((p): p is string => typeof p === "string");
  return <span className={styles.detailRangee}>{parties.join(" · ")}</span>;
}

export function MesProches({ requete }: { requete: RequeteProches }) {
  const { t } = useTranslation("Moi");
  const proches = requete.data ?? [];
  return (
    <section className={styles.liste} aria-label={t("proches.titre")}>
      <div className={styles.bande}>
        <span>{t("proches.titre")}</span>
        <a href={urlPlanche("Proche")} className={styles.ajouter}>
          {t("proches.ajouter")}
        </a>
      </div>
      {requete.data && proches.length > 0 ? (
        proches.map((proche) => (
          <a
            key={proche.id}
            href={urlPlanche("Proche")}
            className={`${styles.rangee} ${styles.proche}`}
          >
            <span
              className={`${styles.initiales} ${proche.payeMesVoyages ? styles.initialesBleu : ""}`}
              aria-hidden="true"
            >
              {proche.initiales}
            </span>
            <span className={styles.textes}>
              <span className={styles.titreRangee}>
                {proche.ville ? `${proche.nom} · ${proche.ville}` : proche.nom}
              </span>
              <DetailProche proche={proche} />
            </span>
            <span
              className={`${styles.actionProche} ${proche.payeMesVoyages ? styles.actionProcheDiscrete : ""}`}
            >
              {t(proche.payeMesVoyages ? "proches.demander" : "proches.payer")}
            </span>
          </a>
        ))
      ) : (
        <EtatsListe requete={requete as Requete<unknown[]>} vide={t("proches.vide")} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ mes voyages et colis */

const STATUT_STYLE: Record<c.StatutHistorique, string> = {
  a_venir: styles.statutVert ?? "",
  a_retirer: styles.statutAmbre ?? "",
  voyage: styles.statutGris ?? "",
  annule: styles.statutGris ?? "",
  livre: styles.statutGris ?? "",
};

/** Destination d'une ligne : le billet d'un voyage (Pass) ou le suivi d'un colis (ColisCode). */
export function hrefElement(element: c.ElementHistorique): string {
  return element.type === "colis"
    ? urlPlanche("ColisCode", { colisId: element.id })
    : urlPlanche("Pass", { billetId: element.id });
}

/** `elements` est l'historique déjà filtré par les modules actifs (pas de colis si le module Colis est masqué). */
export function MesVoyages({
  requete,
  elements,
}: {
  requete: RequeteHistorique;
  elements: readonly c.ElementHistorique[];
}) {
  const { t, i18n } = useTranslation("Moi");
  return (
    <section className={styles.liste} aria-label={t("historique.titre")}>
      <div className={styles.bande}>
        <span>{t("historique.titre")}</span>
        <span className={styles.bandeDroite}>{t("historique.sousTitre")}</span>
      </div>
      {requete.data && elements.length > 0 ? (
        elements.map((element) => (
          <a
            key={`${element.type}-${element.id}`}
            href={hrefElement(element)}
            className={`${styles.rangee} ${styles.historique}`}
          >
            <span className={styles.textes}>
              <span className={styles.titreRangee}>
                {element.type === "voyage" && element.departA
                  ? `${element.titre} · ${jourEtHeure(element.departA, i18n.language)}`
                  : element.titre}
              </span>
              <span className={styles.detailRangee}>{element.detail}</span>
            </span>
            <span className={`${styles.statut} ${STATUT_STYLE[element.statut]}`}>
              {t(`historique.statut.${element.statut}`)}
            </span>
          </a>
        ))
      ) : (
        <EtatsListe requete={requete as Requete<unknown[]>} vide={t("historique.vide")} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ devenir relais ou livreur */

export function Devenir({ relais, livreur }: { relais: boolean; livreur: boolean }) {
  const { t } = useTranslation("Moi");
  if (!relais && !livreur) return null;
  return (
    <div className={`${styles.devenir} ${relais && livreur ? "" : styles.devenirSeul}`}>
      {relais && (
        <a href={urlPlanche("RelaisDevenir")} className={`${styles.carteDevenir} ${styles.relais}`}>
          <span className={styles.carteHaut}>
            <span className={styles.carteIcone}>
              <IconeBoutique taille={17} trait={2.4} />
            </span>
            <ChevronCarte taille={16} trait={2.6} couleur="var(--am-ambre)" />
          </span>
          <span className={styles.carteTextes}>
            <span className={styles.carteTitre}>{t("devenir.relais.titre")}</span>
            <span className={styles.carteDetail}>{t("devenir.relais.detail")}</span>
          </span>
        </a>
      )}
      {livreur && (
        <a
          href={urlPlanche("LivreurDevenir")}
          className={`${styles.carteDevenir} ${styles.livreur}`}
        >
          <span className={styles.carteHaut}>
            <span className={styles.carteIcone}>
              <IconeMotoLivreur taille={17} trait={2.4} />
            </span>
            <ChevronCarte taille={16} trait={2.6} couleur="var(--am-bleu)" />
          </span>
          <span className={styles.carteTextes}>
            <span className={styles.carteTitre}>{t("devenir.livreur.titre")}</span>
            <span className={styles.carteDetail}>{t("devenir.livreur.detail")}</span>
          </span>
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pied : langue, reçus, aide */

export function PiedMoi({
  codeLangue,
  onLangue,
  recu,
  aide,
}: {
  codeLangue: string;
  onLangue: () => void;
  /** `chargement` : l'historique n'est pas encore là ; `undefined` : aucun voyage, donc pas de reçu à ouvrir. */
  recu: { billetId: string } | "chargement" | undefined;
  aide: boolean;
}) {
  const { t } = useTranslation("Moi");
  const colonnes = 1 + (recu !== undefined ? 1 : 0) + (aide ? 1 : 0);
  return (
    <div
      className={styles.pied}
      style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
    >
      <button type="button" className={styles.chip} onClick={onLangue}>
        {t("pied.langue", { code: codeLangue })}
      </button>
      {recu === "chargement" && (
        <span className={`${styles.chip} ${styles.squelette} am-pulse`} aria-hidden="true" />
      )}
      {recu !== undefined && recu !== "chargement" && (
        <a href={urlPlanche("Pass", { billetId: recu.billetId })} className={styles.chip}>
          {t("pied.recus")}
        </a>
      )}
      {aide && (
        <a href={urlPlanche("USSD")} className={styles.chip}>
          {t("pied.aide")}
        </a>
      )}
    </div>
  );
}
