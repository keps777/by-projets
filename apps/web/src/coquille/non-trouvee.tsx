import { Bouton, Ecran, EcranCorps, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { ACCUEIL_ESPACE } from "./roles";
import { useSession } from "./session";

/** Page « introuvable » : adresse inconnue, ou route retirée parce que son module est masqué. */
export function NonTrouvee() {
  const { t } = useTranslation();
  const { role } = useSession();
  return (
    <Ecran data-espace="introuvable">
      <Entete titre={t("coquille.introuvable.titre")} />
      <EcranCorps>
        <Bouton
          variante="secondaire"
          libelle={t("coquille.introuvable.retour")}
          href={ACCUEIL_ESPACE[role]}
        />
      </EcranCorps>
    </Ecran>
  );
}
