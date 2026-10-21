import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { validerSaisie, type ChampSaisie, type Saisie, type Validation } from "./completion";
import styles from "./cadence-quai.module.css";

/** Identifiant du formulaire : le bouton « Embarquer » du pied l'envoie avec l'attribut `form`. */
export const ID_FORMULAIRE = "cadence-quai-completer";

export type Donnees = Extract<Validation, { ok: true }>["donnees"];
export type Issue = "ok" | "deja" | "echec";

type Erreur = ChampSaisie | "deja" | "echec";

interface Props {
  /** Ce que le client a déjà montré ou dicté pour ce billet (valeurs de départ des champs). */
  saisie: { nom: string; pieceQuatreDerniers: string; telephone: string | null };
  /** Envoie la complétion ; l'issue dit si le billet est devenu nominatif. */
  onCompleter: (donnees: Donnees) => Promise<Issue>;
}

/** Carte « Compléter · le client montre sa pièce » : nom, 4 derniers chiffres de la pièce, téléphone facultatif. */
export function FormulaireCompletion({ saisie, onCompleter }: Props) {
  const { t } = useTranslation("CadenceQuai");
  const identifiant = useId();
  const [valeurs, setValeurs] = useState<Saisie>({
    nom: saisie.nom,
    piece: saisie.pieceQuatreDerniers,
    telephone: saisie.telephone ?? "",
  });
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const champs = {
    nom: useRef<HTMLInputElement>(null),
    piece: useRef<HTMLInputElement>(null),
    telephone: useRef<HTMLInputElement>(null),
  };
  const enCours = useRef(false);

  function changer(champ: ChampSaisie, valeur: string) {
    setValeurs((avant) => ({ ...avant, [champ]: valeur }));
    setErreur(null);
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    if (enCours.current) return;
    const verdict = validerSaisie(valeurs);
    if (!verdict.ok) {
      setErreur(verdict.champ);
      champs[verdict.champ].current?.focus();
      return;
    }
    setErreur(null);
    enCours.current = true;
    try {
      const issue = await onCompleter(verdict.donnees);
      if (issue !== "ok") setErreur(issue);
    } finally {
      enCours.current = false;
    }
  }

  const idAide = `${identifiant}-aide`;
  const invalide = (champ: ChampSaisie) => erreur === champ || undefined;

  return (
    <form
      id={ID_FORMULAIRE}
      className={styles.completer}
      aria-labelledby={`${identifiant}-titre`}
      noValidate
      onSubmit={(e) => void soumettre(e)}
    >
      <span id={`${identifiant}-titre`} className={styles.etiquette}>
        {t("completer.titre")}
      </span>

      <label htmlFor={`${identifiant}-nom`} className={styles.champ}>
        <span className={styles.champLibelle}>{t("completer.nom")}</span>
        <input
          ref={champs.nom}
          id={`${identifiant}-nom`}
          type="text"
          className={`${styles.saisie} ${styles.saisieNom}`}
          value={valeurs.nom}
          autoComplete="off"
          autoCapitalize="words"
          aria-invalid={invalide("nom")}
          aria-describedby={idAide}
          onChange={(e) => changer("nom", e.target.value)}
        />
      </label>

      <div className={styles.paire}>
        <label htmlFor={`${identifiant}-piece`} className={styles.champ}>
          <span className={styles.champLibelle}>{t("completer.piece")}</span>
          <input
            ref={champs.piece}
            id={`${identifiant}-piece`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className={`${styles.saisie} ${styles.saisiePiece}`}
            value={valeurs.piece}
            aria-invalid={invalide("piece")}
            aria-describedby={idAide}
            onChange={(e) => changer("piece", e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label htmlFor={`${identifiant}-tel`} className={styles.champ}>
          <span className={styles.champLibelle}>{t("completer.telephone")}</span>
          <input
            ref={champs.telephone}
            id={`${identifiant}-tel`}
            type="tel"
            autoComplete="off"
            className={`${styles.saisie} ${styles.saisieTelephone}`}
            value={valeurs.telephone}
            aria-invalid={invalide("telephone")}
            aria-describedby={idAide}
            onChange={(e) => changer("telephone", e.target.value)}
          />
        </label>
      </div>

      {erreur === null ? (
        <p id={idAide} className={styles.aide}>
          {t("completer.aide")}
        </p>
      ) : (
        <p id={idAide} className={`${styles.aide} ${styles.aideErreur}`} role="alert">
          {t(`completer.erreurs.${erreur}`)}
        </p>
      )}
    </form>
  );
}
