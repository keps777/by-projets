import type { agence } from "@afrimove/contrats";
import { Fragment, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { rangeeAvantAllee } from "./calculs";
import styles from "./vente.module.css";

interface Props {
  plan: agence.PlanSiegesVente;
  /** Siège sélectionné (attribué automatiquement ou choisi sur le plan). */
  choisi: number | null;
  libres: number;
  /** Faux quand le plan chargé n'est pas celui du départ sélectionné. */
  disponible: boolean;
  automatique: boolean;
  onChoisir: (numero: number) => void;
}

/** Plan du bus : cases pleines (pris), bordées (libres), ambre avec le numéro (siège attribué). */
export function PlanSieges({ plan, choisi, libres, disponible, automatique, onChoisir }: Props) {
  const { t } = useTranslation("Vente");
  const avantAllee = rangeeAvantAllee(plan.cases.length, plan.colonnes) * plan.colonnes;

  return (
    <section className={styles.plan}>
      {disponible && (
        <div className={styles.grille} style={{ "--colonnes": plan.colonnes } as CSSProperties}>
          {plan.cases.map((c, i) => (
            <Fragment key={c.numero}>
              {i === avantAllee && <span className={styles.allee} aria-hidden="true" />}
              {c.numero === choisi ? (
                <button
                  type="button"
                  className={`${styles.siege} ${styles.siegeChoisi}`}
                  aria-pressed="true"
                  aria-label={t("plan.siegeChoisi", { numero: c.numero })}
                  onClick={() => onChoisir(c.numero)}
                >
                  {c.numero}
                </button>
              ) : c.etat === "pris" ? (
                <span
                  className={styles.siege}
                  role="img"
                  aria-label={t("plan.siegePris", { numero: c.numero })}
                />
              ) : (
                <button
                  type="button"
                  className={`${styles.siege} ${styles.siegeLibre}`}
                  aria-pressed="false"
                  aria-label={t("plan.siegeLibre", { numero: c.numero })}
                  onClick={() => onChoisir(c.numero)}
                />
              )}
            </Fragment>
          ))}
        </div>
      )}
      <div className={styles.planPied}>
        {disponible ? (
          <span>
            {t("plan.siege")} <strong>{choisi}</strong>{" "}
            {automatique ? t("plan.attribue") : t("plan.choisi")}
          </span>
        ) : (
          <span>{t("plan.indisponible")}</span>
        )}
        <span>{t("plan.libres", { nombre: libres })}</span>
      </div>
    </section>
  );
}
