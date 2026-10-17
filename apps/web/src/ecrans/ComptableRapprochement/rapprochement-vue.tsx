import type { patron } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete, IconeCoche } from "@afrimove/ui";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  decompte,
  instantCourt,
  lignesOuvertes,
  milliers,
  nomDuMois,
  pourcentage,
  segmentsExplication,
  tonDeLaCause,
  totalATraiter,
} from "./formats";
import { IconeCadenas } from "./icones";
import styles from "./rapprochement.module.css";

export type EtatEcran = "chargement" | "erreur" | "vide" | "pret";

export interface PropsRapprochementVue {
  etat: EtatEcran;
  rapprochement?: patron.RapprochementMomo | undefined;
  onReessayer?: () => void;
  /** Ouvre le clavier PIN : appliquer les décisions proposées sur les lignes ouvertes. */
  onAppliquer?: () => void;
}

type Action = patron.ActionRapprochement;
const ACTIONS: readonly Action[] = ["rembourser", "rattacher", "demander"];

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** L'explication de la cause : le texte de l'API, avec « 2e » et « 1er » en exposant comme dans la planche. */
function Explication({ texte }: { texte: string }) {
  return (
    <>
      {segmentsExplication(texte).map((s, i) => (
        <Fragment key={i}>
          {s.texte}
          {s.exposant !== undefined && <sup>{s.exposant}</sup>}
        </Fragment>
      ))}
    </>
  );
}

function Ligne({ ligne }: { ligne: patron.TransactionSansCorrespondance }) {
  const { t } = useTranslation("ComptableRapprochement");
  const action = ligne.actionProposee;
  return (
    <li className={styles.ligne}>
      <div className={styles.ligneHaut}>
        <span className={styles.identite}>
          <span className={styles.reference}>{ligne.reference}</span>
          <span className={styles.quand}>
            {instantCourt(ligne.recueA)} · {ligne.telephoneMasque} ·{" "}
            {t(`tableau.operateur.${ligne.operateur}`)}
          </span>
        </span>
        <span className={styles.montantLigne}>{milliers(ligne.montant)}</span>
      </div>
      <div className={styles.ligneBas}>
        <span className={`${styles.cause} ${styles[tonDeLaCause(ligne.cause)]}`}>
          <Explication texte={ligne.explication} />
        </span>
        {ligne.decision === null ? (
          <a
            className={`${styles.action} ${styles[`action-${action}`]}`}
            href={urlPlanche("ComptableCloture")}
          >
            {t(`tableau.action.${action}`)}
          </a>
        ) : (
          <span className={styles.fait}>
            <IconeCoche taille={12} />
            {t(`tableau.decision.${ligne.decision}`)}
          </span>
        )}
      </div>
    </li>
  );
}

function Tableau({ rapprochement }: { rapprochement: patron.RapprochementMomo | undefined }) {
  const { t } = useTranslation("ComptableRapprochement");
  return (
    <div className={styles.tableau}>
      <div className={styles.tableauTete}>
        <span>{t("tableau.reference")}</span>
        <span>{t("tableau.montant")}</span>
      </div>
      {rapprochement ? (
        <ul className={styles.lignes}>
          {rapprochement.lignes.map((l) => (
            <Ligne key={l.reference} ligne={l} />
          ))}
        </ul>
      ) : (
        <ul className={styles.lignes} aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className={styles.ligne}>
              <div className={styles.ligneHaut}>
                <span className={styles.identite}>
                  <Squelette className={styles.squeletteReference} />
                  <Squelette className={styles.squeletteQuand} />
                </span>
                <Squelette className={styles.squeletteMontant} />
              </div>
              <div className={styles.ligneBas}>
                <Squelette className={styles.squeletteCause} />
                <Squelette className={styles.squeletteAction} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.total}>
        <span>{t("tableau.total")}</span>
        {rapprochement ? (
          <span className={styles.totalMontant}>
            {milliers(totalATraiter(rapprochement.lignes))}
          </span>
        ) : (
          <Squelette className={styles.squeletteTotal} />
        )}
      </div>
    </div>
  );
}

/** Les trois actions expliquées : ce que fait chacune, en une ligne. */
function Explications() {
  const { t } = useTranslation("ComptableRapprochement");
  return (
    <div className={styles.explications}>
      {ACTIONS.map((a) => (
        <div key={a} className={styles.explication}>
          <span className={styles.explicationTitre}>{t(`explications.${a}.titre`)}</span>
          <span className={styles.explicationDetail}>{t(`explications.${a}.detail`)}</span>
        </div>
      ))}
    </div>
  );
}

/** « 2 remboursements · 1 rattachement · 1 réclamation » : seules les actions qui restent à appliquer. */
function DetailDecompte({ lignes }: { lignes: readonly patron.TransactionSansCorrespondance[] }) {
  const { t } = useTranslation("ComptableRapprochement");
  const compte = decompte(lignes);
  return (
    <>
      {[
        compte.rembourser > 0 && t("boutons.remboursement", { count: compte.rembourser }),
        compte.rattacher > 0 && t("boutons.rattachement", { count: compte.rattacher }),
        compte.demander > 0 && t("boutons.reclamation", { count: compte.demander }),
      ]
        .filter(Boolean)
        .join(" · ")}
    </>
  );
}

/**
 * Transactions MoMo sans correspondance : chaque ligne avec sa cause probable et l'action proposée, le total à
 * traiter, l'explication des trois actions, puis « Appliquer les N · mon PIN ».
 *
 * Aucune écriture ici : le PIN se saisit dans la feuille que `onAppliquer` ouvre (voir signature.tsx).
 */
export function RapprochementVue({
  etat,
  rapprochement,
  onReessayer,
  onAppliquer,
}: PropsRapprochementVue) {
  const { t } = useTranslation("ComptableRapprochement");
  const donnees = etat === "pret" ? rapprochement : undefined;
  const chargement = etat === "chargement";
  const ouvertes = donnees ? lignesOuvertes(donnees.lignes) : [];
  const traite = etat === "pret" && ouvertes.length === 0;

  return (
    <div className={styles.ecran}>
      <Entete
        titre={t("entete.titre")}
        sousTitre={
          donnees ? (
            t("entete.sousTitre", {
              count: donnees.transactions,
              mois: nomDuMois(donnees.libelle),
              ventes: milliers(donnees.surTotalVentes),
              montant: milliers(donnees.montantTotal),
            })
          ) : chargement ? (
            <Squelette className={styles.squeletteSousTitre} />
          ) : undefined
        }
        retour={{ libelle: t("entete.retour"), href: urlPlanche("Comptable") }}
        droite={
          donnees ? (
            <span className={styles.part}>{pourcentage(donnees.partPct)}</span>
          ) : chargement ? (
            <Squelette className={styles.squelettePart} />
          ) : undefined
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="ComptableRapprochement"
        data-etat={etat}
        aria-busy={chargement}
        {...(chargement ? { "aria-label": t("etats.chargement") } : {})}
      >
        <span className={styles.intro}>{t("intro")}</span>

        {(etat === "vide" || etat === "erreur" || traite) && (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} />
              <p>
                {t(etat === "erreur" ? "etats.erreur" : traite ? "etats.traite" : "etats.vide")}
              </p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}

        {(chargement || (donnees && !traite)) && (
          <>
            <Tableau rapprochement={donnees} />
            <Explications />
            <span className={styles.note}>
              {donnees ? (
                t("pied", { count: ouvertes.length })
              ) : (
                <Squelette className={styles.squeletteNote} />
              )}
            </span>
          </>
        )}
      </EcranCorps>

      {(chargement || (donnees && !traite)) && (
        <EcranPied className={styles.pied}>
          <Bouton
            variante="secondaire"
            libelle={t("boutons.plusTard")}
            href={urlPlanche("Comptable")}
            className={styles.plusTard}
          />
          {donnees ? (
            <Bouton
              libelle={t("boutons.appliquer", { count: ouvertes.length })}
              sousLibelle={<DetailDecompte lignes={donnees.lignes} />}
              icone={<IconeCadenas />}
              onClick={onAppliquer}
              className={styles.appliquer}
            />
          ) : (
            <Squelette className={styles.squeletteAppliquer} />
          )}
        </EcranPied>
      )}
    </div>
  );
}
