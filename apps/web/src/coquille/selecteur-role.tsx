import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useModeDemo } from "./parametres";
import { ACCUEIL_ESPACE, ESPACES, LIBELLES_ROLES, estEspace } from "./roles";
import { useSession } from "./session";
import styles from "./selecteur-role.module.css";

/**
 * Sélecteur de rôle, RÉSERVÉ AU MODE DÉMO (il ne s'affiche jamais en production). Choisir un rôle ouvre une
 * session mock avec ce rôle et va à l'accueil de son espace. `flottant` : posé en haut à droite de la fenêtre,
 * à côté du cadre de 390 px, et caché sur téléphone (la page /dev/roles le remplace).
 */
export function SelecteurRole({ flottant = false }: { flottant?: boolean }) {
  const demo = useModeDemo();
  const { t } = useTranslation();
  const { role, ouvrirSession } = useSession();
  const navigate = useNavigate();
  if (!demo) return null;

  function surChangement(evenement: ChangeEvent<HTMLSelectElement>) {
    const choix = evenement.target.value;
    if (!estEspace(choix)) return;
    ouvrirSession(choix);
    void navigate(ACCUEIL_ESPACE[choix]);
  }

  return (
    <div
      className={flottant ? `${styles.selecteur} ${styles.flottant}` : styles.selecteur}
      role="group"
      aria-label={t("coquille.demo.titre")}
    >
      <label className={styles.etiquette}>
        <span>{t("coquille.demo.role")}</span>
        <select className={styles.champ} value={role} onChange={surChangement}>
          {ESPACES.map((espace) => (
            <option key={espace} value={espace}>
              {LIBELLES_ROLES[espace]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
