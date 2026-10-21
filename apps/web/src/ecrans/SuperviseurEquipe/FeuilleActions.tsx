import { agence } from "@afrimove/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeuillePin } from "./FeuillePin";
import {
  ROLES,
  contexteGenre,
  idGuichet,
  rangsDesGuichets,
  type Equipe,
  type RoleEquipe,
} from "./formats";
import { SUPERVISEUR } from "./superviseur";
import styles from "./superviseur-equipe.module.css";

/** L'action de l'équipe qui attend le PIN du superviseur. */
export type Feuille =
  | { genre: "renouveler"; personneId: string }
  | { genre: "debloquer"; personneId: string; nom: string }
  | { genre: "desactiver"; personneId: string }
  | { genre: "affectation"; personneId: string }
  | { genre: "monPin" };

/** Ce que l'écran annonce une fois l'action acceptée. */
export interface Resultat {
  cle: "pinRenouvele" | "debloque" | "desactive" | "affectation" | "monPin";
  nom: string;
}

interface Props {
  feuille: Feuille;
  equipe: Equipe;
  onFermer: () => void;
  onFait: (resultat: Resultat) => void;
}

/**
 * La feuille « Mon PIN » de chaque action : renouveler un PIN, débloquer, désactiver, changer de guichet ou de rôle,
 * changer mon propre PIN. Chaque envoi signe le contenu de l'action avec le PIN du superviseur.
 */
export function FeuilleActions({ feuille, equipe, onFermer, onFait }: Props) {
  const { t } = useTranslation("SuperviseurEquipe");
  const renouveler = agence.useRenouvelerPin();
  const debloquer = agence.useDebloquerPersonne();
  const desactiver = agence.useDesactiverCompte();
  const affecter = agence.useChangerAffectation();

  const [guichet, setGuichet] = useState<number | null>(null);
  const [role, setRole] = useState<RoleEquipe | null>(null);

  const personne = (id: string) => equipe.enService.find((p) => p.personneId === id);
  const nomDe = (id: string, repli?: string) => personne(id)?.nom ?? repli ?? id;

  if (feuille.genre === "monPin") {
    return (
      <FeuillePin
        titre={t("feuille.monPin.titre")}
        sousTitre={t("feuille.monPin.detail")}
        onFermer={onFermer}
        envoyer={async (signe) => {
          const validePar = await signe({
            action: "equipe.pin_renouvele",
            personneId: SUPERVISEUR.id,
          });
          await renouveler.mutateAsync({ personneId: SUPERVISEUR.id, validePar });
        }}
        onFait={() => onFait({ cle: "monPin", nom: SUPERVISEUR.nom })}
      />
    );
  }

  const nom = nomDe(feuille.personneId, feuille.genre === "debloquer" ? feuille.nom : undefined);
  const id = feuille.personneId;

  if (feuille.genre === "renouveler") {
    return (
      <FeuillePin
        titre={t("fiche.actions.renouveler_pin.titre")}
        sousTitre={nom}
        onFermer={onFermer}
        envoyer={async (signe) => {
          const validePar = await signe({ action: "equipe.pin_renouvele", personneId: id });
          await renouveler.mutateAsync({ personneId: id, validePar });
        }}
        onFait={() => onFait({ cle: "pinRenouvele", nom })}
      />
    );
  }

  if (feuille.genre === "debloquer") {
    return (
      <FeuillePin
        titre={t("fiche.debloquer", { nom })}
        onFermer={onFermer}
        envoyer={async (signe) => {
          const validePar = await signe({ action: "equipe.personne_debloquee", personneId: id });
          await debloquer.mutateAsync({ personneId: id, validePar });
        }}
        onFait={() => onFait({ cle: "debloque", nom })}
      />
    );
  }

  if (feuille.genre === "desactiver") {
    return (
      <FeuillePin
        titre={t("fiche.actions.desactiver.titre")}
        sousTitre={nom}
        onFermer={onFermer}
        envoyer={async (signe) => {
          const validePar = await signe({ action: "equipe.compte_desactive", personneId: id });
          await desactiver.mutateAsync({ personneId: id, validePar });
        }}
        onFait={() => onFait({ cle: "desactive", nom })}
      />
    );
  }

  const rangs = rangsDesGuichets(equipe);
  const genre = contexteGenre(nom);
  return (
    <FeuillePin
      titre={t("fiche.actions.changer_affectation.titre")}
      sousTitre={`${nom} · ${t("fiche.actions.changer_affectation.detail")}`}
      onFermer={onFermer}
      verifier={() => (guichet === null && role === null ? "feuille.message.choixManquant" : null)}
      envoyer={async (signe) => {
        const guichetId = guichet === null ? null : idGuichet(equipe.gare.id, guichet);
        const validePar = await signe({
          action: "equipe.affectation_changee",
          personneId: id,
          guichetId,
          role,
        });
        await affecter.mutateAsync({ personneId: id, guichetId, role, validePar });
      }}
      onFait={() => onFait({ cle: "affectation", nom })}
    >
      <div className={styles.choix}>
        <h3 className={styles.choixTitre}>{t("feuille.affectation.guichet")}</h3>
        <div className={styles.choixLigne}>
          {rangs.length === 0 ? (
            <span className={styles.etatDetail}>{t("feuille.affectation.aucunGuichet")}</span>
          ) : (
            rangs.map((rang) => (
              <button
                key={rang}
                type="button"
                className={styles.puce}
                aria-pressed={guichet === rang}
                onClick={() => setGuichet(guichet === rang ? null : rang)}
              >
                {t("feuille.affectation.guichetN", { rang })}
              </button>
            ))
          )}
        </div>
      </div>
      <div className={styles.choix}>
        <h3 className={styles.choixTitre}>{t("feuille.affectation.role")}</h3>
        <div className={styles.choixLigne}>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={styles.puce}
              aria-pressed={role === r}
              onClick={() => setRole(role === r ? null : r)}
            >
              {t(`roles.${r}`, genre)}
            </button>
          ))}
        </div>
      </div>
    </FeuillePin>
  );
}
