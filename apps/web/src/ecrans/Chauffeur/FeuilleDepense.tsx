import { agence } from "@afrimove/api-client";
import { Champ, FeuilleModale } from "@afrimove/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { montantFcfa } from "./formats";
import { peripheriques, type PhotoJustificatif } from "./peripheriques";
import styles from "./chauffeur.module.css";

type Categorie = "carburant" | "peage" | "autre";

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  departId: string;
  categories: readonly Categorie[];
}

/** Référence de la photo envoyée avec la dépense (le stockage des fichiers viendra avec AM-160). */
function referencePhoto(photo: PhotoJustificatif): string {
  return `photo:${photo.nom}:${photo.taille}`;
}

/**
 * « + ajouter » : une dépense du trajet avec la photo de son justificatif. Une dépense sans photo n'est pas
 * remboursable : elle n'est donc jamais envoyée sans photo.
 */
export function FeuilleDepense({ ouverte, onFermer, departId, categories }: Props) {
  const { t } = useTranslation("Chauffeur");
  const ajouter = agence.useAjouterDepense();
  const parDefaut: Categorie = categories.includes("autre") ? "autre" : (categories[0] ?? "autre");

  const [categorie, setCategorie] = useState<Categorie>(parDefaut);
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [photo, setPhoto] = useState<PhotoJustificatif | null>(null);
  const [erreurMontant, setErreurMontant] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState(false);
  const [echec, setEchec] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Chaque ouverture repart d'une feuille vierge.
  useEffect(() => {
    if (!ouverte) return;
    setCategorie(parDefaut);
    setLibelle("");
    setMontant("");
    setPhoto(null);
    setErreurMontant(false);
    setErreurPhoto(false);
    setEchec(false);
  }, [ouverte]);

  async function prendrePhoto() {
    const prise = await peripheriques.photo.prendre();
    if (prise) {
      setPhoto(prise);
      setErreurPhoto(false);
    }
  }

  async function valider() {
    if (enCours) return;
    const valeur = Number(montant);
    const montantValide = Number.isInteger(valeur) && valeur > 0;
    setErreurMontant(!montantValide);
    setErreurPhoto(photo === null);
    setEchec(false);
    if (!montantValide || photo === null) return;
    setEnCours(true);
    try {
      await ajouter.mutateAsync({
        depenseId: globalThis.crypto.randomUUID(),
        departId,
        categorie,
        libelle: libelle.trim() || t(`formulaire.categories.${categorie}`),
        montant: valeur,
        justificatifRef: referencePhoto(photo),
      });
      onFermer();
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("formulaire.titre")}
      sousTitre={t("formulaire.sousTitre")}
      libelleFermer={t("formulaire.fermer")}
      className={styles.voile}
      actions={
        <>
          <button type="button" className={styles.boutonFeuille} onClick={onFermer}>
            {t("formulaire.annuler")}
          </button>
          <button
            type="button"
            className={`${styles.boutonFeuille} ${styles.boutonFeuillePrincipal}`}
            aria-busy={enCours}
            onClick={() => void valider()}
          >
            {t("formulaire.valider")}
          </button>
        </>
      }
    >
      <div className={styles.formulaire}>
        <fieldset className={styles.groupeCategories} role="radiogroup">
          <legend className={styles.groupeLegende}>{t("formulaire.categorie")}</legend>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={categorie === c}
              className={styles.categorie}
              onClick={() => setCategorie(c)}
            >
              {t(`formulaire.categories.${c}`)}
            </button>
          ))}
        </fieldset>

        <Champ
          label={t("formulaire.libelle")}
          placeholder={t("formulaire.libelleAide")}
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
        />

        <Champ
          label={t("formulaire.montant")}
          mono
          inputMode="numeric"
          autoComplete="off"
          value={montant === "" ? "" : montantFcfa(Number(montant))}
          onChange={(e) => setMontant(e.target.value.replace(/\D/g, "").slice(0, 9))}
          erreur={erreurMontant ? t("formulaire.erreurMontant") : undefined}
        />

        <div>
          <div className={styles.photo}>
            <button
              type="button"
              className={styles.photoBouton}
              onClick={() => void prendrePhoto()}
            >
              {photo ? t("formulaire.reprendrePhoto") : t("formulaire.prendrePhoto")}
            </button>
            {photo && (
              <span className={styles.photoJointe}>
                {t("formulaire.photoJointe", { nom: photo.nom })}
              </span>
            )}
          </div>
          {erreurPhoto && (
            <p role="alert" className={styles.erreur}>
              {t("formulaire.erreurPhoto")}
            </p>
          )}
        </div>

        {echec && (
          <p role="alert" className={styles.erreur}>
            {t("formulaire.echec")}
          </p>
        )}
      </div>
    </FeuilleModale>
  );
}
