import { Bouton, ChampTelephone, FeuilleModale, Pastille } from "@afrimove/ui";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { telephoneDeSaisie } from "./format";
import styles from "./commun.module.css";

/**
 * Fond du mode cadence : la planche est sur « Profond » (#050810), là où le layout de l'espace pose « Nuit ». Ce
 * conteneur remplit l'écran du layout et porte les feuilles (positionnées dans les 390 px, pas dans la fenêtre).
 */
export function RacineCadence({ planche, children }: { planche: string; children: ReactNode }) {
  return (
    <div className={styles.racine} data-planche={planche}>
      {children}
    </div>
  );
}

/** Pastille « CADENCE · 05:14 » de l'en-tête des deux planches (éclair ambre, fond Surface 2). */
export function PastilleCadence({ heure }: { heure: string }) {
  return <Pastille statut="cadence" detail={heure} />;
}

interface PropsSaisieNumero {
  ouverte: boolean;
  onFermer: () => void;
  /** Reçoit le numéro au format international (+237…). */
  onValider: (telephone: string) => void;
  /** Réglage « numéro obligatoire en cadence » actif. */
  obligatoire: boolean;
  /** Numéro déjà saisi (national, 9 chiffres), pour le corriger. */
  initial?: string | null;
}

/**
 * Feuille « + numéro » : le numéro du client pour le SMS du billet (et le push MoMo). Aucune planche ne la montre,
 * elle ouvre la touche « + numéro » avec le champ téléphone du kit.
 */
export function SaisieNumero({
  ouverte,
  onFermer,
  onValider,
  obligatoire,
  initial = null,
}: PropsSaisieNumero) {
  const { t } = useTranslation("Cadence");
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (ouverte) {
      setSaisie(initial ? initial.replace(/^\+237/, "") : "");
      setErreur(false);
    }
  }, [ouverte, initial]);

  const telephone = telephoneDeSaisie(saisie);

  function valider(evenement: FormEvent) {
    evenement.preventDefault();
    if (telephone === null) {
      setErreur(true);
      return;
    }
    onValider(telephone);
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("numero.titre")}
      sousTitre={obligatoire ? t("numero.obligatoire") : t("numero.aide")}
      libelleFermer={t("numero.fermer")}
      ancrage="parent"
    >
      <form className={styles.formulaire} onSubmit={valider} noValidate>
        <ChampTelephone
          label={t("numero.label")}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setErreur(false);
          }}
          valide={telephone !== null}
          erreur={erreur ? t("numero.erreur") : undefined}
          maxLength={13}
          autoFocus
        />
        <Bouton type="submit" libelle={t("numero.valider")} />
      </form>
    </FeuilleModale>
  );
}
