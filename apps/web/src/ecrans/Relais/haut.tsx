import type { colis as contrats } from "@afrimove/contrats";
import { BoutonIcone, IconeRetour } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { Carte } from "./carte";
import styles from "./relais.module.css";

/** Retour vers le colis (ColisCode), ou vers l'accueil quand l'adresse n'a pas d'identifiant de colis. */
export function adresseColis(colisId: string): string {
  return colisId === "" ? urlPlanche("Main") : urlPlanche("ColisCode", { colisId });
}

/**
 * Haut de la planche : la carte (340 px), le bouton « Retour » rond posé dessus, et le titre en bas de la carte. Le h1
 * (titre de l'écran, clé commune de la coquille) est masqué ; la planche dessine le sien en simple texte. Sans
 * données (chargement, erreur), la carte reste vide et le titre disparaît : la mise en page ne bouge pas.
 */
export function Haut({
  colisId,
  carte,
  titre,
}: {
  colisId: string;
  carte?: { reperes: contrats.RelaisProches["reperes"]; libelle: string };
  titre?: { etiquette: string; sousTitre: string };
}) {
  const { t } = useTranslation("Relais");
  return (
    <div className={styles.haut}>
      <h1 className={styles.titreEcran}>{t("ecrans.Relais.titre", { ns: "translation" })}</h1>
      <Carte reperes={carte?.reperes ?? []} libelle={carte?.libelle ?? t("carte.vide")} />
      <BoutonIcone
        className={styles.retour}
        href={adresseColis(colisId)}
        aria-label={t("retour")}
        icone={<IconeRetour taille={20} />}
      />
      {titre && (
        <div className={styles.entete}>
          <span className={styles.etiquette}>{titre.etiquette}</span>
          <span className={styles.sousTitre}>{titre.sousTitre}</span>
        </div>
      )}
    </div>
  );
}
