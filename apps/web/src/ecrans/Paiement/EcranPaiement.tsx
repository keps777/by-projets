import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import {
  BadgeTouche,
  EcranCorps,
  EcranPied,
  Entete,
  Etiquette,
  IconeCoche,
  IconePersonne,
} from "@afrimove/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { BoutonPayer } from "./BoutonPayer";
import {
  adresseHttps,
  delaiDepasse,
  enPhrase,
  formaterDevise,
  formaterMontant,
  garantieDe,
  moyenInitial,
  moyensProposes,
  type MoyenChoisissable,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatMessage } from "./etats";
import { IconeCarte } from "./icones";
import { JetonCarteIndisponible, useObtenirJetonCarte } from "./jeton-carte";
import { partagerLien } from "./partage";
import { useSuiviPaiement, type PaiementEnAttente } from "./suivi-paiement";
import styles from "./paiement.module.css";

/**
 * Planche « Paiement » (touche 3) : l'écran de paiement commun au covoiturage, au groupe, à la ville et à la moto.
 * `commandeId` vient de l'adresse : le même composant sert tous les types de commande. Les lectures (commande,
 * moyens de paiement) et les écritures (paiement, lien pour un proche) passent par les hooks voyageur de l'api-client.
 */
export function EcranPaiement({ commandeId }: { commandeId: string }) {
  const commande = voyageur.useCommande({ commandeId }, { enabled: commandeId !== "" });
  const moyens = voyageur.useMoyensPaiement();

  const introuvable =
    commandeId === "" ||
    (commande.error instanceof ErreurHttp && commande.error.statut === 404 && !commande.data);
  if (introuvable) return <EtatMessage cle="vide" />;
  if (commande.data === undefined || moyens.data === undefined) {
    if (commande.isError || moyens.isError) {
      return (
        <EtatErreur
          onReessayer={() => {
            void commande.refetch();
            void moyens.refetch();
          }}
        />
      );
    }
    return <EtatChargement />;
  }
  return <ChoisirEtPayer commande={commande.data} moyens={moyens.data} />;
}

interface Message {
  cle: string;
  /** Phrase du serveur qui remplace le texte de l'écran (cause d'un échec, consigne). */
  phrase?: string;
}

const estErreur = (erreur: unknown, statut: number, code: string): boolean =>
  erreur instanceof ErreurHttp && erreur.statut === statut && erreur.code === code;

function ChoisirEtPayer({
  commande,
  moyens,
}: {
  commande: contrats.Commande;
  moyens: contrats.MoyenPaiementVue[];
}) {
  const { t } = useTranslation("Paiement");
  const navigate = useNavigate();
  const cache = useQueryClient();
  const maintenant = useMaintenant();
  const obtenirJetonCarte = useObtenirJetonCarte();
  const payer = voyageur.usePayerCommande();
  const lienProche = voyageur.useLienProche();

  const proposes = moyensProposes(moyens, commande);
  const moyenProche = moyens.find((moyen) => moyen.code === "proche");
  const [choix, setChoix] = useState<MoyenChoisissable | undefined>(() => moyenInitial(proposes));
  // Le moyen coché doit toujours faire partie de ceux qu'on propose (la liste se recharge).
  const moyenChoisi = proposes.some((moyen) => moyen.code === choix)
    ? choix
    : moyenInitial(proposes);

  const [message, setMessage] = useState<Message | null>(null);
  const [attente, setAttente] = useState<PaiementEnAttente | null>(null);
  const [banque, setBanque] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const envoiEnCours = useRef(false);
  const lienEnCours = useRef(false);
  const suivi = useSuiviPaiement(attente);

  // Issue du paiement : billet ouvert, ou échec / délai dépassé et possibilité de recommencer.
  useEffect(() => {
    if (attente === null) return;
    if (suivi.etat === "reussi") {
      if (suivi.billetId !== undefined) {
        void navigate(urlPlanche("Pass", { billetId: suivi.billetId }), { replace: true });
      }
      return;
    }
    if (suivi.etat === "echoue" || suivi.etat === "expire") {
      setAttente(null);
      setBanque(null);
      setMessage({
        cle: suivi.etat === "echoue" ? "echec" : "delai",
        ...(suivi.consigne !== undefined ? { phrase: suivi.consigne } : {}),
      });
    }
    // `navigate` change à chaque rendu : seule l'issue compte.
  }, [attente, suivi.etat, suivi.billetId]);

  if (proposes.length === 0) return <EtatMessage cle="indisponible" />;
  // Une commande déjà réglée (par exemple par un proche), expirée ou annulée ne se paie plus. Pendant un paiement
  // en cours, c'est son issue qui décide : la commande passe à « payée » juste avant l'ouverture du billet.
  if (attente === null && commande.statut !== "en_attente_paiement") {
    const billetId = commande.billetIds[0];
    return (
      <EtatMessage
        cle={
          commande.statut === "payee"
            ? "payee"
            : commande.statut === "expiree"
              ? "expiree"
              : "annulee"
        }
        {...(commande.statut === "payee" && billetId !== undefined
          ? { lien: { href: urlPlanche("Pass", { billetId }), libelle: t("etats.payee.ouvrir") } }
          : {})}
      />
    );
  }
  if (attente === null && delaiDepasse(commande.expireA, maintenant)) {
    return <EtatMessage cle="expiree" />;
  }

  const montant = formaterMontant(commande.total);

  async function lancerPaiement() {
    if (envoiEnCours.current || attente !== null || moyenChoisi === undefined) return;
    envoiEnCours.current = true;
    setEnvoi(true);
    setMessage(null);
    setBanque(null);
    try {
      // Carte : le jeton vient du prestataire de paiement, jamais un numéro saisi ici.
      const jetonCarte = moyenChoisi === "carte" ? await obtenirJetonCarte() : undefined;
      const paiement = await payer.mutateAsync({
        commandeId: commande.id,
        moyen: moyenChoisi,
        ...(jetonCarte !== undefined ? { jetonCarte } : {}),
      });
      setAttente({
        paiementId: paiement.id,
        commandeId: commande.id,
        expireA: commande.expireA,
        statutInitial: paiement.statut,
        ...(paiement.consigne !== undefined ? { consigne: paiement.consigne } : {}),
      });
      setBanque(adresseHttps(paiement.urlAuthentification) ?? null);
    } catch (erreur) {
      if (erreur instanceof JetonCarteIndisponible) {
        setMessage({ cle: "carteIndisponible" });
      } else if (estErreur(erreur, 409, "PAIEMENT_EN_COURS")) {
        setMessage({ cle: "dejaEnCours" });
      } else {
        // Paiement en ligne coupé entre-temps (503) : la liste des moyens se vide, l'écran l'explique.
        if (estErreur(erreur, 503, "MODE_DEGRADE")) {
          void cache.invalidateQueries({ queryKey: [voyageur.OP_MOYENS_PAIEMENT.nom] });
        }
        setMessage({ cle: "demarrage" });
      }
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }
  }

  /** « Demander à un proche de payer » : on crée le lien, on le partage, puis on passe à l'écran Proche. */
  async function demanderAUnProche(evenement: MouseEvent<HTMLAnchorElement>) {
    // Un clic avec une touche (nouvel onglet) garde le comportement du navigateur.
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (lienEnCours.current || attente !== null) return;
    lienEnCours.current = true;
    setMessage(null);
    try {
      const lien = await lienProche.mutateAsync({ commandeId: commande.id });
      const issue = await partagerLien({
        titre: t("proche.partage.titre"),
        texte: t("proche.partage.message", { libelle: commande.libelle, montant }),
        url: lien.url,
      });
      if (issue !== "annule") void navigate(urlPlanche("Proche"));
    } catch {
      setMessage({ cle: "lienEchoue" });
    } finally {
      lienEnCours.current = false;
    }
  }

  return (
    <>
      <Entete
        espace="ample"
        titre={t("titre")}
        sousTitre={commande.libelle}
        retour={{ libelle: t("retour"), href: urlPlanche("Covoit") }}
        droite={<BadgeTouche n={3} />}
      />

      <EcranCorps className={styles.corps} data-planche="Paiement">
        {message && (
          <p role="alert" className={styles.alerte}>
            {message.phrase ?? t(`messages.${message.cle}`)}
          </p>
        )}
        {attente !== null && (
          <p role="status" className={styles.attente}>
            {t("messages.attente")}{" "}
            {enPhrase(suivi.consigne ?? t(`messages.consigne.${moyenChoisi ?? "mtn_momo"}`))}
            {banque !== null && (
              <>
                {" "}
                <a
                  className={styles.lienBanque}
                  href={banque}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("messages.banque")}
                </a>
              </>
            )}
          </p>
        )}

        <div className={styles.montant}>
          <div className={styles.montantTete}>
            <span className={styles.montantLibelle}>{t("aPayer")}</span>
            <span className={styles.montantTotal}>
              {montant} <span className={styles.unite}>{t("unite")}</span>
            </span>
          </div>
          <div className={styles.detail}>
            {commande.lignes.map((ligne) => (
              <span key={ligne.code} className={styles.detailLigne}>
                <span>
                  {ligne.libelle}
                  {ligne.offertAvec !== undefined && (
                    <>
                      {" "}
                      <span className={styles.offert}>
                        {t("detail.offertAvec", { code: ligne.offertAvec })}
                      </span>
                    </>
                  )}
                </span>
                <span className={styles.mono}>
                  {ligne.montantBarre !== undefined && (
                    <>
                      <s className={styles.barre}>{formaterMontant(ligne.montantBarre)}</s>{" "}
                    </>
                  )}
                  {formaterMontant(ligne.montant)}
                </span>
              </span>
            ))}
            {commande.conversion && (
              <span className={styles.detailLigne}>
                <span>{t("detail.equivalent", { devise: commande.conversion.devise })}</span>
                <span className={styles.mono}>
                  {commande.conversion.approximatif ? "≈ " : ""}
                  {formaterDevise(commande.conversion.montantMineur, commande.conversion.devise)}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className={styles.moyens}>
          <Etiquette>{t("question")}</Etiquette>
          {proposes.map((moyen) => {
            const choisi = moyen.code === moyenChoisi;
            return (
              <button
                key={moyen.code}
                type="button"
                className={styles.moyen}
                aria-pressed={choisi}
                onClick={() => {
                  if (attente === null) setChoix(moyen.code);
                }}
              >
                <span className={styles.logo} data-moyen={moyen.code} aria-hidden="true">
                  {moyen.code === "carte" ? <IconeCarte /> : moyen.sigle}
                </span>
                <span className={styles.moyenTextes}>
                  <span className={styles.moyenNom}>{moyen.nom}</span>
                  {moyen.detail !== undefined && (
                    <span className={styles.moyenDetail}>{moyen.detail}</span>
                  )}
                </span>
                <span className={styles.radio} data-choisi={choisi} aria-hidden="true">
                  {choisi && <IconeCoche taille={13} trait={3} />}
                </span>
              </button>
            );
          })}
          {moyenProche && (
            <a
              className={styles.proche}
              href={urlPlanche("Proche")}
              onClick={(e) => void demanderAUnProche(e)}
            >
              <span className={styles.logoProche} aria-hidden="true">
                <IconePersonne taille={18} trait={2.2} />
              </span>
              <span className={styles.moyenTextes}>
                <span className={styles.moyenNom}>{moyenProche.nom}</span>
                {moyenProche.detail !== undefined && (
                  <span className={styles.moyenDetail}>{moyenProche.detail}</span>
                )}
              </span>
            </a>
          )}
        </div>

        <div className={styles.garantie}>
          <span className={styles.garantiePoint} aria-hidden="true" />
          {t(`garantie.${garantieDe(commande.type)}`)}
        </div>
      </EcranCorps>

      <EcranPied>
        <BoutonPayer
          libelle={t("payer.libelle", { montant })}
          detail={t(`payer.detail.${moyenChoisi ?? "mtn_momo"}`)}
          enCours={envoi || attente !== null}
          onClick={() => void lancerPaiement()}
        />
      </EcranPied>
    </>
  );
}
