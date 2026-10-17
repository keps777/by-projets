import {
  BandeauAssistant,
  Bouton,
  ChiffreCle,
  EcranCorps,
  LigneAlerte,
  ListeGlissable,
  Pastille,
  TuileKpi,
} from "@afrimove/ui";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MODULES, moduleDeLUrl, useModules } from "@/coquille/modules";
import { urlPlanche } from "@/coquille/planches";
import { TON_ALERTE, destinationAlerte, type GareConnue } from "./destinations";
import type { Alerte, TableauDuJour } from "./direct";
import { ecart, heureDouala, quandAlerte, recetteCourte, taux, variation } from "./formats";
import { LogoCompagnie } from "./icones";
import styles from "./patron.module.css";
import { TUILES } from "./tuiles";

export type EtatBloc = "chargement" | "erreur" | "vide" | "pret";

export interface PropsAccueilVue {
  /** Le tableau du jour (chiffres, en-tête, assistant), présent quand `etat` vaut `pret`. */
  etat: EtatBloc;
  tableau?: TableauDuJour | undefined;
  /** Les alertes du jour (le direct déjà ajouté), présentes quand `etatAlertes` vaut `pret`. */
  etatAlertes: EtatBloc;
  alertes?: readonly Alerte[] | undefined;
  /** Les gares du patron : retrouvent celle d'une alerte d'écart de caisse. */
  gares?: readonly GareConnue[] | undefined;
  /** Instant de référence des repères « 14:00 » / « hier » : celui du tableau du jour, ou l'horloge du client à défaut. */
  instant: string;
  onReessayer?: () => void;
  onReessayerAlertes?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** « 3e en 10 jours » -> « 3<sup>e</sup> en 10 jours » : la planche écrit les rangs en exposant. */
function avecExposants(texte: string): ReactNode {
  const morceaux = texte.split(/(\d+)(er|e)(?=\s|$)/);
  if (morceaux.length === 1) return texte;
  const noeuds: ReactNode[] = [];
  for (let i = 0; i < morceaux.length; i += 3) {
    noeuds.push(<Fragment key={i}>{morceaux[i]}</Fragment>);
    const nombre = morceaux[i + 1];
    if (nombre !== undefined) {
      noeuds.push(
        <Fragment key={`${i}e`}>
          {nombre}
          <sup>{morceaux[i + 2]}</sup>
        </Fragment>,
      );
    }
  }
  return noeuds;
}

function Entete({ etat, tableau }: { etat: EtatBloc; tableau: TableauDuJour | undefined }) {
  const { t } = useTranslation("Patron");
  return (
    <header className={styles.entete}>
      {/* Le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran ; la planche n'en montre pas
          d'autre que le nom de la compagnie. */}
      <h1 className={styles.titreEcran}>{t("ecrans.Patron.titre", { ns: "translation" })}</h1>
      <span className={styles.marque}>
        <span className={styles.logo}>
          <LogoCompagnie />
        </span>
        <span className={styles.textes}>
          {tableau ? (
            <>
              <span className={styles.titre}>{tableau.compagnie}</span>
              <span className={styles.sousTitre}>
                {t("entete.sousTitre", {
                  patron: tableau.patron,
                  gares: t("entete.gares", { count: tableau.nbGares }),
                  bus: t("entete.bus", { count: tableau.nbBus }),
                })}
              </span>
            </>
          ) : etat === "chargement" ? (
            <>
              <Squelette className={styles.squeletteTitre} />
              <Squelette className={styles.squeletteSousTitre} />
            </>
          ) : null}
        </span>
      </span>
      {tableau ? (
        <Pastille statut="direct" libelle={heureDouala(tableau.instant)} />
      ) : etat === "chargement" ? (
        <Squelette className={styles.squelettePastille} />
      ) : null}
    </header>
  );
}

function Bandeau({
  role,
  texte,
  onReessayer,
}: {
  role: "alert" | "status";
  texte: string;
  onReessayer?: (() => void) | undefined;
}) {
  const { t } = useTranslation("Patron");
  return (
    <div className={styles.etat}>
      <div className={styles.bandeau} role={role}>
        <span className={styles.point} />
        <p>{texte}</p>
      </div>
      {onReessayer && (
        <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
      )}
    </div>
  );
}

/** La grande carte « Aujourd'hui · en direct » : recette, variation, quatre chiffres. */
function Chiffres({ etat, tableau }: { etat: EtatBloc; tableau: TableauDuJour | undefined }) {
  const { t } = useTranslation("Patron");
  const jour = tableau?.jour;
  const chargement = etat === "chargement";
  return (
    <TuileKpi
      taille="affiche"
      etiquette={t("jour.etiquette")}
      etiquetteAmbre
      {...(jour ? { note: t("jour.comparaison", { jour: jour.comparaison }) } : {})}
      valeur={
        jour ? recetteCourte(jour.recette) : <Squelette className={styles.squeletteRecette} />
      }
      {...(jour
        ? {
            tendance: variation(jour.variationPct),
            etatTendance: jour.variationPct < 0 ? ("rouge" as const) : ("vert" as const),
          }
        : {})}
      {...(chargement ? { ariaLabel: t("etats.chargement") } : {})}
      className={styles.chiffres}
    >
      <div className={styles.grille4}>
        <ChiffreCle
          valeur={jour ? String(jour.billets) : <Squelette className={styles.squeletteChiffre} />}
          libelle={t("jour.billets")}
        />
        <ChiffreCle
          valeur={jour ? String(jour.colis) : <Squelette className={styles.squeletteChiffre} />}
          libelle={t("jour.colis")}
        />
        <ChiffreCle
          valeur={
            jour ? taux(jour.remplissagePct) : <Squelette className={styles.squeletteChiffre} />
          }
          libelle={t("jour.remplissage")}
        />
        <ChiffreCle
          valeur={jour ? ecart(jour.ecartTotal) : <Squelette className={styles.squeletteChiffre} />}
          libelle={t("jour.ecart")}
          etat={jour && jour.ecartTotal !== 0 ? "ambre" : "neutre"}
        />
      </div>
    </TuileKpi>
  );
}

function Alertes({
  etat,
  alertes,
  instant,
  gares,
  onReessayer,
}: {
  etat: EtatBloc;
  alertes: readonly Alerte[] | undefined;
  instant: string;
  gares: readonly GareConnue[] | undefined;
  onReessayer?: (() => void) | undefined;
}) {
  const { t } = useTranslation("Patron");
  const { moduleActif } = useModules();

  // Une alerte dont l'écran appartient à un module masqué n'est pas affichée : son écran n'existe plus, elle
  // n'aurait aucune destination.
  const visibles = (alertes ?? [])
    .map((alerte) => ({ alerte, href: destinationAlerte(alerte, gares) }))
    .filter(({ href }) => {
      const module = moduleDeLUrl(href);
      return module === null || moduleActif(module);
    });

  const mention = t("alertes.mention");
  return (
    <ListeGlissable
      titre={t("alertes.titre", { count: etat === "pret" ? visibles.length : 0 })}
      mention={mention}
      hauteur="libre"
      className={styles.alertes}
    >
      {etat === "chargement" &&
        [1, 2, 3].map((i) => (
          <li key={i} className={styles.alerteSquelette} aria-hidden="true">
            <Squelette className={styles.squeletteLigneAlerte} />
          </li>
        ))}
      {etat === "erreur" && (
        <li className={styles.alerteMessage}>
          <p role="alert">{t("etats.erreurAlertes")}</p>
          {onReessayer && (
            <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
          )}
        </li>
      )}
      {etat === "pret" && visibles.length === 0 && (
        <li className={styles.alerteMessage}>
          <p role="status">{t("alertes.aucune")}</p>
        </li>
      )}
      {etat === "pret" &&
        visibles.map(({ alerte, href }) => {
          const quand = quandAlerte(alerte.quand, instant);
          const heure =
            quand.genre === "heure"
              ? quand.heure
              : quand.genre === "hier"
                ? t("alertes.hier")
                : quand.date;
          return (
            <LigneAlerte
              key={alerte.id}
              etat={TON_ALERTE[alerte.categorie]}
              href={href}
              texte={avecExposants(alerte.texte)}
              heure={heure}
            />
          );
        })}
    </ListeGlissable>
  );
}

/**
 * Accueil du patron, tout à une touche : l'en-tête de la compagnie avec l'heure, les chiffres du jour contre la
 * semaine dernière, l'assistant, neuf tuiles et les alertes qui défilent. La barre d'onglets (Aujourd'hui · Analyses ·
 * Gares · Réglages) est posée par le layout de l'espace patron.
 *
 * Les tuiles ne dépendent pas des données : elles restent utilisables pendant le chargement et en cas d'erreur.
 * Un module masqué retire sa tuile (et le bandeau de l'assistant, et les alertes qui mènent à son écran).
 */
export function AccueilVue({
  etat,
  tableau,
  etatAlertes,
  alertes,
  gares,
  instant,
  onReessayer,
  onReessayerAlertes,
}: PropsAccueilVue) {
  const { t } = useTranslation("Patron");
  const { moduleActif } = useModules();
  const donnees = etat === "pret" ? tableau : undefined;

  const actif = (href: string): boolean => {
    const module = moduleDeLUrl(href);
    return module === null || moduleActif(module);
  };
  const hrefAssistant = urlPlanche("Assistant");
  const nbInsights = donnees?.assistant.nbInsights ?? 0;
  const detailAssistant = donnees?.assistant.apercus.join(" · ");

  return (
    <>
      <Entete etat={etat} tableau={donnees} />

      <EcranCorps
        className={styles.corps}
        data-planche="Patron"
        data-etat={etat}
        aria-busy={etat === "chargement" || etatAlertes === "chargement"}
      >
        {(etat === "vide" || etat === "erreur") && (
          <Bandeau
            role={etat === "erreur" ? "alert" : "status"}
            texte={t(etat === "erreur" ? "etats.erreur" : "etats.vide")}
            onReessayer={etat === "erreur" ? onReessayer : undefined}
          />
        )}

        {(etat === "chargement" || donnees) && <Chiffres etat={etat} tableau={donnees} />}

        {etat === "chargement" && actif(hrefAssistant) && (
          <Squelette className={styles.squeletteAssistant} />
        )}
        {donnees && nbInsights > 0 && actif(hrefAssistant) && (
          <BandeauAssistant
            titre={t("assistant.titre", { count: nbInsights })}
            {...(detailAssistant ? { detail: detailAssistant } : {})}
            href={hrefAssistant}
            className={styles.assistant}
          />
        )}

        <div className={styles.tuiles}>
          {TUILES.map((tuile) => {
            const href = urlPlanche(tuile.planche);
            if (!actif(href)) return null;
            const detail =
              tuile.cle === "gares"
                ? donnees
                  ? t("tuiles.gares.detail", { count: donnees.nbPersonnes })
                  : t("tuiles.gares.detailSansEffectif")
                : tuile.cle === "modules"
                  ? t("tuiles.modules.detail", { count: MODULES.length })
                  : t(`tuiles.${tuile.cle}.detail`);
            return (
              <a key={tuile.cle} className={styles.tuile} href={href}>
                {tuile.icone}
                <span className={styles.tuileTexte}>
                  {t(`tuiles.${tuile.cle}.titre`)} <br />
                  <span className={styles.tuileDetail}>{detail}</span>
                </span>
              </a>
            );
          })}
        </div>

        <Alertes
          etat={etatAlertes}
          alertes={alertes}
          instant={instant}
          gares={gares}
          onReessayer={onReessayerAlertes}
        />
      </EcranCorps>
    </>
  );
}
