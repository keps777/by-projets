import { voyageur } from "@afrimove/api-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { useModeDemo } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { ACCUEIL_ESPACE } from "@/coquille/roles";
import { useSession } from "@/coquille/session";
import { LANGUES, changerLangue, type Langue } from "@/i18n";
import { CarteJingle } from "./LecteurJingle";
import { LogoVolets } from "./LogoVolets";
import { creerJingleWebAudio, type Jingle } from "./jingle";
import { premiereOuvertureTerminee, terminerPremiereOuverture } from "./premiere-ouverture";
import styles from "./splash.module.css";

/** Noms des langues : écrits dans leur propre langue, donc identiques quelle que soit la langue choisie. */
const NOMS_LANGUES: Record<Langue, string> = { fr: "FR", en: "EN", pcm: "Pidgin" };

/** Heure de Douala (UTC+1, sans changement d'heure) au format « 07:38 ». */
function heureDouala(instant: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Douala",
  }).format(instant);
}

export interface PropsEcranSplash {
  /** Jingle remplaçable (tests, ou fichier audio plus tard). Par défaut : le jingle Web Audio. */
  jingle?: Jingle;
}

/**
 * Écran de première ouverture (AM-020, planche Splash, route /bienvenue) : logo à volets, signature, slogan, jingle
 * de 10 s, choix de la langue. Il n'apparaît qu'au premier lancement : une fois quitté par l'un de ses deux
 * boutons, l'application ouvre l'accueil du rôle. En mode démo (développement, banc de fidélité) il reste toujours
 * accessible.
 */
export function EcranSplash({ jingle }: PropsEcranSplash) {
  const demo = useModeDemo();
  const { role } = useSession();
  // Lu une seule fois : le bouton qui mémorise la fin du premier lancement ne doit pas renvoyer ailleurs que vers /connexion.
  const [dejaVu] = useState(() => !demo && premiereOuvertureTerminee());
  if (dejaVu) return <Navigate to={ACCUEIL_ESPACE[role]} replace />;
  return <Bienvenue {...(jingle ? { jingle } : {})} />;
}

function Bienvenue({ jingle }: PropsEcranSplash) {
  const { t, i18n } = useTranslation("Splash");
  const maintenant = useMaintenant();
  const lecteur = useMemo(() => jingle ?? creerJingleWebAudio(), [jingle]);
  const connexion = urlPlanche("Connexion");

  return (
    <div className={styles.ecran} data-planche="Splash">
      <header className={styles.haut}>
        <span className={styles.lieu}>{t("lieuEtHeure", { heure: heureDouala(maintenant) })}</span>
        <div role="group" aria-label={t("langue.groupe")} className={styles.langues}>
          {LANGUES.map((langue) => {
            const actif = i18n.language === langue;
            return (
              <button
                key={langue}
                type="button"
                aria-pressed={actif}
                className={styles.langue}
                data-actif={actif}
                onClick={() => void changerLangue(i18n, langue)}
              >
                {NOMS_LANGUES[langue]}
              </button>
            );
          })}
        </div>
      </header>

      <main className={styles.corps}>
        <h1 className={styles.titreEcran}>{t("ecrans.Splash.titre", { ns: "translation" })}</h1>
        <LogoVolets libelle={t("logo")} />
        <div className={styles.marque}>
          <span className={styles.nom}>AfriMove</span>
          <span className={styles.signature}>{t("signature")}</span>
        </div>
        <p className={styles.slogan}>
          {t("slogan.ligne1")}
          <br />
          <span className={styles.sloganAccent}>{t("slogan.ligne2")}</span>
        </p>
        <CarteJingle jingle={lecteur} />
      </main>

      <div className={styles.bas}>
        <a href={connexion} className={styles.principal} onClick={terminerPremiereOuverture}>
          {t("actions.principale")}
        </a>
        <a href={connexion} className={styles.secondaire} onClick={terminerPremiereOuverture}>
          {t("actions.secondaire")}
        </a>
        <MentionPied />
      </div>
    </div>
  );
}

/**
 * Mention du pied. Le nombre de compagnies partenaires vient de l'API (`useReseau`), jamais du texte : pendant la
 * lecture il est remplacé par une barre qui pulse, et s'il est absent (zéro, erreur, hors ligne) la mention
 * reste lisible sans lui, sans bouger la mise en page.
 */
function MentionPied() {
  const { t } = useTranslation("Splash");
  const reseau = voyageur.useReseau({}, { networkMode: "always", retry: false });
  const compagnies = reseau.data?.compagnies ?? 0;
  const enChargement = reseau.isPending;

  return (
    <span className={styles.mention} aria-busy={enChargement}>
      {t("pied.debut")}
      {enChargement ? (
        <>
          {" · "}
          <span className={styles.compteChargement} aria-hidden="true" />
        </>
      ) : compagnies > 0 ? (
        <>
          {" · "}
          {t("pied.compagnies", { count: compagnies })}
        </>
      ) : null}
      {" · "}
      {t("pied.fin")}
    </span>
  );
}
