import type { TFunction } from "i18next";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CarteBus } from "./carte";
import {
  ONGLETS,
  TON_A_TRAITER,
  destinationATraiter,
  destinationGare,
  destinationRapport,
  type CleOnglet,
  type TonPoint,
} from "./destinations";
import type { ATraiter, Gare, SalleDeControle } from "./direct";
import {
  ecart,
  heureDouala,
  jourDeLaSemaine,
  jourLong,
  montantGroupe,
  quand,
  recetteCourte,
  taux,
  variation,
} from "./formats";
import { LogoCompagnie } from "./icones";
import { barres, reperesAxe, type TonBarre } from "./ventes";
import styles from "./controle.module.css";

export type EtatEcran = "chargement" | "erreur" | "pret";

export interface PropsVue {
  etat: EtatEcran;
  /** La salle (la lecture et le direct déjà fusionnés), présente quand `etat` vaut `pret`. */
  salle?: SalleDeControle | undefined;
  /** Le canal temps réel est ouvert : la pastille dit « EN DIRECT », sinon « HORS LIGNE ». */
  enDirect: boolean;
  /** Faux quand le module qui porte l'écran de destination est masqué : le lien disparaît (ou devient du texte). */
  lienActif: (href: string) => boolean;
  /** « Direct » reste sur l'écran : l'action se fait sur place (relire la salle). */
  onDirect?: () => void;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

const CLASSE_POINT: Record<TonPoint, string | undefined> = {
  ambre: styles.pointAmbre,
  rouge: styles.pointRouge,
  bleu: styles.pointBleu,
  vert: styles.pointVert,
};

const CLASSE_BARRE: Record<TonBarre, string | undefined> = {
  pic: styles.barrePic,
  normal: styles.barreNormal,
  prevu: styles.barrePrevue,
};

/* ------------------------------------------------------------------------------------------------ en-tête */

function Entete({ etat, salle, enDirect, lienActif, onDirect }: PropsVue) {
  const { t } = useTranslation("Controle");
  const donnees = etat === "pret" ? salle : undefined;
  const onglets = ONGLETS.filter(
    ({ cle, planche }) => cle === "direct" || lienActif(urlPlanche(planche)),
  );

  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche montre le nom de la
          compagnie à la place. */}
      <h1 className={styles.titreEcran}>{t("ecrans.Controle.titre", { ns: "translation" })}</h1>
      <span className={styles.marque}>
        <LogoCompagnie />
        <span className={styles.textes}>
          {donnees ? (
            <>
              <span className={styles.titre}>
                {t("entete.titre", { compagnie: donnees.compagnie })}
              </span>
              <span className={styles.sousTitre}>
                {t("entete.sousTitre", {
                  gares: t("entete.gares", { count: donnees.nbGares }),
                  bus: t("entete.bus", { count: donnees.nbBus }),
                  jour: jourLong(donnees.jour),
                })}
              </span>
            </>
          ) : etat === "chargement" ? (
            <>
              <Squelette className={styles.squeletteTitre} />
              <Squelette className={styles.squeletteSousTitre} />
            </>
          ) : (
            <span className={styles.titre}>{t("entete.titreSeul")}</span>
          )}
        </span>
      </span>
      <nav aria-label={t("entete.vues")} className={styles.onglets}>
        {onglets.map(({ cle, planche }) => (
          <OngletVue key={cle} cle={cle} href={urlPlanche(planche)} onDirect={onDirect} />
        ))}
      </nav>
      {donnees ? (
        <span className={styles.pastille}>
          <span
            className={`${styles.pointPastille} ${enDirect ? "" : styles.pointHorsLigne} am-pulse`}
          />
          {t(enDirect ? "direct.enDirect" : "direct.horsLigne", {
            heure: heureDouala(donnees.instant),
            etat: t(enDirect ? "direct.libelleDirect" : "direct.libelleHorsLigne"),
            synchronisees: donnees.synchro.garesSynchronisees,
            count: donnees.synchro.gares,
          })}
        </span>
      ) : etat === "chargement" ? (
        <Squelette className={styles.squelettePastille} />
      ) : null}
    </header>
  );
}

function OngletVue({
  cle,
  href,
  onDirect,
}: {
  cle: CleOnglet;
  href: string;
  onDirect: (() => void) | undefined;
}) {
  const { t } = useTranslation("Controle");
  const actif = cle === "direct";
  return (
    <a
      href={href}
      className={actif ? `${styles.onglet} ${styles.ongletActif}` : styles.onglet}
      {...(actif ? { "aria-current": "page" as const } : {})}
      onClick={
        actif
          ? (evenement) => {
              // « Direct » est l'écran lui-même : on reste sur place et on relit la salle.
              evenement.preventDefault();
              onDirect?.();
            }
          : undefined
      }
    >
      {t(`onglets.${cle}`)}
    </a>
  );
}

/* ------------------------------------------------------------------------------------------------ les cinq chiffres */

interface Kpi {
  cle: string;
  etiquette: string;
  valeur: string;
  detail: string;
  ton?: "vert" | "rouge";
  alerte?: boolean;
}

function kpis(salle: SalleDeControle, t: TFunction<"Controle">): Kpi[] {
  const c = salle.chiffres;
  const ecarts = c.ecartsDeCaisse;
  return [
    {
      cle: "recette",
      etiquette: t("kpis.recette"),
      valeur: recetteCourte(c.recette),
      detail: t("kpis.recetteDetail", {
        variation: variation(c.variationPct),
        jour: jourDeLaSemaine(salle.jour),
      }),
      ton: c.variationPct < 0 ? "rouge" : "vert",
    },
    {
      cle: "billets",
      etiquette: t("kpis.billets"),
      valeur: String(c.billets),
      detail: t("kpis.billetsDetail", { enLigne: c.billetsEnLigne, enRoute: c.billetsEnRoute }),
    },
    {
      cle: "colis",
      etiquette: t("kpis.colis"),
      valeur: String(c.colis),
      detail: t("kpis.colisDetail", {
        correspondances: c.colisEnCorrespondance,
        litiges: t("kpis.litiges", { count: c.litiges }),
      }),
    },
    {
      cle: "remplissage",
      etiquette: t("kpis.remplissage"),
      valeur: taux(c.remplissagePct),
      detail: t("kpis.remplissageDetail", {
        departs: t("kpis.departs", { count: c.departs }),
        fusionnes: t("kpis.fusionnes", { count: c.departsFusionnes }),
      }),
    },
    {
      cle: "ecarts",
      etiquette: t("kpis.ecarts"),
      valeur: ecart(ecarts.total),
      detail:
        ecarts.caissesEnEcart > 0
          ? t("kpis.ecartsDetail", { count: ecarts.caissesEnEcart, caisses: ecarts.caisses })
          : t("kpis.ecartsAucun", { caisses: ecarts.caisses }),
      alerte: ecarts.total !== 0,
    },
  ];
}

function Chiffres({ salle }: { salle: SalleDeControle | undefined }) {
  const { t } = useTranslation("Controle");
  const liste = salle ? kpis(salle, t) : undefined;
  const cles = ["recette", "billets", "colis", "remplissage", "ecarts"] as const;

  return (
    <div className={styles.kpis}>
      {cles.map((cle) => {
        const kpi = liste?.find((k) => k.cle === cle);
        const alerte = kpi?.alerte === true;
        const classeDetail =
          kpi?.ton === "vert"
            ? `${styles.kpiDetail} ${styles.vert}`
            : kpi?.ton === "rouge"
              ? `${styles.kpiDetail} ${styles.rouge}`
              : styles.kpiDetail;
        return (
          <div
            key={cle}
            className={alerte ? `${styles.kpi} ${styles.kpiAlerte}` : styles.kpi}
            data-kpi={cle}
          >
            <span
              className={alerte ? `${styles.kpiEtiquette} ${styles.ambre}` : styles.kpiEtiquette}
            >
              {t(`kpis.${cle}`)}
            </span>
            {kpi ? (
              <span className={alerte ? `${styles.kpiValeur} ${styles.ambre}` : styles.kpiValeur}>
                {kpi.valeur}
              </span>
            ) : (
              <Squelette className={styles.squeletteValeur} />
            )}
            {kpi ? (
              <span className={classeDetail}>{kpi.detail}</span>
            ) : (
              <Squelette className={styles.squeletteDetail} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ la carte */

function Carte({ salle }: { salle: SalleDeControle | undefined }) {
  const { t } = useTranslation("Controle");
  return (
    <div className={`${styles.panneau} ${styles.panneauCarte}`}>
      <div className={styles.barre}>
        <span>{t("carte.titre", { count: salle?.carte.busEnRoute ?? 0 })}</span>
        <span className={styles.aide}>{t("carte.aide")}</span>
      </div>
      {salle ? (
        <CarteBus carte={salle.carte} />
      ) : (
        <div className={styles.carteVide} aria-hidden="true" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ les gares */

function ProchainDepart({ gare }: { gare: Gare }) {
  const { t } = useTranslation("Controle");
  const depart = gare.prochainDepart;
  if (!depart) return <>{t("gares.aucunDepart")}</>;
  return (
    <>
      <span className={styles.heureDepart}>{depart.heure}</span>{" "}
      {t("gares.prochain", {
        destination: depart.destination,
        remplis: depart.remplis,
        capacite: depart.capacite,
      })}
      {depart.remplis >= depart.capacite ? t("gares.plein") : ""}
    </>
  );
}

function Gares({
  salle,
  lienActif,
}: {
  salle: SalleDeControle | undefined;
  lienActif: (href: string) => boolean;
}) {
  const { t } = useTranslation("Controle");
  const colonnes = [
    "gare",
    "billets",
    "colis",
    "cash",
    "ecart",
    "prochain",
    "superviseur",
  ] as const;
  const gares = salle?.gares;
  const href = destinationGare();

  return (
    <div className={styles.panneau}>
      <div className={styles.barre} id="controle-gares">
        <span>{t("gares.titre")}</span>
        <span className={styles.aide}>{t("gares.aide")}</span>
      </div>
      <div className={styles.defilement}>
        <table className={styles.table} aria-labelledby="controle-gares">
          <thead>
            <tr className={styles.entetesTable}>
              {colonnes.map((cle, i) => (
                <th
                  key={cle}
                  scope="col"
                  className={[
                    i === 0 ? styles.premiere : "",
                    i === colonnes.length - 1 ? styles.derniere : "",
                    i >= 1 && i <= 4 ? styles.droite : "",
                  ].join(" ")}
                >
                  {t(`gares.colonnes.${cle}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gares === undefined &&
              [1, 2, 3].map((i) => (
                <tr key={i} className={styles.ligneGare} aria-hidden="true">
                  <td colSpan={7} className={styles.cellule}>
                    <Squelette className={styles.squeletteLigne} />
                  </td>
                </tr>
              ))}
            {gares?.length === 0 && (
              <tr className={styles.ligneGare}>
                <td colSpan={7} className={styles.message}>
                  <span role="status">{t("gares.vide")}</span>
                </td>
              </tr>
            )}
            {gares?.map((gare) => (
              <tr key={gare.gareId} className={styles.ligneGare}>
                <td className={`${styles.cellule} ${styles.premiere}`}>
                  {lienActif(href) ? (
                    <a href={href} className={styles.nomGare}>
                      {gare.nom}
                    </a>
                  ) : (
                    <span className={styles.nomGare}>{gare.nom}</span>
                  )}
                </td>
                <td className={`${styles.cellule} ${styles.droite} ${styles.mono}`}>
                  {gare.billets}
                </td>
                <td className={`${styles.cellule} ${styles.droite} ${styles.mono}`}>
                  {gare.colis}
                </td>
                <td className={`${styles.cellule} ${styles.droite} ${styles.mono}`}>
                  {montantGroupe(gare.cashAttendu)}
                </td>
                <td
                  className={`${styles.cellule} ${styles.droite} ${styles.mono} ${styles.gras} ${
                    gare.ecart === 0 ? styles.vert : styles.ambre
                  }`}
                >
                  {ecart(gare.ecart)}
                </td>
                <td className={styles.cellule}>
                  <ProchainDepart gare={gare} />
                </td>
                <td className={`${styles.cellule} ${styles.derniere} ${styles.superviseur}`}>
                  {gare.superviseur.enLigne || gare.superviseur.horsLigneDepuisMinutes === null
                    ? t("gares.superviseurEnLigne", { nom: gare.superviseur.nom })
                    : t("gares.superviseurHorsLigne", {
                        nom: gare.superviseur.nom,
                        minutes: gare.superviseur.horsLigneDepuisMinutes,
                      })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ à traiter */

function LigneATraiter({
  element,
  maintenant,
  premiere,
}: {
  element: ATraiter;
  maintenant: string;
  premiere: boolean;
}) {
  const { t } = useTranslation("Controle");
  const repere = quand(element.quand, maintenant);
  const heure =
    repere.genre === "heure"
      ? repere.heure
      : repere.genre === "hier"
        ? t("aTraiter.hier")
        : repere.date;
  const ton = TON_A_TRAITER[element.type];
  return (
    <a
      href={destinationATraiter(element.type)}
      className={premiere ? styles.ligneATraiter : `${styles.ligneATraiter} ${styles.suite}`}
      data-type={element.type}
    >
      <span className={`${styles.point} ${CLASSE_POINT[ton]}`} />
      <span className={styles.texteATraiter}>{element.texte}</span>
      <span className={styles.quand}>{heure}</span>
    </a>
  );
}

function ATraiterListe({
  salle,
  lienActif,
}: {
  salle: SalleDeControle | undefined;
  lienActif: (href: string) => boolean;
}) {
  const { t } = useTranslation("Controle");
  // Un élément dont l'écran appartient à un module masqué n'est pas affiché : son écran n'existe plus.
  const visibles = (salle?.aTraiter ?? []).filter((x) => lienActif(destinationATraiter(x.type)));
  return (
    <div className={styles.panneau}>
      <div className={styles.barre}>
        <span>{t("aTraiter.titre", { count: visibles.length })}</span>
        <span className={styles.aide}>{t("aTraiter.aide")}</span>
      </div>
      {salle === undefined &&
        [1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.ligneSqueletteATraiter} aria-hidden="true">
            <Squelette className={styles.squeletteLigne} />
          </div>
        ))}
      {salle && visibles.length === 0 && (
        <p className={styles.messageATraiter} role="status">
          {t("aTraiter.vide")}
        </p>
      )}
      {salle &&
        visibles.map((element, i) => (
          <LigneATraiter
            key={element.id}
            element={element}
            maintenant={salle.instant}
            premiere={i === 0}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ ventes par heure */

function Ventes({ salle }: { salle: SalleDeControle | undefined }) {
  const { t } = useTranslation("Controle");
  const ventes = salle?.ventesParHeure;
  const liste = ventes ? barres(ventes.heures) : [];
  const axe = ventes ? reperesAxe(ventes.heures) : [];

  return (
    <div className={styles.ventes}>
      <div className={styles.enteteVentes}>
        <span>{t("ventes.titre")}</span>
        <span className={styles.aide}>{t("ventes.aide")}</span>
      </div>
      {salle === undefined ? (
        <Squelette className={styles.squeletteBarres} />
      ) : liste.length === 0 ? (
        <p className={styles.messageVentes} role="status">
          {t("ventes.vide")}
        </p>
      ) : (
        <>
          <div
            className={styles.barres}
            style={{ "--colonnes": liste.length } as CSSProperties}
            role="img"
            aria-label={t("ventes.libelle")}
          >
            {liste.map((barre) => (
              <span
                key={barre.heure}
                className={`${styles.colonneBarre} ${CLASSE_BARRE[barre.ton]}`}
                style={{ height: `${barre.hauteur}%` }}
                data-heure={barre.heure}
                data-ton={barre.ton}
              />
            ))}
          </div>
          <div className={styles.axe}>
            {axe.map((repere) => (
              <span key={repere.heure}>
                {t(repere.prevu ? "ventes.heurePrevu" : "ventes.heure", {
                  heure: String(repere.heure).padStart(2, "0"),
                })}
              </span>
            ))}
          </div>
          <span className={styles.lecture}>{ventes?.lecture}</span>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ rapport du soir */

function Rapport({
  salle,
  lienActif,
}: {
  salle: SalleDeControle | undefined;
  lienActif: (href: string) => boolean;
}) {
  const { t } = useTranslation("Controle");
  const rapport = salle?.rapport;
  const href = destinationRapport();
  const texte: ReactNode = rapport ? (
    <>
      {rapport.destinataires.superviseurs > 0
        ? t("rapport.envoi", {
            heure: heureDouala(rapport.envoiA),
            patron: rapport.destinataires.patron,
            count: rapport.destinataires.superviseurs,
          })
        : t("rapport.envoiSeul", {
            heure: heureDouala(rapport.envoiA),
            patron: rapport.destinataires.patron,
          })}{" "}
      {rapport.caissesAValider > 0
        ? t("rapport.caisses", { count: rapport.caissesAValider })
        : t("rapport.toutesValidees")}
    </>
  ) : (
    <Squelette className={styles.squeletteTexteRapport} />
  );
  return (
    <div className={styles.rapport}>
      <span className={styles.etiquetteRapport}>{t("rapport.titre")}</span>
      <span className={styles.texteRapport}>{texte}</span>
      {lienActif(href) && (
        <a href={href} className={styles.lienRapport}>
          {t("rapport.lien")}
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ l'écran */

/**
 * Salle de contrôle (planche Controle.dc.html, 1280 px, fluide jusqu'au téléphone) : l'en-tête avec les cinq vues et la
 * pastille « EN DIRECT », les cinq chiffres, la carte des bus, le tableau des gares, puis « À traiter », les ventes par
 * heure et le rapport du soir.
 */
export function VueControle(props: PropsVue) {
  const { t } = useTranslation("Controle");
  const { etat, onReessayer, lienActif } = props;
  const salle = etat === "pret" ? props.salle : undefined;

  return (
    <div
      className={styles.page}
      data-planche="Controle"
      data-etat={etat}
      aria-busy={etat === "chargement"}
    >
      <Entete {...props} />
      <main className={styles.principal}>
        {etat === "erreur" ? (
          <div className={styles.etat}>
            <div className={styles.bandeau} role="alert">
              <span className={styles.pointBandeau} />
              <p>{t("etats.erreur")}</p>
            </div>
            {onReessayer && (
              <button type="button" className={styles.reessayer} onClick={onReessayer}>
                {t("etats.reessayer")}
              </button>
            )}
          </div>
        ) : (
          <>
            <section
              className={styles.colonne}
              {...(etat === "chargement" ? { "aria-label": t("etats.chargement") } : {})}
            >
              <Chiffres salle={salle} />
              <Carte salle={salle} />
              <Gares salle={salle} lienActif={lienActif} />
            </section>
            <aside className={styles.lateral}>
              <ATraiterListe salle={salle} lienActif={lienActif} />
              <Ventes salle={salle} />
              <Rapport salle={salle} lienActif={lienActif} />
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
