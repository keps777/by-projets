import { ErreurHttp, agence } from "@afrimove/api-client";
import {
  Bouton,
  BoutonIcone,
  EcranCorps,
  EcranPied,
  IconeChevronDroite,
  IconeCoche,
  IconeRetour,
} from "@afrimove/ui";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { PastilleCadence, RacineCadence, SaisieNumero } from "../Cadence/commun";
import { EtatChargement, EtatErreur, EtatVide } from "../Cadence/etats";
import {
  formaterMontant,
  heureDoualaDe,
  secondesAffichees,
  sequenceSur4,
  telephoneAffiche,
} from "../Cadence/format";
import { IconeHorloge } from "../Cadence/icones";
import communes from "../Cadence/commun.module.css";
import { BilletPapier } from "./BilletPapier";
import { PARAM_BILLET, venteDeLEtat, vueDepuisLecture, vueDepuisVente, type VueVendu } from "./vue";
import styles from "./cadence-billet.module.css";

/** En-tête de la planche : retour à la cadence (rond de 44 px) et la pastille CADENCE avec les secondes. */
function EnteteBillet() {
  const { t } = useTranslation("CadenceBillet");
  const maintenant = useMaintenant(1000);
  return (
    <header className={communes.entete}>
      <BoutonIcone
        href={urlPlanche("Cadence")}
        aria-label={t("retour")}
        icone={<IconeRetour taille={20} />}
      />
      <PastilleCadence heure={heureDoualaDe(maintenant, true)} />
    </header>
  );
}

/** Planche « CadenceBillet » (20b) : la suite d'une vente de cadence, billet imprimé et ce que l'app a fait. */
export function EcranCadenceBillet() {
  const { t } = useTranslation("CadenceBillet");
  const emplacement = useLocation();
  const [parametres] = useSearchParams();
  const billetParam = parametres.get(PARAM_BILLET);

  // Juste après la vente, l'écran « Cadence » a posé la vente dans l'état de navigation : on l'affiche sans
  // attendre le serveur (hors ligne, le billet n'y est pas encore). Sinon on relit le billet par son identifiant.
  const venteEtat = venteDeLEtat(emplacement.state);
  const vente =
    venteEtat !== null && (billetParam === null || billetParam === venteEtat.billet.billetId)
      ? venteEtat
      : null;

  // Sans identifiant (adresse ouverte à la main) : le dernier billet vendu sur cet appareil.
  const sansIdentifiant = vente === null && billetParam === null;
  const dernier = agence.useCadenceEtat({}, { enabled: sansIdentifiant });
  const billetId =
    vente?.billet.billetId ?? billetParam ?? dernier.data?.dernierBillet?.billetId ?? "";
  const lecture = agence.useCadenceBillet(billetId, { enabled: vente === null && billetId !== "" });

  const entete = <EnteteBillet />;
  const vide = (
    <EtatVide
      planche="CadenceBillet"
      entete={entete}
      titre={t("etats.vide.titre")}
      detail={t("etats.vide.detail")}
    />
  );

  if (vente !== null) return <Vendu vue={vueDepuisVente(vente)} />;

  if (sansIdentifiant) {
    if (dernier.isPending) {
      return (
        <EtatChargement planche="CadenceBillet" entete={entete} libelle={t("etats.chargement")} />
      );
    }
    if (dernier.isError) return <Panne onReessayer={() => void dernier.refetch()} />;
    if (billetId === "") return vide;
  }

  if (lecture.isPending) {
    return (
      <EtatChargement planche="CadenceBillet" entete={entete} libelle={t("etats.chargement")} />
    );
  }
  if (lecture.isError) {
    return lecture.error instanceof ErreurHttp && lecture.error.statut === 404 ? (
      vide
    ) : (
      <Panne onReessayer={() => void lecture.refetch()} />
    );
  }
  return <Vendu vue={vueDepuisLecture(lecture.data)} />;
}

function Panne({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useTranslation("CadenceBillet");
  return (
    <EtatErreur
      planche="CadenceBillet"
      entete={<EnteteBillet />}
      titre={t("etats.erreur.titre")}
      detail={t("etats.erreur.detail")}
      reessayer={t("etats.erreur.reessayer")}
      onReessayer={onReessayer}
    />
  );
}

type Ton = "ok" | "attente" | "pulse";

function Fait({ ton, titre, children }: { ton: Ton; titre: string; children: ReactNode }) {
  return (
    <div className={styles.fait}>
      <span className={styles.pastilleFait} data-ton={ton} aria-hidden="true">
        {ton === "ok" && <IconeCoche taille={11} trait={3.5} />}
        {ton === "attente" && "–"}
        {ton === "pulse" && <IconeHorloge taille={11} trait={3} />}
      </span>
      <span>
        <strong>{titre}</strong> {children}
      </span>
    </div>
  );
}

function Vendu({ vue }: { vue: VueVendu }) {
  const { t } = useTranslation("CadenceBillet");
  const navigate = useNavigate();
  const appareil = agence.useAppareilAgence();
  const ajouterTelephone = agence.useAjouterTelephoneBillet();
  const demanderAnnulation = agence.useDemanderAnnulation();

  const [telephoneAjoute, setTelephoneAjoute] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);
  const [echec, setEchec] = useState<"sms" | "annulation" | null>(null);
  const [annulation, setAnnulation] = useState(false);

  const { billet, recap, paiement } = vue;
  const numero = sequenceSur4(billet.sequence);
  const telephone = telephoneAjoute ?? recap.telephone;
  const smsEnvoye = telephoneAjoute !== null || recap.sms === "envoye";
  const momo = paiement.mode !== "cash";
  const modeTexte = t(`modes.${paiement.mode}`);

  async function envoyerSms(numeroClient: string) {
    setFeuille(false);
    setEchec(null);
    try {
      await ajouterTelephone.mutateAsync({ billetId: billet.billetId, telephone: numeroClient });
      setTelephoneAjoute(numeroClient);
    } catch {
      setEchec("sms");
    }
  }

  /** Un guichetier ne peut pas annuler seul : la demande part, le superviseur la décide avec son PIN. */
  async function annuler() {
    if (annulation) return;
    setAnnulation(true);
    setEchec(null);
    try {
      await demanderAnnulation.mutateAsync({
        demandeId: appareil.nouvelId(),
        billetId: billet.billetId,
        motif: t("annulation.motif"),
      });
      void navigate(urlPlanche("Superviseur"));
    } catch {
      setEchec("annulation");
      setAnnulation(false);
    }
  }

  return (
    <RacineCadence planche="CadenceBillet">
      <EnteteBillet />

      <EcranCorps className={styles.corps}>
        {echec !== null && (
          <p role="alert" className={communes.alerte}>
            {t(`erreurs.${echec}`)}
          </p>
        )}

        <section className={styles.vendu} aria-label={t("vendu.aria")}>
          <span className={styles.coche} aria-hidden="true">
            <IconeCoche taille={22} trait={3} />
          </span>
          <div className={styles.venduTextes}>
            <h1 className={styles.venduTitre}>
              {t("vendu.libelle", { duree: secondesAffichees(vue.dureeMs) })}
            </h1>
            <p className={styles.venduDetail}>
              {t("vendu.detail", {
                numero,
                siege: billet.siege ?? recap.siegeBloque,
                mode: modeTexte,
                montant: formaterMontant(billet.prix),
              })}
              {paiement.rendu > 0 && t("vendu.rendu", { rendu: formaterMontant(paiement.rendu) })}
            </p>
          </div>
          <span className={styles.restent}>
            {vue.placesRestantes}
            <span className={styles.restentMot}>
              {" "}
              {t("vendu.restent", { count: vue.placesRestantes })}
            </span>
          </span>
        </section>

        <div className={styles.milieu}>
          <BilletPapier billet={billet} />

          <div className={styles.faits}>
            <span className={styles.etiquette}>{t("fait.titre")}</span>

            <Fait ton={recap.plageSansTrou ? "ok" : "attente"} titre={t("fait.numerote.titre")}>
              {t(recap.plageSansTrou ? "fait.numerote.detail" : "fait.numerote.detailTrou", {
                numero,
              })}
            </Fait>
            <Fait ton="ok" titre={t("fait.siege.titre", { siege: recap.siegeBloque })}>
              {t("fait.siege.detail")}
            </Fait>
            <Fait
              ton={recap.imprime ? "ok" : "attente"}
              titre={t(recap.imprime ? "fait.imprime.titre" : "fait.impression.titre")}
            >
              {recap.imprime
                ? t("fait.imprime.detail", { code: billet.codeBillet })
                : t("fait.impression.detail")}
            </Fait>
            <Fait ton="ok" titre={t(momo ? "fait.momo.titre" : "fait.caisse.titre")}>
              {momo
                ? t("fait.momo.detail", { montant: formaterMontant(billet.prix) })
                : paiement.rendu > 0
                  ? t("fait.caisse.detailRendu", {
                      montant: formaterMontant(recap.caisseCash),
                      rendu: formaterMontant(paiement.rendu),
                    })
                  : t("fait.caisse.detail", { montant: formaterMontant(recap.caisseCash) })}
            </Fait>
            <Fait ton={smsEnvoye ? "ok" : "attente"} titre={t("fait.sms.titre")}>
              {smsEnvoye ? (
                telephone === null ? (
                  t("fait.sms.envoye")
                ) : (
                  t("fait.sms.envoyeAu", { numero: telephoneAffiche(telephone) })
                )
              ) : (
                <>
                  {t("fait.sms.sansNumero")}{" "}
                  <span className={styles.ambre}>{t("fait.sms.action")}</span> {t("fait.sms.suite")}
                </>
              )}
            </Fait>
            <Fait ton={recap.synchro === "faite" ? "ok" : "pulse"} titre={t("fait.synchro.titre")}>
              {t(recap.synchro === "faite" ? "fait.synchro.faite" : "fait.synchro.auRetour")}
            </Fait>
          </div>
        </div>

        {billet.aCompleterAuQuai && (
          <section className={styles.manque}>
            <div className={styles.manqueTete}>
              <span className={styles.etiquette}>{t("manque.titre")}</span>
              <span className={styles.manqueAide}>{t("manque.aide")}</span>
            </div>
            <p className={styles.manqueTexte}>
              {t("manque.debut")} <strong className={styles.manqueCode}>{billet.codeBillet}</strong>
              {t("manque.fin")}
            </p>
          </section>
        )}

        <div className={styles.actions}>
          {!smsEnvoye && (
            <button type="button" className={communes.option} onClick={() => setFeuille(true)}>
              {t("actions.numero")}
            </button>
          )}
          <button
            type="button"
            className={`${communes.option} ${styles.annuler}`}
            aria-busy={annulation}
            onClick={() => void annuler()}
          >
            {t("actions.annuler")}
          </button>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a className={styles.suiteQuai} href={urlPlanche("CadenceQuai")}>
          {t("pied.suite")}
        </a>
        <Bouton
          className={styles.suivant}
          href={urlPlanche("Cadence")}
          libelle={t("pied.suivant.libelle")}
          sousLibelle={t("pied.suivant.detail", {
            siege: vue.suivant.siege,
            prix: formaterMontant(vue.suivant.prix),
          })}
          icone={<IconeChevronDroite taille={22} />}
        />
      </EcranPied>

      <SaisieNumero
        ouverte={feuille}
        onFermer={() => setFeuille(false)}
        onValider={(numeroClient) => void envoyerSms(numeroClient)}
        obligatoire={false}
        initial={telephone}
      />
    </RacineCadence>
  );
}
