import { BoutonIcone, IconeRetour } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./direct.module.css";

/**
 * Bloc du haut : la carte (ou son squelette) avec « Retour au billet » par-dessus. Le retour reste là dans tous les
 * états, y compris le chargement et l'erreur : rien n'est grisé.
 */
export function HautDeCarte({
  billetId,
  children,
  enAttente = false,
}: {
  billetId: string;
  children?: ReactNode;
  enAttente?: boolean;
}) {
  const { t } = useTranslation("Direct");
  return (
    <div className={enAttente ? `${styles.carte} am-pulse` : styles.carte}>
      {children}
      {billetId !== "" && (
        <BoutonIcone
          className={styles.retour}
          href={urlPlanche("Pass", { billetId })}
          aria-label={t("retour")}
          icone={<IconeRetour taille={20} />}
        />
      )}
    </div>
  );
}

/** Titre de l'écran pour les lecteurs d'écran : la planche n'en montre pas. */
export function TitreEcran() {
  const { t } = useTranslation();
  return <h1 className={styles.titreEcran}>{t("ecrans.Direct.titre")}</h1>;
}
