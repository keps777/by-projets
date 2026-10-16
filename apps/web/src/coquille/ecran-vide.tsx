import { Entete, EcranCorps } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { PLANCHES, type Planche } from "./planches";

/**
 * Écran vide titré : placeholder de chaque route tant que son ticket d'écran n'est pas fait. Le ticket d'écran
 * remplace le contenu de SON fichier de route (et crée `src/ecrans/<Planche>/`), sans toucher aux layouts.
 */
export function EcranVide({ planche }: { planche: Planche }) {
  const { t } = useTranslation();
  return (
    <>
      <Entete
        titre={t(`ecrans.${planche}.titre`)}
        sousTitre={`${t("coquille.ecranVide.etiquette")} · ${PLANCHES[planche].tickets}`}
      />
      <EcranCorps data-planche={planche} />
    </>
  );
}
