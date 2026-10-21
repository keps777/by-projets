import { EcranCorps, Entete, Ecran } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ACCUEIL_ESPACE, ESPACES, LIBELLES_ROLES } from "./roles";
import { SelecteurRole } from "./selecteur-role";
import styles from "./layouts-speciaux.module.css";

/**
 * /dev/roles : choix du rôle de démonstration et accès direct à l'accueil de chaque espace. Sert sur
 * téléphone, où le sélecteur flottant (ordinateur) est caché.
 */
export function PageRoles() {
  const { t } = useTranslation();
  return (
    <Ecran data-espace="dev">
      <Entete titre={t("coquille.demo.roles")} sousTitre={t("coquille.demo.titre")} />
      <EcranCorps>
        <SelecteurRole />
        <nav className={styles.liens} aria-label={t("coquille.demo.ouvrir")}>
          {ESPACES.map((espace) => (
            <Link key={espace} to={ACCUEIL_ESPACE[espace]}>
              {LIBELLES_ROLES[espace]} · {ACCUEIL_ESPACE[espace]}
            </Link>
          ))}
          <Link to="/dev/kit">{t("coquille.demo.kit")}</Link>
        </nav>
      </EcranCorps>
    </Ecran>
  );
}
