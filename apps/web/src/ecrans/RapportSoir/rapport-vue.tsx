import { Bouton, EcranCorps } from "@afrimove/ui";
import type { TFunction } from "i18next";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  echelleDe,
  ecart,
  francs,
  groupes,
  heureDouala,
  partCourte,
  pourcentEntier,
  recetteCourte,
  variation,
} from "./formats";
import { IconeEnvoi, IconeRetourRapport, LogoAfriMove } from "./icones";
import { ranger } from "./lignes";
import styles from "./rapport-soir.module.css";
import type { RapportGare, RapportSoir } from "./types";

export type EtatRapport = "chargement" | "erreur" | "vide" | "pret";

export interface PropsRapportVue {
  etat: EtatRapport;
  /** Le rapport arrêté à 21 h, présent quand `etat` vaut `pret`. */
  rapport?: RapportSoir | undefined;
  /** Nom de la compagnie (« Alpha Voyages »), pour l'en-tête ; absent tant que le tableau du jour n'est pas lu. */
  compagnie?: string | undefined;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Entete({
  compagnie,
  rapport,
}: {
  compagnie: string | undefined;
  rapport: RapportSoir | undefined;
}) {
  const { t } = useTranslation("RapportSoir");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche n'en montre pas
          d'autre que le nom de l'expéditeur. */}
      <h1 className={styles.titreEcran}>{t("ecrans.RapportSoir.titre", { ns: "translation" })}</h1>
      <a className={styles.retour} href={urlPlanche("Patron")} aria-label={t("entete.retour")}>
        <IconeRetourRapport />
      </a>
      <span className={styles.logo}>
        <LogoAfriMove />
      </span>
      <span className={styles.expediteur}>
        <span className={styles.nom}>
          {compagnie ? t("entete.marque", { compagnie }) : t("entete.marqueSeule")}
        </span>
        <span className={styles.verifie}>{t("entete.verifie")}</span>
      </span>
      {rapport && <span className={styles.heure}>{heureDouala(rapport.envoyeA)}</span>}
    </header>
  );
}

function LigneGare({ gare }: { gare: RapportGare }) {
  const { t } = useTranslation("RapportSoir");
  const { avant, entreParentheses, apres } = ranger(gare.remarques);
  const billets = t("gares.billets", { count: gare.billets, nombre: groupes(gare.billets) });
  return (
    <span>
      <strong>{gare.nom}</strong>
      {` · ${[billets, ...avant].join(" · ")} · ${t("gares.ecart")} `}
      <span
        className={gare.ecart === 0 ? styles.ecartVert : styles.ecartAmbre}
        data-ton={gare.ecart === 0 ? "vert" : "ambre"}
      >
        {ecart(gare.ecart)}
      </span>
      {entreParentheses.length > 0 && ` (${entreParentheses.join(" ; ")})`}
      {apres.map((remarque, i) => (
        <Fragment key={i}>{` · ${remarque}`}</Fragment>
      ))}
    </span>
  );
}

function Tuiles({ rapport }: { rapport: RapportSoir }) {
  const { t } = useTranslation("RapportSoir");
  const c = rapport.chiffres;
  const echelle = echelleDe(c.recette);
  const classeVariation =
    c.variationBilletsPct > 0
      ? styles.tuileDetailVert
      : c.variationBilletsPct < 0
        ? styles.tuileDetailRouge
        : "";
  return (
    <div className={styles.chiffres}>
      <span className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("chiffres.billets")}</span>
        <span className={styles.tuileValeur}>{groupes(c.billets)}</span>
        <span
          className={`${styles.tuileDetail} ${classeVariation}`}
          data-tendance={
            c.variationBilletsPct > 0 ? "hausse" : c.variationBilletsPct < 0 ? "baisse" : "stable"
          }
        >
          {t("chiffres.variation", { variation: variation(c.variationBilletsPct) })}
        </span>
      </span>
      <span className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("chiffres.colis")}</span>
        <span className={styles.tuileValeur}>{groupes(c.colis)}</span>
        <span className={styles.tuileDetail}>{t("chiffres.litiges", { count: c.litiges })}</span>
      </span>
      <span className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("chiffres.recette")}</span>
        <span className={`${styles.tuileValeur} ${styles.tuileRecette}`}>
          {recetteCourte(c.recette)}
        </span>
        <span className={styles.tuileDetail}>
          {t("chiffres.repartition", {
            cash: partCourte(c.cash, echelle),
            momo: partCourte(c.momo, echelle),
          })}
        </span>
      </span>
    </div>
  );
}

function texteAnnulations(rapport: RapportSoir, t: TFunction<"RapportSoir">): string {
  const a = rapport.annulations;
  if (a.nombre === 0) return t("annulations.aucune");
  return t("annulations.detail", {
    nombre: groupes(a.nombre),
    montant: francs(a.montant),
    pin: t(a.toutesAvecPin ? "annulations.toutesAvecPin" : "annulations.sansPin"),
  });
}

function Message({ rapport }: { rapport: RapportSoir }) {
  const { t } = useTranslation("RapportSoir");
  const { enRoute, remplissage, enLigne } = rapport;
  const moyen = t("remplissage.moyen", { pct: pourcentEntier(remplissage.moyenPct) });
  return (
    <div className={styles.bulle}>
      <span className={styles.titre}>{rapport.titre}</span>
      <Tuiles rapport={rapport} />
      <div className={styles.lignes}>
        {rapport.gares.length === 0 && <span>{t("gares.aucune")}</span>}
        {rapport.gares.map((gare) => (
          <LigneGare key={gare.gareId} gare={gare} />
        ))}
        <span>
          <strong>{t("enRoute.titre")}</strong>
          {` · ${enRoute.texte}`}
        </span>
        <span>
          <strong>{t("remplissage.titre")}</strong>
          {` · ${moyen}${remplissage.remarque ? ` · ${remplissage.remarque}` : ""}`}
        </span>
        <span>
          <strong>{t("annulations.titre")}</strong>
          {` · ${texteAnnulations(rapport, t)} · `}
          <strong>{t("enLigne.titre")}</strong>
          {` · ${t("enLigne.billets", {
            count: enLigne.billets,
            nombre: groupes(enLigne.billets),
            pct: pourcentEntier(enLigne.partPct),
          })}`}
        </span>
      </div>
      <a className={styles.detail} href={urlPlanche("Analyses")}>
        {t("ouvrirDetail")}
      </a>
    </div>
  );
}

function Signature({ rapport }: { rapport: RapportSoir }) {
  const { t } = useTranslation("RapportSoir");
  const heure = heureDouala(rapport.envoyeA);
  const signatures = rapport.signatures.map((s) => `${s.nom} (${s.gare})`).join(", ");
  return (
    <span className={styles.signature}>
      {signatures === "" ? t("signatureAucune", { heure }) : t("signature", { heure, signatures })}
    </span>
  );
}

function Echange({ rapport }: { rapport: RapportSoir }) {
  const { t } = useTranslation("RapportSoir");
  const { question, reponse } = rapport.questionSuggeree;
  // Sans question préparée (l'assistant n'a rien suggéré), la conversation s'arrête au rapport.
  if (question.trim() === "") return null;
  return (
    <>
      <div className={styles.question}>{question}</div>
      <div className={styles.reponse}>
        {reponse}{" "}
        <a className={styles.voir} href={urlPlanche("Assistant")}>
          {t("voir")}
        </a>
      </div>
    </>
  );
}

function Chargement() {
  return (
    <div className={styles.bulle} aria-hidden="true">
      <Squelette className={styles.squeletteTitre} />
      <div className={styles.chiffres}>
        {[1, 2, 3].map((i) => (
          <Squelette key={i} className={styles.squeletteTuile} />
        ))}
      </div>
      <div className={styles.lignes}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Squelette key={i} className={styles.squeletteLigne} />
        ))}
      </div>
      <Squelette className={styles.squeletteBouton} />
    </div>
  );
}

/**
 * Le rapport du soir, tel que le patron le reçoit sur WhatsApp à 21 h et le relit dans l'app : le message de
 * l'expéditeur vérifié (chiffres, une ligne par gare, en route, remplissage, annulations, en ligne), la signature des
 * superviseurs, puis la question que le rapport suggère et la réponse préparée par l'assistant.
 *
 * Lire le rapport ne demande aucune touche : il arrive seul. Deux liens mènent plus loin : « Ouvrir le détail dans
 * l'app » (Analyses) et l'assistant (« Voir → », la flèche de la zone de saisie).
 */
export function RapportVue({ etat, rapport, compagnie, onReessayer }: PropsRapportVue) {
  const { t } = useTranslation("RapportSoir");
  const donnees = etat === "pret" ? rapport : undefined;
  return (
    <>
      <Entete compagnie={compagnie} rapport={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="RapportSoir"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {etat === "chargement" && <Chargement />}
        {(etat === "vide" || etat === "erreur") && (
          <div className={styles.bulle}>
            <div className={styles.message}>
              <p
                role={etat === "erreur" ? "alert" : "status"}
                className={etat === "erreur" ? styles.messageErreur : undefined}
              >
                {t(etat === "erreur" ? "etats.erreur" : "etats.vide")}
              </p>
              {etat === "erreur" && onReessayer && (
                <Bouton
                  variante="secondaire"
                  libelle={t("etats.reessayer")}
                  onClick={onReessayer}
                />
              )}
            </div>
          </div>
        )}
        {donnees && (
          <>
            <Message rapport={donnees} />
            <Signature rapport={donnees} />
            <Echange rapport={donnees} />
          </>
        )}
      </EcranCorps>

      <div className={styles.saisie}>
        <span className={styles.pose}>{t("saisie")}</span>
        <a
          className={styles.envoi}
          href={urlPlanche("Assistant")}
          aria-label={t("ouvrirAssistant")}
        >
          <IconeEnvoi />
        </a>
      </div>
    </>
  );
}
