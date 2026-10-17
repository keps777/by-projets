import { BoutonIcone, IconeCoche, IconeRetour } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { IconePartager } from "./icones";
import styles from "./pass.module.css";

export type TonStatut = "vert" | "ambre" | "rouge" | "neutre";

export interface StatutBillet {
  /** Clé i18n du texte de la pastille, sous `statut.`. */
  cle: string;
  ton: TonStatut;
}

/**
 * En-tête de la planche : retour à l'accueil (rond de 44 px), pastille d'état du billet, partager. Pas de titre
 * visible : la planche n'en a pas, le titre de l'écran (clé commune de la coquille) est lu par les lecteurs d'écran.
 * Sans billet (chargement, vide, erreur), seul le retour reste : rien n'est grisé.
 */
export function EnteteBillet({
  statut,
  onPartager,
}: {
  statut?: StatutBillet;
  onPartager?: () => void;
}) {
  const { t } = useTranslation("Pass");
  return (
    <header className={styles.entete}>
      <h1 className={styles.titreEcran}>{t("ecrans.Pass.titre", { ns: "translation" })}</h1>
      <BoutonIcone
        href={urlPlanche("Main")}
        aria-label={t("retour")}
        icone={<IconeRetour taille={20} />}
      />
      {statut !== undefined && (
        <span className={styles.statut} data-ton={statut.ton}>
          {statut.ton === "vert" && <IconeCoche taille={14} trait={2.6} />}
          {t(`statut.${statut.cle}`)}
        </span>
      )}
      {onPartager !== undefined && (
        <BoutonIcone
          className={styles.partager}
          aria-label={t("partager.libelle")}
          icone={<IconePartager />}
          onClick={onPartager}
        />
      )}
    </header>
  );
}
