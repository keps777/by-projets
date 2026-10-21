import type { voyageur as c } from "@afrimove/contrats";
import { Bouton, BoutonIcone, EcranCorps, IconeRetour, Pastille } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CarteReseau } from "./carte";
import { heureDouala } from "./formats";
import { LigneReseau } from "./ligne";
import styles from "./reseau.module.css";

export type EtatReseau = "chargement" | "erreur" | "vide" | "pret";

export interface PropsVueReseau {
  etat: EtatReseau;
  /** Aperçu du réseau renvoyé par le serveur ; absent tant qu'il n'est pas arrivé. */
  apercu: c.ApercuReseau | undefined;
  /** Filtre affiché comme choisi (celui touché, sinon celui du serveur). */
  filtreActif: string | undefined;
  onFiltre: (filtre: string) => void;
  onReessayer: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function EnTete({ apercu }: { apercu: c.ApercuReseau | undefined }) {
  const { t } = useTranslation("Reseau");
  return (
    <header className={styles.entete}>
      <h1 className={styles.titreEcran}>{t("ecrans.Reseau.titre", { ns: "translation" })}</h1>
      <BoutonIcone
        href={urlPlanche("Main")}
        aria-label={t("retour")}
        icone={<IconeRetour taille={20} />}
      />
      <div className={styles.textes}>
        <span className={styles.titre}>{t("titre")}</span>
        {apercu ? (
          <span className={styles.resume}>
            {[
              t("resume.compagnies", { count: apercu.compagnies }),
              t("resume.busEnRoute", { count: apercu.busEnRoute }),
              t("resume.departsAVenir", { count: apercu.departsAVenir }),
            ].join(" · ")}
          </span>
        ) : (
          <Squelette className={styles.squeletteResume} />
        )}
      </div>
      {apercu ? (
        <Pastille statut="direct" libelle={heureDouala(apercu.maintenant)} />
      ) : (
        <Squelette className={styles.squelettePastille} />
      )}
    </header>
  );
}

function Filtres({
  apercu,
  filtreActif,
  onFiltre,
}: Pick<PropsVueReseau, "apercu" | "filtreActif" | "onFiltre">) {
  return (
    <div className={styles.filtres}>
      {apercu
        ? apercu.filtres.map((filtre) => (
            <button
              key={filtre}
              type="button"
              className={styles.filtre}
              aria-pressed={filtre === filtreActif}
              onClick={() => onFiltre(filtre)}
            >
              {filtre}
            </button>
          ))
        : [0, 1, 2, 3, 4, 5].map((i) => <Squelette key={i} className={styles.squeletteFiltre} />)}
    </div>
  );
}

function Lignes({
  etat,
  apercu,
  onReessayer,
}: Pick<PropsVueReseau, "etat" | "apercu" | "onReessayer">) {
  const { t } = useTranslation("Reseau");

  if (etat === "chargement") {
    return (
      <div
        className={styles.etatListe}
        role="status"
        aria-label={t("lignes.chargement")}
        aria-busy="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.ligneSquelette}>
            <span className={styles.squeletteTextes}>
              <Squelette className={styles.squeletteTrajet} />
              <Squelette className={styles.squeletteDetail} />
            </span>
            <Squelette className={styles.squelettePrix} />
          </div>
        ))}
      </div>
    );
  }
  if (etat === "erreur") {
    return (
      <div className={styles.messageListe} role="alert">
        <p>{t("lignes.erreur")}</p>
        <Bouton variante="secondaire" libelle={t("lignes.reessayer")} onClick={onReessayer} />
      </div>
    );
  }
  if (etat === "vide" || !apercu) {
    return (
      <div className={styles.messageListe} role="status">
        <p>{t("lignes.vide")}</p>
      </div>
    );
  }
  return (
    <>
      {apercu.lignes.map((ligne) => (
        <LigneReseau key={ligne.id} ligne={ligne} maintenant={apercu.maintenant} />
      ))}
    </>
  );
}

/**
 * Le réseau en direct : en-tête (retour, résumé du réseau, heure en direct), filtres par compagnie ou classe,
 * carte, puis les lignes avec leurs prochains départs. La barre d'onglets est posée par le layout du voyageur.
 */
export function VueReseau(props: PropsVueReseau) {
  const { t } = useTranslation("Reseau");
  const { etat, apercu } = props;
  return (
    <>
      <EnTete apercu={apercu} />
      <Filtres apercu={apercu} filtreActif={props.filtreActif} onFiltre={props.onFiltre} />
      <div className={styles.carte}>
        <CarteReseau villes={apercu?.villes} />
      </div>
      <EcranCorps
        className={styles.corps}
        data-planche="Reseau"
        data-etat={etat}
        aria-busy={etat === "chargement"}
      >
        <div className={styles.enteteListe}>
          <span>{t("lignes.titre")}</span>
          <span className={styles.aide}>{t("lignes.aide")}</span>
        </div>
        <Lignes etat={etat} apercu={apercu} onReessayer={props.onReessayer} />
      </EcranCorps>
    </>
  );
}
