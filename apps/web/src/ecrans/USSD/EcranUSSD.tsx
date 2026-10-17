import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import {
  BulleWhatsApp,
  ConversationWhatsApp,
  EcranCorps,
  EcranPied,
  EcranUssd,
  Etiquette,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { EXEMPLES_PARAMS, urlPlanche } from "@/coquille/planches";
import { EnteteUssd } from "./EnteteUssd";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { apercuVide, billetCite, messagesVue, texteUssd } from "./formats";
import styles from "./ussd.module.css";

/**
 * Planche « USSD » (« Sans internet », route /sans-internet) : le même service sur un téléphone à touches. L'aperçu
 * (écran USSD, conversation WhatsApp, légendes) vient de `useApercuSansInternet` ; les vraies sessions sont servies
 * par la passerelle USSD (AM-169) et le canal WhatsApp (AM-168).
 */
export function EcranUSSD() {
  const requete = voyageur.useApercuSansInternet();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
  if (apercuVide(requete.data)) return <EtatVide />;
  return <Apercu apercu={requete.data} />;
}

function Apercu({ apercu }: { apercu: c.ApercuSansInternet }) {
  const { t } = useTranslation("USSD");
  const { ussd, whatsapp } = apercu;
  const messages = messagesVue(whatsapp.echanges);
  // Le billet reçu est celui que la conversation annonce ; sans numéro dans l'aperçu, le billet de démonstration.
  const billetId = billetCite(whatsapp.echanges) ?? EXEMPLES_PARAMS["billetId"]!;

  return (
    <>
      <EnteteUssd />
      <EcranCorps className={styles.corps} data-planche="USSD">
        <div className={styles.colonne}>
          <Etiquette>{t("ussd.titre", { code: ussd.code })}</Etiquette>
          <EcranUssd texte={texteUssd(ussd.lignes)} />
          <span className={styles.legende}>{ussd.note}</span>
        </div>

        <div className={styles.colonne}>
          <Etiquette className={styles.etiquetteVerte}>
            {t("whatsapp.titre", { motCle: whatsapp.motCle })}
          </Etiquette>
          <ConversationWhatsApp
            ariaLabel={t("whatsapp.conversation")}
            className={styles.conversation}
          >
            {messages.map((message, i) => (
              <BulleWhatsApp
                key={i}
                sens={message.de === "voyageur" ? "envoye" : "recu"}
                taille="compacte"
              >
                <span className={message.confirmation ? styles.confirmation : undefined}>
                  {message.lignes.map((ligne, j) => (
                    <span key={j}>
                      {j > 0 && <br />}
                      {ligne.reponse !== undefined ? (
                        <>
                          <strong className={styles.reponse}>{ligne.reponse}</strong>
                          {ligne.suite}
                        </>
                      ) : (
                        ligne.texte
                      )}
                    </span>
                  ))}
                </span>
              </BulleWhatsApp>
            ))}
          </ConversationWhatsApp>
          <span className={styles.legende}>{whatsapp.vocal}</span>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a href={urlPlanche("Pass", { billetId })} className={styles.principal}>
          {t("actions.billet")}
        </a>
        <a href={urlPlanche("Proche")} className={styles.secondaire}>
          {t("actions.proche")}
        </a>
      </EcranPied>
    </>
  );
}
