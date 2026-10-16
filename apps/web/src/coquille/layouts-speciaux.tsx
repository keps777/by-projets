import { Bouton, Ecran, Etiquette } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { Cadre } from "./cadre";
import { NonTrouvee } from "./non-trouvee";
import { useModeDemo } from "./parametres";
import { ROLES_SALLE_DE_CONTROLE } from "./roles";
import { useSession } from "./session";
import styles from "./layouts-speciaux.module.css";

/** Layout racine : routes sans espace (/bienvenue, /connexion, /tutoriel), dans le cadre de 390 px. */
export function LayoutRacine() {
  return (
    <Cadre>
      <Ecran data-espace="public">
        <Outlet />
      </Ecran>
    </Cadre>
  );
}

/**
 * Salle de contrôle (/controle) : pleine largeur jusqu'à 1280 px, couleurs et polices v3. Ouverte au compte
 * patron ; sans session patron, la page de connexion du patron (MOCK : un bouton ouvre la session, la vraie
 * connexion arrive avec AM-021 et AM-017). En mode démo la salle est ouverte directement, pour le banc.
 */
export function LayoutSalleDeControle() {
  const { t } = useTranslation();
  const demo = useModeDemo();
  const { role, session, ouvrirSession } = useSession();
  const autorise = demo || (session !== null && ROLES_SALLE_DE_CONTROLE.includes(role));

  return (
    <Cadre fluide>
      <div className={styles.salle} data-espace="controle-salle">
        {autorise ? (
          <Outlet />
        ) : (
          <section className={styles.connexion} aria-label={t("coquille.controle.connexion")}>
            <Etiquette>{t("coquille.controle.titre")}</Etiquette>
            <h1 className={styles.titre}>{t("coquille.controle.connexion")}</h1>
            <p className={styles.aide}>{t("coquille.controle.aide")}</p>
            <Bouton
              libelle={t("coquille.controle.action")}
              sousLibelle={t("coquille.controle.demoMention")}
              onClick={() => ouvrirSession("patron")}
            />
          </section>
        )}
      </div>
    </Cadre>
  );
}

/** Pages de développement (/dev/*) : réservées au mode démo, pleine largeur. */
export function LayoutDev() {
  const demo = useModeDemo();
  if (!demo) return <NonTrouvee />;
  return (
    <Cadre fluide>
      <Outlet />
    </Cadre>
  );
}
