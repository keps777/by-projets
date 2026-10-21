import { ErreurHttp, colis as api } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import {
  Champ,
  EcranCorps,
  EcranPied,
  Entete,
  IconeFleche,
  SelecteurDeroulant,
} from "@afrimove/ui";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  decouperEngagement,
  garderBrouillon,
  oublierBrouillon,
  problemesDe,
  reprendreBrouillon,
  versBrouillon,
  versFiche,
  type Saisie,
} from "./fiche";
import { IconeAppareilPhoto, IconePosition, IconeVerifiee } from "./icones";
import styles from "./relaisinscription.module.css";

/** Le serveur n'a pas de fiche à proposer. */
function introuvable(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « RelaisInscription » (22c, étape 1 / 3) : la fiche de la boutique en 3 minutes. La fiche et ses choix
 * viennent de `useFormulaireRelais`; le brouillon est gardé par `useEnregistrerBrouillonRelais` (et sur l'appareil, si
 * le réseau lâche); « Envoyer ma fiche » dépose la demande par `useEnvoyerFicheRelais`, puis l'écran de suivi s'ouvre.
 */
export function EcranRelaisInscription() {
  const requete = api.useFormulaireRelais();

  if (requete.data === undefined) {
    if (requete.isError) {
      return introuvable(requete.error) ? (
        <EtatVide />
      ) : (
        <EtatErreur onReessayer={() => void requete.refetch()} />
      );
    }
    return <EtatChargement />;
  }
  return <Fiche formulaire={requete.data} />;
}

/** Les trois traits de l'en-tête : celui de l'étape courante est Ambre. */
function Etapes({ etape }: { etape: contrats.FormulaireRelais["etape"] }) {
  return (
    <span className={styles.etapes} aria-hidden="true">
      {Array.from({ length: etape.total }, (_, i) => (
        <span key={i} className={styles.etape} data-courante={i < etape.courante} />
      ))}
    </span>
  );
}

type Echec = "echec" | "dejaRelais";

function Fiche({ formulaire }: { formulaire: contrats.FormulaireRelais }) {
  const { t } = useTranslation("RelaisInscription");
  const navigate = useNavigate();
  const enregistrer = api.useEnregistrerBrouillonRelais();
  const envoyer = api.useEnvoyerFicheRelais();
  const { fiche, pieces, engagement } = formulaire;
  const positionDetectee = fiche.position.valeur.trim() !== "";

  // Ce que le serveur propose, avec par-dessus ce que l'utilisateur avait déjà tapé sur cet appareil.
  const [saisie, setSaisie] = useState<Saisie>(() =>
    reprendreBrouillon(
      {
        nom: fiche.nom,
        type: fiche.type.valeur,
        ouvert: fiche.ouvert.valeur,
        position: fiche.position.valeur,
        tailleMax: fiche.taille.valeur,
        momo: fiche.momo.valeurMasquee,
        momoPropose: fiche.momo.valeurMasquee,
        facadeRef: null,
      },
      { type: fiche.type.choix, ouvert: fiche.ouvert.choix, tailleMax: fiche.taille.choix },
      positionDetectee,
    ),
  );
  const [tentative, setTentative] = useState(false);
  const [echec, setEchec] = useState<Echec | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  // La saisie la plus récente, lisible depuis un effet de démontage; le dernier brouillon envoyé au serveur.
  const derniere = useRef(saisie);
  const dernierBrouillon = useRef<string>("");
  const termine = useRef(false);
  const enregistrerBrouillon = enregistrer.mutate;
  const sauverRef = useRef<(force: boolean) => void>(() => undefined);

  useEffect(() => {
    dernierBrouillon.current = JSON.stringify(versBrouillon(derniere.current));
    sauverRef.current = (force) => {
      const brouillon = versBrouillon(derniere.current);
      const cle = JSON.stringify(brouillon);
      if (!force && cle === dernierBrouillon.current) return;
      dernierBrouillon.current = cle;
      enregistrerBrouillon({ fiche: brouillon });
    };
  }, [enregistrerBrouillon]);

  // Quitter l'écran (retour, onglet, autre page) garde ce qui a changé depuis le dernier envoi au serveur.
  useEffect(
    () => () => {
      if (!termine.current) sauverRef.current(false);
    },
    [],
  );

  function modifier(changement: Partial<Saisie>) {
    const suivante = { ...derniere.current, ...changement };
    derniere.current = suivante;
    setSaisie(suivante);
    garderBrouillon(suivante, positionDetectee);
  }

  function surFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const pris = evenement.target.files?.length ?? 0;
    evenement.target.value = "";
    // Le téléversement de la photo est hors de ce périmètre : on garde une référence de la photo prise.
    if (pris > 0) modifier({ facadeRef: `photo-${crypto.randomUUID()}` });
  }

  function quitter(destination: "RelaisDevenir" | "Moi", force: boolean) {
    sauverRef.current(force);
    void navigate(urlPlanche(destination));
  }

  function valider() {
    if (envoyer.isPending) return;
    setTentative(true);
    setEchec(null);
    const complete = versFiche(derniere.current);
    if (complete === null) return;
    envoyer.mutate(complete, {
      onSuccess: () => {
        termine.current = true;
        oublierBrouillon();
        void navigate(urlPlanche("RelaisVerification"));
      },
      onError: (erreur) => {
        const code = erreur instanceof ErreurHttp ? erreur.code : undefined;
        if (code === "demande_en_cours") {
          // Une demande est déjà ouverte : son suivi est la bonne suite.
          termine.current = true;
          void navigate(urlPlanche("RelaisVerification"));
        } else {
          setEchec(code === "deja_relais" ? "dejaRelais" : "echec");
        }
      },
    });
  }

  const problemes = problemesDe(saisie);
  const optionsDe = (choix: readonly string[]) => choix.map((c) => ({ valeur: c, libelle: c }));
  const [facade, identite] = pieces;
  const coupe = decouperEngagement(engagement.texte);
  const facadeManquante = tentative && problemes.facade;
  const message = facadeManquante ? "facade" : echec;

  return (
    <>
      <Entete
        className={styles.entete}
        titre={formulaire.titre}
        sousTitre={formulaire.detail}
        retour={{ libelle: t("retour"), onClick: () => quitter("RelaisDevenir", false) }}
        droite={<Etapes etape={formulaire.etape} />}
      />

      <EcranCorps className={styles.corps} data-planche="RelaisInscription">
        <div className={styles.fiche}>
          <Champ
            variante="config"
            className={styles.pleine}
            label={t("champs.nom")}
            name="nom"
            autoComplete="organization"
            value={saisie.nom}
            onChange={(e) => modifier({ nom: e.target.value })}
            erreur={tentative && problemes.nom ? t("erreurs.nom") : undefined}
          />
          <SelecteurDeroulant
            variante="config"
            className={styles.demi}
            label={fiche.type.libelle}
            name="type"
            value={saisie.type}
            options={optionsDe(fiche.type.choix)}
            onChange={(e) => modifier({ type: e.target.value })}
          />
          <SelecteurDeroulant
            variante="config"
            className={styles.demi}
            label={fiche.ouvert.libelle}
            name="ouvert"
            value={saisie.ouvert}
            options={optionsDe(fiche.ouvert.choix)}
            onChange={(e) => modifier({ ouvert: e.target.value })}
          />
          {positionDetectee ? (
            <div className={styles.position}>
              <span className={styles.positionEtiquette}>{fiche.position.libelle}</span>
              <span className={styles.positionValeur}>
                <IconePosition />
                <span className={styles.positionTexte}>{saisie.position}</span>
              </span>
            </div>
          ) : (
            <Champ
              variante="config"
              className={styles.pleine}
              label={fiche.position.libelle}
              name="position"
              value={saisie.position}
              onChange={(e) => modifier({ position: e.target.value })}
              erreur={tentative && problemes.position ? t("erreurs.position") : undefined}
            />
          )}
          <SelecteurDeroulant
            variante="config"
            className={styles.demi}
            label={fiche.taille.libelle}
            name="tailleMax"
            value={saisie.tailleMax}
            options={optionsDe(fiche.taille.choix)}
            onChange={(e) => modifier({ tailleMax: e.target.value })}
          />
          <Champ
            variante="config"
            mono
            className={styles.demi}
            label={fiche.momo.libelle}
            name="momo"
            inputMode="tel"
            autoComplete="tel"
            value={saisie.momo}
            onFocus={(e) => e.target.select()}
            onChange={(e) => modifier({ momo: e.target.value })}
            erreur={tentative && problemes.momo ? t("erreurs.momo") : undefined}
          />
        </div>

        <div className={styles.pieces}>
          {facade && (
            <button
              type="button"
              className={`${styles.piece} ${styles.facade}`}
              data-prise={saisie.facadeRef !== null}
              data-manquante={facadeManquante ? "true" : undefined}
              onClick={() => fichier.current?.click()}
            >
              {saisie.facadeRef === null ? <IconeAppareilPhoto /> : <IconeVerifiee />}
              <span>
                <strong>{facade.titre}</strong>
                <br />
                {facade.detail}
              </span>
            </button>
          )}
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
          {identite && (
            <div className={`${styles.piece} ${styles.verifiee}`}>
              <IconeVerifiee />
              <span>
                <strong>{identite.titre}</strong>
                <br />
                {identite.detail}
              </span>
            </div>
          )}
        </div>

        <div className={styles.engagement}>
          <span className={styles.engagementTitre}>{engagement.titre}</span>
          <span>
            {coupe ? (
              <>
                {coupe.avant}
                <strong>{coupe.gras}</strong>
                {coupe.apres}
              </>
            ) : (
              engagement.texte
            )}
          </span>
        </div>

        <span className={styles.mention}>{formulaire.mention}</span>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {message !== null && (
          <p role="alert" className={styles.message}>
            {t(`messages.${message}`)}
          </p>
        )}
        <button type="button" className={styles.plusTard} onClick={() => quitter("Moi", true)}>
          {t("actions.plusTard.libelle")}
          <br />
          <span className={styles.plusTardDetail}>{t("actions.plusTard.detail")}</span>
        </button>
        <button
          type="button"
          className={styles.envoyer}
          aria-busy={envoyer.isPending}
          onClick={valider}
        >
          <span className={styles.envoyerTextes}>
            <span className={styles.envoyerLibelle}>{t("actions.envoyer.libelle")}</span>
            <span className={styles.envoyerDetail}>{t("actions.envoyer.detail")}</span>
          </span>
          <IconeFleche taille={22} />
        </button>
      </EcranPied>
    </>
  );
}
