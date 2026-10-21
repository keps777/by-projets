import { ErreurHttp, colis as api } from "@afrimove/api-client";
import { Bouton, Champ } from "@afrimove/ui";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import styles from "./relaisapp.module.css";

type Retour = { ton: "ok" | "erreur"; cle: string; numero?: string };

/** Cause d'un échec de réception, en une phrase : numéro inconnu, colis qui ne peut pas arriver ici, ou panne. */
function cleEchec(erreur: unknown): string {
  if (erreur instanceof ErreurHttp) {
    if (erreur.statut === 404) return "reception.introuvable";
    if (erreur.statut === 409) return "reception.refuse";
  }
  return "reception.echec";
}

/**
 * Recevoir un colis : le numéro lu sur l'étiquette (au lecteur de codes ou au clavier) met le colis en garde chez le
 * relais (`useRecevoirColisRelais`) ; l'espace se recharge tout seul.
 */
export function Reception({ id }: { id: string }) {
  const { t } = useTranslation("RelaisApp");
  const recevoir = api.useRecevoirColisRelais();
  const [numero, setNumero] = useState("");
  const [retour, setRetour] = useState<Retour | null>(null);
  const enCours = useRef(false);

  async function valider(evenement: FormEvent) {
    evenement.preventDefault();
    const lu = numero.trim();
    if (lu === "") {
      setRetour({ ton: "erreur", cle: "reception.vide" });
      return;
    }
    if (enCours.current) return;
    enCours.current = true;
    setRetour(null);
    try {
      const recu = await recevoir.mutateAsync({ numeroColis: lu });
      setNumero("");
      setRetour({ ton: "ok", cle: "reception.reussie", numero: recu.colis.numero });
    } catch (erreur) {
      setRetour({ ton: "erreur", cle: cleEchec(erreur) });
    } finally {
      enCours.current = false;
    }
  }

  return (
    <form id={id} className={styles.reception} onSubmit={(e) => void valider(e)} noValidate>
      <span className={styles.receptionTitre}>{t("reception.titre")}</span>
      <Champ
        label={t("reception.champ")}
        mono
        autoFocus
        autoComplete="off"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
      />
      <Bouton
        variante="secondaire"
        type="submit"
        libelle={t("reception.valider")}
        aria-busy={recevoir.isPending}
      />
      {retour !== null && (
        <p
          role={retour.ton === "erreur" ? "alert" : "status"}
          className={retour.ton === "erreur" ? styles.messageErreur : styles.messageOk}
        >
          {t(retour.cle, { numero: retour.numero })}
        </p>
      )}
    </form>
  );
}
