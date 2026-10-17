import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied, Entete, IconeFleche, Stepper } from "@afrimove/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { useParametres } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import {
  estMoi,
  formaterMontant,
  heureDouala,
  jourCourt,
  lienWhatsApp,
  minutesRestantes,
  nomCourt,
  plageSieges,
  siegesAPayer,
  teinteDe,
} from "./calculs";
import { DEMO_GROUPE_ID } from "./demo";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { IconeWhatsApp } from "./icones";
import styles from "./groupe.module.css";

/** Taille du bus à louer pour le devis (« Louer un bus de 30 »). */
const PLACES_BUS = 30;
/** Un groupe qu'on ouvre depuis un départ commence à deux voyageurs, le minimum d'un groupe. */
const VOYAGEURS_INITIAUX = 2;
const VOYAGEURS_MIN = 2;
const VOYAGEURS_MAX = 12;
/** Délai avant de redemander les sièges quand on touche − / + (pour ne bloquer qu'une fois après plusieurs touches). */
const DELAI_MISE_A_JOUR_MS = 400;

const MODES: readonly contrats.ModeGroupe[] = ["groupe", "bus_entier", "cagnotte"];

/** D'où vient le groupe : un groupe existant (`?groupe=`), un départ où le créer (`?depart=`), ou la démonstration. */
interface Source {
  type: "groupe" | "depart";
  id: string;
}

function lireSource(params: URLSearchParams, demonstration: boolean): Source | null {
  const groupe = params.get("groupe");
  if (groupe) return { type: "groupe", id: groupe };
  if (demonstration) return { type: "groupe", id: DEMO_GROUPE_ID };
  const depart = params.get("depart");
  if (depart) return { type: "depart", id: depart };
  return null;
}

type Acquisition =
  | { etat: "vide" }
  | { etat: "chargement" }
  | { etat: "erreur"; reessayer: () => void }
  | { etat: "pret"; groupe: contrats.Groupe };

/** Le groupe de départ : lu s'il existe déjà, sinon créé sur le départ choisi. */
function useAcquisition(source: Source | null): Acquisition {
  const lecture = voyageur.useGroupe(
    { groupeId: source?.type === "groupe" ? source.id : "" },
    { enabled: source?.type === "groupe" },
  );
  const creation = voyageur.useCreerGroupe();
  const lancee = useRef(false);

  function creer(depart: string) {
    creation.mutate({
      departId: depart,
      voyageurs: VOYAGEURS_INITIAUX,
      mode: "groupe",
      placesCoteACote: true,
    });
  }

  useEffect(() => {
    if (source?.type !== "depart" || lancee.current) return;
    lancee.current = true;
    creer(source.id);
    // Une seule fois, à l'ouverture.
  }, []);

  if (source === null) return { etat: "vide" };
  if (source.type === "depart") {
    if (creation.data) return { etat: "pret", groupe: creation.data };
    if (creation.isError) return { etat: "erreur", reessayer: () => creer(source.id) };
    return { etat: "chargement" };
  }
  if (lecture.data) return { etat: "pret", groupe: lecture.data };
  if (lecture.isError) {
    const introuvable = lecture.error instanceof ErreurHttp && lecture.error.statut === 404;
    return introuvable
      ? { etat: "vide" }
      : { etat: "erreur", reessayer: () => void lecture.refetch() };
  }
  return { etat: "chargement" };
}

/**
 * Planche « Groupe » : voyager à plusieurs, bus entier ou cagnotte. Les lectures (groupe, profil) et les écritures
 * (groupe, invitation, devis du bus, commande) passent par les hooks voyageur de l'api-client.
 */
export function EcranGroupe() {
  const { demo, scenario } = useParametres();
  const [params] = useSearchParams();
  // La source est lue à l'ouverture : changer le groupe ensuite met l'adresse à jour sans relire un autre groupe.
  const [source] = useState(() => lireSource(params, demo && scenario === "Groupe"));
  const acquisition = useAcquisition(source);

  if (acquisition.etat === "vide") return <EtatVide />;
  if (acquisition.etat === "erreur") return <EtatErreur onReessayer={acquisition.reessayer} />;
  if (acquisition.etat === "chargement") return <EtatChargement />;
  return <VoyagerEnGroupe groupeInitial={acquisition.groupe} />;
}

interface Message {
  cle: string;
  valeurs?: Record<string, string | number>;
  /** `alerte` pour un échec, `info` pour une confirmation. */
  ton: "alerte" | "info";
}

interface Demande {
  mode: contrats.ModeGroupe;
  voyageurs: number;
}

const demandeDe = (groupe: contrats.Groupe): Demande => ({
  mode: groupe.mode,
  voyageurs: groupe.voyageurs,
});

function VoyagerEnGroupe({ groupeInitial }: { groupeInitial: contrats.Groupe }) {
  const { t } = useTranslation("Groupe");
  const navigate = useNavigate();
  const [, majParams] = useSearchParams();
  const maintenant = useMaintenant();

  const profil = voyageur.useProfil({ retry: false });
  const creerGroupe = voyageur.useCreerGroupe();
  const creerCommande = voyageur.useCreerCommande();
  const devisBus = voyageur.useDevisBus();

  const [groupe, setGroupe] = useState(groupeInitial);
  const [demande, setDemande] = useState<Demande>(() => demandeDe(groupeInitial));
  const [message, setMessage] = useState<Message | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const enCours = useRef(false);
  const dernierAppel = useRef(0);
  const demandeCourante = useRef(demande);
  demandeCourante.current = demande;

  // Une demande (mode, nombre de voyageurs) qui n'est pas encore celle du groupe : on redemande les sièges.
  const enMiseAJour = demande.mode !== groupe.mode || demande.voyageurs !== groupe.voyageurs;
  useEffect(() => {
    if (!enMiseAJour) return;
    const envoyee = demande;
    const minuterie = setTimeout(() => {
      const appel = ++dernierAppel.current;
      creerGroupe.mutate(
        {
          departId: groupe.depart.id,
          voyageurs: envoyee.voyageurs,
          mode: envoyee.mode,
          placesCoteACote: true,
        },
        {
          onSuccess: (nouveau) => {
            if (appel !== dernierAppel.current) return;
            setGroupe(nouveau);
            setMessage(null);
            // Le groupe a changé d'identifiant : l'adresse le garde pour qu'un rechargement le retrouve.
            majParams(
              (actuels) => {
                const suivants = new URLSearchParams(actuels);
                suivants.set("groupe", nouveau.id);
                suivants.delete("depart");
                return suivants;
              },
              { replace: true },
            );
            // Le serveur peut corriger la demande ; sauf si l'on a retouché entre-temps, l'écran s'y aligne.
            if (demandeCourante.current === envoyee) setDemande(demandeDe(nouveau));
          },
          onError: () => {
            if (appel !== dernierAppel.current) return;
            if (demandeCourante.current === envoyee) setDemande(demandeDe(groupe));
            setMessage({ cle: "miseAJour", ton: "alerte" });
          },
        },
      );
    }, DELAI_MISE_A_JOUR_MS);
    return () => clearTimeout(minuterie);
    // La demande ou le groupe change : on repart du délai.
  }, [demande, groupe]);

  const { cagnotte } = groupe;
  const plage = plageSieges(groupe.sieges);
  const minutes = minutesRestantes(groupe.blocageJusqua, maintenant);
  const blocageTermine = minutes === 0;
  const monId = profil.data?.id;
  const jour = jourCourt(groupe.depart.heureDepart);
  const heure = heureDouala(groupe.depart.heureDepart);

  async function payer(tout: boolean) {
    // Les sièges bloqués sont ceux du groupe affiché : on attend que la mise à jour demandée soit faite.
    if (enCours.current || enMiseAJour) return;
    enCours.current = true;
    setEnvoi(true);
    setMessage(null);
    try {
      const commande = await creerCommande.mutateAsync({
        departId: groupe.depart.id,
        sieges: siegesAPayer(groupe.sieges, tout),
        pour: "plusieurs",
      });
      void navigate(urlPlanche("Paiement", { commandeId: commande.id }));
    } catch (erreur) {
      const conflit = erreur instanceof ErreurHttp && erreur.statut === 409;
      setMessage({ cle: conflit ? "siegesPris" : "paiement", ton: "alerte" });
    } finally {
      enCours.current = false;
      setEnvoi(false);
    }
  }

  function partager() {
    const texte = t("partage", {
      trajet: groupe.trajet,
      jour,
      heure,
      part: formaterMontant(cagnotte.partMoi),
      lien: groupe.lienPartage,
    });
    window.open(lienWhatsApp(texte), "_blank", "noopener,noreferrer");
  }

  function demanderDevis() {
    setMessage(null);
    devisBus.mutate(
      { departId: groupe.depart.id, places: PLACES_BUS },
      {
        onSuccess: (devis) =>
          setMessage(
            devis.statut === "chiffre" && devis.montant !== undefined
              ? {
                  cle: "devisChiffre",
                  valeurs: { places: devis.places, montant: formaterMontant(devis.montant) },
                  ton: "info",
                }
              : {
                  cle: "devisEnvoye",
                  valeurs: { places: devis.places, heure: heureDouala(devis.reponseAttendueAvant) },
                  ton: "info",
                },
          ),
        onError: () => setMessage({ cle: "devisEchec", ton: "alerte" }),
      },
    );
  }

  return (
    <>
      <Entete
        espace="ample"
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
      />

      <EcranCorps className={styles.corps} data-planche="Groupe">
        {blocageTermine && (
          <p role="alert" className={styles.alerte}>
            {t("messages.blocageTermine")}
          </p>
        )}
        {message && (
          <p
            role={message.ton === "alerte" ? "alert" : "status"}
            className={message.ton === "alerte" ? styles.alerte : styles.info}
          >
            {t(`messages.${message.cle}`, message.valeurs)}
          </p>
        )}

        <div role="group" aria-label={t("modes.nom")} className={styles.modes}>
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.mode}
              aria-pressed={demande.mode === mode}
              onClick={() => setDemande({ ...demande, mode })}
            >
              {t(`modes.${mode}`)}
            </button>
          ))}
        </div>

        <div className={styles.depart}>
          <div className={styles.departLigne}>
            <span className={styles.trajet}>
              {t("depart.trajet", { trajet: groupe.trajet, jour })}
            </span>
            <span className={styles.heure}>
              {t("depart.heure", {
                heure,
                compagnie: nomCourt(groupe.depart.compagnie.nom),
              })}
            </span>
          </div>
          <Stepper
            label={t("voyageurs.nom")}
            labelMoins={t("voyageurs.moins")}
            labelPlus={t("voyageurs.plus")}
            min={VOYAGEURS_MIN}
            max={VOYAGEURS_MAX}
            value={demande.voyageurs}
            legende={t("voyageurs.legende", { nombre: demande.voyageurs })}
            onChange={(voyageurs) => setDemande({ ...demande, voyageurs })}
          />
          <ul className={styles.sieges}>
            {groupe.sieges.map((siege) => (
              <li key={siege} className={styles.siege}>
                {siege}
              </li>
            ))}
          </ul>
          {plage && !blocageTermine && (
            <span className={styles.reservation}>
              {t("reservation", { premier: plage.premier, dernier: plage.dernier, minutes })}
            </span>
          )}
        </div>

        <section aria-label={t("cagnotte.titre")} className={styles.cagnotte}>
          <div className={styles.cagnotteTitre}>
            <span>{t("cagnotte.titre")}</span>
            <span>
              {t("cagnotte.calcul", {
                nombre: groupe.voyageurs,
                prix: formaterMontant(cagnotte.prixPlace),
                total: formaterMontant(cagnotte.total),
              })}
            </span>
          </div>
          <ul className={styles.participants}>
            {cagnotte.participants.map((participant, rang) => (
              <li key={`${participant.nom}-${rang}`} className={styles.participant}>
                <span className={styles.pastille} data-teinte={teinteDe(rang)} aria-hidden="true">
                  {participant.initiales}
                </span>
                <span className={styles.nom}>
                  {participant.nom}
                  {estMoi(participant, monId) && (
                    <>
                      {" · "}
                      <span className={styles.moi}>{t("cagnotte.moi")}</span>
                    </>
                  )}
                </span>
                <span className={styles.statut} data-statut={participant.statut}>
                  {t(`cagnotte.statut.${participant.statut}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={partager}>
            <IconeWhatsApp className={styles.iconeWhatsApp} />
            {t("actions.whatsapp")}
          </button>
          <button
            type="button"
            className={styles.action}
            aria-busy={devisBus.isPending}
            onClick={demanderDevis}
          >
            {t("actions.bus", { places: PLACES_BUS })}
          </button>
        </div>
      </EcranCorps>

      <EcranPied>
        <div className={styles.payerBloc}>
          <span className={styles.payerTextes}>
            <button
              type="button"
              className={styles.payer}
              aria-busy={envoi || enMiseAJour}
              onClick={() => void payer(false)}
            >
              {t("payer.ma_part", { montant: formaterMontant(cagnotte.partMoi) })}
            </button>
            <button
              type="button"
              className={styles.payerTout}
              aria-busy={envoi || enMiseAJour}
              onClick={() => void payer(true)}
            >
              {t("payer.tout", { montant: formaterMontant(cagnotte.total) })}
            </button>
          </span>
          <IconeFleche taille={24} className={styles.fleche} />
        </div>
      </EcranPied>
    </>
  );
}
