import type { patron } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./comptable.module.css";
import { jourDuMois, milliers, nomDuMois, partRapprochee } from "./formats";
import { IconeApercu } from "./icones";

export type EtatEcran = "chargement" | "erreur" | "vide" | "pret";

export interface MoisDisponible {
  mois: string;
  libelle: string;
}

export interface PropsComptableVue {
  etat: EtatEcran;
  synthese?: patron.SyntheseComptable | undefined;
  /** Les mois proposés par le sélecteur : ceux de la dernière synthèse reçue, gardés pendant un rechargement. */
  moisDisponibles: readonly MoisDisponible[];
  /** Le mois affiché (celui du sélecteur), vide tant que le mois en cours de clôture n'est pas connu. */
  mois: string;
  onMois: (mois: string) => void;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function SelecteurMois({
  mois,
  moisDisponibles,
  onMois,
}: Pick<PropsComptableVue, "mois" | "moisDisponibles" | "onMois">) {
  const { t } = useTranslation("Comptable");
  if (moisDisponibles.length === 0) return null;
  return (
    <select
      className={styles.mois}
      aria-label={t("entete.mois")}
      value={mois}
      onChange={(e) => onMois(e.target.value)}
    >
      {moisDisponibles.map((m) => (
        <option key={m.mois} value={m.mois}>
          {m.libelle}
        </option>
      ))}
    </select>
  );
}

/** La carte de rapprochement MoMo : ventes enregistrées, reçu sur le compte marchand, écart, lien vers les lignes. */
function Rapprochement({
  synthese,
  nomMois,
}: {
  synthese: patron.SyntheseComptable | undefined;
  nomMois: string;
}) {
  const { t } = useTranslation("Comptable");
  const r = synthese?.rapprochement;
  const sans = r?.sansCorrespondance.transactions ?? 0;
  return (
    <section className={styles.rapprochement} aria-labelledby="comptable-rapprochement">
      <div className={styles.rapprochementTete}>
        <h2 id="comptable-rapprochement" className={styles.etiquette}>
          {r ? (
            t("rapprochement.titre", { mois: nomMois })
          ) : (
            <Squelette className={styles.squeletteEtiquette} />
          )}
        </h2>
        {r ? (
          <span className={styles.part}>
            {t("rapprochement.rapproche", {
              part: partRapprochee(r.ventesMomo.nombre, r.sansCorrespondance.transactions),
            })}
          </span>
        ) : (
          <Squelette className={styles.squelettePart} />
        )}
      </div>
      <div className={styles.chiffres}>
        {r ? (
          <>
            <span>{t("rapprochement.ventes", { nombre: milliers(r.ventesMomo.nombre) })}</span>
            <span className={styles.montant}>{milliers(r.ventesMomo.montant)}</span>
            <span>{t("rapprochement.recu")}</span>
            <span className={styles.montant}>{milliers(r.recuMarchand)}</span>
            <span className={sans > 0 ? styles.ecart : undefined}>
              {t("rapprochement.sansCorrespondance", { count: sans })}
            </span>
            <span className={`${styles.montant} ${sans > 0 ? styles.ecart : ""}`}>
              {milliers(r.sansCorrespondance.montant)}
            </span>
          </>
        ) : (
          [1, 2, 3].map((i) => (
            <span key={i} className={styles.ligneChiffres} aria-hidden="true">
              <Squelette className={styles.squeletteLibelle} />
              <Squelette className={styles.squeletteMontant} />
            </span>
          ))
        )}
      </div>
      {r ? (
        sans > 0 && (
          <a className={styles.voir} href={urlPlanche("ComptableRapprochement")}>
            {t("rapprochement.voir", { count: sans })}
          </a>
        )
      ) : (
        <Squelette className={styles.squeletteLien} />
      )}
    </section>
  );
}

/** La liste des exports : une ligne par fichier, toute la ligne ouvre l'aperçu. */
function Exports({ synthese }: { synthese: patron.SyntheseComptable | undefined }) {
  const { t } = useTranslation("Comptable");
  return (
    <section className={styles.exports} aria-labelledby="comptable-exports">
      <div className={styles.exportsTete}>
        <h2 id="comptable-exports" className={styles.exportsTitre}>
          {t("exports.titre")}
        </h2>
        <span className={styles.exportsAide}>{t("exports.aide")}</span>
      </div>
      {!synthese &&
        [1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.exportSquelette} aria-hidden="true">
            <span className={styles.exportTextes}>
              <Squelette className={styles.squeletteNom} />
              <Squelette className={styles.squeletteDetail} />
            </span>
            <Squelette className={styles.squeletteApercu} />
          </div>
        ))}
      {synthese && synthese.exports.length === 0 && (
        <p className={styles.aucunExport} role="status">
          {t("exports.aucun")}
        </p>
      )}
      {synthese?.exports.map((e) => (
        <a
          key={e.id}
          className={styles.export}
          href={urlPlanche("ComptableApercu", { exportId: e.id })}
        >
          <span className={styles.exportTextes}>
            <span className={styles.exportNom}>{e.nom}</span>
            <span className={styles.exportDetail}>{e.description}</span>
          </span>
          <span className={styles.apercu}>
            <IconeApercu />
            {t("exports.apercu")}
          </span>
          {e.statut === "a_jour" ? (
            <span className={`${styles.fin} ${styles.aJour}`}>{t("exports.aJour")}</span>
          ) : (
            <span className={`${styles.fin} ${styles.telecharger}`} aria-hidden="true">
              {t("exports.telecharger")}
            </span>
          )}
        </a>
      ))}
    </section>
  );
}

/** L'envoi automatique au cabinet : un état, pas une commande (aucune écriture n'existe dans l'API pour le changer). */
function Cabinet({ synthese }: { synthese: patron.SyntheseComptable | undefined }) {
  const { t } = useTranslation("Comptable");
  const titre = useId();
  const cabinet = synthese?.cabinet;
  return (
    <div className={styles.cabinet}>
      <span className={styles.cabinetTextes}>
        {cabinet ? (
          <>
            <span id={titre} className={styles.cabinetTitre}>
              {t("cabinet.titre")}
            </span>
            <span className={styles.cabinetDetail}>
              {cabinet.automatique
                ? t("cabinet.detail", {
                    destinataire: cabinet.destinataire,
                    jour: jourDuMois(cabinet.jourDEnvoi),
                    count: cabinet.derniersEnvoisRecus,
                  })
                : t("cabinet.desactive", { destinataire: cabinet.destinataire })}
            </span>
          </>
        ) : (
          <>
            <Squelette className={styles.squeletteNom} />
            <Squelette className={styles.squeletteDetail} />
          </>
        )}
      </span>
      {cabinet ? (
        <span
          className={styles.bascule}
          role="switch"
          aria-checked={cabinet.automatique}
          aria-readonly="true"
          aria-labelledby={titre}
        >
          <span className={styles.boule} aria-hidden="true" />
        </span>
      ) : (
        <Squelette className={styles.squeletteBascule} />
      )}
    </div>
  );
}

/**
 * Comptable du patron : le mois, le rapprochement MoMo, les cinq exports à colonnes fixes avec leur aperçu, l'envoi
 * automatique au cabinet et, en bas, « Clôturer <mois> · tout envoyer ».
 *
 * Aucune écriture ici : la clôture se confirme sur son propre écran (ComptableCloture), le rapprochement se traite
 * sur le sien (ComptableRapprochement).
 */
export function ComptableVue({
  etat,
  synthese,
  moisDisponibles,
  mois,
  onMois,
  onReessayer,
}: PropsComptableVue) {
  const { t } = useTranslation("Comptable");
  const donnees = etat === "pret" ? synthese : undefined;
  const chargement = etat === "chargement";
  const libelleMois =
    moisDisponibles.find((m) => m.mois === (donnees?.mois ?? mois))?.libelle ??
    donnees?.libelle.split(" ")[0] ??
    "";
  const nomMois = nomDuMois(libelleMois);

  return (
    <div className={styles.ecran}>
      <Entete
        titre={t("entete.titre")}
        sousTitre={
          donnees ? (
            t("entete.sousTitre", { periode: donnees.libelle, jour: donnees.jourDeCloture })
          ) : chargement ? (
            <Squelette className={styles.squeletteSousTitre} />
          ) : undefined
        }
        retour={{ libelle: t("entete.retour"), href: urlPlanche("Patron") }}
        droite={<SelecteurMois mois={mois} moisDisponibles={moisDisponibles} onMois={onMois} />}
      />

      <EcranCorps
        className={styles.corps}
        data-planche="Comptable"
        data-etat={etat}
        aria-busy={chargement}
        {...(chargement ? { "aria-label": t("etats.chargement") } : {})}
      >
        {(etat === "vide" || etat === "erreur") && (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
              <span className={styles.point} />
              <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
            </div>
            {etat === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}

        {(chargement || donnees) && (
          <>
            <Rapprochement synthese={donnees} nomMois={nomMois} />
            <Exports synthese={donnees} />
            <Cabinet synthese={donnees} />
          </>
        )}
      </EcranCorps>

      {(chargement || donnees) && (
        <EcranPied className={styles.pied}>
          {donnees ? (
            <Bouton
              libelle={t("cloture", { mois: nomMois })}
              href={urlPlanche("ComptableCloture")}
              className={styles.cloture}
            />
          ) : (
            <Squelette className={styles.squeletteCloture} />
          )}
        </EcranPied>
      )}
    </div>
  );
}
