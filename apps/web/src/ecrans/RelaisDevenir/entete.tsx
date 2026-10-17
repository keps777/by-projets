import { Entete, Pastille } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./relais-devenir.module.css";

/**
 * En-tête de la planche : retour vers Moi, titre, sous-titre et pastille ambre « 200 F / COLIS ». Pendant le
 * chargement et dans les états sans programme, il garde le retour et le titre.
 */
export function EnteteDevenir({
  titre,
  sousTitre,
  badge,
}: {
  titre?: string | undefined;
  sousTitre?: ReactNode;
  badge?: string | undefined;
}) {
  const { t } = useTranslation("RelaisDevenir");
  return (
    <Entete
      className={styles.entete}
      titre={titre ?? t("entete.titre")}
      {...(sousTitre !== undefined ? { sousTitre } : {})}
      retour={{ libelle: t("entete.retour"), href: urlPlanche("Moi") }}
      {...(badge !== undefined ? { droite: <Pastille statut="modifier" libelle={badge} /> } : {})}
    />
  );
}
