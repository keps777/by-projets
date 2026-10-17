import { voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { BadgeTouche, Champ, ChampTelephone, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { BoutonPayer } from "./BoutonPayer";
import {
  decomposerDevis,
  deviseDemandee,
  estFeminin,
  formaterConversion,
  formaterMontant,
  formaterTelephone,
  heureDouala,
  jourCourt,
  jourDemande,
  jourSemaine,
  normaliserTelephone,
  resumeCarte,
  siegeAReserver,
  urlAuthentificationSure,
} from "./calculs";
import { useCommandeProche } from "./commande-proche";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { useSuiviPaiement, type PaiementEnAttente } from "./suivi-paiement";
import styles from "./proche.module.css";

/** Trajet proposé quand l'adresse n'en donne pas (`?depart=BAF&arrivee=DLA&jour=2027-01-10`). */
const TRAJET_PAR_DEFAUT = { depart: "BAF", arrivee: "DLA" } as const;
/** Devise de paiement du voyageur à l'étranger quand l'adresse n'en donne pas (`?devise=EUR`). */
const DEVISE_PAR_DEFAUT = "CAD";
/** Valeur de `choix` pour « + Nouveau numéro ». */
const NOUVEAU = "nouveau";

/**
 * Planche « Proche » (touche 2) : payer par carte, depuis l'étranger, le voyage d'un proche qui reçoit son billet
 * par SMS. Les lectures (proches, départs, plan de sièges, devis, moyens de paiement) et les écritures (commande,
 * paiement, prévenir le proche) passent par les hooks voyageur de l'api-client.
 */
export function EcranProche() {
  const [adresse] = useSearchParams();
  const depart = adresse.get("depart") ?? TRAJET_PAR_DEFAUT.depart;
  const arrivee = adresse.get("arrivee") ?? TRAJET_PAR_DEFAUT.arrivee;
  const jour = jourDemande(adresse.get("jour"));
  const devise = deviseDemandee(adresse.get("devise"), DEVISE_PAR_DEFAUT);

  const proches = voyageur.useProches();
  const recherche = voyageur.useRechercheDeparts({ depart, arrivee, ...(jour ? { jour } : {}) });
  const requetes = [proches, recherche];

  if (proches.data === undefined || recherche.data === undefined) {
    if (requetes.some((requete) => requete.isError)) {
      return <EtatErreur onReessayer={() => requetes.forEach((r) => void r.refetch())} />;
    }
    return <EtatChargement />;
  }
  if (recherche.data.departs.length === 0) return <EtatVide />;

  return <ChoisirEtPayer proches={proches.data} recherche={recherche.data} devise={devise} />;
}

interface Message {
  cle: string;
}

/** Ce que l'écran garde du proche au moment du paiement, pour le prévenir une fois le billet émis. */
interface Cible {
  procheId: string | undefined;
  nom: string;
  telephone: string | undefined;
  prevenir: boolean;
}

interface Props {
  proches: contrats.Proche[];
  recherche: contrats.ResultatRechercheDeparts;
  devise: string;
}

function ChoisirEtPayer({ proches, recherche, devise }: Props) {
  const { t, i18n } = useTranslation("Proche");
  const navigate = useNavigate();
  const idPrevenir = useId();

  const [choixProche, setChoixProche] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [telephoneTouche, setTelephoneTouche] = useState(false);
  const [choixDepart, setChoixDepart] = useState<string | null>(null);
  const [prevenir, setPrevenir] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState<PaiementEnAttente | null>(null);
  const envoiEnCours = useRef(false);
  const termine = useRef(false);
  const cible = useRef<Cible | null>(null);

  // Le proche : celui que je touche, sinon le premier de ma liste, sinon un nouveau numéro.
  const proche =
    choixProche === NOUVEAU ? undefined : (proches.find((p) => p.id === choixProche) ?? proches[0]);
  const nouveau = proche === undefined;
  const nomSaisi = nom.trim();
  const telephoneSaisi = normaliserTelephone(telephone);
  const destinataireValide = proche !== undefined || (nomSaisi !== "" && telephoneSaisi !== null);
  const nomDuProche = proche?.nom ?? nomSaisi;
  const contexte = estFeminin(nomDuProche) ? "f" : undefined;

  // Le départ : celui que je touche, sinon le premier de la liste (la recherche en contient toujours un).
  const depart = recherche.departs.find((d) => d.id === choixDepart) ?? recherche.departs[0]!;

  const plan = voyageur.usePlanSieges(
    { departId: depart.id },
    { placeholderData: keepPreviousData },
  );
  const devis = voyageur.useDevis(
    { departId: depart.id, places: 1 },
    { placeholderData: keepPreviousData },
  );
  const moyens = voyageur.useMoyensPaiement();

  const siege = plan.data ? siegeAReserver(plan.data) : undefined;
  const pret =
    plan.data !== undefined &&
    devis.data !== undefined &&
    !plan.isPlaceholderData &&
    !devis.isPlaceholderData;
  const demande: contrats.CreerCommande | null =
    pret && siege !== undefined && destinataireValide
      ? {
          departId: depart.id,
          sieges: [siege.numero],
          pour: "proche",
          devise,
          ...(proche
            ? { procheId: proche.id }
            : { passagers: [{ nom: nomSaisi, telephone: telephoneSaisi! }] }),
        }
      : null;
  const commandeProche = useCommandeProche(demande);
  const { commande } = commandeProche;

  const payer = voyageur.usePayerCommande();
  const ajouterProche = voyageur.useAjouterProche();
  const prevenirProche = voyageur.usePrevenirProche();
  const suivi = useSuiviPaiement(attente);

  /** Le paiement est fait et le billet existe : on prévient le proche si demandé, puis on ouvre le billet. */
  async function terminer(billetId: string) {
    if (termine.current) return;
    termine.current = true;
    const visee = cible.current;
    if (visee?.prevenir) {
      try {
        let procheId = visee.procheId;
        if (procheId === undefined && visee.telephone !== undefined) {
          const cree = await ajouterProche.mutateAsync({
            nom: visee.nom,
            telephone: visee.telephone,
            prevenuALArrivee: true,
          });
          procheId = cree.id;
        }
        if (procheId !== undefined) await prevenirProche.mutateAsync({ billetId, procheId });
      } catch {
        // Le billet est payé et émis : la préférence se règle depuis le suivi du bus, elle ne bloque pas l'ouverture.
      }
    }
    void navigate(urlPlanche("Pass", { billetId }));
  }

  /** Un nouveau choix efface l'ancien message, sauf l'attente d'un paiement en cours. */
  function effacerMessage() {
    setMessage((courant) => (courant?.cle === "attente" ? courant : null));
  }

  /** Le paiement n'a pas abouti : la commande est abandonnée, la suivante repart de zéro. */
  function echouer(cle: string) {
    setAttente(null);
    commandeProche.renouveler();
    setMessage({ cle });
  }

  useEffect(() => {
    if (attente === null) return;
    if (suivi.etat === "reussi" && suivi.billetId !== undefined) {
      void terminer(suivi.billetId);
    } else if (suivi.etat === "echoue") {
      echouer("echec");
    } else if (suivi.etat === "expire") {
      echouer("delai");
    }
    // `terminer` et `echouer` changent à chaque rendu : seule l'issue du paiement compte.
  }, [attente, suivi.etat, suivi.billetId]);

  async function lancerPaiement() {
    if (envoiEnCours.current || attente !== null) return;
    if (!destinataireValide) {
      setMessage({ cle: "saisirProche" });
      return;
    }
    if (siege === undefined && plan.data !== undefined && !plan.isPlaceholderData) {
      setMessage({ cle: "complet" });
      return;
    }
    if (demande === null) {
      // Le prix ou le siège ne sont pas encore là : en panne on relit, sinon un instant de patience.
      if (plan.isError) void plan.refetch();
      if (devis.isError) void devis.refetch();
      return;
    }
    envoiEnCours.current = true;
    setEnvoi(true);
    setMessage(null);
    try {
      let aPayer: contrats.Commande;
      try {
        aPayer = await commandeProche.obtenir();
      } catch {
        setMessage({ cle: "prix" });
        return;
      }
      // Le jeton de carte vient du prestataire de paiement (champs hébergés) ; sans lui l'écran envoie la demande
      // telle quelle et le serveur répond.
      const paiement = await payer.mutateAsync({ commandeId: aPayer.id, moyen: "carte" });
      cible.current = {
        procheId: proche?.id,
        nom: nomDuProche,
        telephone: proche ? undefined : (telephoneSaisi ?? undefined),
        prevenir,
      };
      termine.current = false;
      const authentification = urlAuthentificationSure(paiement.urlAuthentification);
      if (authentification !== undefined) window.open(authentification, "_blank", "noopener");
      setMessage({ cle: "attente" });
      setAttente({
        paiementId: paiement.id,
        commandeId: aPayer.id,
        expireA: aPayer.expireA,
        statutInitial: paiement.statut,
      });
    } catch {
      // La commande a pu expirer entre-temps (15 min) : la prochaine tentative repart d'une commande neuve.
      commandeProche.renouveler();
      setMessage({ cle: "demarrage" });
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }
  }

  // Le prix (devis) et le siège (plan) arrivent après la liste des départs : la page s'affiche sans attendre, les
  // lignes qui en dépendent se complètent.
  const { billet, frais } = devis.data
    ? decomposerDevis(devis.data)
    : { billet: depart.prix, frais: 0 };
  const conversion = commande?.conversion;
  const carte = resumeCarte(moyens.data ?? []);
  const prixEnPanne = (plan.isError && plan.data === undefined) || (devis.isError && !devis.data);
  const messageAffiche = message ?? (commandeProche.echec || prixEnPanne ? { cle: "prix" } : null);
  const enAttente = attente !== null;

  return (
    <>
      <Entete
        espace="ample"
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="Proche">
        {messageAffiche && (
          <p
            role={messageAffiche.cle === "attente" ? "status" : "alert"}
            className={messageAffiche.cle === "attente" ? styles.attente : styles.alerte}
          >
            {t(`messages.${messageAffiche.cle}`)}
          </p>
        )}

        <div role="group" aria-label={t("proches.groupe")} className={styles.proches}>
          {proches.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.proche}
              aria-pressed={p.id === proche?.id}
              onClick={() => {
                if (enAttente) return;
                setChoixProche(p.id);
                effacerMessage();
              }}
            >
              <span className={styles.initiales} aria-hidden="true">
                {p.initiales}
              </span>
              {p.nom}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.proche} ${styles.nouveau}`}
            aria-pressed={nouveau}
            onClick={() => {
              if (enAttente) return;
              setChoixProche(NOUVEAU);
              effacerMessage();
            }}
          >
            {t("proches.nouveau")}
          </button>
        </div>

        <div className={styles.carte}>
          {proche ? (
            <div className={styles.destinataire}>
              <span className={styles.destinataireNom}>
                {proche.nomComplet ? `${proche.nom} · ${proche.nomComplet}` : proche.nom}
              </span>
              {proche.telephone && (
                <span className={styles.telephone}>{formaterTelephone(proche.telephone)}</span>
              )}
            </div>
          ) : (
            <div className={styles.saisie}>
              <Champ
                label={t("saisie.nom")}
                value={nom}
                autoComplete="off"
                onChange={(e) => {
                  setNom(e.target.value);
                  effacerMessage();
                }}
              />
              <ChampTelephone
                label={t("saisie.telephone")}
                value={telephone}
                valide={telephoneSaisi !== null}
                {...(telephoneTouche && telephone !== "" && telephoneSaisi === null
                  ? { erreur: t("saisie.telephoneInvalide") }
                  : {})}
                onChange={(e) => {
                  setTelephone(e.target.value);
                  effacerMessage();
                }}
                onBlur={() => setTelephoneTouche(true)}
              />
            </div>
          )}
          <div className={styles.trajet}>
            <span className={styles.trajetVilles}>
              {recherche.depart.nom} <span className={styles.fleche}>→</span>{" "}
              {recherche.arrivee.nom}
            </span>
            <span className={styles.trajetJour}>{jourCourt(recherche.jour, i18n.language)}</span>
          </div>
        </div>

        <div className={styles.departs}>
          <div className={styles.departsTete}>
            <span>{t("departs.titre", { jour: jourSemaine(recherche.jour, i18n.language) })}</span>
            <span>{t("departs.aide", { context: contexte })}</span>
          </div>
          {recherche.departs.map((d) => {
            const choisi = d.id === depart.id;
            const siegeChoisi = choisi && siege?.choisi ? siege : undefined;
            return (
              <button
                key={d.id}
                type="button"
                className={styles.depart}
                aria-pressed={choisi}
                onClick={() => {
                  if (enAttente) return;
                  setChoixDepart(d.id);
                  effacerMessage();
                }}
              >
                <span className={styles.heure}>{heureDouala(d.heureDepart)}</span>
                <span className={styles.departTextes}>
                  <span className={styles.compagnie}>
                    {d.compagnie.nom}{" "}
                    <span className={styles.classe} data-classe={d.classe}>
                      {t(`classe.${d.classe}`)}
                    </span>
                  </span>
                  <span className={styles.departDetail}>
                    {t("departs.places", { count: d.placesLibres })}
                    {siegeChoisi &&
                      ` · ${
                        siegeChoisi.emplacement
                          ? t("departs.siege", {
                              numero: siegeChoisi.numero,
                              emplacement: siegeChoisi.emplacement,
                            })
                          : t("departs.siegeSansEmplacement", { numero: siegeChoisi.numero })
                      }`}
                  </span>
                </span>
                <span className={styles.prix}>{formaterMontant(d.prix)}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.paiement}>
          <div className={styles.paiementLigne}>
            <span className={styles.paiementTitre}>
              {t("paiement.libelle", { devise: conversion?.devise ?? devise })}
            </span>
            {carte && <span className={styles.paiementCarte}>{carte}</span>}
          </div>
          <div className={`${styles.paiementLigne} ${styles.paiementDetail}`}>
            <span>
              {frais > 0
                ? t("paiement.frais", {
                    billet: formaterMontant(billet),
                    frais: formaterMontant(frais),
                  })
                : t("paiement.sansFrais", { billet: formaterMontant(billet) })}
            </span>
            <span className={styles.conversion}>
              {conversion && t("paiement.conversion", { montant: formaterConversion(conversion) })}
            </span>
          </div>
          <label className={styles.prevenir} htmlFor={idPrevenir}>
            <button
              id={idPrevenir}
              type="button"
              role="switch"
              aria-checked={prevenir}
              className={styles.interrupteur}
              onClick={() => setPrevenir((actif) => !actif)}
            >
              <span className={styles.pastille} aria-hidden="true" />
            </button>
            {t("paiement.prevenir", { context: contexte })}
          </label>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <BoutonPayer
          libelle={t("payer.libelle", { nom: nomDuProche || t("proches.sansNom") })}
          detail={t("payer.detail")}
          touche={3}
          prix={devis.data ? `${formaterMontant(devis.data.total)} F` : ""}
          enCours={envoi || enAttente}
          onClick={() => void lancerPaiement()}
        />
        <span className={styles.aide}>{t("payer.aide", { context: contexte })}</span>
      </EcranPied>
    </>
  );
}
