import { ErreurHttp } from "@afrimove/api-client";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  blocageEnCours,
  compteBloque,
  deriverCle,
  enregistrerBlocage,
  leverBlocage,
  pinRefuse,
  signer,
} from "@/ecrans/SuperviseurValider/pin";
import { PIN, SUPERVISEUR } from "./superviseur";
import styles from "./superviseur-equipe.module.css";

/** La preuve que le serveur attend avec chaque action de l'équipe (`ValidationSuperviseur` du contrat). */
export interface ValidePar {
  superviseurId: string;
  methode: "pin";
  signature: string;
}

/** Signe le contenu de l'action avec la clé dérivée du PIN tapé, puis oublie le PIN. */
export type Signeur = (contenu: Record<string, unknown>) => Promise<ValidePar>;

export interface PropsFeuillePin {
  titre: string;
  sousTitre?: string;
  onFermer: () => void;
  /** Le choix de la feuille est-il complet ? Sinon, la clé du message à montrer à la place du PIN. */
  verifier?: () => string | null;
  /** Signe puis envoie l'action ; rejette avec l'erreur du serveur (un PIN refusé compte un essai). */
  envoyer: (signe: Signeur) => Promise<void>;
  /** L'action est acceptée : la feuille se ferme. */
  onFait: () => void;
  children?: ReactNode;
}

/**
 * Feuille « Mon PIN » : chaque action de l'équipe est signée par le PIN du superviseur (6 chiffres, 3 essais, puis
 * blocage 15 min). Le PIN ne sert qu'à dériver la clé de signature : il n'est ni affiché, ni gardé, ni envoyé.
 * Le blocage survit à un rechargement (même clé que SuperviseurValider : c'est le même PIN).
 */
export function FeuillePin({
  titre,
  sousTitre,
  onFermer,
  verifier,
  envoyer,
  onFait,
  children,
}: PropsFeuillePin) {
  const { t } = useTranslation("SuperviseurEquipe");
  const [bloqueJusqua, setBloqueJusqua] = useState<number | null>(() =>
    blocageEnCours(SUPERVISEUR.id),
  );
  const [retour, setRetour] = useState<string | null>(null);

  function messageDe(erreur: unknown): string {
    if (erreur instanceof ErreurHttp && erreur.statut === 404) return t("feuille.message.inconnue");
    if (erreur instanceof ErreurHttp && erreur.statut === 409) return t("feuille.message.refusee");
    return t("feuille.message.echec");
  }

  async function surComplet(saisie: string): Promise<boolean | void> {
    const manque = verifier?.();
    if (manque) {
      setRetour(t(manque));
      return;
    }
    setRetour(null);
    const cle = await deriverCle(saisie, SUPERVISEUR.id);
    const signe: Signeur = async (contenu) => {
      const preuve = { superviseurId: SUPERVISEUR.id, methode: "pin" as const };
      return { ...preuve, signature: await signer(cle, { ...contenu, ...preuve }) };
    };
    try {
      await envoyer(signe);
    } catch (erreur) {
      if (compteBloque(erreur)) {
        const jusqua = Date.now() + PIN.blocageMinutes * 60_000;
        enregistrerBlocage(SUPERVISEUR.id, jusqua);
        setBloqueJusqua(jusqua);
        return;
      }
      if (pinRefuse(erreur)) return false;
      setRetour(messageDe(erreur));
      return;
    }
    onFait();
  }

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={titre}
      {...(sousTitre ? { sousTitre } : {})}
      libelleFermer={t("feuille.fermer")}
    >
      <div className={styles.feuille}>
        {children}
        <ClavierPin
          longueur={PIN.longueur}
          titre={t("feuille.pin.titre", { nom: SUPERVISEUR.nom })}
          sousTitre={t("feuille.pin.aide", { longueur: PIN.longueur })}
          note={
            retour ? (
              <span className={styles.retour} role="alert">
                {retour}
              </span>
            ) : (
              t("feuille.pin.regle", { essais: PIN.essaisMax, minutes: PIN.blocageMinutes })
            )
          }
          essaisMax={PIN.essaisMax}
          dureeBlocageMs={PIN.blocageMinutes * 60_000}
          bloqueJusqua={bloqueJusqua}
          onBlocage={(info) => {
            enregistrerBlocage(SUPERVISEUR.id, info.jusqua);
            setBloqueJusqua(info.jusqua);
          }}
          onDeblocage={() => {
            leverBlocage(SUPERVISEUR.id);
            setBloqueJusqua(null);
          }}
          onComplet={surComplet}
          empreinte={false}
        />
      </div>
    </FeuilleModale>
  );
}
