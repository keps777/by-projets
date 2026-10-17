import type { agence as c } from "@afrimove/contrats";
import { CodeQr } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { dateCourteDeIso, heureDeIso } from "../Cadence/format";
import styles from "./cadence-billet.module.css";

/** Logo AfriMove de la planche (carré Nuit, deux plaques, flèche), dessiné tel quel. */
function LogoBillet() {
  return (
    <svg width="14" height="14" viewBox="0 0 72 72" aria-hidden="true">
      <rect width="72" height="72" rx="20" fill="#0B1019" />
      <rect x="12" y="12" width="48" height="23" rx="6" fill="#FFFFFF" />
      <rect x="12" y="37" width="48" height="23" rx="6" fill="#BBBBBB" />
      <path d="M36 18 L50 56 L42 56 L36 38 L30 56 L22 56 Z" fill="#0B1019" />
    </svg>
  );
}

/**
 * Aperçu du billet imprimé en cadence : papier blanc de 150 px, sans nom ni pièce (« à compléter au quai »). Le
 * kit n'a que l'aperçu thermique de la vente en un écran, qui est un autre papier : variante locale.
 */
export function BilletPapier({ billet }: { billet: c.BilletImprimable }) {
  const { t } = useTranslation("CadenceBillet");
  const classe = billet.classe === "vip" ? t("billet.vip") : t("billet.classique");
  return (
    <div
      className={styles.billet}
      role="group"
      aria-label={t("billet.aria", { numero: billet.numero })}
    >
      <span className={styles.billetMarque}>
        <LogoBillet />
        {billet.compagnie.toLocaleUpperCase("fr")}
      </span>
      <span className={styles.billetTrajet}>
        {billet.trajet.origine} → {billet.trajet.destination}
      </span>
      <span className={styles.billetDepart}>
        {heureDeIso(billet.heureDepart)} · {dateCourteDeIso(billet.heureDepart)}
      </span>
      <span>
        {t("billet.siege")} <strong className={styles.billetSiege}>{billet.siege ?? "–"}</strong> ·{" "}
        {classe}
      </span>
      <span className={styles.billetNom}>
        {t("billet.nom")} <strong>{billet.passager.nom ?? t("billet.aCompleter")}</strong>
      </span>
      <span>
        {billet.passager.pieceQuatreDerniers === null
          ? t("billet.piece")
          : t("billet.pieceFaite", { piece: billet.passager.pieceQuatreDerniers })}
      </span>
      <span className={styles.billetQr}>
        <CodeQr valeur={billet.qr} taille={56} correction="L" marge={1} libelle={t("billet.qr")} />
      </span>
      <span className={styles.billetCode}>{billet.codeBillet.split("").join(" ")}</span>
      <span className={styles.billetNumero}>{billet.numero}</span>
      <span className={styles.billetPied}>{t("billet.pied")}</span>
    </div>
  );
}
