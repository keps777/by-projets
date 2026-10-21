import { Bouton, EcranCorps } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import type { DemandeSuperviseur, GuichetSuperviseur, SuperviseurGare } from "./direct";
import { couleurRemplissage, heureDouala, montant, sequenceBillet } from "./formats";
import { IconeControle, IconeDebloquer, IconeEquipe, IconeRapport } from "./icones";
import styles from "./superviseur.module.css";

export type EtatGare = "chargement" | "erreur" | "vide" | "pret";

/**
 * Appareil visé par « Débloquer 12 h ». Le contrat de la gare (`SuperviseurGare`) ne porte aucun appareil bloqué :
 * on vise le téléphone du guichet 3 d'Akwa, celui de la planche « Débloquer » (point douteux signalé dans le rapport).
 */
export const APPAREIL_A_DEBLOQUER = "appareil-gu3-dla";

export interface PropsGareVue {
  etat: EtatGare;
  /** Les données de l'API (complétées par le temps réel) ; présentes quand `etat` vaut `pret`. */
  gare?: SuperviseurGare | undefined;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Entete({ etat, gare }: { etat: EtatGare; gare: SuperviseurGare | undefined }) {
  const { t } = useTranslation("Superviseur");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; le titre visible de la
          planche, « Superviseur · Akwa », vient des données. */}
      <h1 className={styles.titreEcran}>{t("ecrans.Superviseur.titre", { ns: "translation" })}</h1>
      <span className={styles.textes}>
        {gare ? (
          <>
            <span className={styles.titre}>{t("entete.titre", { gare: gare.gare.nom })}</span>
            <span className={styles.sousTitre}>
              {t("entete.sousTitre", {
                superviseur: gare.superviseur.nom,
                guichets: gare.guichets.length,
                quais: gare.quais,
                heure: heureDouala(gare.at),
              })}
            </span>
          </>
        ) : etat === "chargement" ? (
          <>
            <Squelette className={styles.squeletteTitre} />
            <Squelette className={`${styles.squeletteLigne} ${styles.squeletteSousTitre}`} />
          </>
        ) : null}
      </span>
      {gare ? (
        <span className={styles.synchro}>
          <span
            className={`${styles.synchroPoint} am-pulse`}
            data-ton={gare.synchro.synchronises < gare.synchro.total ? "ambre" : "vert"}
            aria-hidden="true"
          />
          {t("entete.synchro", {
            synchronises: gare.synchro.synchronises,
            total: gare.synchro.total,
          })}
        </span>
      ) : etat === "chargement" ? (
        <Squelette className={styles.squelettePastille} />
      ) : null}
    </header>
  );
}

function LigneDemande({ demande }: { demande: DemandeSuperviseur }) {
  const { t } = useTranslation("Superviseur");
  if (demande.genre === "cloture") {
    return (
      <div className={styles.demande}>
        <span className={styles.demandeTexte}>
          <strong>{t("demandes.cloture.titre", { rang: demande.guichetRang })}</strong>{" "}
          {t("demandes.cloture.detail", {
            agent: demande.agent.nom,
            ecart: montant(demande.ecart),
            compte: montant(demande.compte),
          })}
        </span>
        <a
          className={styles.demandeAction}
          href={urlPlanche("SuperviseurValider", { sessionId: demande.sessionId })}
        >
          {t("demandes.cloture.action")}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.demande}>
      <span className={styles.demandeTexte}>
        <strong>{t("demandes.annulation.titre")}</strong>{" "}
        {t("demandes.annulation.detail", {
          rang: demande.guichetRang,
          billet: sequenceBillet(demande.billetSequence),
          montant: montant(demande.montant),
          motif: demande.motif,
        })}
      </span>
      <a
        className={styles.demandeAction}
        href={urlPlanche("SuperviseurVoir", { demandeId: demande.demandeId })}
      >
        {t("demandes.annulation.action")}
      </a>
    </div>
  );
}

/** « 2 demandes attendent ton PIN » : absente quand rien n'attend le superviseur. */
function Demandes({ demandes }: { demandes: readonly DemandeSuperviseur[] }) {
  const { t } = useTranslation("Superviseur");
  if (demandes.length === 0) return null;
  return (
    <section className={styles.demandes} aria-live="polite">
      <div className={styles.demandesTete}>
        <h2 className={styles.demandesTitre}>{t("demandes.titre", { count: demandes.length })}</h2>
        <span className={styles.demandesAide}>{t("demandes.aide")}</span>
      </div>
      {demandes.map((demande) => (
        <LigneDemande key={demande.demandeId} demande={demande} />
      ))}
    </section>
  );
}

function Guichets({ guichets }: { guichets: readonly GuichetSuperviseur[] }) {
  const { t } = useTranslation("Superviseur");

  /** Ce que la planche écrit sous le nombre de billets : « écart 0 · ouvert », « − 1 000 · à valider », « ouvert 09:00 ». */
  function detail(g: GuichetSuperviseur): { texte: string; ton: "vert" | "ambre" | "neutre" } {
    if (g.etat === "a_valider") {
      return { texte: t("guichets.aValider", { ecart: montant(g.ecart) }), ton: "ambre" };
    }
    if (g.etat === "ferme") return { texte: t("guichets.ferme"), ton: "neutre" };
    if (g.ouvertA && g.ecart === 0) {
      return { texte: t("guichets.ouvertA", { heure: heureDouala(g.ouvertA) }), ton: "neutre" };
    }
    return {
      texte: t("guichets.ecartOuvert", { ecart: montant(g.ecart) }),
      ton: g.ecart === 0 ? "vert" : "ambre",
    };
  }

  return (
    <div className={styles.guichets}>
      {guichets.map((g) => {
        const { texte, ton } = detail(g);
        return (
          <div key={g.rang} className={styles.guichet} data-attente={g.etat === "a_valider"}>
            <span className={styles.guichetEtiquette}>
              {t("guichets.libelle", { rang: g.rang })}
            </span>
            <span className={styles.guichetBillets}>{g.billets}</span>
            <span className={styles.guichetEtat} data-ton={ton}>
              {texte}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Departs({ departs }: { departs: SuperviseurGare["apresMidi"] }) {
  const { t } = useTranslation("Superviseur");
  return (
    <section className={styles.departs} aria-label={t("departs.titre")}>
      <div className={styles.departsTete}>
        <h2 className={styles.departsTitre}>{t("departs.titre")}</h2>
        <span className={styles.departsAide}>{t("departs.aide")}</span>
      </div>
      {departs.map((d) => (
        <a key={d.departId} className={styles.depart} href={urlPlanche("Quai")}>
          <span className={styles.departHeure}>{heureDouala(d.heureDepart)}</span>
          <span className={styles.departLigne}>
            {t("departs.ligne", { destination: d.destination, quai: d.quai })}
            {d.bus ? <> · {t("departs.bus", { bus: d.bus })}</> : null}
            {d.fusionProposeeAvec ? (
              <>
                {" · "}
                <span className={styles.departFusion}>
                  {t("departs.fusion", { heure: heureDouala(d.fusionProposeeAvec) })}
                </span>
              </>
            ) : null}
          </span>
          <span
            className={styles.departRemplissage}
            data-ton={couleurRemplissage(d.vendus, d.capacite)}
          >
            {t("departs.remplissage", { vendus: d.vendus, capacite: d.capacite })}
          </span>
        </a>
      ))}
    </section>
  );
}

function Raccourci({
  href,
  icone,
  libelle,
  alerte = false,
}: {
  href: string;
  icone: ReactNode;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <a className={styles.raccourci} href={href} data-alerte={alerte}>
      {icone}
      {libelle}
    </a>
  );
}

function Etat({ etat, onReessayer }: { etat: "vide" | "erreur"; onReessayer?: () => void }) {
  const { t } = useTranslation("Superviseur");
  return (
    <div className={styles.etat}>
      <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
        <span className={styles.point} />
        <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
      </div>
      {etat === "erreur" && onReessayer && (
        <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
      )}
    </div>
  );
}

/**
 * Accueil du superviseur de gare : en-tête et pastille de synchronisation, demandes qui attendent son PIN, état des
 * guichets, départs de l'après-midi, quatre raccourcis. La barre d'onglets (Gare · Caisses · Quais · Patron) est posée
 * par le layout de l'espace superviseur.
 *
 * Les raccourcis ne dépendent pas des données : ils restent utilisables pendant le chargement et en cas d'erreur.
 */
export function GareVue({ etat, gare, onReessayer }: PropsGareVue) {
  const { t } = useTranslation("Superviseur");
  const donnees = etat === "pret" ? gare : undefined;

  return (
    <>
      <Entete etat={etat} gare={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="Superviseur"
        data-etat={etat}
        aria-busy={etat === "chargement"}
      >
        {etat === "chargement" && (
          <div role="status" aria-label={t("etats.chargement")} className={styles.chargement}>
            <span className={`${styles.squeletteBloc} ${styles.squeletteDemandes} am-pulse`} />
            <div className={styles.guichets}>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`${styles.squeletteBloc} ${styles.squeletteGuichet} am-pulse`}
                />
              ))}
            </div>
            <span className={`${styles.squeletteBloc} ${styles.squeletteDeparts} am-pulse`} />
          </div>
        )}

        {(etat === "vide" || etat === "erreur") && (
          <Etat etat={etat} {...(onReessayer ? { onReessayer } : {})} />
        )}

        {donnees && (
          <>
            <Demandes demandes={donnees.demandes} />
            <Guichets guichets={donnees.guichets} />
            <Departs departs={donnees.apresMidi} />
          </>
        )}

        <div className={styles.raccourcis}>
          <Raccourci
            href={urlPlanche("Controleur")}
            icone={<IconeControle />}
            libelle={t("raccourcis.controle")}
          />
          <Raccourci
            href={urlPlanche("SuperviseurEquipe")}
            icone={<IconeEquipe />}
            libelle={t("raccourcis.equipe")}
          />
          <Raccourci
            href={urlPlanche("SuperviseurDebloquer", { appareilId: APPAREIL_A_DEBLOQUER })}
            icone={<IconeDebloquer />}
            libelle={t("raccourcis.debloquer")}
            alerte
          />
          <Raccourci
            href={urlPlanche("RapportSoir")}
            icone={<IconeRapport />}
            libelle={t("raccourcis.rapport")}
          />
        </div>
      </EcranCorps>
    </>
  );
}
