import { Bouton, EcranCorps, EcranPied, Pastille, TuileKpi } from "@afrimove/ui";
import type { TFunction } from "i18next";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import type { DetailGare, EvenementGare, GuichetGare, QuaiGare } from "./gare";
import {
  caisseCourte,
  commenceParVoyelle,
  ecart,
  heureDouala,
  montant,
  morceauxJournal,
  taux,
} from "./formats";
import { IconeFlecheCaisse, IconeRetourGare } from "./icones";
import styles from "./patron-gare.module.css";

export type EtatGare = "chargement" | "erreur" | "introuvable" | "pret";

export interface PropsGareVue {
  etat: EtatGare;
  /** La gare en détail, présente quand `etat` vaut `pret`. */
  gare?: DetailGare | undefined;
  onReessayer?: () => void;
}

type Ton = "vert" | "ambre" | "rouge" | "bleu" | "neutre";

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- en-tête */

function Entete({ etat, gare }: { etat: EtatGare; gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre le nom
          de la gare, qui n'est connu qu'une fois la lecture arrivée. */}
      <h1 className={styles.titreEcran}>{t("ecrans.PatronGare.titre", { ns: "translation" })}</h1>
      <a
        className={styles.retour}
        href={urlPlanche("PatronEquipe")}
        aria-label={t("entete.retour")}
      >
        <IconeRetourGare />
      </a>
      <div className={styles.textes}>
        {gare ? (
          <>
            <span className={styles.titre}>
              {t(commenceParVoyelle(gare.gare.nom) ? "entete.titreVoyelle" : "entete.titre", {
                nom: gare.gare.nom,
                ville: gare.gare.ville,
              })}
            </span>
            <span className={styles.sousTitre}>
              {t("entete.detail", {
                superviseur: t(
                  /^mme\b/i.test(gare.superviseur) ? "entete.superviseure" : "entete.superviseur",
                  { nom: gare.superviseur },
                ),
                guichets: t("entete.guichets", { count: gare.nbGuichets }),
                quais: t("entete.quais", { count: gare.nbQuais }),
                heure: heureDouala(gare.instant),
              })}
            </span>
          </>
        ) : etat === "chargement" ? (
          <>
            <Squelette className={styles.squeletteTitre} />
            <Squelette className={styles.squeletteSousTitre} />
          </>
        ) : null}
      </div>
      {gare ? (
        <Pastille
          statut={gare.synchro.guichetsSynchronises < gare.synchro.guichets ? "horsLigne" : "sync"}
          libelle={t("entete.synchro", {
            synchronises: gare.synchro.guichetsSynchronises,
            total: gare.synchro.guichets,
          })}
        />
      ) : etat === "chargement" ? (
        <Squelette className={styles.squelettePastille} />
      ) : null}
    </header>
  );
}

/* ---------------------------------------------------------------- les quatre tuiles */

function Chiffres({ gare }: { gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  const c = gare?.chiffres;
  const attente = <Squelette className={styles.squeletteChiffre} />;
  const detailEcart = c
    ? c.ecartGuichet !== null
      ? t("chiffres.ecartGuichet", { rang: c.ecartGuichet })
      : t(c.ecart === 0 ? "chiffres.ecartAucun" : "chiffres.ecartGare")
    : undefined;
  return (
    <div className={styles.chiffres}>
      <TuileKpi
        etiquette={t("chiffres.caisse")}
        valeur={c ? caisseCourte(c.caisse) : attente}
        {...(c
          ? { sousLigne: t("chiffres.caisseDepuis", { heure: heureDouala(c.caisseDepuis) }) }
          : {})}
      />
      <TuileKpi
        etiquette={t("chiffres.billets")}
        valeur={c ? String(c.billets) : attente}
        {...(c ? { sousLigne: t("chiffres.billetsRempli", { pct: taux(c.remplissagePct) }) } : {})}
      />
      <TuileKpi
        etiquette={t("chiffres.colis")}
        valeur={c ? String(c.colis) : attente}
        {...(c ? { sousLigne: t("chiffres.colisRelais", { count: c.colisAuRelais }) } : {})}
      />
      <TuileKpi
        etiquette={t("chiffres.ecart")}
        valeur={c ? ecart(c.ecart) : attente}
        {...(c ? { etat: c.ecart !== 0 ? ("ambre" as const) : ("neutre" as const) } : {})}
        {...(detailEcart ? { sousLigne: detailEcart } : {})}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- les trois blocs */

function Bloc({
  titre,
  mention,
  children,
}: {
  titre: string;
  mention: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className={styles.bloc} aria-label={titre}>
      <div className={styles.blocEntete}>
        <span className={styles.blocTitre}>{titre}</span>
        {mention ? <span className={styles.blocMention}>{mention}</span> : null}
      </div>
      <ul className={styles.liste}>{children}</ul>
    </section>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <li className={styles.vide}>
      <p role="status">{texte}</p>
    </li>
  );
}

function LignesSquelette({ classe, nombre }: { classe: string | undefined; nombre: number }) {
  return (
    <>
      {Array.from({ length: nombre }, (_, i) => (
        <li key={i} className={classe} aria-hidden="true">
          <Squelette className={styles.squeletteLigne} />
        </li>
      ))}
    </>
  );
}

interface LigneGuichet {
  detail: string;
  tonDetail: Ton;
  tonAvatar: Ton;
  etat: string;
  tonEtat: Ton;
}

/** Les textes et les couleurs d'une ligne de guichet, comme la planche les pose (bloqué en rouge, écart en ambre). */
function presenterGuichet(g: GuichetGare, t: TFunction<"PatronGare">): LigneGuichet {
  const bloque = g.etat === "bloque";
  const ecartNonNul = g.ecart !== 0;
  const morceaux = [
    t("guichets.billets", { count: g.billets }),
    t("guichets.colis", { count: g.colis }),
  ];
  if (bloque) {
    morceaux.push(t("guichets.bloqueeDepuis", { heure: heureDouala(g.bloqueDepuis ?? "") }));
  }
  if (ecartNonNul || !bloque) {
    morceaux.push(
      ecartNonNul ? t("guichets.ecart", { montant: ecart(g.ecart) }) : t("guichets.ecartNul"),
    );
  }
  if (g.clotureAttendPin) morceaux.push(t("guichets.attendPin"));

  const tonDetail: Ton = bloque
    ? "rouge"
    : ecartNonNul || g.clotureAttendPin || g.etat === "hors_ligne"
      ? "ambre"
      : "neutre";
  const etat =
    g.etat === "bloque"
      ? t("guichets.bloque")
      : g.etat === "hors_ligne"
        ? t("guichets.horsLigne")
        : g.derniereSyncA
          ? t("guichets.sync", { heure: heureDouala(g.derniereSyncA) })
          : t("guichets.syncSansHeure");
  return {
    detail: morceaux.join(" · "),
    tonDetail,
    tonAvatar: bloque ? "neutre" : ecartNonNul ? "ambre" : "bleu",
    etat,
    tonEtat: bloque ? "rouge" : g.etat === "hors_ligne" ? "ambre" : "vert",
  };
}

function Guichets({ etat, gare }: { etat: EtatGare; gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  return (
    <Bloc titre={t("guichets.titre")} mention={t("guichets.mention")}>
      {etat === "chargement" && <LignesSquelette classe={styles.ligneGuichetAttente} nombre={3} />}
      {gare && gare.guichets.length === 0 && <Vide texte={t("guichets.aucun")} />}
      {gare?.guichets.map((g) => {
        const l = presenterGuichet(g, t);
        return (
          <li key={g.rang} className={styles.item}>
            <a
              className={`${styles.ligne} ${styles.ligneGuichet}`}
              href={urlPlanche("PatronPersonne", { personneId: g.personne.id })}
            >
              <span className={styles.avatar} data-ton={l.tonAvatar}>
                {g.personne.initiales}
              </span>
              <span className={styles.pile}>
                <span className={styles.ligneTitre}>
                  {t("guichets.intitule", { rang: g.rang, nom: g.personne.nom })}
                </span>
                <span className={styles.ligneDetail} data-ton={l.tonDetail}>
                  {l.detail}
                </span>
              </span>
              <span className={`${styles.pile} ${styles.droite}`}>
                <span className={styles.caisse}>{montant(g.caisse)}</span>
                <span className={styles.etat} data-ton={l.tonEtat}>
                  {l.etat}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </Bloc>
  );
}

/** Part de la capacité qui reste libre. */
function libres(q: QuaiGare): number {
  return Math.max(0, q.capacite - q.remplis);
}

function Quais({ etat, gare }: { etat: EtatGare; gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  return (
    <Bloc
      titre={t("quais.titre")}
      mention={gare ? t("quais.mention", { count: gare.quais.length }) : undefined}
    >
      {etat === "chargement" && <LignesSquelette classe={styles.ligneQuaiAttente} nombre={2} />}
      {gare && gare.quais.length === 0 && <Vide texte={t("quais.aucun")} />}
      {gare?.quais.map((q) => {
        const reste = libres(q);
        const infos = [
          q.chauffeur,
          q.convoyeur,
          `${q.remplis} / ${q.capacite}`,
          q.embarquementA ? t("quais.embarquement", { heure: heureDouala(q.embarquementA) }) : null,
          q.note,
        ].filter((info): info is string => Boolean(info));
        return (
          <li key={q.departId} className={styles.item}>
            <a className={`${styles.ligne} ${styles.ligneQuai}`} href={urlPlanche("Quai")}>
              <span className={styles.pile}>
                <span className={styles.ligneTitre}>
                  {`${heureDouala(q.heureDepart)} · ${q.origine} → ${q.destination} · ${q.bus}`}
                </span>
                <span className={styles.ligneDetail} data-ton="neutre">
                  {infos.join(" · ")}
                </span>
              </span>
              {/* Presque plein = vert (le bus part rempli), encore de la place = ambre (à vendre). */}
              <span
                className={styles.libres}
                data-ton={reste * 10 <= q.capacite ? "vert" : "ambre"}
              >
                {reste === 0 ? t("quais.complet") : t("quais.libres", { count: reste })}
              </span>
            </a>
          </li>
        );
      })}
    </Bloc>
  );
}

const ETAT_JOURNAL: Record<EvenementGare["etat"], { cle: string; ton: Ton }> = {
  ouvert: { cle: "journal.ouvert", ton: "rouge" },
  trace: { cle: "journal.trace", ton: "neutre" },
  attend_pin: { cle: "journal.attendPin", ton: "ambre" },
};

function TexteJournal({ texte }: { texte: string }) {
  return (
    <>
      {morceauxJournal(texte).map((m, i) => (
        <Fragment key={i}>{"exposant" in m ? <sup>{m.exposant}</sup> : m.texte}</Fragment>
      ))}
    </>
  );
}

function Journal({ etat, gare }: { etat: EtatGare; gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  return (
    <Bloc
      titre={t("journal.titre")}
      mention={gare ? t("journal.mention", { count: gare.journal.length }) : undefined}
    >
      {etat === "chargement" && <LignesSquelette classe={styles.ligneJournalAttente} nombre={3} />}
      {gare && gare.journal.length === 0 && <Vide texte={t("journal.aucun")} />}
      {gare?.journal.map((e) => {
        const etatJournal = ETAT_JOURNAL[e.etat];
        return (
          <li key={`${e.at}-${e.texte}`} className={`${styles.item} ${styles.evenement}`}>
            <span>
              <strong>{heureDouala(e.at)}</strong>
              {" · "}
              <TexteJournal texte={e.texte} />
            </span>
            <span className={styles.etatJournal} data-ton={etatJournal.ton}>
              {t(etatJournal.cle)}
            </span>
          </li>
        );
      })}
    </Bloc>
  );
}

/* ---------------------------------------------------------------- pied : rapport d'hier et caisse en direct */

function Pied({ gare }: { gare: DetailGare | undefined }) {
  const { t } = useTranslation("PatronGare");
  return (
    <EcranPied className={styles.pied}>
      <a className={styles.rapport} href={urlPlanche("RapportSoir")}>
        {t("actions.rapport")}
      </a>
      <a className={styles.caisseDirect} href={urlPlanche("Caisse")}>
        <span className={styles.caisseTextes}>
          <span className={styles.caisseTitre}>{t("actions.caisse")}</span>
          {gare ? (
            <span className={styles.caisseDetail}>
              {t("actions.caisseDetail", {
                montant: montant(gare.chiffres.caisse),
                guichets: t("entete.guichets", { count: gare.nbGuichets }),
              })}
            </span>
          ) : null}
        </span>
        <IconeFlecheCaisse />
      </a>
    </EcranPied>
  );
}

/**
 * Une gare en détail, vue par le patron : l'en-tête (gare, superviseur, synchronisation), les quatre chiffres, les
 * guichets (qui, combien, état), les quais et les prochains départs, le journal du jour, puis le rapport d'hier et la
 * caisse en direct.
 *
 * Lecture seule : le patron voit tout et ne touche pas la caisse, les validations restent au superviseur. Chaque
 * guichet ouvre la fiche de la personne, chaque départ le quai.
 */
export function GareVue({ etat, gare, onReessayer }: PropsGareVue) {
  const { t } = useTranslation("PatronGare");
  const donnees = etat === "pret" ? gare : undefined;
  const sansDonnees = etat === "erreur" || etat === "introuvable";
  return (
    <>
      <Entete etat={etat} gare={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="PatronGare"
        data-etat={etat}
        aria-busy={etat === "chargement"}
        {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
      >
        {sansDonnees ? (
          <div className={styles.etatMessage}>
            <div className={styles.bandeau}>
              <span className={styles.point} />
              <p role={etat === "erreur" ? "alert" : "status"}>
                {t(etat === "erreur" ? "etats.erreur" : "etats.introuvable")}
              </p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        ) : (
          <>
            <Chiffres gare={donnees} />
            <Guichets etat={etat} gare={donnees} />
            <Quais etat={etat} gare={donnees} />
            <Journal etat={etat} gare={donnees} />
            <p className={styles.regle}>{t("regle")}</p>
          </>
        )}
      </EcranCorps>

      <Pied gare={donnees} />
    </>
  );
}
