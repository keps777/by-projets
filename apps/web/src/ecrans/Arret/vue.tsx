import type { voyageur as c } from "@afrimove/contrats";
import { Bouton, BoutonIcone, EcranCorps, IconeRetour, Pastille } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CarteBus, SqueletteBus } from "./bus";
import { IconeHorloge } from "./icones";
import { CarteLigne, SqueletteLigne } from "./ligne";
import styles from "./arret.module.css";

export type EtatArret = "chargement" | "erreur" | "vide" | "pret";

export interface PropsVueArret {
  etat: EtatArret;
  /** Offres renvoyées par le serveur ; absentes tant qu'elles ne sont pas arrivées. */
  offres: c.OffresMonteeEnRoute | undefined;
  onReessayer: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function EnTete({ offres }: { offres: c.OffresMonteeEnRoute | undefined }) {
  const { t } = useTranslation("Arret");
  return (
    <header className={styles.entete}>
      <h1 className={styles.titreEcran}>{t("ecrans.Arret.titre", { ns: "translation" })}</h1>
      <BoutonIcone
        href={urlPlanche("Main")}
        aria-label={t("retour")}
        icone={<IconeRetour taille={20} />}
      />
      <div className={styles.textes}>
        <span className={styles.titre}>{t("titre")}</span>
        <span className={styles.position}>
          {offres ? t("position", { arret: offres.arret.nom }) : t("positionInconnue")}
        </span>
      </div>
      {offres ? (
        offres.arret.gps && <Pastille statut="direct" libelle={t("gps")} />
      ) : (
        <Squelette className={styles.squelettePastille} />
      )}
    </header>
  );
}

function Contenu({ etat, offres, onReessayer }: PropsVueArret) {
  const { t } = useTranslation("Arret");

  if (etat === "erreur") {
    return (
      <div className={styles.message} role="alert">
        <p>{t("etats.erreur")}</p>
        <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
      </div>
    );
  }

  if (etat === "chargement" || !offres) {
    return (
      <div
        className={styles.liste}
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <SqueletteLigne />
        <SqueletteBus />
        <SqueletteBus />
        <SqueletteBus />
      </div>
    );
  }

  // Le plus proche en premier : c'est lui qu'on entoure d'ambre.
  const bus = [...offres.bus].sort((a, b) => a.passeDansMinutes - b.passeDansMinutes);
  return (
    <>
      <CarteLigne ligne={offres.ligne} />
      {bus.length === 0 ? (
        <div className={styles.message} role="status">
          <p>{t("etats.vide")}</p>
        </div>
      ) : (
        bus.map((b, index) => (
          <CarteBus
            key={b.departId}
            bus={b}
            ligne={offres.ligne}
            arretId={offres.arret.id}
            premier={index === 0}
          />
        ))
      )}
    </>
  );
}

/**
 * Monter en route : où est le voyageur sur la ligne, puis les bus qui passent avec des places (heure, délai,
 * compagnie, places, arrivée, prix au prorata), et la note qui explique que payer bloque la place. La barre
 * d'onglets est posée par le layout du voyageur.
 */
export function VueArret(props: PropsVueArret) {
  const { t } = useTranslation("Arret");
  return (
    <>
      <EnTete offres={props.offres} />
      <EcranCorps
        className={styles.corps}
        data-planche="Arret"
        data-etat={props.etat}
        aria-busy={props.etat === "chargement"}
      >
        <Contenu {...props} />
        <div className={styles.note}>
          <IconeHorloge />
          {t("note")}
        </div>
      </EcranCorps>
    </>
  );
}
