import { agence } from "@afrimove/api-client";
import { ApercuEtiquetteColis, BadgeTouche, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { BoutonEncaisser } from "./BoutonEncaisser";
import {
  codeApproche,
  destinataireMasque,
  formaterContact,
  formaterMontant,
  formaterPoids,
  heureDouala,
  lireContact,
  lireMontant,
  lirePoids,
  portDuDevis,
  primeDe,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { usePiloteEtiquette } from "./impression";
import styles from "./guichet-colis.module.css";

export type ColisFormulaire = NonNullable<ReturnType<typeof agence.useColisFormulaire>["data"]>;
type ModePaiement = "cash" | "momo";
type ChampActif = "expediteur" | "destinataire" | "contenu" | "poids" | "valeur";
type Alerte = "saisie" | "echec" | "echecImpression" | null;

/** Planche « GuichetColis » (touche 2) : enregistrer un colis, encaisser, imprimer l'étiquette. */
export function EcranGuichetColis() {
  const requete = agence.useColisFormulaire();
  // La compagnie figure sur l'étiquette ; sans elle l'étiquette reste correcte (mention sans le nom).
  const accueil = agence.useGuichetAccueil();

  if (requete.isPending || (accueil.isPending && !requete.isError)) return <EtatChargement />;
  if (requete.isError) return <EtatErreur onReessayer={() => void requete.refetch()} />;
  if (requete.data.departs.length === 0) {
    return <EtatVide autreVille={requete.data.autreVilleDisponible} />;
  }
  return (
    <EnregistrerColis
      formulaire={requete.data}
      compagnie={accueil.data?.agence.compagnie ?? null}
    />
  );
}

function EnregistrerColis({
  formulaire,
  compagnie,
}: {
  formulaire: ColisFormulaire;
  compagnie: string | null;
}) {
  const { t } = useTranslation("GuichetColis");
  const navigate = useNavigate();
  const pilote = usePiloteEtiquette();
  const appareil = agence.useAppareilAgence();
  const enregistrer = agence.useEnregistrerColis();
  const imprimer = agence.useImprimer();
  const impression = agence.useImpressionEtat();
  const brouillon = formulaire.brouillon;

  const [photo, setPhoto] = useState(brouillon?.photoPrise ?? false);
  const [expediteur, setExpediteur] = useState(
    brouillon ? formaterContact(brouillon.expediteur) : "",
  );
  const [destinataire, setDestinataire] = useState(
    brouillon ? formaterContact(brouillon.destinataire) : "",
  );
  const [contenu, setContenu] = useState(brouillon?.contenu ?? "");
  const [poids, setPoids] = useState(brouillon ? formaterPoids(brouillon.poidsKg) : "");
  const [valeur, setValeur] = useState(brouillon ? formaterMontant(brouillon.valeurDeclaree) : "");
  const [departId, setDepartId] = useState(
    brouillon?.departId ?? formulaire.departs[0]?.departId ?? "",
  );
  const [mode, setMode] = useState<ModePaiement>(
    brouillon?.modePaiement === "momo" ? "momo" : "cash",
  );
  const [assure, setAssure] = useState(
    brouillon?.assure ?? formulaire.devis.lignes.some((l) => l.code === "assurance"),
  );
  // Le champ « courant » (bord ambre) : le destinataire à l'ouverture, puis le dernier champ touché.
  const [actif, setActif] = useState<ChampActif>("destinataire");
  const [tentative, setTentative] = useState(false);
  const [alerte, setAlerte] = useState<Alerte>(null);
  const [enregistre, setEnregistre] = useState<{ colisId: string; numero: string } | null>(null);

  const fichier = useRef<HTMLInputElement>(null);
  const colisId = useRef<string | null>(null);
  const enCours = useRef(false);

  const depart = formulaire.departs.find((d) => d.departId === departId) ?? formulaire.departs[0];
  const contactExpediteur = lireContact(expediteur);
  const contactDestinataire = lireContact(destinataire);
  const poidsKg = lirePoids(poids);
  const valeurDeclaree = lireMontant(valeur);
  const prime = primeDe(valeurDeclaree, formulaire.devis.lignes);
  const total = portDuDevis(formulaire.devis.lignes) + (assure ? prime : 0);

  const invalide = {
    photo: !photo,
    expediteur: contactExpediteur === null,
    destinataire: contactDestinataire === null,
    contenu: contenu.trim() === "",
    poids: poidsKg === null,
    valeur: valeurDeclaree === null,
  };
  const incomplet = Object.values(invalide).some(Boolean);
  const marque = (champ: keyof typeof invalide) =>
    tentative && invalide[champ] ? true : undefined;

  const numero = enregistre?.numero ?? formulaire.prochainNumero.numero;
  const heure = depart ? heureDouala(depart.heureDepart) : "";
  const trajet = {
    origine: formulaire.etiquette.trajet.origine,
    // Le code de gare vient du serveur pour le départ qu'il a préparé ; un autre départ prend trois lettres de sa ville.
    destination:
      depart && depart.heureDepart === formulaire.etiquette.heureDepart
        ? formulaire.etiquette.trajet.destination
        : codeApproche(depart?.destination ?? ""),
  };
  const etat = (impression.data?.imprimante ?? formulaire.imprimante).etat;

  function choisirPhoto(evenement: ChangeEvent<HTMLInputElement>) {
    if (evenement.target.files?.length) setPhoto(true);
    evenement.target.value = "";
  }

  async function surEncaisser(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (enCours.current) return;
    if (
      incomplet ||
      !depart ||
      !contactExpediteur ||
      !contactDestinataire ||
      poidsKg === null ||
      valeurDeclaree === null
    ) {
      setTentative(true);
      setAlerte("saisie");
      return;
    }
    enCours.current = true;
    setAlerte(null);
    let phase: "echec" | "echecImpression" = "echec";
    try {
      let colis = enregistre;
      if (!colis) {
        colisId.current ??= crypto.randomUUID();
        const id = colisId.current;
        // Comme la vente (anomalie A9 de la recette) : le colis part avec le numéro que le serveur annonce.
        appareil.aligner("colis", formulaire.prochainNumero.sequence);
        const resultat = await enregistrer.mutateAsync({
          colisId: id,
          departId: depart.departId,
          expediteur: contactExpediteur,
          destinataire: contactDestinataire,
          contenu: contenu.trim(),
          poidsKg,
          valeurDeclaree,
          assure,
          photoRef: `photo-${id}`,
          paiement: { mode, montant: total },
        });
        colis = { colisId: id, numero: resultat.colis.numero };
        setEnregistre(colis);
      }
      phase = "echecImpression";
      await pilote.imprimer({
        numero: colis.numero,
        largeurMm: formulaire.etiquette.largeurMm,
        hauteurMm: formulaire.etiquette.hauteurMm,
        trajet,
        destinataire: destinataireMasque(destinataire),
        poidsKg,
        heureDepart: heure,
        compagnie,
      });
      await imprimer.mutateAsync({
        document: "etiquette_colis",
        documentId: colis.colisId,
        copies: 1,
        reimpression: false,
      });
      void navigate(urlPlanche("Guichet"));
    } catch {
      setAlerte(phase);
    } finally {
      enCours.current = false;
    }
  }

  const modeCash = mode === "cash";
  const montant = formaterMontant(total);
  const mention = compagnie
    ? t("etiquette.mention", { compagnie })
    : t("etiquette.mentionSansCompagnie");

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", { numero, guichet: formulaire.guichet.rang })}
        retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="GuichetColis">
        <div className={styles.identites}>
          <button
            type="button"
            className={styles.photo}
            data-invalide={tentative && invalide.photo ? "true" : undefined}
            onClick={() => fichier.current?.click()}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {photo ? (
              <span>
                {t("photo.prise")}
                <br />
                {t("photo.reprendre")}
              </span>
            ) : (
              <span>{t("photo.aPrendre")}</span>
            )}
          </button>
          <input
            ref={fichier}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.fichier}
            tabIndex={-1}
            aria-hidden="true"
            onChange={choisirPhoto}
          />
          <div className={styles.colonne}>
            <Saisie
              id="exp"
              libelle={t("champs.expediteur")}
              valeur={expediteur}
              actif={actif === "expediteur"}
              invalide={marque("expediteur")}
              onFocus={() => setActif("expediteur")}
              onChange={setExpediteur}
            />
            <Saisie
              id="dst"
              libelle={t("champs.destinataire")}
              valeur={destinataire}
              actif={actif === "destinataire"}
              invalide={marque("destinataire")}
              onFocus={() => setActif("destinataire")}
              onChange={setDestinataire}
            />
          </div>
        </div>

        <div className={styles.champs}>
          <Saisie
            id="cont"
            libelle={t("champs.contenu")}
            valeur={contenu}
            actif={actif === "contenu"}
            invalide={marque("contenu")}
            onFocus={() => setActif("contenu")}
            onChange={setContenu}
          />
          <Saisie
            id="kg"
            mono
            libelle={t("champs.poids")}
            valeur={poids}
            actif={actif === "poids"}
            invalide={marque("poids")}
            inputMode="decimal"
            onFocus={() => setActif("poids")}
            onChange={setPoids}
          />
          <Saisie
            id="val"
            mono
            libelle={t("champs.valeur")}
            valeur={valeur}
            actif={actif === "valeur"}
            invalide={marque("valeur")}
            inputMode="numeric"
            onFocus={() => setActif("valeur")}
            onChange={setValeur}
          />
        </div>

        <div className={styles.departs}>
          {formulaire.departs.map((d) => {
            const choisi = d.departId === depart?.departId;
            return (
              <button
                key={d.departId}
                type="button"
                className={styles.depart}
                aria-pressed={choisi}
                onClick={() => setDepartId(d.departId)}
              >
                <span className={styles.heure}>{heureDouala(d.heureDepart)}</span>
                <span className={styles.detail}>
                  {t(choisi ? "departs.soute" : "departs.taux", {
                    destination: d.destination,
                    pct: d.soutePct,
                  })}
                </span>
              </button>
            );
          })}
          {formulaire.autreVilleDisponible && (
            <a className={styles.autreVille} href={urlPlanche("InterAgences")}>
              <span className={styles.autreVilleTitre}>{t("departs.autreVille.titre")}</span>
              <span className={styles.detail}>{t("departs.autreVille.detail")}</span>
            </a>
          )}
        </div>

        <ApercuEtiquetteColis
          trajet={`${trajet.origine} → ${trajet.destination}`}
          destinataire={destinataireMasque(destinataire)}
          reference={numero}
          poids={formaterPoids(poidsKg ?? formulaire.etiquette.poidsKg)}
          heure={heure}
          mention={mention}
          statutImprimante={t(`etiquette.imprimante.${etat}`)}
        />

        <div className={styles.modes}>
          <button
            type="button"
            className={styles.mode}
            data-choisi={modeCash}
            aria-pressed={modeCash}
            onClick={() => setMode("cash")}
          >
            {modeCash ? t("paiement.cashMontant", { montant }) : t("paiement.cash")}
          </button>
          <button
            type="button"
            className={styles.mode}
            data-choisi={!modeCash}
            aria-pressed={!modeCash}
            onClick={() => setMode("momo")}
          >
            {modeCash ? t("paiement.momo") : t("paiement.momoMontant", { montant })}
          </button>
          <button
            type="button"
            className={styles.mode}
            aria-pressed={assure}
            onClick={() => setAssure(!assure)}
          >
            {t(assure ? "paiement.assurance" : "paiement.sansAssurance", {
              montant: formaterMontant(prime),
            })}
          </button>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {alerte && (
          <p role="alert" className={styles.alerte}>
            {t(`alertes.${alerte}`)}
          </p>
        )}
        <BoutonEncaisser
          href={urlPlanche("Guichet")}
          touche={3}
          libelle={t(enregistre ? "encaisser.reimprimer" : "encaisser.libelle")}
          detail={t("encaisser.detail")}
          montant={montant}
          enCours={enregistrer.isPending || imprimer.isPending}
          onClick={(e) => void surEncaisser(e)}
        />
      </EcranPied>
    </>
  );
}

interface SaisieProps {
  id: string;
  libelle: string;
  valeur: string;
  actif: boolean;
  invalide: true | undefined;
  mono?: boolean;
  inputMode?: "decimal" | "numeric";
  onFocus: () => void;
  onChange: (valeur: string) => void;
}

/** Champ de la planche : libellé 11/600 au-dessus d'une boîte de 44 px (bord ambre pour le champ courant). */
function Saisie({
  id,
  libelle,
  valeur,
  actif,
  invalide,
  mono,
  inputMode,
  onFocus,
  onChange,
}: SaisieProps) {
  return (
    <label htmlFor={id} className={styles.champ}>
      <span className={styles.libelle}>{libelle}</span>
      <input
        id={id}
        type="text"
        value={valeur}
        inputMode={inputMode}
        className={mono ? `${styles.saisie} ${styles.mono}` : styles.saisie}
        data-actif={actif}
        aria-invalid={invalide}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
