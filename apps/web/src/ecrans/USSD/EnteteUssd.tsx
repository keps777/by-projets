import { Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";

/** En-tête de la planche (retour vers l'accueil voyageur, titre, sous-titre), gardé dans tous les états. */
export function EnteteUssd() {
  const { t } = useTranslation("USSD");
  return (
    <Entete
      espace="ample"
      titre={t("titre")}
      sousTitre={t("sousTitre")}
      retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
    />
  );
}
