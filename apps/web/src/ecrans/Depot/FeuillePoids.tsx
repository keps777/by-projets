import { Bouton, Champ, FeuilleModale } from "@afrimove/ui";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  calculerComplement,
  controlerPoids,
  formaterKilos,
  formaterMontant,
  lirePoids,
  type ParamsComplement,
} from "./calculs";
import styles from "./depot.module.css";

interface Props {
  ouverte: boolean;
  /** Poids déjà relevé, proposé dans le champ. */
  poidsInitial: number | null;
  poidsDeclareKg: number;
  seuilKg: number;
  /** Ce qu'il faut pour chiffrer le complément (tout sauf l'écart). */
  tarif: Omit<ParamsComplement, "ecartKg">;
  onValider: (poidsKg: number) => void;
  onFermer: () => void;
}

/**
 * « Vérifier le poids » : l'agent tape ce que dit la balance. Conforme jusqu'à 1 kg de plus que le déclaré ;
 * au-delà, la feuille chiffre le complément que le client paiera par MoMo. (La planche ne dessine pas cette feuille :
 * elle montre seulement le résultat, « 2,1 kg · conforme ».)
 */
export function FeuillePoids({
  ouverte,
  poidsInitial,
  poidsDeclareKg,
  seuilKg,
  tarif,
  onValider,
  onFermer,
}: Props) {
  const { t } = useTranslation("Depot");
  const [saisie, setSaisie] = useState(poidsInitial === null ? "" : formaterKilos(poidsInitial));
  const poids = lirePoids(saisie);

  let message: { ton: "vert" | "ambre" | "rouge"; texte: string } | null = null;
  if (saisie.trim() !== "" && poids === null) {
    message = { ton: "rouge", texte: t("poids.feuille.invalide") };
  } else if (poids !== null) {
    const controle = controlerPoids(poids, poidsDeclareKg, seuilKg);
    message = controle.complementRequis
      ? {
          ton: "ambre",
          texte: t("poids.feuille.complement", {
            seuil: formaterKilos(seuilKg),
            montant: formaterMontant(calculerComplement({ ...tarif, ecartKg: controle.ecartKg })),
          }),
        }
      : {
          ton: "vert",
          texte: t("poids.feuille.conforme", {
            poids: formaterKilos(poids),
            ecart: `${controle.ecartKg > 0 ? "+" : controle.ecartKg < 0 ? "−" : ""}${formaterKilos(Math.abs(controle.ecartKg))}`,
          }),
        };
  }

  function valider(evenement: FormEvent) {
    evenement.preventDefault();
    if (poids !== null) onValider(poids);
  }

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("poids.feuille.titre")}
      sousTitre={t("poids.feuille.sousTitre", { declare: formaterKilos(poidsDeclareKg) })}
      libelleFermer={t("poids.feuille.fermer")}
    >
      <form className={styles.feuille} onSubmit={valider}>
        <Champ
          label={t("poids.feuille.champ")}
          mono
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
        {message && (
          <p className={styles.resultat} data-ton={message.ton} role="status">
            {message.texte}
          </p>
        )}
        <Bouton type="submit" variante="assistant" libelle={t("poids.feuille.valider")} />
      </form>
    </FeuilleModale>
  );
}
