import type { colis as contrats } from "@afrimove/contrats";
import { forwardRef } from "react";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  LONGUEUR_CODE,
  chiffresDuCode,
  formaterMontant,
  formaterNote,
  formaterPoids,
  heureDouala,
  numeroCourt,
} from "./formats";
import { IconeCocheVerifiee, IconeColis, IconeScan } from "./icones";
import styles from "./relaisapp.module.css";

type Espace = contrats.EspaceRelais;

/** En-tête : la boutique et son état, sa note et le lien pour inscrire une autre boutique. */
export function Boutique({ boutique }: { boutique: Espace["boutique"] }) {
  const { t } = useTranslation("RelaisApp");
  return (
    <header className={styles.entete}>
      <span className={styles.boutique}>
        <span className={styles.boutiqueNom}>{boutique.nom}</span>
        <span className={styles.boutiqueDetail}>{boutique.detail}</span>
      </span>
      <span className={styles.droite}>
        <span className={styles.note}>
          {t("boutique.note", { note: formaterNote(boutique.note) })}
        </span>
        <a className={styles.inscrire} href={urlPlanche("RelaisDevenir")}>
          {t("boutique.inscrire")}
        </a>
      </span>
    </header>
  );
}

/** Les trois tuiles : en garde sur la capacité, ce qui arrive, la semaine. */
export function Resume({ resume }: { resume: Espace["resume"] }) {
  const { t } = useTranslation("RelaisApp");
  const { arrivent, semaine } = resume;
  return (
    <div className={styles.tuiles}>
      <div className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("resume.enGarde")}</span>
        <span className={styles.tuileValeur}>
          {resume.enGarde}
          <span className={styles.tuileSur}>
            {t("resume.capacite", { capacite: resume.capacite })}
          </span>
        </span>
      </div>
      <div className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("resume.arrivent")}</span>
        <span className={`${styles.tuileValeur} ${styles.valeurBleue}`}>{arrivent.nombre}</span>
        {arrivent.vers !== null && (
          <span className={styles.tuileDetail}>
            {t("resume.arriventVers", { heure: heureDouala(arrivent.vers) })}
          </span>
        )}
      </div>
      <div className={styles.tuile}>
        <span className={styles.tuileLibelle}>{t("resume.semaine")}</span>
        <span className={`${styles.tuileValeur} ${styles.valeurSemaine}`}>
          {formaterMontant(semaine.gain)}
        </span>
        <span className={styles.tuileDetail}>
          {t("resume.semaineDetail", {
            remis: semaine.remis,
            jour: semaine.versement.jour,
            moyen: semaine.versement.moyen,
          })}
        </span>
      </div>
    </div>
  );
}

/** Les deux grandes actions, sur place : remettre (code + pièce) et recevoir (scanner l'étiquette). */
export function Actions({
  receptionOuverte,
  idReception,
  onRemettre,
  onRecevoir,
}: {
  receptionOuverte: boolean;
  idReception: string;
  onRemettre: () => void;
  onRecevoir: () => void;
}) {
  const { t } = useTranslation("RelaisApp");
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={`${styles.action} ${styles.actionRemettre}`}
        onClick={onRemettre}
      >
        <IconeScan />
        <span className={styles.actionTexte}>
          {t("actions.remettre.titre")}
          <br />
          <span className={styles.actionDetail}>{t("actions.remettre.detail")}</span>
        </span>
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionRecevoir}`}
        aria-expanded={receptionOuverte}
        aria-controls={idReception}
        onClick={onRecevoir}
      >
        <IconeColis />
        <span className={styles.actionTexte}>
          {t("actions.recevoir.titre")}
          <br />
          <span className={`${styles.actionDetail} ${styles.actionDetailGris}`}>
            {t("actions.recevoir.detail")}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Le colis qu'on remet : celui du serveur ou un colis touché dans la liste. */
export interface RemiseVue {
  colis: contrats.ColisPartenaire;
  consigne: string;
}

interface PropsSaisieCode {
  code: string;
  onChange: (code: string) => void;
  label: string;
}

/**
 * Les six cases du code, comme la planche (48 px). Un seul vrai champ, transparent, recouvre les cases : le clavier
 * numérique s'ouvre et le collage fonctionne ; les cases ne font qu'afficher. La dernière case remplie est en ambre.
 */
const SaisieCodeRemise = forwardRef<HTMLInputElement, PropsSaisieCode>(function SaisieCodeRemise(
  { code, onChange, label },
  ref,
) {
  const derniere = code.length - 1;
  return (
    <div className={styles.cases}>
      {Array.from({ length: LONGUEUR_CODE }, (_, i) => {
        const chiffre = code[i];
        return (
          <span
            key={i}
            aria-hidden="true"
            data-testid="case-code"
            className={`${styles.case} ${chiffre === undefined ? styles.caseVide : ""} ${
              i === derniere ? styles.caseDerniere : ""
            }`}
          >
            {chiffre ?? "_"}
          </span>
        );
      })}
      <input
        ref={ref}
        className={styles.saisie}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        value={code}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(chiffresDuCode(e.target.value))}
      />
    </div>
  );
});

/** Remise en cours : le colis, les six cases du code et le contrôle de la pièce (qu'on ne photographie jamais). */
export const Remise = forwardRef(function Remise(
  {
    remise,
    code,
    pieceVerifiee,
    onCode,
    onPiece,
  }: {
    remise: RemiseVue | null;
    code: string;
    pieceVerifiee: boolean;
    onCode: (code: string) => void;
    onPiece: (verifiee: boolean) => void;
  },
  champ: Ref<HTMLInputElement>,
) {
  const { t } = useTranslation("RelaisApp");
  if (remise === null) {
    return (
      <section className={styles.remise} aria-label={t("remise.titre")}>
        <div className={styles.remiseTete}>
          <span className={styles.remiseTitre}>{t("remise.titre")}</span>
        </div>
        <p className={styles.remiseVide}>{t("remise.vide")}</p>
      </section>
    );
  }
  const nom = remise.colis.destinataire.nom;
  const consigne = t("remise.pieceVerifiee", { nom, consigne: remise.consigne });
  const aVerifier = t("remise.pieceAVerifier", { nom, consigne: remise.consigne });
  return (
    <section className={styles.remise} aria-label={t("remise.titre")}>
      <div className={styles.remiseTete}>
        <span className={styles.remiseTitre}>{t("remise.titre")}</span>
        <span className={styles.remisePour}>
          {t("remise.pour", { numero: numeroCourt(remise.colis.numero), nom })}
        </span>
      </div>
      <SaisieCodeRemise ref={champ} code={code} onChange={onCode} label={t("remise.code")} />
      <div className={styles.piece}>
        <button
          type="button"
          role="checkbox"
          aria-checked={pieceVerifiee}
          aria-label={t("remise.pieceCase")}
          className={`${styles.pieceCase} ${pieceVerifiee ? styles.pieceCaseCochee : ""}`}
          onClick={() => onPiece(!pieceVerifiee)}
        >
          {pieceVerifiee && <IconeCocheVerifiee />}
        </button>
        <span>{pieceVerifiee ? consigne : aVerifier}</span>
      </div>
    </section>
  );
});

/** La liste des colis en garde : numéro, destinataire, poids, jours (en ambre quand le rappel est parti), téléphone. */
export function EnGarde({
  total,
  jours,
  lignes,
  onChoisir,
  vide,
}: {
  total: number;
  jours: number;
  lignes: Espace["enGarde"];
  onChoisir: (colisId: string) => void;
  vide: ReactNode;
}) {
  const { t } = useTranslation("RelaisApp");
  return (
    <section className={styles.garde} aria-label={t("garde.titre", { nombre: total })}>
      <div className={styles.gardeTete}>
        <span>{t("garde.titre", { nombre: total })}</span>
        <span className={styles.gardeAide}>{t("garde.reprise", { jours })}</span>
      </div>
      {lignes.length === 0 && <p className={styles.gardeVide}>{vide}</p>}
      {lignes.map((ligne) => (
        <button
          key={ligne.colis.id}
          type="button"
          className={styles.ligne}
          onClick={() => onChoisir(ligne.colis.id)}
        >
          <span>
            <strong>{numeroCourt(ligne.colis.numero)}</strong> · {ligne.colis.destinataire.nom} ·{" "}
            {formaterPoids(ligne.colis.poidsKg)} ·{" "}
            {ligne.rappelEnvoye ? (
              <span className={styles.rappel}>
                {t("garde.depuisRappel", { jours: ligne.depuisJours })}
              </span>
            ) : (
              t("garde.depuis", { jours: ligne.depuisJours })
            )}
          </span>
          <span className={styles.telephone}>{ligne.colis.destinataire.telephoneMasque}</span>
        </button>
      ))}
    </section>
  );
}
