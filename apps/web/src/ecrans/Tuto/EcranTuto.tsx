import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { useModeDemo } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { IconeSuivant } from "./icones";
import { marquerTutorielVu, tutorielVu } from "./vu";
import styles from "./tuto.module.css";

/** Les trois écrans du tutoriel, dans l'ordre : billet, colis, proches. */
const DIAPOS = ["billet", "colis", "proches"] as const;
type Diapo = (typeof DIAPOS)[number];
export const NOMBRE_DIAPOS = DIAPOS.length;

/** Départ montré dans l'exemple du premier écran (donnée de la planche : le tutoriel n'a pas d'appel d'API). */
const DEPART_EXEMPLE = { heure: "08:00", compagnie: "Bêta Express VIP", places: 9 } as const;

/**
 * Planche « Tuto » (AM-022, route /tutoriel) : trois écrans glissables après la première connexion. « Passer » et le
 * dernier « Suivant » ouvrent l'accueil voyageur ; le tutoriel n'est montré qu'une fois (en mode démo, il reste
 * toujours accessible, comme la bienvenue).
 */
export function EcranTuto() {
  const demo = useModeDemo();
  // Lu une seule fois : marquer le tutoriel comme vu en le quittant ne doit pas déclencher la redirection.
  const [dejaVu] = useState(() => !demo && tutorielVu());
  if (dejaVu) return <Navigate to={urlPlanche("Main")} replace />;
  return <Tutoriel />;
}

function mouvementReduit(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function Tutoriel() {
  const { t } = useTranslation("Tuto");
  const navigate = useNavigate();
  const accueil = urlPlanche("Main");
  const [index, setIndex] = useState(0);
  const piste = useRef<HTMLDivElement>(null);
  const dernier = index === NOMBRE_DIAPOS - 1;

  function aller(cible: number) {
    setIndex(cible);
    const element = piste.current;
    if (element && typeof element.scrollTo === "function") {
      element.scrollTo({
        left: cible * element.clientWidth,
        behavior: mouvementReduit() ? "auto" : "smooth",
      });
    }
  }

  /** Le balayage est celui du navigateur (défilement aimanté) : l'écran courant se déduit de la position. */
  function surDefilement() {
    const element = piste.current;
    if (!element || element.clientWidth === 0) return;
    const rang = Math.round(element.scrollLeft / element.clientWidth);
    setIndex(Math.min(NOMBRE_DIAPOS - 1, Math.max(0, rang)));
  }

  function surSuivant() {
    if (!dernier) {
      aller(index + 1);
      return;
    }
    marquerTutorielVu();
    void navigate(accueil);
  }

  return (
    <div className={styles.ecran} data-planche="Tuto">
      <header className={styles.haut}>
        <span className={styles.barres} aria-hidden="true">
          {DIAPOS.map((diapo) => (
            <span key={diapo} className={styles.barre} />
          ))}
        </span>
        <a href={accueil} className={styles.passer} onClick={marquerTutorielVu}>
          {t("passer")}
        </a>
      </header>

      <main className={styles.corps}>
        <h1 className={styles.titreEcran}>{t("ecrans.Tuto.titre", { ns: "translation" })}</h1>
        <div
          ref={piste}
          className={styles.piste}
          role="region"
          aria-roledescription="carrousel"
          aria-label={t("carrousel")}
          tabIndex={0}
          onScroll={surDefilement}
        >
          {DIAPOS.map((diapo, rang) => (
            <section
              key={diapo}
              className={styles.diapo}
              aria-roledescription="diapositive"
              aria-label={t("diapo", { n: rang + 1, total: NOMBRE_DIAPOS })}
              aria-hidden={rang !== index}
              data-actif={rang === index}
            >
              <span className={styles.etape}>
                {t("etape", { n: rang + 1, total: NOMBRE_DIAPOS })}
              </span>
              <div className={styles.carte}>
                <div className={styles.exemple} aria-hidden="true">
                  <Exemple diapo={diapo} />
                </div>
                <div className={styles.textes}>
                  <h2 className={styles.titre}>
                    <Lignes texte={t(`diapos.${diapo}.titre`)} />
                  </h2>
                  <p className={styles.texte}>{t(`diapos.${diapo}.texte`)}</p>
                </div>
              </div>
              <div className={styles.suite}>
                {DIAPOS.map((autre, rangAutre) =>
                  autre === diapo ? null : (
                    <div key={autre} className={styles.apercu}>
                      <span className={styles.rang}>
                        {t("rang", { n: rangAutre + 1, total: NOMBRE_DIAPOS })}
                      </span>
                      <span className={styles.apercuTitre}>
                        {t(`diapos.${autre}.titre`).replace("\n", " ")}
                      </span>
                      <span className={styles.apercuDetail}>{t(`diapos.${autre}.detail`)}</span>
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </main>

      <div className={styles.bas}>
        <button type="button" className={styles.suivant} onClick={surSuivant}>
          {t("suivant")}
          <IconeSuivant />
        </button>
        <div className={styles.points} aria-hidden="true">
          {DIAPOS.map((diapo, rang) => (
            <span key={diapo} className={styles.point} data-actif={rang === index} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Un titre peut tenir sur deux lignes : le saut est écrit `\n` dans les textes. */
function Lignes({ texte }: { texte: string }) {
  const lignes = texte.split("\n");
  return (
    <>
      {lignes.map((ligne, i) => (
        <Fragment key={ligne}>
          {i > 0 && <br />}
          {ligne}
        </Fragment>
      ))}
    </>
  );
}

/** Pastille numérotée d'une touche (1, 2, 3). */
function Touche({ n, inverse = false }: { n: number; inverse?: boolean }) {
  return (
    <span className={styles.touche} data-inverse={inverse}>
      {n}
    </span>
  );
}

/** Petite image de l'écran : sur le premier, le parcours en trois touches de la planche. */
function Exemple({ diapo }: { diapo: Diapo }) {
  const { t } = useTranslation("Tuto");
  if (diapo === "billet") {
    return (
      <>
        <div className={styles.depart}>
          <span className={styles.heure}>{DEPART_EXEMPLE.heure}</span>
          <span className={styles.departTextes}>
            <span className={styles.compagnie}>{DEPART_EXEMPLE.compagnie}</span>
            <span className={styles.places}>
              {t("exemple.places", { n: DEPART_EXEMPLE.places })}
            </span>
          </span>
          <Touche n={1} />
        </div>
        <div className={styles.siege}>
          <span className={styles.rangee}>
            <span className={styles.place} data-etat="pris" />
            <span className={styles.place} data-etat="libre" />
            <span />
            <span className={styles.place} data-etat="choisi" />
            <span className={styles.place} data-etat="libre" />
          </span>
          <span className={styles.consigne}>{t("exemple.choisis")}</span>
          <Touche n={2} />
        </div>
        <div className={styles.payer}>
          <span className={styles.payerLibelle}>{t("exemple.payer")}</span>
          <Touche n={3} inverse />
        </div>
      </>
    );
  }
  const etapes =
    diapo === "colis" ? (["photo", "code", "livraison"] as const) : (["direct", "sms"] as const);
  return (
    <>
      {etapes.map((etape, i) => (
        <div key={etape} className={styles.etapeExemple} data-derniere={i === etapes.length - 1}>
          <span className={styles.etapeLibelle}>{t(`diapos.${diapo}.etapes.${etape}`)}</span>
          <Touche n={i + 1} inverse={i === etapes.length - 1} />
        </div>
      ))}
    </>
  );
}
