import { ErreurHttp, colis } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { BadgeTouche, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useParametres } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { BoutonPayer } from "./BoutonPayer";
import {
  assuranceDe,
  detailDuPrix,
  formaterContact,
  formaterDestination,
  formaterMontant,
  formaterPoids,
  heureCourte,
  heureDouala,
  lireContact,
  lireMontant,
  saisirMontant,
  villeDe,
} from "./calculs";
import { DEMO_COLIS_ENVOI } from "./demo";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import styles from "./colis-envoi.module.css";

type Mode = contrats.OptionsEnvoiColis["modes"][number]["mode"];
type Message = "saisie" | "photoEchec" | "aucunDepart" | "departFerme" | "devis" | "echec";

/** Écran où l'on continue après le paiement : le suivi du colis, ou le choix du relais / de la livraison. */
const SUITE: Record<Mode, "ColisCode" | "Relais" | "Livraison"> = {
  gare: "ColisCode",
  relais: "Relais",
  moto: "Livraison",
};

/**
 * Planche « ColisEnvoi » (touche 2) : photo du colis, destinataire, départ et assurance sur un seul écran, puis
 * « Payer et obtenir le code ». Les lectures (options d'envoi, devis) et les écritures (lecture de la photo, création
 * du colis) passent par les hooks colis de l'api-client.
 */
export function EcranColisEnvoi() {
  // Destination cherchée par l'expéditeur : absente, le serveur propose la dernière destination connue.
  const [ville, setVille] = useState<string | null>(null);
  const options = colis.useOptionsEnvoiColis(ville === null ? {} : { ville }, {
    placeholderData: keepPreviousData,
  });

  if (options.data === undefined) {
    if (options.isError) return <EtatErreur onReessayer={() => void options.refetch()} />;
    return <EtatChargement />;
  }
  if (ville === null && options.data.departs.length === 0) return <EtatVide />;
  return <Envoyer options={options.data} onVille={setVille} />;
}

function Envoyer({
  options,
  onVille,
}: {
  options: contrats.OptionsEnvoiColis;
  onVille: (ville: string) => void;
}) {
  const { t } = useTranslation("ColisEnvoi");
  const navigate = useNavigate();
  const { demo, scenario } = useParametres();
  const demonstration = demo && scenario === "ColisEnvoi";
  const estimer = colis.useEstimerPhotoColis();
  const creer = colis.useCreerColis();
  const { suggestion } = options;

  const [photo, setPhoto] = useState<contrats.EstimationPhoto | null>(null);
  const [pour, setPour] = useState(() =>
    suggestion ? formaterContact({ nom: suggestion.surnom, telephone: suggestion.telephone }) : "",
  );
  const [ou, setOu] = useState(() =>
    suggestion ? formaterDestination(suggestion.destination) : "",
  );
  const [contenu, setContenu] = useState(() => (demonstration ? DEMO_COLIS_ENVOI.contenu : ""));
  const [valeur, setValeur] = useState(() => (demonstration ? DEMO_COLIS_ENVOI.valeur : ""));
  const [mode, setMode] = useState<Mode>("gare");
  const [assurer, setAssurer] = useState(true);
  const [tentative, setTentative] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const fichier = useRef<HTMLInputElement>(null);
  const enCours = useRef(false);
  const derniereVille = useRef(villeDe(ou));

  // Le prochain départ : celui que le serveur recommande, sinon le premier.
  const offre = options.departs.find((d) => d.recommande) ?? options.departs[0];
  const destinataire = lireContact(pour);
  const valeurDeclaree = lireMontant(valeur);
  const assurance = assuranceDe(valeurDeclaree);
  const valeurAssuree = assurer && assurance ? assurance.valeurAssuree : 0;

  const devis = colis.useDevisColis(
    { departId: offre?.departId ?? "", mode, valeurAssuree },
    { enabled: offre !== undefined, placeholderData: keepPreviousData },
  );

  const invalide = {
    photo: photo === null,
    destinataire: destinataire === null,
    ou: villeDe(ou) === "",
    contenu: contenu.trim() === "",
    valeur: valeurDeclaree === null,
  };
  const marque = (champ: keyof typeof invalide) =>
    tentative && invalide[champ] ? true : undefined;

  function lirePhoto(photoRef: string) {
    setMessage(null);
    estimer.mutate(
      { photoRef },
      {
        onSuccess: (estimation) => setPhoto(estimation),
        onError: () => setMessage("photoEchec"),
      },
    );
  }

  // Démonstration : la planche montre la photo déjà prise.
  useEffect(() => {
    if (demonstration) lirePhoto(DEMO_COLIS_ENVOI.photoRef);
    // Une seule fois, à l'ouverture.
  }, []);

  function surFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const pris = evenement.target.files?.length ?? 0;
    evenement.target.value = "";
    // Le téléversement de la photo est hors de ce périmètre : on garde une référence de la photo prise.
    if (pris > 0) lirePhoto(`photo-${crypto.randomUUID()}`);
  }

  function quitterOu() {
    const nouvelle = villeDe(ou);
    if (nouvelle === "" || nouvelle === derniereVille.current) return;
    derniereVille.current = nouvelle;
    onVille(nouvelle);
  }

  async function payer() {
    if (enCours.current) return;
    setTentative(true);
    if (Object.values(invalide).some(Boolean) || !destinataire || valeurDeclaree === null) {
      setMessage("saisie");
      return;
    }
    if (!offre) {
      setMessage("aucunDepart");
      return;
    }
    if (!photo || devis.data === undefined) {
      setMessage("devis");
      return;
    }
    enCours.current = true;
    setMessage(null);
    try {
      // Le colis est créé et payé en mode « gare » ; le relais ou la livraison se règlent sur l'écran suivant.
      const cree = await creer.mutateAsync({
        departId: offre.departId,
        photoRef: photo.photoRef,
        destinataire,
        contenu: contenu.trim(),
        poidsKg: photo.poidsKg,
        valeurDeclaree,
        assurer: assurer && assurance !== null,
        mode: "gare",
        paiement: { moyen: "mtn_momo" },
      });
      void navigate(urlPlanche(SUITE[mode], { colisId: cree.colis.id }));
    } catch (erreur) {
      setMessage(
        erreur instanceof ErreurHttp && erreur.code === "depart_ferme" ? "departFerme" : "echec",
      );
    } finally {
      enCours.current = false;
    }
  }

  const autresModes = options.modes.filter((m) => m.mode !== "gare");
  const mots = {
    port: t("prix.mots.port"),
    frais_app: t("prix.mots.frais"),
    assurance: t("prix.mots.assurance"),
    relais: t("prix.mots.relais"),
    livraison: t("prix.mots.livraison"),
  };
  const detailPrix = [
    devis.data ? detailDuPrix(devis.data.lignes, mots) : "",
    options.interdits ? t("prix.interdits", { liste: options.interdits }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Entete
        espace="ample"
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Main") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="ColisEnvoi">
        {message && (
          <p role="alert" className={styles.alerte}>
            {t(`messages.${message}`)}
          </p>
        )}

        <button
          type="button"
          className={styles.photo}
          data-invalide={tentative && invalide.photo ? "true" : undefined}
          onClick={() => fichier.current?.click()}
        >
          <svg width="130" height="100" viewBox="0 0 130 100" aria-hidden="true">
            <path
              d="M20 35l45-20 45 20v40l-45 20-45-20z"
              fill="var(--am-surface-2)"
              stroke="var(--am-trait-fort)"
              strokeWidth="2"
            />
            <path
              d="M20 35l45 20 45-20M65 55v40"
              fill="none"
              stroke="var(--am-trait-fort)"
              strokeWidth="2"
            />
            <path d="M42 25l45 20" stroke="var(--am-ambre)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className={styles.balayage} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.coinHautGauche}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.coinHautDroit}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.coinBasGauche}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.coinBasDroit}`} aria-hidden="true" />
          <span className={styles.photoTexte} data-attente={photo === null}>
            {photo
              ? t("photo.prise", { taille: photo.taille, poids: formaterPoids(photo.poidsKg) })
              : estimer.isPending
                ? t("photo.lecture")
                : t("photo.aPrendre")}
          </span>
        </button>
        <input
          ref={fichier}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.fichier}
          tabIndex={-1}
          aria-hidden="true"
          onChange={surFichier}
        />

        <div className={`${styles.deux} ${styles.deuxEgal}`}>
          <Saisie
            id="dest"
            libelle={t("champs.pour")}
            valeur={pour}
            invalide={marque("destinataire")}
            onChange={setPour}
          />
          <Saisie
            id="ou"
            libelle={t("champs.ou")}
            valeur={ou}
            invalide={marque("ou")}
            onChange={setOu}
            onBlur={quitterOu}
          />
        </div>
        <div className={`${styles.deux} ${styles.deuxContenu}`}>
          <Saisie
            id="contenu"
            libelle={t("champs.contenu")}
            valeur={contenu}
            invalide={marque("contenu")}
            onChange={setContenu}
          />
          <Saisie
            id="valeur"
            mono
            libelle={t("champs.valeur")}
            valeur={valeur}
            inputMode="numeric"
            invalide={marque("valeur")}
            onChange={(texte) => setValeur(saisirMontant(texte))}
          />
        </div>

        <div className={styles.depart}>
          <div className={styles.departTitre}>
            <span>{t("depart.titre")}</span>
            <span>{t("depart.sousTitre")}</span>
          </div>
          {offre ? (
            <button
              type="button"
              className={`${styles.ligne} ${styles.ligneDepart}`}
              aria-pressed={mode === "gare"}
              onClick={() => setMode("gare")}
            >
              <span className={styles.heure}>{heureDouala(offre.heureDepart)}</span>
              <span className={styles.ligneTexte}>
                <Trans
                  t={t}
                  i18nKey="depart.gare"
                  values={{
                    compagnie: offre.compagnie,
                    retrait: offre.retrait,
                    heure: heureCourte(offre.arriveePrevue),
                  }}
                  components={{ fort: <strong /> }}
                />
              </span>
              <span className={styles.port}>{formaterMontant(offre.port)}</span>
            </button>
          ) : (
            <p className={styles.aucunDepart}>{t("depart.aucun")}</p>
          )}
          {autresModes.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`${styles.ligne} ${styles.ligneOption}`}
              aria-pressed={mode === option.mode}
              onClick={() => setMode(mode === option.mode ? "gare" : option.mode)}
            >
              <span className={styles.mode} data-mode={option.mode}>
                {t(`modes.${option.mode}`)}
              </span>
              <span className={styles.ligneTexte}>{option.detail}</span>
              <span className={styles.supplement}>+{formaterMontant(option.supplement)}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={assurer}
          className={styles.assurance}
          onClick={() => setAssurer(!assurer)}
        >
          <span>
            <strong>
              {assurance
                ? t("assurance.libelle", { valeur: formaterMontant(assurance.valeurAssuree) })
                : t("assurance.sansValeur")}
            </strong>{" "}
            <span className={styles.assuranceDetail}>
              {assurance
                ? t("assurance.detail", {
                    prime: formaterMontant(assurance.prime),
                    assureur: options.assurance.assureur,
                  })
                : t("assurance.regle", {
                    taux: options.assurance.tauxPct,
                    minimum: formaterMontant(options.assurance.minimum),
                    assureur: options.assurance.assureur,
                  })}
            </span>
          </span>
          <span className={styles.interrupteur} data-actif={assurer} aria-hidden="true">
            <span className={styles.pastille} />
          </span>
        </button>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <BoutonPayer
          libelle={t("payer.libelle")}
          detail={t("payer.detail")}
          touche={3}
          prix={devis.data ? `${formaterMontant(devis.data.total)} F` : t("payer.calcul")}
          enCours={creer.isPending}
          onClick={() => void payer()}
        />
        <span className={styles.detailPrix}>{detailPrix}</span>
      </EcranPied>
    </>
  );
}

interface SaisieProps {
  id: string;
  libelle: string;
  valeur: string;
  invalide: true | undefined;
  mono?: boolean;
  inputMode?: "numeric";
  onChange: (valeur: string) => void;
  onBlur?: () => void;
}

/** Champ de la planche : libellé 11/600 au-dessus d'une boîte de 46 px. */
function Saisie({ id, libelle, valeur, invalide, mono, inputMode, onChange, onBlur }: SaisieProps) {
  return (
    <label htmlFor={id} className={styles.champ}>
      <span className={styles.libelle}>{libelle}</span>
      <input
        id={id}
        type="text"
        value={valeur}
        inputMode={inputMode}
        className={mono ? `${styles.saisie} ${styles.mono}` : styles.saisie}
        aria-invalid={invalide}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
