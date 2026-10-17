import { Bouton, CaseACocher, Champ, FeuilleModale } from "@afrimove/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ErreurArret } from "./brouillon";
import styles from "./configligne.module.css";

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  /** Contrôle le nom saisi (non vide, pas déjà sur la ligne) ; `null` s'il est bon. */
  verifier: (nom: string) => ErreurArret | null;
  onAjouter: (nom: string, montee: boolean) => void;
}

/**
 * « + arrêt » : le nom de l'arrêt en route et la montée autorisée. Le prix au prorata n'est pas saisi : l'API le
 * calcule à la publication, d'après les kilomètres depuis l'origine. La feuille ne touche pas à la ligne publiée,
 * elle ajoute l'arrêt au brouillon de l'écran.
 */
export function FeuilleArret({ ouverte, onFermer, verifier, onAjouter }: Props) {
  const { t } = useTranslation("ConfigLigne");
  const [nom, setNom] = useState("");
  const [montee, setMontee] = useState(true);
  const [erreur, setErreur] = useState<ErreurArret | null>(null);

  useEffect(() => {
    if (ouverte) {
      setNom("");
      setMontee(true);
      setErreur(null);
    }
  }, [ouverte]);

  function valider(evenement?: FormEvent) {
    evenement?.preventDefault();
    const probleme = verifier(nom);
    setErreur(probleme);
    if (probleme === null) onAjouter(nom, montee);
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("arret.titre")}
      sousTitre={t("arret.sousTitre")}
      libelleFermer={t("arret.fermer")}
      ancrage="parent"
      actions={
        <>
          <Bouton variante="secondaire" libelle={t("arret.annuler")} onClick={onFermer} />
          <Bouton libelle={t("arret.ajouter")} onClick={() => valider()} />
        </>
      }
    >
      <form className={styles.formulaireArret} onSubmit={valider} noValidate>
        <Champ
          label={t("arret.nom")}
          value={nom}
          onChange={(e) => {
            setNom(e.target.value);
            setErreur(null);
          }}
          erreur={
            erreur === null
              ? undefined
              : t(erreur === "nom" ? "arret.erreurNom" : "arret.erreurExiste")
          }
          autoFocus
        />
        <CaseACocher
          label={t("arret.montee")}
          checked={montee}
          onChange={(e) => setMontee(e.target.checked)}
        />
      </form>
    </FeuilleModale>
  );
}
