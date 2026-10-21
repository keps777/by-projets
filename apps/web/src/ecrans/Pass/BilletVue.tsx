import type { voyageur as c } from "@afrimove/contrats";
import { voyageur } from "@afrimove/api-client";
import { CarteBillet, EcranCorps, IconeBus } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { EnteteBillet, type StatutBillet } from "./EnteteBillet";
import { codeVille, dateCourte, dureeTrajet, heureDouala, montantFcfa } from "./formats";
import { IconeMoto } from "./icones";
import { ouvrirWhatsApp } from "./partage";
import styles from "./pass.module.css";

interface InfosEtat {
  statut: StatutBillet;
  /** Le voyage est à venir ou en cours : les actions du billet ont un sens. */
  actif: boolean;
}

/** Pastille et disponibilité des actions selon l'état du billet. Payé et envoyé par SMS : le texte de la maquette. */
export function infosEtat(billet: c.BilletVoyageur): InfosEtat {
  switch (billet.etat) {
    case "paye":
      return {
        statut: { cle: billet.smsEnvoye ? "paye" : "payeSansSms", ton: "vert" },
        actif: true,
      };
    case "reserve":
      return { statut: { cle: "reserve", ton: "ambre" }, actif: true };
    case "embarque":
      return { statut: { cle: "embarque", ton: "vert" }, actif: true };
    case "voyage":
      return { statut: { cle: "voyage", ton: "vert" }, actif: true };
    case "annule":
      return { statut: { cle: "annule", ton: "rouge" }, actif: false };
    case "non_presente":
      return { statut: { cle: "nonPresente", ton: "rouge" }, actif: false };
    case "reporte":
      return { statut: { cle: "reporte", ton: "neutre" }, actif: false };
  }
}

/**
 * Le billet affiché : en-tête, billet du kit (QR, code sans scanner), puis les cartes d'action. `copieLocale` :
 * c'est la copie chiffrée de l'appareil, faute de réponse du serveur.
 */
export function BilletVue({
  billet,
  copieLocale,
}: {
  billet: c.BilletVoyageur;
  copieLocale: boolean;
}) {
  const { t } = useTranslation("Pass");
  const { statut, actif } = infosEtat(billet);

  // La limite d'annulation gratuite vient du domaine (règle de la compagnie) : le serveur la calcule. Sans réponse
  // (hors ligne), on garde celle que le billet portait déjà, calculée de la même façon à l'émission.
  const apercu = voyageur.useApercuAnnulation(
    { billetId: billet.id },
    { enabled: actif, networkMode: "always" },
  );
  const gratuiteJusqua = apercu.data?.gratuiteJusqua ?? billet.annulationGratuiteJusqua;

  const piece = billet.passager.pieceQuatreDerniers;
  const passager =
    piece === undefined
      ? t("billet.passagerSansPiece", { nom: billet.passager.nom })
      : t("billet.passager", { nom: billet.passager.nom, piece });

  function partager() {
    const lien = `${globalThis.location.origin}${urlPlanche("Pass", { billetId: billet.id })}`;
    ouvrirWhatsApp(
      t("partager.message", {
        compagnie: billet.compagnie.nom,
        depart: billet.origine.gare,
        arrivee: billet.destination.gare,
        date: dateCourte(billet.heureDepart),
        heure: heureDouala(billet.heureDepart),
        lien,
      }),
    );
  }

  return (
    <>
      <EnteteBillet statut={statut} onPartager={partager} />

      <EcranCorps className={styles.corps} data-planche="Pass" data-etat={billet.etat}>
        {copieLocale && (
          <p role="status" className={styles.horsLigne}>
            {t("horsLigne")}
          </p>
        )}

        <CarteBillet
          className={actif ? undefined : styles.billetInactif}
          compagnie={billet.compagnie.nom}
          reference={billet.numero}
          depart={{ code: codeVille(billet.origine.ville), ville: billet.origine.gare }}
          arrivee={{ code: codeVille(billet.destination.ville), ville: billet.destination.gare }}
          duree={dureeTrajet(billet.dureeMinutes)}
          heure={heureDouala(billet.heureDepart)}
          date={dateCourte(billet.heureDepart)}
          siege={billet.siege === null ? "–" : String(billet.siege)}
          classe={t(`billet.classe.${billet.classe}`)}
          qr={billet.qr}
          code={billet.codeBillet}
          passager={passager}
          consigne={t("billet.consigne", { minutes: billet.presenceQuaiMinutes })}
        />

        {actif && (
          <div className={styles.cartes}>
            <a
              className={styles.carte}
              data-principale="true"
              href={urlPlanche("Direct", { billetId: billet.id })}
            >
              <IconeBus taille={22} trait={2.2} />
              <span className={styles.carteTextes}>
                <span className={styles.carteTitre}>{t("actions.suivre.titre")}</span>
                <span className={styles.carteDetail}>{t("actions.suivre.detail")}</span>
              </span>
            </a>
            {billet.courseProposee !== undefined && (
              <a
                className={styles.carte}
                href={`${urlPlanche("Course")}?billetId=${encodeURIComponent(billet.id)}`}
              >
                <IconeMoto taille={22} />
                <span className={styles.carteTextes}>
                  <span className={styles.carteTitre}>{t("actions.moto.titre")}</span>
                  <span className={styles.carteDetail}>
                    {t("actions.moto.detail", {
                      heure: heureDouala(billet.courseProposee.partirA),
                      prix: montantFcfa(billet.courseProposee.prix),
                    })}
                  </span>
                </span>
              </a>
            )}
          </div>
        )}

        <div className={styles.liens}>
          {actif && (
            <a className={styles.lien} href={urlPlanche("Moi")}>
              {t("actions.annulation", { heure: heureDouala(gratuiteJusqua) })}
            </a>
          )}
          <a
            className={`${styles.lien} ${styles.lienColis}`}
            href={urlPlanche("ColisEnvoi")}
            data-seul={actif ? undefined : "true"}
          >
            {t("actions.colis")}
          </a>
        </div>
      </EcranCorps>
    </>
  );
}
