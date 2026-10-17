import { ErreurHttp, agence, patron } from "@afrimove/api-client";
import { aleaCrypto, genererCodeBilletUnique } from "@afrimove/domain";
import { EcranCorps, EcranPied, IconeCaisse, IconeRetour, useConception } from "@afrimove/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { ChoixDepart } from "./ChoixDepart";
import { PastilleCadence, RacineCadence, SaisieNumero } from "./commun";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  ecoule,
  formaterMontant,
  heureDeIso,
  heureDoualaDe,
  sequenceSur4,
  telephoneAffiche,
} from "./format";
import { IconeTelephone } from "./icones";
import { useServiceImpression } from "./impression";
import { PARAM_BILLET, paiementCadence, type ModeCadence, type VenteFaite } from "./vente";
import commun from "./commun.module.css";
import styles from "./cadence.module.css";

export type EtatCadence = NonNullable<ReturnType<typeof agence.useCadenceEtat>["data"]>;

/** En-tête de la planche : « Quitter la cadence » à gauche, la pastille CADENCE et l'heure à droite. */
function EnteteCadence() {
  const { t } = useTranslation("Cadence");
  const maintenant = useMaintenant(1000);
  return (
    <header className={commun.entete}>
      <a className={styles.quitter} href={urlPlanche("Guichet")}>
        <IconeRetour taille={16} trait={2.4} />
        {t("quitter")}
      </a>
      <PastilleCadence heure={heureDoualaDe(maintenant)} />
    </header>
  );
}

/** Planche « Cadence » (20) : vendre un billet à chaque touche, au rythme de la file. */
export function EcranCadence() {
  const { t } = useTranslation("Cadence");
  const [departId, setDepartId] = useState<string | undefined>(undefined);
  const requete = agence.useCadenceEtat(departId === undefined ? {} : { departId }, {
    placeholderData: keepPreviousData,
  });
  // Lus en même temps que l'état de la cadence, pour qu'ils soient prêts à la première touche.
  const regles = patron.useRegles();
  const imprimante = agence.useImpressionEtat();

  if (requete.isPending) {
    return (
      <EtatChargement
        planche="Cadence"
        entete={<EnteteCadence />}
        libelle={t("etats.chargement")}
      />
    );
  }
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide
        planche="Cadence"
        entete={<EnteteCadence />}
        titre={t("etats.vide.titre")}
        detail={t("etats.vide.detail")}
      />
    ) : (
      <EtatErreur
        planche="Cadence"
        entete={<EnteteCadence />}
        titre={t("etats.erreur.titre")}
        detail={t("etats.erreur.detail")}
        reessayer={t("etats.erreur.reessayer")}
        onReessayer={() => void requete.refetch()}
      />
    );
  }
  return (
    <VenteCadence
      etat={requete.data}
      numeroObligatoire={regles.data?.cadence.numeroObligatoire === true}
      imprimanteHorsService={
        imprimante.data !== undefined && imprimante.data.imprimante.etat !== "ok"
      }
      onChoisirDepart={setDepartId}
    />
  );
}

type Feuille = { ouverte: "numero"; apres: ModeCadence | null } | { ouverte: "depart" } | null;

function VenteCadence({
  etat,
  numeroObligatoire,
  imprimanteHorsService,
  onChoisirDepart,
}: {
  etat: EtatCadence;
  /** Réglage « numéro obligatoire en cadence » du patron. */
  numeroObligatoire: boolean;
  imprimanteHorsService: boolean;
  onChoisirDepart: (departId: string) => void;
}) {
  const { t } = useTranslation("Cadence");
  const conception = useConception();
  const navigate = useNavigate();
  const maintenant = useMaintenant(1000);
  const appareil = agence.useAppareilAgence();
  const vendreBillet = agence.useVendreBilletCadence();
  const impression = useServiceImpression();

  const [telephone, setTelephone] = useState<string | null>(null);
  const [deuxPlaces, setDeuxPlaces] = useState(false);
  const [pushEnvoye, setPushEnvoye] = useState(false);
  const [feuille, setFeuille] = useState<Feuille>(null);
  const [echec, setEchec] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const enCours = useRef(false);
  const codesVus = useRef(new Set<string>());

  const { depart, dernierBillet, prochain, synchro } = etat;
  const toucheMention = (n: number) => (conception ? t("touche", { n }) : "");

  /** Vend 1 ou 2 billets (un événement chacun), les imprime, puis montre l'écran « Vendu ». */
  async function vendre(mode: ModeCadence, numero: string | null) {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    setEchec(false);
    const debut = performance.now();
    let derniere: VenteFaite | undefined;
    try {
      const places = deuxPlaces ? 2 : 1;
      for (let i = 0; i < places; i++) {
        const siege = prochain.siege + i;
        const codeBillet = genererCodeBilletUnique(aleaCrypto(), codesVus.current);
        codesVus.current.add(codeBillet);
        const paiement = paiementCadence(mode, prochain.prix);
        const resultat = await vendreBillet.mutateAsync({
          billetId: appareil.nouvelId(),
          departId: depart.departId,
          siege,
          prix: prochain.prix,
          paiement,
          codeBillet,
          telephone: numero,
        });
        let imprime = false;
        try {
          imprime = (await impression.imprimerBillet(resultat.billet)) === "imprime";
        } catch {
          // Imprimante en panne : la vente est faite, le billet reste à imprimer.
        }
        derniere = {
          billet: resultat.billet,
          dureeMs: 0,
          paiement: { mode, recu: paiement.recu, rendu: paiement.rendu },
          placesRestantes: resultat.placesRestantes,
          imprime,
          telephone: numero,
          synchro: synchro.etat === "sync" ? "faite" : "au_retour_du_reseau",
          suivant: { siege: siege + 1, prix: prochain.prix },
        };
      }
    } catch {
      setEchec(true);
    } finally {
      enCours.current = false;
      setOccupe(false);
    }
    if (!derniere) return;
    const vente: VenteFaite = { ...derniere, dureeMs: Math.round(performance.now() - debut) };
    setTelephone(null);
    setDeuxPlaces(false);
    setPushEnvoye(false);
    void navigate(
      `${urlPlanche("CadenceBillet")}?${PARAM_BILLET}=${encodeURIComponent(vente.billet.billetId)}`,
      { state: { vente } },
    );
  }

  /** CASH : une touche. MOMO : première touche = push (au numéro), seconde = confirmé. */
  function toucher(mode: ModeCadence, numero: string | null) {
    if (enCours.current) return;
    if (numero === null && (mode === "momo" || numeroObligatoire)) {
      setFeuille({ ouverte: "numero", apres: mode });
      return;
    }
    if (mode === "momo" && !pushEnvoye) {
      setPushEnvoye(true);
      return;
    }
    if (mode === "cash") setPushEnvoye(false);
    void vendre(mode, numero);
  }

  function numeroValide(numero: string) {
    const apres = feuille?.ouverte === "numero" ? feuille.apres : null;
    setTelephone(numero);
    setFeuille(null);
    if (apres) toucher(apres, numero);
  }

  const sync = (() => {
    const heure = synchro.derniereSyncA === null ? "" : heureDeIso(synchro.derniereSyncA);
    const cle = { hors_ligne: "horsLigne", sync: "sync", en_attente: "enAttente" }[synchro.etat];
    return t(`pied.synchro.${cle}`, { heure, n: synchro.evenementsEnAttente });
  })();

  const duree = dernierBillet ? ecoule(dernierBillet.venduA, maintenant) : null;
  const ecouleTexte =
    duree === null
      ? ""
      : duree.unite === "heures"
        ? t("duree.heures", { h: duree.h, m: duree.m })
        : t(`duree.${duree.unite}`, { n: duree.n });

  return (
    <RacineCadence planche="Cadence">
      <EnteteCadence />

      <EcranCorps className={styles.corps}>
        <h1 className={commun.titreMasque}>{t("titre")}</h1>

        {echec && (
          <p role="alert" className={commun.alerte}>
            {t("erreurs.vente")}
          </p>
        )}
        {imprimanteHorsService && (
          <p role="status" className={`${commun.alerte} ${commun.alerteAmbre}`}>
            {t("erreurs.imprimante")}
          </p>
        )}

        <section className={styles.carteDepart} aria-label={t("depart.libelle")}>
          <span className={styles.departGauche}>
            <span className={styles.etiquette}>{t("depart.libelle")}</span>
            <span className={styles.departValeur}>
              {heureDeIso(depart.heureDepart)} {depart.destination}
            </span>
          </span>
          <span className={styles.departDroite}>
            <span className={styles.places}>{depart.placesRestantes}</span>
            <span className={styles.placesLibelle}>
              {t("depart.places", { count: depart.placesRestantes })}
            </span>
          </span>
        </section>

        <section className={styles.carteDernier}>
          <div className={styles.ligne}>
            <span className={styles.dernierLibelle}>
              {dernierBillet ? t("dernier.libelle", { ecoule: ecouleTexte }) : t("dernier.aucun")}
            </span>
            {dernierBillet && (
              <span className={styles.dernierDetail}>
                {t("dernier.detail", {
                  numero: sequenceSur4(dernierBillet.sequence),
                  siege: dernierBillet.siege,
                  nom: dernierBillet.nom ?? t("dernier.sansNom"),
                })}
              </span>
            )}
          </div>
          <div className={`${styles.ligne} ${styles.ligneBase}`}>
            <span className={styles.prochainLibelle}>{t("prochain")}</span>
            <span className={styles.prix}>
              {formaterMontant(prochain.prix)} <span className={styles.devise}>F</span>
            </span>
          </div>
          <span className={styles.siegeSuivant}>
            {t("siegeSuivant")} <strong className={styles.siegeNumero}>{prochain.siege}</strong>{" "}
            {t("noteQuai")}
          </span>
        </section>

        <div className={styles.paiements}>
          <button
            type="button"
            className={`${styles.paiement} ${styles.cash}`}
            aria-busy={occupe}
            onClick={() => toucher("cash", telephone)}
          >
            <IconeCaisse taille={40} trait={2.2} />
            <span className={styles.paiementLibelle}>{t("paiements.cash.libelle")}</span>
            <span className={styles.paiementDetail}>
              {toucheMention(1)}
              {t("paiements.cash.ligne1")} <br />
              {t("paiements.cash.ligne2")}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.paiement} ${styles.momo}`}
            aria-busy={occupe}
            data-push={pushEnvoye}
            onClick={() => toucher("momo", telephone)}
          >
            <IconeTelephone taille={40} />
            <span className={styles.paiementLibelle}>{t("paiements.momo.libelle")}</span>
            <span className={styles.paiementDetail}>
              {toucheMention(1)}
              {pushEnvoye ? t("paiements.momo.pushEnvoye") : t("paiements.momo.ligne1")} <br />
              {toucheMention(2)}
              {t("paiements.momo.ligne2")}
            </span>
          </button>
        </div>

        <div className={styles.options}>
          <button
            type="button"
            className={commun.option}
            aria-pressed={deuxPlaces}
            onClick={() => setDeuxPlaces((v) => !v)}
          >
            {t("options.deuxPlaces")}
          </button>
          <button
            type="button"
            className={commun.option}
            aria-pressed={telephone !== null}
            onClick={() => setFeuille({ ouverte: "numero", apres: null })}
          >
            {telephone === null ? t("options.numero") : telephoneAffiche(telephone)}
          </button>
          <button
            type="button"
            className={commun.option}
            onClick={() => setFeuille({ ouverte: "depart" })}
          >
            {t("options.autreDepart")}
          </button>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <span>
          {t("pied.vendus")} <strong className={styles.vendus}>{etat.vendusEnCadence}</strong>{" "}
          {t("pied.annulations", { count: etat.annulations })}
        </span>
        <span className={styles.synchro}>
          <span
            className={`${styles.point} am-pulse`}
            data-etat={synchro.etat}
            aria-hidden="true"
          />
          {sync}
        </span>
      </EcranPied>

      <SaisieNumero
        ouverte={feuille?.ouverte === "numero"}
        onFermer={() => setFeuille(null)}
        onValider={numeroValide}
        obligatoire={numeroObligatoire}
        initial={telephone}
      />
      <ChoixDepart
        ouverte={feuille?.ouverte === "depart"}
        onFermer={() => setFeuille(null)}
        departId={depart.departId}
        onChoisir={(id) => {
          onChoisirDepart(id);
          setFeuille(null);
        }}
      />
    </RacineCadence>
  );
}
