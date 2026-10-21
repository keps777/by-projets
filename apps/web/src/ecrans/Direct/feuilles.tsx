import { voyageur } from "@afrimove/api-client";
import { Bouton, FeuilleModale, IconeCoche } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { numeroLisible } from "./suivi";
import styles from "./direct.module.css";

type Motif = voyageur.MotifSignalement;

const MOTIFS: readonly Motif[] = ["retard", "conduite", "incident"];

/**
 * Feuille « Signaler un problème » : un signalement rapide en une touche (retard, conduite, incident), transmis à
 * la gare de départ. Aucune planche de la maquette ne la dessine (elle est aussi du ticket AM-183). Elle est montée
 * à l'ouverture seulement : chaque ouverture repart d'un état neuf.
 */
export function FeuilleSignaler({
  billetId,
  onFermer,
}: {
  billetId: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation("Direct");
  const signaler = voyageur.useSignalerTrajet();
  const envoye = signaler.data;

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={t("signaler.titre")}
      libelleFermer={t("feuille.fermer")}
      ancrage="parent"
      actions={
        envoye !== undefined ? (
          <Bouton libelle={t("feuille.terminer")} onClick={onFermer} />
        ) : undefined
      }
    >
      <div className={styles.feuille}>
        {envoye !== undefined ? (
          <p role="status" className={styles.confirmation}>
            <IconeCoche taille={18} trait={2.6} />
            {t("signaler.transmis", { gare: envoye.transmisA })}
          </p>
        ) : (
          <>
            {MOTIFS.map((motif) => (
              <button
                key={motif}
                type="button"
                className={styles.option}
                disabled={signaler.isPending}
                onClick={() => signaler.mutate({ billetId, motif })}
              >
                <span className={styles.optionTitre}>{t(`signaler.motifs.${motif}.titre`)}</span>
                <span className={styles.optionDetail}>{t(`signaler.motifs.${motif}.detail`)}</span>
              </button>
            ))}
            {signaler.isError && (
              <p role="alert" className={styles.alerte}>
                {t("signaler.erreur")}
              </p>
            )}
          </>
        )}
      </div>
    </FeuilleModale>
  );
}

/** Feuille « Appeler le chauffeur » : le numéro du chauffeur du bus, à composer en une touche. */
export function FeuilleChauffeur({
  billetId,
  onFermer,
}: {
  billetId: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation("Direct");
  const chauffeur = voyageur.useChauffeurBus({ billetId });

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={t("chauffeur.titre")}
      libelleFermer={t("feuille.fermer")}
      ancrage="parent"
      actions={
        chauffeur.data !== undefined ? (
          <Bouton
            href={`tel:${chauffeur.data.telephone}`}
            libelle={t("chauffeur.appeler", { nom: chauffeur.data.nom })}
            sousLibelle={numeroLisible(chauffeur.data.telephone)}
          />
        ) : undefined
      }
    >
      <div className={styles.feuille}>
        {chauffeur.isPending && (
          <p role="status" className={styles.feuilleEtat}>
            {t("chauffeur.chargement")}
          </p>
        )}
        {chauffeur.isError && (
          <div role="alert" className={styles.feuilleEtat}>
            <p>{t("chauffeur.erreur")}</p>
            <Bouton
              variante="secondaire"
              libelle={t("etats.erreur.reessayer")}
              onClick={() => void chauffeur.refetch()}
            />
          </div>
        )}
        {chauffeur.isSuccess && (
          <p className={styles.feuilleEtat}>
            {t("chauffeur.consigne", { nom: chauffeur.data.nom })}
          </p>
        )}
      </div>
    </FeuilleModale>
  );
}
