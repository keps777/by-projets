import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { BadgeTouche, EcranCorps, EcranPied, Entete, PlanSieges, Puce } from "@afrimove/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { BoutonPayer } from "./BoutonPayer";
import {
  delaiDepasse,
  emplacementDe,
  estMoyenAffiche,
  formaterDuree,
  formaterMontant,
  formaterTelephone,
  heureDouala,
  siegesIndisponibles,
  type MoyenAffiche,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { useSuiviPaiement, type PaiementEnAttente } from "./suivi-paiement";
import styles from "./siegepay.module.css";

/**
 * Planche « SiegePay » (touche 2) : choisir sa place et payer sur le même écran. Les lectures (départ, plan de
 * sièges, profil, moyens de paiement, devis) et les écritures (blocage du siège, commande, paiement) passent
 * par les hooks voyageur de l'api-client.
 */
export function EcranSiegePay({ departId }: { departId: string }) {
  const detail = voyageur.useDetailDepart({ departId });
  const plan = voyageur.usePlanSieges({ departId });
  const profil = voyageur.useProfil();
  const moyens = voyageur.useMoyensPaiement();
  const devis = voyageur.useDevis({ departId, places: 1 });
  const requetes = [detail, plan, profil, moyens, devis];

  const introuvable =
    detail.error instanceof ErreurHttp && detail.error.statut === 404 && !detail.data;
  if (introuvable) return <EtatVide />;
  if (
    detail.data === undefined ||
    plan.data === undefined ||
    profil.data === undefined ||
    moyens.data === undefined ||
    devis.data === undefined
  ) {
    if (requetes.some((requete) => requete.isError)) {
      return <EtatErreur onReessayer={() => requetes.forEach((r) => void r.refetch())} />;
    }
    return <EtatChargement />;
  }
  if (plan.data.libres === 0 && plan.data.mon === undefined) return <EtatVide complet />;

  return (
    <ChoisirEtPayer
      departId={departId}
      detail={detail.data}
      planInitial={plan.data}
      profil={profil.data}
      moyens={moyens.data}
      devis={devis.data}
    />
  );
}

interface Message {
  cle: string;
  valeurs?: Record<string, string | number>;
}

interface Commande {
  id: string;
  siege: number;
  expireA: string;
}

const estConflit = (erreur: unknown): boolean =>
  erreur instanceof ErreurHttp && erreur.statut === 409;

interface Props {
  departId: string;
  detail: contrats.DetailDepart;
  planInitial: contrats.PlanSiegesVue;
  profil: contrats.Profil;
  moyens: contrats.MoyenPaiementVue[];
  devis: contrats.Devis;
}

function ChoisirEtPayer({ departId, detail, planInitial, profil, moyens, devis }: Props) {
  const { t } = useTranslation("SiegePay");
  const navigate = useNavigate();
  const cache = useQueryClient();
  const maintenant = useMaintenant();
  const { depart } = detail;

  // Plan en temps réel : un siège pris par un autre voyageur se grise tout seul.
  const { plan: planDirect } = voyageur.usePlanSiegesTempsReel({ departId });
  const plan = planDirect ?? planInitial;

  const bloquer = voyageur.useBloquerSiege();
  const creerCommande = voyageur.useCreerCommande();
  const payer = voyageur.usePayerCommande();

  // Le siège que je tiens (bloqué 15 min) et la fin de ce blocage : l'écran en est la source, le plan en est la
  // photo de départ.
  const [choix, setChoix] = useState<number | null>(planInitial.mon?.siege ?? null);
  const [jusqua, setJusqua] = useState<string | null>(planInitial.mon?.jusqua ?? null);
  const [message, setMessage] = useState<Message | null>(null);
  const dernierBlocage = useRef(0);

  const moyensAffiches = moyens.filter(
    (moyen): moyen is contrats.MoyenPaiementVue & { code: MoyenAffiche } =>
      estMoyenAffiche(moyen.code),
  );
  const [moyenChoisi, setMoyenChoisi] = useState<MoyenAffiche>(
    () =>
      moyensAffiches.find((moyen) => moyen.choisi)?.code ?? moyensAffiches[0]?.code ?? "mtn_momo",
  );
  const nomMoyen = moyensAffiches.find((moyen) => moyen.code === moyenChoisi)?.nom ?? "";

  const commande = useRef<Commande | null>(null);
  const envoiEnCours = useRef(false);
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState<PaiementEnAttente | null>(null);
  const suivi = useSuiviPaiement(attente);

  function rafraichirPlan() {
    void cache.invalidateQueries({ queryKey: [voyageur.OP_PLAN_SIEGES.nom, { departId }] });
  }

  /** La place n'est plus à moi : le serveur la relâche, l'écran oublie le choix mais garde le reste de la saisie. */
  function relacher(suivant: Message) {
    dernierBlocage.current += 1;
    commande.current = null;
    setChoix(null);
    setJusqua(null);
    setAttente(null);
    setMessage(suivant);
    rafraichirPlan();
  }

  // Un autre voyageur prend le siège que je tiens avant que je paie.
  const etatDuChoix =
    choix === null ? undefined : plan.sieges.find((s) => s.numero === choix)?.etat;
  useEffect(() => {
    if (choix !== null && (etatDuChoix === "pris" || etatDuChoix === "bloque")) {
      relacher({ cle: "siegePris", valeurs: { numero: choix } });
    }
    // `relacher` change à chaque rendu : seul l'état du siège que je tiens compte.
  }, [etatDuChoix]);

  // Le blocage de 15 minutes est terminé : la place n'est plus à moi.
  const blocageTermine = choix !== null && jusqua !== null && delaiDepasse(jusqua, maintenant);
  useEffect(() => {
    if (blocageTermine && attente === null) relacher({ cle: "blocageTermine" });
    // Pendant un paiement en attente, c'est l'issue du paiement qui décide.
  }, [blocageTermine]);

  // Issue du paiement : billet ouvert, ou échec / délai dépassé et place relâchée.
  useEffect(() => {
    if (attente === null) return;
    if (suivi.etat === "reussi" && suivi.billetId !== undefined) {
      void navigate(urlPlanche("Pass", { billetId: suivi.billetId }));
    } else if (suivi.etat === "echoue") {
      relacher({ cle: "echec" });
    } else if (suivi.etat === "expire") {
      relacher({ cle: "delai" });
    }
    // `relacher` et `navigate` changent à chaque rendu : seule l'issue compte.
  }, [attente, suivi.etat, suivi.billetId]);

  function surSelection(selection: number[]) {
    if (attente !== null) return;
    // Retoucher le siège choisi ne le relâche pas : seul un autre siège ou la fin du blocage le fait.
    const siege = selection.find((numero) => numero !== choix);
    if (siege === undefined) return;
    const avant = { choix, jusqua };
    const appel = ++dernierBlocage.current;
    commande.current = null;
    setChoix(siege);
    setJusqua(null);
    setMessage(null);
    bloquer.mutate(
      { departId, siege },
      {
        onSuccess: (blocage) => {
          if (appel === dernierBlocage.current) setJusqua(blocage.jusqua);
        },
        onError: (erreur) => {
          if (appel !== dernierBlocage.current) return;
          setChoix(avant.choix);
          setJusqua(avant.jusqua);
          setMessage(
            estConflit(erreur)
              ? { cle: "siegePris", valeurs: { numero: siege } }
              : { cle: "blocageEchoue" },
          );
          rafraichirPlan();
        },
      },
    );
  }

  async function lancerPaiement() {
    if (envoiEnCours.current || attente !== null) return;
    if (choix === null) {
      setMessage({ cle: "choisirSiege" });
      return;
    }
    envoiEnCours.current = true;
    setEnvoi(true);
    setMessage(null);
    try {
      let courante = commande.current;
      if (courante === null || courante.siege !== choix) {
        const creee = await creerCommande.mutateAsync({ departId, sieges: [choix], pour: "moi" });
        courante = { id: creee.id, siege: choix, expireA: creee.expireA };
        commande.current = courante;
      }
      if (moyenChoisi === "carte") {
        // Le jeton de carte vient du prestataire de paiement : l'écran Paiement le prend en charge.
        void navigate(urlPlanche("Paiement", { commandeId: courante.id }));
        return;
      }
      const paiement = await payer.mutateAsync({
        commandeId: courante.id,
        moyen: moyenChoisi,
        telephone: profil.telephone,
      });
      setAttente({
        paiementId: paiement.id,
        commandeId: courante.id,
        expireA: courante.expireA,
        statutInitial: paiement.statut,
      });
    } catch (erreur) {
      if (estConflit(erreur) && commande.current === null) {
        relacher({ cle: "siegePris", valeurs: { numero: choix } });
      } else {
        setMessage({ cle: "demarrage" });
      }
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }
  }

  const emplacement = choix === null ? undefined : emplacementDe(plan, choix);
  const placesLibres = plan.libres;

  return (
    <>
      <Entete
        espace="ample"
        titre={`${depart.compagnie.nom} · ${t(`classe.${depart.classe}`)}`}
        sousTitre={
          <>
            {detail.origine.gare} → {detail.destination.gare} ·{" "}
            <span className={styles.heure}>{heureDouala(depart.heureDepart)}</span> ·{" "}
            {formaterDuree(detail.dureeMinutes)}
          </>
        }
        retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="SiegePay">
        {message && (
          <p role="alert" className={styles.alerte}>
            {t(`messages.${message.cle}`, message.valeurs)}
          </p>
        )}
        {attente !== null && (
          <p role="status" className={styles.attente}>
            {t("messages.attente", { moyen: nomMoyen })}
          </p>
        )}

        <div className={styles.pour}>
          <Puce taille="l" selectionnee className={styles.pourMoi}>
            {t("pour.moi")}
          </Puce>
          <a className={styles.pourLien} href={urlPlanche("Proche")}>
            {t("pour.proche")}
          </a>
          <a
            className={styles.pourLien}
            href={`${urlPlanche("Groupe")}?depart=${encodeURIComponent(departId)}`}
          >
            {t("pour.plusieurs")}
          </a>
        </div>

        <PlanSieges
          nombre={plan.capacite}
          titre={t("plan.titre")}
          pris={siegesIndisponibles(plan)}
          selection={choix === null ? [] : [choix]}
          onSelectionChange={surSelection}
          pied={
            <>
              <span>
                {choix === null ? (
                  t("plan.aucunSiege")
                ) : (
                  <Trans
                    t={t}
                    i18nKey={emplacement ? "plan.siegeEmplacement" : "plan.siege"}
                    values={{ numero: choix, emplacement }}
                    components={{ fort: <strong /> }}
                  />
                )}
              </span>
              <span>{t("plan.placesLibres", { count: placesLibres })}</span>
            </>
          }
        />

        <div className={styles.carte}>
          <div className={styles.voyageur}>
            <span className={styles.voyageurNom}>
              {profil.prenom} {profil.nom} · {formaterTelephone(profil.telephone)}
            </span>
            <a className={styles.modifier} href={urlPlanche("Moi")}>
              {t("voyageur.modifier")}
            </a>
          </div>
          <div className={styles.moyens}>
            {moyensAffiches.map((moyen) => (
              <button
                key={moyen.code}
                type="button"
                className={styles.moyen}
                aria-pressed={moyen.code === moyenChoisi}
                onClick={() => {
                  if (attente === null) setMoyenChoisi(moyen.code);
                }}
              >
                {moyen.code !== "carte" && (
                  <span className={styles.point} data-moyen={moyen.code} />
                )}
                {moyen.nom}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.recap}>
          {devis.lignes.map((ligne) => (
            <div key={ligne.code} className={styles.recapLigne}>
              <span>
                {ligne.libelle}
                {ligne.offertAvec !== undefined && (
                  <>
                    {" "}
                    <span className={styles.recapOffert}>
                      {t("recap.offertAvec", { code: ligne.offertAvec })}
                    </span>
                  </>
                )}
              </span>
              <span className={styles.recapMontant}>
                {ligne.montantBarre !== undefined && (
                  <>
                    <s className={styles.recapBarre}>{formaterMontant(ligne.montantBarre)}</s>{" "}
                  </>
                )}
                {formaterMontant(ligne.montant)}
              </span>
            </div>
          ))}
        </div>
      </EcranCorps>

      <EcranPied>
        <BoutonPayer
          libelle={t("payer.libelle")}
          detail={t(`payer.detail.${moyenChoisi}`)}
          touche={3}
          prix={`${formaterMontant(devis.total)} F`}
          enCours={envoi || attente !== null}
          onClick={() => void lancerPaiement()}
        />
        <span className={styles.garantie}>
          {t("payer.garantie", { compagnie: depart.compagnie.nom })}
        </span>
      </EcranPied>
    </>
  );
}
