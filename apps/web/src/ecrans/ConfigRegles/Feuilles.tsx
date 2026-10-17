import { ClavierPin, FeuilleModale, SaisieCode } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import type { Operateur } from "./brouillon";
import styles from "./configregles.module.css";

/** Où en est l'enregistrement : rien, le PIN des règles, le code SMS d'un compte, le PIN de ce compte. */
export type Etape =
  | { type: "fermee" }
  | { type: "pin" }
  | { type: "code"; operateur: Operateur }
  | { type: "pinCompte"; operateur: Operateur; code: string };

interface Props {
  etape: Etape;
  onFermer: () => void;
  /** « 2 changements » : ce que le PIN va signer. */
  resume: string;
  /** Ancien numéro (masqué) qui a reçu le SMS, par compte. */
  envoyeA: Partial<Record<Operateur, string>>;
  /**
   * Signe l'enregistrement des règles avec ce PIN. `false` : PIN refusé (compte un essai du clavier). Une exception
   * est une erreur technique (réseau, contrat) : le clavier la dit sans compter d'essai.
   */
  onSigner: (pin: string) => Promise<boolean>;
  /** Le code SMS du compte est saisi en entier. */
  onCode: (code: string) => void;
  /** Change le compte avec ce PIN (même convention que `onSigner`). */
  onSignerCompte: (pin: string) => Promise<boolean>;
  /** Le code SMS saisi a été refusé par l'API. */
  codeFaux: boolean;
  /** L'écriture a échoué pour une autre raison qu'un PIN refusé. */
  echec: boolean;
}

/**
 * Toute modification des règles est signée par le PIN du patron et tracée dans le journal : le clavier du kit ouvre
 * donc l'enregistrement. Changer un compte MoMo ajoute le code reçu par SMS à l'ancien numéro, puis un PIN pour le
 * changement lui-même (le PIN n'est jamais gardé d'une étape à l'autre). Tant que tout n'est pas validé, les guichets
 * lisent les règles et les comptes enregistrés.
 */
export function FeuillesSignature({
  etape,
  onFermer,
  resume,
  envoyeA,
  onSigner,
  onCode,
  onSignerCompte,
  codeFaux,
  echec,
}: Props) {
  const { t } = useTranslation("ConfigRegles");
  const operateur = etape.type === "code" || etape.type === "pinCompte" ? etape.operateur : null;
  const nom = operateur === null ? "" : t(`momo.operateur.${operateur}`);

  return (
    <>
      <FeuilleModale
        ouverte={etape.type === "pin"}
        onFermer={onFermer}
        titre={t("pin.titre")}
        sousTitre={t("pin.sousTitre", { changements: resume })}
        libelleFermer={t("pin.fermer")}
        ancrage="parent"
      >
        <div className={styles.feuillePin}>
          <ClavierPin onComplet={onSigner} />
          {echec && (
            <p role="alert" className={styles.echec}>
              {t("pin.echec")}
            </p>
          )}
        </div>
      </FeuilleModale>

      <FeuilleModale
        ouverte={etape.type === "code"}
        onFermer={onFermer}
        titre={t("compte.code.titre", { operateur: nom })}
        sousTitre={t("compte.code.sousTitre", {
          numero: operateur === null ? "" : (envoyeA[operateur] ?? ""),
        })}
        libelleFermer={t("compte.fermer")}
        ancrage="parent"
      >
        <div className={styles.feuillePin}>
          <SaisieCode
            longueur={6}
            label={t("compte.code.libelle")}
            autoFocus
            onComplete={onCode}
            {...(codeFaux ? { erreur: t("compte.code.faux") } : {})}
          />
        </div>
      </FeuilleModale>

      <FeuilleModale
        ouverte={etape.type === "pinCompte"}
        onFermer={onFermer}
        titre={t("compte.pin.titre")}
        sousTitre={t("compte.pin.sousTitre", { operateur: nom })}
        libelleFermer={t("compte.fermer")}
        ancrage="parent"
      >
        <div className={styles.feuillePin}>
          <ClavierPin onComplet={onSignerCompte} />
          {echec && (
            <p role="alert" className={styles.echec}>
              {t("compte.pin.echec")}
            </p>
          )}
        </div>
      </FeuilleModale>
    </>
  );
}
