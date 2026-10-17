import type { patron } from "@afrimove/contrats";
import { Bouton, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./cloture.module.css";
import {
  enMinuscules,
  formatFichier,
  heureDe,
  instantAvecAnnee,
  milliers,
  moisSuivant,
  nomDuMois,
  sansAbonnement,
} from "./formats";
import { CocheEntete, CocheFichier, IconeCadenas } from "./icones";

/**
 * `cloture` : le mois est clôturé et envoyé (la planche). `a_cloturer` : le mois est encore ouvert, on arrive de
 * « Clôturer · tout envoyer » ou de l'application des décisions du rapprochement : il reste à signer.
 */
export type EtatEcran = "chargement" | "erreur" | "vide" | "cloture" | "a_cloturer";

export interface PropsClotureVue {
  etat: EtatEcran;
  cloture?: patron.ClotureMois | undefined;
  /** Nombre de transactions sans correspondance traitées ; inconnu tant que le rapprochement n'est pas lu. */
  traitees?: number | undefined;
  onReessayer?: () => void;
  /** Ouvre le clavier PIN : clôturer le mois et tout envoyer au cabinet. */
  onCloturer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** « Les 4 transactions sans correspondance sont traitées. » puis le verrou du mois. */
function PhraseVerrou({
  cloture,
  traitees,
  clos,
}: {
  cloture: patron.ClotureMois;
  traitees: number | undefined;
  clos: boolean;
}) {
  const { t } = useTranslation("ComptableCloture");
  const suivant = moisSuivant(cloture.mois);
  return (
    <span className={styles.verrou}>
      {clos && traitees !== undefined && traitees > 0
        ? `${t("verrou.traitees", { count: traitees })} `
        : ""}
      {t(clos ? "verrou.clos" : "verrou.aVenir", { suivant })}
    </span>
  );
}

function Encaisse({
  cloture,
  traitees,
  clos,
}: {
  cloture: patron.ClotureMois | undefined;
  traitees: number | undefined;
  clos: boolean;
}) {
  const { t } = useTranslation("ComptableCloture");
  if (!cloture) {
    return (
      <div className={`${styles.encaisse} ${styles.neutre}`}>
        <div className={styles.encaisseHaut}>
          <Squelette className={styles.squeletteTotal} />
          <Squelette className={styles.squeletteLibelle} />
        </div>
        <Squelette className={styles.squeletteDetail} />
        <Squelette className={styles.squeletteVerrou} />
      </div>
    );
  }
  const { encaisse } = cloture;
  return (
    <div className={clos ? styles.encaisse : `${styles.encaisse} ${styles.neutre}`}>
      <div className={styles.encaisseHaut}>
        <span className={styles.total}>{milliers(encaisse.total)}</span>
        <span className={styles.libelleTotal}>
          {t("encaisse.libelle", { mois: enMinuscules(nomDuMois(cloture.libelle)) })}
        </span>
      </div>
      <div className={styles.repartition}>
        <span>
          {t("encaisse.cash")} <strong>{milliers(encaisse.cash)}</strong>
        </span>
        <span>
          {t("encaisse.momo")} <strong>{milliers(encaisse.momo)}</strong>
        </span>
        <span className={styles.droite}>
          {t("encaisse.ecart")}{" "}
          <strong className={encaisse.ecart === 0 ? styles.ecartNul : styles.ecartOuvert}>
            {milliers(encaisse.ecart)}
          </strong>
        </span>
      </div>
      <PhraseVerrou cloture={cloture} traitees={traitees} clos={clos} />
    </div>
  );
}

function Fichiers({ cloture, clos }: { cloture: patron.ClotureMois | undefined; clos: boolean }) {
  const { t } = useTranslation("ComptableCloture");
  const recu = cloture?.envoi.recuA ?? null;
  return (
    <div className={styles.fichiers}>
      <div className={styles.fichiersTete}>
        <span>
          {cloture ? (
            t(clos ? "envoi.titre" : "envoi.titreAvenir", {
              destinataire: cloture.envoi.destinataire,
            })
          ) : (
            <Squelette className={styles.squeletteTitreEnvoi} />
          )}
        </span>
        {clos && recu !== null && (
          <span className={styles.recu}>{t("envoi.recu", { heure: heureDe(recu) })}</span>
        )}
      </div>
      {cloture ? (
        <ul className={styles.listeFichiers}>
          {cloture.envoi.fichiers.map((f) => (
            <li key={f.id} className={styles.fichier}>
              <span className={clos ? styles.envoye : `${styles.envoye} ${styles.enAttente}`}>
                {clos && <CocheFichier />}
              </span>
              <span className={styles.fichierTextes}>
                <span className={styles.fichierNom}>{f.nom}</span>
                <span className={styles.fichierDetail}>{sansAbonnement(f.description)}</span>
              </span>
              <span className={styles.fichierFormat}>{formatFichier(f)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.listeFichiers} aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i} className={styles.fichier}>
              <Squelette className={styles.squeletteRond} />
              <span className={styles.fichierTextes}>
                <Squelette className={styles.squeletteNom} />
                <Squelette className={styles.squeletteDescription} />
              </span>
              <Squelette className={styles.squeletteFormat} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Les premières lignes du journal des ventes envoyé : le CSV tel quel, la première ligne est l'en-tête. */
function Apercu({ cloture }: { cloture: patron.ClotureMois | undefined }) {
  const { t } = useTranslation("ComptableCloture");
  const titre = useId();
  const [entete, ...lignes] = cloture?.apercuJournal ?? [];
  return (
    // Les lignes du CSV ne passent pas à la ligne : l'aperçu défile sur le côté, au clavier aussi.
    <div
      className={styles.apercu}
      role="region"
      aria-labelledby={titre}
      {...(cloture ? { tabIndex: 0 } : {})}
    >
      <span id={titre} className={styles.apercuTitre}>
        {t("apercu.titre")}
      </span>
      {cloture ? (
        <>
          {entete !== undefined && <span className={styles.apercuEntete}>{entete}</span>}
          {lignes.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </>
      ) : (
        <>
          <Squelette className={styles.squeletteCsv} />
          <Squelette className={styles.squeletteCsv} />
          <Squelette className={styles.squeletteCsv} />
        </>
      )}
    </div>
  );
}

/**
 * Mois clôturé et envoyé au cabinet : total encaissé (cash, MoMo, écart), mois verrouillé, fichiers envoyés avec
 * leur format et leur taille, aperçu des trois premières lignes du journal des ventes.
 *
 * Aucune écriture ici : tant que le mois est ouvert, « Clôturer · mon PIN » ouvre la signature (voir signature.tsx).
 */
export function ClotureVue({ etat, cloture, traitees, onReessayer, onCloturer }: PropsClotureVue) {
  const { t } = useTranslation("ComptableCloture");
  const chargement = etat === "chargement";
  const donnees = etat === "cloture" || etat === "a_cloturer" ? cloture : undefined;
  const clos = etat === "cloture";
  const aCloturer = etat === "a_cloturer";
  const nomMois = donnees ? nomDuMois(donnees.libelle) : "";
  const contenu = chargement || donnees !== undefined;

  return (
    <div className={styles.ecran}>
      <Entete
        titre={
          donnees
            ? t(clos ? "entete.titre" : "entete.titreAvenir", { mois: nomMois })
            : t("entete.titreAttente")
        }
        sousTitre={
          clos && donnees?.clotureA ? (
            t("entete.sousTitre", { quand: instantAvecAnnee(donnees.clotureA) })
          ) : chargement ? (
            <Squelette className={styles.squeletteSousTitre} />
          ) : undefined
        }
        retour={{ libelle: t("entete.retour"), href: urlPlanche("Comptable") }}
        droite={
          clos ? (
            <span className={styles.pastille}>
              <CocheEntete />
            </span>
          ) : undefined
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="ComptableCloture"
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

        {contenu && (
          <>
            <Encaisse cloture={donnees} traitees={traitees} clos={clos} />
            <Fichiers cloture={donnees} clos={clos} />
            <Apercu cloture={donnees} />
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <Bouton
          variante="secondaire"
          libelle={t("boutons.revoir")}
          href={urlPlanche("Comptable")}
          className={styles.revoir}
        />
        {aCloturer ? (
          <Bouton
            variante="secondaire"
            libelle={t("boutons.cloturer", { mois: enMinuscules(nomMois) })}
            icone={<IconeCadenas />}
            onClick={onCloturer}
            className={styles.retour}
          />
        ) : (
          <Bouton
            variante="secondaire"
            libelle={t("boutons.tableauDeBord")}
            href={urlPlanche("Patron")}
            className={styles.retour}
          />
        )}
      </EcranPied>
    </div>
  );
}
