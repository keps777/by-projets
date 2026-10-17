import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps, EcranPied, Entete, Etiquette, Pastille, useConception } from "@afrimove/ui";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  dansLesBornes,
  estOptionRegulier,
  formaterMontant,
  formaterNote,
  lirePrix,
  momentDepart,
  prixAutorise,
  saisirPrix,
} from "./formats";
import styles from "./conducteur.module.css";

type Message = "nonVerifie" | "prix" | "champs" | "chevauche" | "echec";

/**
 * Planche « Conducteur » (touche 2) : proposer mon trajet. Le formulaire est lu par `useFormulairePublication`
 * (le dernier trajet du conducteur, ou le trajet de démonstration) ; « Publier le trajet » l'écrit par
 * `usePublierTrajet` puis ramène au covoiturage, où les voyageurs le voient.
 */
export function EcranConducteur() {
  const requete = voyageur.useFormulairePublication();
  const formulaire = requete.data;

  if (formulaire === undefined) {
    return requete.isError ? (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    ) : (
      <EtatChargement />
    );
  }
  // Pas de voiture déclarée : le serveur ne peut rien publier, l'écran le dit au lieu d'un formulaire vide.
  if (formulaire.vehicule === "") return <EtatVide />;
  return <Formulaire formulaire={formulaire} />;
}

/** Le message que le serveur a refusé de publier, ou `echec` pour toute autre panne. */
function messageDeLErreur(erreur: unknown): Message {
  if (erreur instanceof ErreurHttp) {
    if (erreur.statut === 403 && erreur.code === "CONDUCTEUR_NON_VERIFIE") return "nonVerifie";
    if (erreur.code === "PRIX_INVALIDE") return "prix";
    if (erreur.statut === 409 && erreur.code === "TRAJET_CHEVAUCHANT") return "chevauche";
  }
  return "echec";
}

function Formulaire({ formulaire: f }: { formulaire: c.FormulairePublication }) {
  const { t, i18n } = useTranslation("Conducteur");
  const navigate = useNavigate();
  const conception = useConception();
  const publier = voyageur.usePublierTrajet();
  const idDepart = useId();
  const idArrivee = useId();

  const [villeDepart, setVilleDepart] = useState(f.depart.ville);
  const [villeArrivee, setVilleArrivee] = useState(f.arrivee.ville);
  const [pointDepart, setPointDepart] = useState(f.depart.point);
  const [pointArrivee, setPointArrivee] = useState(f.arrivee.point);
  const [places, setPlaces] = useState(f.places.choisi);
  const [prixTexte, setPrixTexte] = useState(
    f.prixParPlace > 0 ? formaterMontant(f.prixParPlace) : "",
  );
  const [actives, setActives] = useState<ReadonlySet<string>>(
    () => new Set(f.options.filter((o) => o.actif).map((o) => o.code)),
  );
  const [message, setMessage] = useState<Message | null>(
    f.conducteur.verifie ? null : "nonVerifie",
  );
  const enCours = useRef(false);

  const bornes = f.prixConseille;
  const prix = lirePrix(prixTexte);
  // Les villes ne se saisissent que si le serveur n'en propose pas (premier trajet du conducteur).
  const villesProposees = f.depart.ville !== "" && f.arrivee.ville !== "";

  const identite = [
    f.conducteur.nom,
    f.conducteur.verifie ? t("conducteur.verifie") : null,
    f.vehicule,
    f.immatriculation,
  ]
    .filter((x) => x !== null && x !== "")
    .join(" · ");

  function basculer(code: string) {
    setActives((avant) => {
      const apres = new Set(avant);
      if (!apres.delete(code)) apres.add(code);
      return apres;
    });
  }

  /** Le prix sort de la saisie dans la fourchette conseillée : au-delà, ce ne serait plus du partage de frais. */
  function remettreDansLaFourchette() {
    if (prix !== null && !prixAutorise(prix, bornes)) {
      setPrixTexte(formaterMontant(dansLesBornes(prix, bornes)));
    }
  }

  async function publierLeTrajet() {
    if (enCours.current) return;
    if (!prixAutorise(prix, bornes)) {
      remettreDansLaFourchette();
      setMessage("prix");
      return;
    }
    const complet = [villeDepart, villeArrivee, pointDepart, pointArrivee].every(
      (x) => x.trim() !== "",
    );
    if (!complet) {
      setMessage("champs");
      return;
    }
    enCours.current = true;
    setMessage(null);
    const codes = f.options.filter((o) => actives.has(o.code)).map((o) => o.code);
    try {
      await publier.mutateAsync({
        depart: { ville: villeDepart.trim(), point: pointDepart.trim() },
        arrivee: { ville: villeArrivee.trim(), point: pointArrivee.trim() },
        departA: f.departA,
        places,
        prixParPlace: prix,
        options: codes,
        regulier: codes.some(estOptionRegulier),
      });
      void navigate(urlPlanche("Covoit"));
    } catch (erreur) {
      setMessage(messageDeLErreur(erreur));
    } finally {
      enCours.current = false;
    }
  }

  const pieces = f.reputation.piecesVerifiees;

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={identite}
        retour={{ libelle: t("retour"), href: urlPlanche("Covoit") }}
        droite={f.conducteur.verifie ? <Pastille statut="verifie" /> : undefined}
      />

      <EcranCorps className={styles.corps} data-planche="Conducteur">
        {message && (
          <p
            role={message === "nonVerifie" ? "status" : "alert"}
            className={message === "nonVerifie" ? styles.rappel : styles.alerte}
          >
            {message === "prix"
              ? t("messages.prix", {
                  min: formaterMontant(bornes.min),
                  max: formaterMontant(bornes.max),
                })
              : t(`messages.${message}`)}
          </p>
        )}

        <div className={styles.carte}>
          <div className={styles.trajet}>
            <span
              className={villesProposees ? styles.route : `${styles.route} ${styles.routeSaisie}`}
            >
              {villesProposees ? (
                <>
                  {f.depart.ville} <span className={styles.fleche}>→</span> {f.arrivee.ville}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    className={styles.ville}
                    aria-label={t("trajet.villeDepart")}
                    value={villeDepart}
                    onChange={(e) => setVilleDepart(e.target.value)}
                  />
                  <span className={styles.fleche}>→</span>
                  <input
                    type="text"
                    className={styles.ville}
                    aria-label={t("trajet.villeArrivee")}
                    value={villeArrivee}
                    onChange={(e) => setVilleArrivee(e.target.value)}
                  />
                </>
              )}
            </span>
            <span className={styles.quand}>{momentDepart(f.departA, i18n.language)}</span>
          </div>

          <div className={styles.points}>
            <label htmlFor={idDepart} className={styles.champ}>
              <span className={styles.champLibelle}>{t("champs.depart")}</span>
              <input
                id={idDepart}
                type="text"
                className={styles.saisie}
                value={pointDepart}
                onChange={(e) => setPointDepart(e.target.value)}
              />
            </label>
            <label htmlFor={idArrivee} className={styles.champ}>
              <span className={styles.champLibelle}>{t("champs.arrivee")}</span>
              <input
                id={idArrivee}
                type="text"
                className={styles.saisie}
                value={pointArrivee}
                onChange={(e) => setPointArrivee(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.ligne}>
            <span className={styles.ligneLibelle} id={`${idDepart}-places`}>
              {t("places")}
            </span>
            <span className={styles.places} role="group" aria-labelledby={`${idDepart}-places`}>
              {f.places.choix.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.place}
                  aria-pressed={n === places}
                  onClick={() => setPlaces(n)}
                >
                  {n}
                </button>
              ))}
            </span>
            <span className={styles.ligneLibelle}>{t("prix.libelle")}</span>
            <label className={styles.prixZone}>
              <input
                type="text"
                inputMode="numeric"
                className={styles.prix}
                aria-label={t("prix.aria")}
                aria-invalid={prix !== null && !prixAutorise(prix, bornes)}
                value={prixTexte}
                onChange={(e) => setPrixTexte(saisirPrix(e.target.value))}
                onBlur={remettreDansLaFourchette}
              />
            </label>
          </div>

          {bornes.max > 0 && (
            <span className={styles.conseil}>
              {t("prix.conseil", {
                min: formaterMontant(bornes.min),
                max: formaterMontant(bornes.max),
              })}
            </span>
          )}
        </div>

        <div className={styles.options}>
          <Etiquette>{t("options")}</Etiquette>
          <div className={styles.grille}>
            {f.options.map((option) => {
              const active = actives.has(option.code);
              return (
                <button
                  key={option.code}
                  type="button"
                  className={styles.option}
                  aria-pressed={active}
                  onClick={() => basculer(option.code)}
                >
                  {option.libelle}
                  {active && <span aria-hidden="true"> ✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.reputation}>
          <div className={styles.reputationTete}>
            <span className={styles.reputationTitre}>
              {f.reputation.trajets === 0
                ? t("reputation.premier")
                : t("reputation.titre", {
                    count: f.reputation.trajets,
                    note: formaterNote(f.reputation.note),
                  })}
            </span>
            {pieces.length > 0 && (
              <span className={styles.reputationPieces}>
                {t("reputation.pieces", { count: pieces.length, pieces: pieces.join(", ") })}
              </span>
            )}
          </div>
          <span className={styles.reputationPaiement}>
            {t("reputation.paiement", { frais: formaterMontant(f.fraisParPlace) })}
          </span>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <button
          type="button"
          className={styles.publier}
          aria-busy={publier.isPending}
          onClick={() => void publierLeTrajet()}
        >
          <span className={styles.publierTextes}>
            <span className={styles.publierLibelle}>{t("publier.libelle")}</span>
            <span className={styles.publierDetail}>
              {conception ? "touche 2 · " : ""}
              {t("publier.detail")}
            </span>
          </span>
          <span className={styles.publierTotal}>
            {places} × {formaterMontant(prix ?? 0)}
          </span>
        </button>
      </EcranPied>
    </>
  );
}
